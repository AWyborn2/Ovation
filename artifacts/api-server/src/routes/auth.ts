import { Router, type IRouter } from "express";
import { LoginBody } from "@workspace/api-zod";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  encodeSession,
  getAdminByUsernameForTenant,
  verifyPassword,
} from "../lib/auth";
import { resolveAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { loginRateLimiter } from "../middlewares/rate-limit";

const router: IRouter = Router();

function serializeAdmin(a: { id: number; username: string; displayName: string; createdAt: Date }) {
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    createdAt: a.createdAt.toISOString(),
  };
}

router.post("/auth/login", loginRateLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Authenticate against the admins of the request's tenant (resolved from the
  // host); a Mandurah login on Mandurah's host can't match a Halls Head admin.
  const admin = await getAdminByUsernameForTenant(getTenantId(req), parsed.data.username);
  if (!admin || !(await verifyPassword(parsed.data.password, admin.passwordHash))) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const token = encodeSession({ adminId: admin.id, issuedAt: Date.now() });
  res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTS);
  res.json(serializeAdmin(admin));
});

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

export default router;
