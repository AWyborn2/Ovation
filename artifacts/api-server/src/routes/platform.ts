import { Router, type IRouter } from "express";
import { isNull } from "drizzle-orm";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import { PlatformSignupBody } from "@workspace/api-zod";
import {
  validateSlug,
  isReservedSlug,
  slugRejectionReason,
} from "../lib/slug";
import {
  hashPassword,
  encodeSession,
  signupSessionCookieOpts,
  SESSION_COOKIE,
} from "../lib/auth";
import { platformBaseDomain, tenantHost } from "../lib/tenant-url";
import { invalidateTenantDirectoryCache } from "../middlewares/tenant-context";
import {
  signupRateLimiter,
  signupDiscoveryRateLimiter,
} from "../middlewares/rate-limit";
import { listAvailableClubs } from "../lib/available-clubs";
import { env } from "../config";
import { isEmail, slugTaken } from "../lib/signup-validation";

const router: IRouter = Router();

/**
 * The platform (apex/marketing) API: self-serve onboarding. Central reads and the
 * provisioning service are imported lazily inside handlers so a tenant-only
 * deployment without CENTRAL_DATABASE_URL still boots (matches the grades/matches
 * central-read pattern).
 */

/** Onboarding gate. `pca` (default) onboards central PCA clubs; `off` disables. */
function signupMode(): "pca" | "open" | "off" {
  const m = (env.SIGNUP_MODE() ?? "pca").toLowerCase();
  if (m === "off") return "off";
  if (m === "open") return "open";
  return "pca";
}

// --- Available clubs (the signup picker) ------------------------------------

router.get("/platform/available-clubs", signupDiscoveryRateLimiter, async (_req, res): Promise<void> => {
  if (signupMode() === "off") {
    res.status(403).json({ error: "Signup is disabled" });
    return;
  }
  res.json(await listAvailableClubs({ context: "self-serve" }));
});

// --- Public club directory --------------------------------------------------

/**
 * The public directory: every active club running Ovation, so a visitor on the
 * apex can browse the platform and click through to any club's site. Unlike
 * `/platform/available-clubs` (central clubs still to claim), this lists the
 * *existing tenants*, and is independent of SIGNUP_MODE — the directory stays
 * browsable even when onboarding is paused. Only public branding is exposed
 * (no plan, data source, or health), and suspended tenants are omitted.
 */
router.get(
  "/platform/directory-clubs",
  signupDiscoveryRateLimiter,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        slug: tenantsTable.slug,
        name: tenantsTable.name,
        shortName: tenantsTable.shortName,
        tagline: tenantsTable.tagline,
        logoUrl: tenantsTable.logoUrl,
        backgroundColour: tenantsTable.backgroundColour,
        primaryColour: tenantsTable.primaryColour,
        customDomain: tenantsTable.customDomain,
      })
      .from(tenantsTable)
      .where(isNull(tenantsTable.suspendedAt));

    const clubs = rows
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        shortName: r.shortName ?? null,
        tagline: r.tagline ?? null,
        logoUrl: r.logoUrl ?? null,
        backgroundColour: r.backgroundColour ?? null,
        primaryColour: r.primaryColour ?? null,
        url: `https://${tenantHost(req, { slug: r.slug, customDomain: r.customDomain })}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(clubs);
  },
);

// --- Slug availability (live check in the wizard) ---------------------------

router.get("/platform/slug-available", signupDiscoveryRateLimiter, async (req, res): Promise<void> => {
  const raw = typeof req.query.slug === "string" ? req.query.slug : "";
  const rejection = validateSlug(raw);
  if (rejection) {
    res.json({ available: false, reason: slugRejectionReason(rejection) });
    return;
  }
  if (await slugTaken(raw.trim().toLowerCase())) {
    res.json({ available: false, reason: "That address is already taken." });
    return;
  }
  res.json({ available: true, reason: null });
});

// --- Signup (provision a tenant + first admin) ------------------------------

router.post(
  "/platform/signup",
  signupRateLimiter,
  async (req, res): Promise<void> => {
    if (signupMode() === "off") {
      res.status(403).json({ error: "Signup is disabled" });
      return;
    }
    const parsed = PlatformSignupBody.safeParse(req.body);
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
    const adminEmail = parsed.data.adminEmail.trim().toLowerCase();
    if (!isEmail(adminEmail)) {
      res.status(400).json({ error: "A valid email is required." });
      return;
    }
    // Slug uniqueness is a 409 regardless of the central club — check it up front so
    // a taken slug can't fall through to provisionTenant's club resolution (400).
    if (await slugTaken(slug)) {
      res.status(409).json({ error: "That address is already taken." });
      return;
    }

    const { provisionTenant, ProvisionError } =
      await import("@workspace/db/provision");
    try {
      const result = await provisionTenant({
        slug,
        centralClubId: parsed.data.centralClubId,
        plan: "free",
        mode: "create",
        context: "self-serve",
      });

      // The first club admin (email + password, no verification in the pilot).
      const passwordHash = await hashPassword(parsed.data.password);
      const [admin] = await db
        .insert(adminsTable)
        .values({
          tenantId: result.tenant.id,
          username: adminEmail,
          displayName: adminEmail.split("@")[0] || "Owner",
          passwordHash,
        })
        .returning();
      if (!admin) {
        // The tenant was provisioned but the admin row didn't come back --
        // surface a clean 500 rather than throwing on admin.id below, which
        // would leave the client with no tenantId to retry or recover with.
        req.log?.error(
          { event: "signup_admin_insert_failed", tenantId: result.tenant.id },
          "signup: admin insert returned no row after tenant provisioning",
        );
        res.status(500).json({ error: "Signup failed. Please try again." });
        return;
      }

      // Mint the session for the admin just created, not for whatever tenant
      // `getTenantId(req)` would resolve on this request — signup is served from
      // the apex/platform host, which resolves to platform/fallback mode, not the
      // new tenant's own subdomain. The cookie is scoped to the shared apex domain
      // (not just this host) because the redirect below sends the browser to the
      // new tenant's own subdomain, a different host from the one setting it.
      const token = encodeSession({ adminId: admin.id, issuedAt: Date.now(), epoch: admin.sessionEpoch });
      res.cookie(SESSION_COOKIE, token, signupSessionCookieOpts(req));

      // The new tenant's slug must resolve on its subdomain right away (the
      // response redirects the browser straight there); without this the fresh
      // host misses the directory and serves the demo tenant for up to 5 min.
      invalidateTenantDirectoryCache();

      const apex = platformBaseDomain(req);
      res.status(201).json({
        tenantId: result.tenant.id,
        slug: result.tenant.slug,
        name: result.tenant.name,
        redirectUrl: `https://${result.tenant.slug}.${apex}/admin`,
      });
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

export default router;
