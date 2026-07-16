import { Router, type IRouter } from "express";
import { and, eq, ne, isNull, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  adminPasswordResetsTable,
  type TenantRow,
} from "@workspace/db";
import { toAdminTenant } from "../lib/admin-tenant-shape";
import {
  PlatformAdminLoginBody,
  UpdateAdminTenantBody,
  UpdateAdminTenantBrandBody,
  ProvisionTenantAsAdminBody,
  IssueTenantAdminResetBody,
} from "@workspace/api-zod";
import {
  PLATFORM_SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  RESET_TOKEN_TTL_MS,
  encodePlatformSession,
  getPlatformAdminByEmail,
  verifyPassword,
  hashPassword,
  generateRandomPassword,
  generateResetToken,
} from "../lib/auth";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import { tenantUrl } from "../lib/tenant-url";
import { invalidateTenantBrandCache } from "../lib/tenant-brand";
import { validateSlug, isReservedSlug, slugRejectionReason } from "../lib/slug";
import { loginRateLimiter } from "../middlewares/rate-limit";
import { hasEntitlement, planFromString } from "../lib/entitlements";

const router: IRouter = Router();

/**
 * The platform-admin (super-admin) console API: a global, tenant-independent
 * surface for overseeing every tenant. Authenticated by the platform session
 * (separate from club-admin sessions), so a club admin can never reach these
 * routes. Central reads are imported lazily so a tenant-only deployment without
 * CENTRAL_DATABASE_URL still boots.
 */

/** Basic email shape check (mirrors the signup route; no verification in pilot). */
function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

/** Whether a slug is already claimed in the tenants register. */
async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));
  return !!row;
}

/** Admin counts keyed by tenant id (one grouped query). */
async function adminCountsByTenant(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      tenantId: adminsTable.tenantId,
      count: sql<number>`count(*)::int`,
    })
    .from(adminsTable)
    .groupBy(adminsTable.tenantId);
  return new Map(rows.map((r) => [r.tenantId, r.count]));
}

/**
 * Best-effort central club names keyed by club id. Returns an empty map (names
 * become null) when the central DB isn't configured for this deployment.
 */
async function centralClubNames(): Promise<Map<number, string>> {
  try {
    const { centralDb, centralClubsTable } =
      await import("@workspace/db/central");
    const clubs = await centralDb
      .select({
        clubId: centralClubsTable.clubId,
        name: centralClubsTable.name,
      })
      .from(centralClubsTable);
    return new Map(clubs.map((c) => [c.clubId, c.name ?? `Club ${c.clubId}`]));
  } catch {
    return new Map();
  }
}


// --- Auth -------------------------------------------------------------------

router.post(
  "/platform/auth/login",
  loginRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = PlatformAdminLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const admin = await getPlatformAdminByEmail(email);
    if (
      !admin ||
      !(await verifyPassword(parsed.data.password, admin.passwordHash))
    ) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    res.cookie(
      PLATFORM_SESSION_COOKIE,
      encodePlatformSession({
        platformAdminId: admin.id,
        issuedAt: Date.now(),
      }),
      SESSION_COOKIE_OPTS,
    );
    res.json({
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
    });
  },
);

router.post("/platform/auth/logout", (_req, res): void => {
  res.clearCookie(PLATFORM_SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/platform/auth/me", requirePlatformAdmin, (req, res): void => {
  const a = (req as RequestWithPlatformAdmin).platformAdmin!;
  res.json({ id: a.id, email: a.email, displayName: a.displayName });
});

// --- Tenant oversight + management ------------------------------------------

router.get(
  "/platform/admin/tenants",
  requirePlatformAdmin,
  async (_req, res): Promise<void> => {
    const [tenants, counts, names] = await Promise.all([
      db.select().from(tenantsTable),
      adminCountsByTenant(),
      centralClubNames(),
    ]);
    const out = tenants
      .map((t) =>
        toAdminTenant(
          t,
          names.get(t.centralClubId) ?? null,
          counts.get(t.id) ?? 0,
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(out);
  },
);

router.get(
  "/platform/admin/tenants/:id",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id));
    if (!tenant) {
      res.status(404).json({ error: "No such tenant" });
      return;
    }
    const admins = await db
      .select({
        id: adminsTable.id,
        username: adminsTable.username,
        displayName: adminsTable.displayName,
      })
      .from(adminsTable)
      .where(eq(adminsTable.tenantId, id));
    const names = await centralClubNames();
    res.json({
      tenant: toAdminTenant(
        tenant,
        names.get(tenant.centralClubId) ?? null,
        admins.length,
      ),
      admins,
    });
  },
);

