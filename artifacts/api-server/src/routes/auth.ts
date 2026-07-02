import { Router, type IRouter, type Request } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  adminsTable,
  adminPasswordResetsTable,
  tenantsTable,
  type AdminPasswordResetRow,
} from "@workspace/db";
import { LoginBody, SubmitPasswordResetBody } from "@workspace/api-zod";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  encodeSession,
  getAdminByUsernameForTenant,
  verifyPassword,
  hashResetToken,
  hashPassword,
} from "../lib/auth";
import { resolveAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { loginRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

function serializeAdmin(a: {
  id: number;
  username: string;
  displayName: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    createdAt: a.createdAt.toISOString(),
  };
}

router.post(
  "/auth/login",
  loginRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // Authenticate against the admins of the request's tenant (resolved from the
    // host); a Mandurah login on Mandurah's host can't match a Halls Head admin.
    const admin = await getAdminByUsernameForTenant(
      getTenantId(req),
      parsed.data.username,
    );
    if (
      !admin ||
      !(await verifyPassword(parsed.data.password, admin.passwordHash))
    ) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    const token = encodeSession({ adminId: admin.id, issuedAt: Date.now() });
    res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
    res.json(serializeAdmin(admin));
  },
);

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.sendStatus(204);
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const admin = await resolveAdmin(req);
  if (!admin) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  res.json(serializeAdmin(admin));
});

// --- Password reset / bootstrap (redeems a platform-issued token) -----------

/**
 * Resolve a live reset token for THIS request's tenant. A token is live only when
 * unused, unexpired, and minted for the same tenant as the host it's being
 * redeemed on (defence-in-depth: a link for club A cannot be redeemed on club B's
 * host even though the token alone identifies the admin). Returns null otherwise.
 */
async function liveReset(
  req: Request,
  token: string,
): Promise<AdminPasswordResetRow | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(adminPasswordResetsTable)
    .where(
      and(
        eq(adminPasswordResetsTable.tokenHash, hashResetToken(token)),
        eq(adminPasswordResetsTable.tenantId, getTenantId(req)),
        isNull(adminPasswordResetsTable.usedAt),
        gt(adminPasswordResetsTable.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

router.get("/auth/password-reset/:token", async (req, res): Promise<void> => {
  const reset = await liveReset(req, String(req.params.token ?? ""));
  if (!reset) {
    res
      .status(410)
      .json({ error: "This link is invalid, expired, or already used." });
    return;
  }
  const [[admin], [tenant]] = await Promise.all([
    db.select().from(adminsTable).where(eq(adminsTable.id, reset.adminId)),
    db.select().from(tenantsTable).where(eq(tenantsTable.id, reset.tenantId)),
  ]);
  if (!admin || !tenant) {
    res
      .status(410)
      .json({ error: "This link is invalid, expired, or already used." });
    return;
  }
  res.json({
    username: admin.username,
    displayName: admin.displayName,
    tenantName: tenant.name,
    expiresAt: reset.expiresAt.toISOString(),
  });
});

router.post(
  "/auth/password-reset/:token",
  loginRateLimiter,
  async (req, res): Promise<void> => {
    const parsed = SubmitPasswordResetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const reset = await liveReset(req, String(req.params.token ?? ""));
    if (!reset) {
      res
        .status(410)
        .json({ error: "This link is invalid, expired, or already used." });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date();
    await db
      .update(adminsTable)
      .set({ passwordHash })
      .where(eq(adminsTable.id, reset.adminId));
    // Spend this token AND any siblings so the link is strictly single-use.
    await db
      .update(adminPasswordResetsTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(adminPasswordResetsTable.adminId, reset.adminId),
          isNull(adminPasswordResetsTable.usedAt),
        ),
      );
    req.log?.info(
      {
        event: "admin_password_reset_redeemed",
        tenantId: reset.tenantId,
        adminId: reset.adminId,
      },
      "club admin redeemed a password-reset link",
    );
    res.sendStatus(204);
  },
);

export default router;
