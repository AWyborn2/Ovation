import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import express, { Router, type IRouter, type Response } from "express";
import rateLimit from "express-rate-limit";
import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable, socialConnectionPendingTable } from "@workspace/db";
import { env } from "../config";
import { getAdminById } from "../lib/auth";
import { isTenantSuspended } from "../lib/tenant";
import { seal } from "../lib/secret-box";
import { cancelOpenPublications, publishingAvailable } from "../lib/publishing/connections";
import { completeLogin } from "../lib/publishing/meta-login";
import { signToken, verifyToken } from "../lib/publishing/signed-token";
import {
  COMPLETE_PURPOSE,
  STATE_PURPOSE,
  type CompletionClaims,
  type OAuthState,
} from "./social-connections";

/**
 * Meta-facing endpoints (plan 2026-10-06-001 U3, KTD3, KTD16), mounted at
 * /api/meta BEFORE tenant context: they live on the one platform host Meta
 * knows about, and the tenant comes from a signed state or a signed request,
 * never from the host.
 *
 *   GET  /oauth/callback       — Meta's redirect after the login dialog
 *   POST /deauthorize          — a user removed the app
 *   POST /data-deletion        — a user asked Meta to delete their data
 *   GET  /data-deletion/:code  — the status page Meta links to
 */
const router: IRouter = Router();

const PENDING_TTL_MS = 10 * 60 * 1000;
const COMPLETE_TTL_MS = 10 * 60 * 1000;
/** Signed requests older than this are refused (KTD16). */
const SIGNED_REQUEST_MAX_AGE_S = 24 * 60 * 60;

const metaLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

function redirectWith(res: Response, returnUrl: string, key: string, value: string): void {
  const url = new URL(returnUrl);
  url.searchParams.set(key, value);
  res.redirect(303, url.toString());
}

router.get("/oauth/callback", metaLimiter, async (req, res): Promise<void> => {
  const state = verifyToken<OAuthState>(STATE_PURPOSE, req.query.state);
  if (!state) {
    res.status(400).type("text/plain").send("This connection link has expired. Start again.");
    return;
  }
  if (typeof req.query.error === "string" || typeof req.query.code !== "string") {
    redirectWith(res, state.r, "meta_error", "cancelled");
    return;
  }
  // The admin who started must still be an admin of that club, and the club live.
  const admin = await getAdminById(state.a);
  if (!admin || admin.tenantId !== state.t || (await isTenantSuspended(state.t))) {
    redirectWith(res, state.r, "meta_error", "not_allowed");
    return;
  }
  if (!(await publishingAvailable(state.t))) {
    redirectWith(res, state.r, "meta_error", "unavailable");
    return;
  }

  let login;
  try {
    login = await completeLogin(req.query.code);
  } catch (err) {
    req.log.warn({ err: err instanceof Error ? err.message : String(err) }, "meta login failed");
    redirectWith(res, state.r, "meta_error", "login_failed");
    return;
  }
  if (login.pages.length === 0) {
    redirectWith(res, state.r, "meta_error", "no_pages");
    return;
  }

  await db
    .delete(socialConnectionPendingTable)
    .where(
      and(
        eq(socialConnectionPendingTable.tenantId, state.t),
        eq(socialConnectionPendingTable.adminId, state.a),
      ),
    );
  const [pending] = await db
    .insert(socialConnectionPendingTable)
    .values({
      tenantId: state.t,
      adminId: state.a,
      metaUserId: login.metaUserId,
      scopes: login.scopes,
      pages: login.pages.map((p) => ({
        pageId: p.pageId,
        pageName: p.pageName,
        igUserId: p.igUserId,
        igUsername: p.igUsername,
        token: seal(p.token),
      })),
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    })
    .returning({ id: socialConnectionPendingTable.id });

  const token = signToken(
    COMPLETE_PURPOSE,
    { p: pending.id, t: state.t, a: state.a } satisfies CompletionClaims,
    COMPLETE_TTL_MS,
  );
  redirectWith(res, state.r, "meta_connect", token);
});

type SignedRequest = { algorithm?: string; issued_at?: number; user_id?: string };

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/** Verify Meta's `signed_request` (HMAC-SHA256 with the app secret only). */
export function parseSignedRequest(raw: unknown, nowS = Date.now() / 1000): SignedRequest | null {
  const secret = env.META_APP_SECRET();
  if (!secret || typeof raw !== "string") return null;
  const [sig, payload] = raw.split(".");
  if (!sig || !payload) return null;
  let data: SignedRequest;
  try {
    data = JSON.parse(b64urlDecode(payload).toString("utf8")) as SignedRequest;
  } catch {
    return null;
  }
  if (data.algorithm?.toUpperCase() !== "HMAC-SHA256") return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = b64urlDecode(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (typeof data.issued_at !== "number" || nowS - data.issued_at > SIGNED_REQUEST_MAX_AGE_S) {
    return null;
  }
  if (typeof data.user_id !== "string" || !data.user_id) return null;
  return data;
}

/** Forget a Meta user everywhere they connected a club. */
async function forgetMetaUser(metaUserId: string, reason: string): Promise<void> {
  const rows = await db
    .update(socialConnectionsTable)
    .set({ status: "disconnected", pageToken: null, statusReason: reason, updatedAt: new Date() })
    .where(eq(socialConnectionsTable.metaUserId, metaUserId))
    .returning({ tenantId: socialConnectionsTable.tenantId });
  await db
    .delete(socialConnectionPendingTable)
    .where(eq(socialConnectionPendingTable.metaUserId, metaUserId));
  const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
  if (tenantIds.length) await cancelOpenPublications(tenantIds, reason);
}

const form = express.urlencoded({ extended: false, limit: "10kb" });

router.post("/deauthorize", metaLimiter, form, async (req, res): Promise<void> => {
  const data = parseSignedRequest((req.body as Record<string, unknown>)?.signed_request);
  if (!data) {
    res.status(400).json({ error: "invalid signed_request" });
    return;
  }
  await forgetMetaUser(data.user_id!, "Meta access was removed from Facebook.");
  res.json({ ok: true });
});

router.post("/data-deletion", metaLimiter, form, async (req, res): Promise<void> => {
  const data = parseSignedRequest((req.body as Record<string, unknown>)?.signed_request);
  if (!data) {
    res.status(400).json({ error: "invalid signed_request" });
    return;
  }
  await forgetMetaUser(data.user_id!, "Meta data was deleted at the user's request.");
  const code = randomBytes(16).toString("hex");
  const origin = (env.SOCIAL_PUBLIC_ORIGIN() ?? "").replace(/\/$/, "");
  res.json({ url: `${origin}/api/meta/data-deletion/${code}`, confirmation_code: code });
});

// Deletion runs synchronously above, so every well-formed code reports done.
// The code is opaque: it reveals nothing about whose data, or whether any existed.
router.get("/data-deletion/:code", metaLimiter, (req, res): void => {
  const code = String(req.params.code);
  if (!/^[a-f0-9]{32}$/.test(code)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ status: "completed", confirmation_code: code });
});

export default router;