router.patch(
  "/platform/admin/tenants/:id",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const parsed = UpdateAdminTenantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Read the current row up front -- needed for the tenant-existence check
    // (so an unknown id 404s before any entitlement check runs, rather than
    // being misread as "no plan" and misreported as a 402), the effective-plan
    // calc below, and the plan-downgrade/customDomain-clearing check.
    const [currentRow] = await db
      .select({ plan: tenantsTable.plan, customDomain: tenantsTable.customDomain })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id));
    if (!currentRow) {
      res.status(404).json({ error: "No such tenant" });
      return;
    }

    const updates: Partial<Pick<TenantRow, "plan" | "customDomain">> = {};
    if (parsed.data.plan !== undefined) updates.plan = parsed.data.plan;

    // Custom domain is plan-gated (always enforced, independent of the
    // dormant BILLING_ENABLED flag — see entitlements.ts). Evaluate the
    // EFFECTIVE plan for this request: the incoming `plan` when this same
    // call sets it (a super-admin granting Pro and a domain together), else
    // the tenant's current stored plan — not stale pre-update state.
    const effectivePlan = parsed.data.plan ?? planFromString(currentRow.plan);
    const effectiveHasCustomDomain = hasEntitlement(effectivePlan, "customDomain");

    if (parsed.data.customDomain !== undefined) {
      const cd = parsed.data.customDomain?.trim().toLowerCase() || null;
      if (cd) {
        if (!effectiveHasCustomDomain) {
          res.status(402).json({
            error: "Upgrade required",
            feature: "customDomain",
            plan: effectivePlan,
          });
          return;
        }
        const [clash] = await db
          .select({ id: tenantsTable.id })
          .from(tenantsTable)
          .where(
            and(eq(tenantsTable.customDomain, cd), ne(tenantsTable.id, id)),
          );
        if (clash) {
          res
            .status(409)
            .json({ error: "That custom domain is already in use." });
          return;
        }
      }
      updates.customDomain = cd;
    } else if (!effectiveHasCustomDomain && currentRow.customDomain) {
      // The request didn't touch customDomain, but a plan change (or the
      // stored plan alone) now leaves this tenant without the entitlement
      // while a custom domain is still set on the row -- the gate above only
      // guards the moment customDomain is written, so without this branch a
      // plan downgrade alone would silently leave a Free tenant still serving
      // on its old custom domain. Clear it rather than block the downgrade.
      updates.customDomain = null;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [row] = await db
      .update(tenantsTable)
      .set(updates)
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "No such tenant" });
      return;
    }
    const [names, counts] = await Promise.all([
      centralClubNames(),
      adminCountsByTenant(),
    ]);
    res.json(
      toAdminTenant(
        row,
        names.get(row.centralClubId) ?? null,
        counts.get(row.id) ?? 0,
      ),
    );
  },
);

// Concierge update of any tenant's cosmetic branding fields (name, short name,
// logo, favicon, colours) by a platform admin. Targets the tenant purely by the
// path id — the request's own tenant context (host / x-tenant-id) plays no part,
// so the console can brand any club from the apex host. `plan`, `customDomain`,
// and `backgroundUrl` are not properties on UpdateAdminTenantBrandBody at all
// (additionalProperties: false in openapi.yaml), so they can't be smuggled in
// here — plan/domain changes stay on the sibling PATCH above.
router.patch(
  "/platform/admin/tenants/:id/brand",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const parsed = UpdateAdminTenantBrandBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Pre-read so an unknown id 404s before the empty-update check can misreport
    // it as a 400 (mirrors the sibling tenant PATCH above).
    const [existing] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "No such tenant" });
      return;
    }

    // Field-by-field with `!== undefined` guards (never spread the body): an
    // explicit null clears a column, an omitted field leaves it untouched, so a
    // concierge logo-only save can never clobber a concurrent colour-only save.
    const updates: Partial<
      Pick<
        TenantRow,
        | "name"
        | "shortName"
        | "logoUrl"
        | "faviconUrl"
        | "backgroundColour"
        | "primaryColour"
        | "juniorsColour"
        | "badgeStyle"
        | "useNavyBase"
      >
    > = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.shortName !== undefined) updates.shortName = parsed.data.shortName;
    if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl;
    if (parsed.data.faviconUrl !== undefined) updates.faviconUrl = parsed.data.faviconUrl;
    if (parsed.data.backgroundColour !== undefined) updates.backgroundColour = parsed.data.backgroundColour;
    if (parsed.data.primaryColour !== undefined) updates.primaryColour = parsed.data.primaryColour;
    if (parsed.data.juniorsColour !== undefined) updates.juniorsColour = parsed.data.juniorsColour;
    if (parsed.data.badgeStyle !== undefined) updates.badgeStyle = parsed.data.badgeStyle;
    if (parsed.data.useNavyBase !== undefined) updates.useNavyBase = parsed.data.useNavyBase;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [row] = await db
      .update(tenantsTable)
      .set(updates)
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!row) {
      // The tenant vanished between the pre-read and this write (no transaction
      // spans them) — without this check the response below would fabricate a
      // successful update for a tenant that no longer exists.
      res.status(404).json({ error: "No such tenant" });
      return;
    }
    // Drop the 5-minute brand cache so the club's site reflects the concierge
    // change on the very next GET /tenant-brand, not up to TTL later.
    invalidateTenantBrandCache(id);

    const admins = await db
      .select({
        id: adminsTable.id,
        username: adminsTable.username,
        displayName: adminsTable.displayName,
      })
      .from(adminsTable)
      .where(eq(adminsTable.tenantId, id));
    const names = await centralClubNames();
    res.json({
      tenant: toAdminTenant(
        row,
        names.get(row.centralClubId) ?? null,
        admins.length,
      ),
      admins,
    });
  },
);

