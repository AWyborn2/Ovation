import { Router, type IRouter, type Response } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, gt } from "drizzle-orm";
import { db, figmaConnectionPendingTable } from "@workspace/db";
import { getAdminById } from "../lib/auth";
import { isTenantSuspended } from "../lib/tenant";
import { publicOrigin } from "../middlewares/tenant-context";
import { verifyToken } from "../lib/publishing/signed-token";
import {
  exchangeCode,
  figmaCallbackUrl,
  figmaMe,
  saveFigmaConnection,
} from "../lib/figma-connection/store";
import { FIGMA_STATE_PURPOSE, type FigmaOAuthState } from "./figma-connection";

/**
 * Figma's sign-in callback (ADR-012, R2-E), mounted at /api/figma BEFORE
 * tenant context: it is the one address registered with Ovation's Figma app,
 * and the club comes from the signed state, never the host.
 *
 * The state is signed, expires in 10 minutes and carries a nonce that is used
 * once: the pending row is deleted before the code is exchanged, so a replayed
 * callback finds nothing. The browser always goes back to the club's settings
 * with `figma=connected` or `figma_error=<reason>`; tokens never travel there.
 */
const router: IRouter = Router();

const figmaLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

function backTo(res: Response, returnUrl: string, key: string, value: string): void {
  const url = new URL(returnUrl);
  url.searchParams.set(key, value);
  res.redirect(302, url.toString());
}

router.get("/oauth/callback", figmaLimiter, async (req, res): Promise<void> => {
  const state = verifyToken<FigmaOAuthState>(FIGMA_STATE_PURPOSE, req.query.state);
  if (!state) {
    res.status(400).type("text/plain").send("This Figma sign-in link has expired. Start again.");
    return;
  }
  // Use the nonce once, whatever happens next.
  const used = await db
    .delete(figmaConnectionPendingTable)
    .where(
      and(
        eq(figmaConnectionPendingTable.nonce, state.n),
        eq(figmaConnectionPendingTable.tenantId, state.t),
        eq(figmaConnectionPendingTable.adminId, state.a),
        gt(figmaConnectionPendingTable.expiresAt, new Date()),
      ),
    )
    .returning({ id: figmaConnectionPendingTable.id });
  if (used.length === 0) {
    backTo(res, state.r, "figma_error", "expired");
    return;
  }
  if (typeof req.query.error === "string" || typeof req.query.code !== "string") {
    backTo(res, state.r, "figma_error", "cancelled");
    return;
  }
  // The admin who started must still be an admin of that club, and the club live.
  const admin = await getAdminById(state.a);
  if (!admin || admin.tenantId !== state.t || (await isTenantSuspended(state.t))) {
    backTo(res, state.r, "figma_error", "not_allowed");
    return;
  }

  try {
    const callbackUrl = figmaCallbackUrl(publicOrigin(req));
    const tokens = await exchangeCode(req.query.code, state.n, callbackUrl);
    const user = tokens ? await figmaMe(tokens.accessToken, "oauth") : null;
    if (!tokens || !user) {
      backTo(res, state.r, "figma_error", "login_failed");
      return;
    }
    await saveFigmaConnection(state.t, state.a, "oauth", tokens, user);
  } catch (err) {
    // Only our own fixed messages: Figma's body and the tokens never reach a log.
    req.log.warn({ err: err instanceof Error ? err.name : "error" }, "figma sign-in failed");
    backTo(res, state.r, "figma_error", "login_failed");
    return;
  }
  backTo(res, state.r, "figma", "connected");
});

export default router;
