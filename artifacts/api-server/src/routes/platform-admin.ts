import { Router, type IRouter } from "express";
import { and, eq, ne, isNull, sql } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  adminPasswordResetsTable,
  type TenantRow,
} from "@workspace/db";
import {
  PlatformAdminLoginBody,
  UpdateAdminTenantBody,
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
import { validateSlug, isReservedSlug, slugRejectionReason } from "../lib/slug";
import { loginRateLimiter } from "../middlewares/rate-limit";

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

/** Shape a tenant row for the console (plan, branding, counts). */
function toAdminTenant(
  t: TenantRow,
  centralClubName: string | null,
  adminCount: number,
) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    plan: t.plan,
    centralClubId: t.centralClubId,
    centralClubName,
    customDomain: t.customDomain,
    readsFromCentral: t.readsFromCentral,
    createdAt:
      t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    adminCount,
  };
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

    const updates: Partial<Pick<TenantRow, "plan" | "customDomain">> = {};
    if (parsed.data.plan !== undefined) updates.plan = parsed.data.plan;
    if (parsed.data.customDomain !== undefined) {
      const cd = parsed.data.customDomain?.trim().toLowerCase() || null;
      if (cd) {
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