router.post(
  "/platform/admin/tenants",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const parsed = ProvisionTenantAsAdminBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const slug = parsed.data.slug.trim().toLowerCase();
    const rejection = validateSlug(slug);
    if (rejection) {
      res.status(400).json({ error: slugRejectionReason(rejection) });
      return;
    }
    if (isReservedSlug(slug)) {
      res.status(400).json({ error: "That address is reserved." });
      return;
    }
    if (await slugTaken(slug)) {
      res.status(409).json({ error: "That address is already taken." });
      return;
    }
    const adminEmail = parsed.data.adminEmail?.trim().toLowerCase();
    if (adminEmail && !isEmail(adminEmail)) {
      res.status(400).json({ error: "A valid email is required." });
      return;
    }
    if (adminEmail && !parsed.data.password) {
      res
        .status(400)
        .json({ error: "A password is required to create the first admin." });
      return;
    }

    const { provisionTenant, ProvisionError } =
      await import("@workspace/db/provision");
    try {
      const result = await provisionTenant({
        slug,
        centralClubId: parsed.data.centralClubId,
        name: parsed.data.name,
        plan: parsed.data.plan ?? "free",
        mode: "create",
      });

      if (adminEmail && parsed.data.password) {
        const passwordHash = await hashPassword(parsed.data.password);
        await db.insert(adminsTable).values({
          tenantId: result.tenant.id,
          username: adminEmail,
          displayName: adminEmail.split("@")[0] || "Owner",
          passwordHash,
        });
      }

      const counts = await adminCountsByTenant();
      res
        .status(201)
        .json(
          toAdminTenant(
            result.tenant,
            result.centralClub.name,
            counts.get(result.tenant.id) ?? 0,
          ),
        );
    } catch (e) {
      if (e instanceof ProvisionError) {
        if (e.code === "slug_taken" || e.code === "club_claimed") {
          res.status(409).json({ error: e.message });
          return;
        }
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }
  },
);

// --- Admin credential recovery (bootstrap / reset) --------------------------

/**
 * Issue a single-use password-reset link for a club admin on this tenant,
 * bootstrapping the admin when none exists (e.g. a central tenant like Mandurah
 * with zero admins). The raw token is embedded ONLY in the returned URL; the DB
 * stores just its hash. The club admin sets their own password via the link, so
 * platform staff never learn or set it — no silent impersonation vector. Every
 * issue is audited (which platform admin, which tenant/admin, whether created).
 */
router.post(
  "/platform/admin/tenants/:id/admin-resets",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const parsed = IssueTenantAdminResetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const username = parsed.data.username.trim().toLowerCase();
    if (!username) {
      res.status(400).json({ error: "Username required" });
      return;
    }

    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, id));
    if (!tenant) {
      res.status(404).json({ error: "No such tenant" });
      return;
    }

    // Find or bootstrap the target admin ON THIS TENANT (usernames are per-tenant,
    // so this can never touch another club's admin of the same name).
    let [admin] = await db
      .select()
      .from(adminsTable)
      .where(
        and(eq(adminsTable.tenantId, id), eq(adminsTable.username, username)),
      );
    let created = false;
    if (!admin) {
      const displayName =
        parsed.data.displayName?.trim() || username.split("@")[0] || "Admin";
      // Random, never-disclosed password: the account is reachable only via the
      // reset link until the club admin sets their own.
      const passwordHash = await hashPassword(generateRandomPassword());
      [admin] = await db
        .insert(adminsTable)
        .values({ tenantId: id, username, displayName, passwordHash })
        .returning();
      created = true;
    }

    // Spend any outstanding tokens for this admin so only the newest link works.
    const now = new Date();
    await db
      .update(adminPasswordResetsTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminPasswordResetsTable.adminId, admin.id),
          isNull(adminPasswordResetsTable.usedAt),
        ),
      );

    const { token, tokenHash } = generateResetToken();
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
    const platformAdmin = (req as RequestWithPlatformAdmin).platformAdmin!;
    await db.insert(adminPasswordResetsTable).values({
      tenantId: id,
      adminId: admin.id,
      tokenHash,
      createdByPlatformAdminId: platformAdmin.id,
      expiresAt,
    });

    // The link must land on the CLUB's host, not the apex console this runs on.
    const resetUrl = tenantUrl(
      req,
      tenant,
      `/admin/reset?token=${encodeURIComponent(token)}`,
    );

    req.log?.info(
      {
        event: "admin_password_reset_issued",
        platformAdminId: platformAdmin.id,
        tenantId: id,
        adminId: admin.id,
        username,
        created,
      },
      "platform admin issued a club-admin reset link",
    );

    res.status(201).json({
      resetUrl,
      expiresAt: expiresAt.toISOString(),
      username: admin.username,
      displayName: admin.displayName,
      tenantName: tenant.name,
      created,
    });
  },
);

export default router;
