import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import { PlatformSignupBody } from "@workspace/api-zod";
import {
  validateSlug,
  isReservedSlug,
  slugify,
  slugRejectionReason,
} from "../lib/slug";
import { hashPassword } from "../lib/auth";
import { platformBaseDomain } from "../lib/tenant-url";
import { loginRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

/**
 * The platform (apex/marketing) API: self-serve onboarding. Central reads and the
 * provisioning service are imported lazily inside handlers so a tenant-only
 * deployment without CENTRAL_DATABASE_URL still boots (matches the grades/matches
 * central-read pattern).
 */

/** Onboarding gate. `pca` (default) onboards central PCA clubs; `off` disables. */
function signupMode(): "pca" | "open" | "off" {
  const m = (process.env.SIGNUP_MODE ?? "pca").toLowerCase();
  if (m === "off") return "off";
  if (m === "open") return "open";
  return "pca";
}

/** Basic email shape check (no verification in the pilot). */
function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

/** Whether a slug is free in the tenants register. */
async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));
  return !!row;
}

// --- Available clubs (the signup picker) ------------------------------------

router.get("/platform/available-clubs", async (_req, res): Promise<void> => {
  if (signupMode() === "off") {
    res.status(403).json({ error: "Signup is disabled" });
    return;
  }
  const { centralDb, centralClubsTable } =
    await import("@workspace/db/central");

  const claimed = await db
    .select({ centralClubId: tenantsTable.centralClubId })
    .from(tenantsTable);
  const claimedIds = new Set(claimed.map((c) => c.centralClubId));

  const clubs = await centralDb.select().from(centralClubsTable);
  const available = clubs
    .filter((c) => !claimedIds.has(c.clubId))
    .map((c) => ({
      centralClubId: c.clubId,
      name: c.name ?? `Club ${c.clubId}`,
      shortName: c.shortName ?? null,
      primaryColour: c.primaryColour ?? null,
      suggestedSlug: slugify(c.name ?? `club-${c.clubId}`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json(available);
});

// --- Slug availability (live check in the wizard) ---------------------------

router.get("/platform/slug-available", async (req, res): Promise<void> => {
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
  loginRateLimiter,
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
      });

      // The first club admin (email + password, no verification in the pilot).
      const passwordHash = await hashPassword(parsed.data.password);
      await db.insert(adminsTable).values({
        tenantId: result.tenant.id,
        username: adminEmail,
        displayName: adminEmail.split("@")[0] || "Owner",
        passwordHash,
      });

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
