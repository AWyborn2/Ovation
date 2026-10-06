import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, eq, gt } from "drizzle-orm";
import {
  db,
  socialConnectionsTable,
  socialConnectionPendingTable,
  type PendingPage,
} from "@workspace/db";
import { CompleteMetaConnectBody, StartMetaConnectBody } from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import {
  PROVIDER,
  cancelOpenPublications,
  loadConnection,
  presentConnection,
  publishingAvailable,
  releaseHeld,
} from "../lib/publishing/connections";
import { signToken, verifyToken } from "../lib/publishing/signed-token";
import { loginDialogUrl } from "../lib/publishing/meta-login";

/**
 * The club side of connecting Meta (plan 2026-10-06-001 U3, R1).
 *
 *   start    → signed state carrying tenant, admin, return URL and a nonce;
 *              the browser goes to Meta's dialog.
 *   callback → (routes/meta-callbacks.ts, platform host) holds the Pages
 *              found and sends the browser back here with a completion token.
 *   pending  → the admin sees the Pages to choose from.
 *   complete → the chosen Page's token is stored; held posts resume.
 *
 * The completion token is a capability that only ever travels in the
 * connecting browser's redirect, and every step re-checks it against the
 * signed-in admin — so a stranger's login can never land on this club, and a
 * club admin can never pick up someone else's Pages.
 */
const router: IRouter = Router();

export const STATE_PURPOSE = "meta-oauth-state";
export const COMPLETE_PURPOSE = "meta-connect-complete";
export const STATE_TTL_MS = 15 * 60 * 1000;
export type OAuthState = { t: number; a: number; r: string; n: string };
export type CompletionClaims = { p: number; t: number; a: number };

const guard = [requireAdmin, requireEntitlement("socialPublishing")];

/** The admin page the connect flow returns to, on the host this request came in on. */
function returnUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}/admin/social/cards`;
}

router.get("/social-connections/meta", requireAdmin, async (req, res): Promise<void> => {
  res.json(await presentConnection(getTenantId(req)));
});

router.post("/social-connections/meta/start", ...guard, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const admin = (req as RequestWithAdmin).admin!;
  if (!(await publishingAvailable(tenantId))) {
    res.status(403).json({ error: "Publishing to Meta is not switched on." });
    return;
  }
  const parsed = StartMetaConnectBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await loadConnection(tenantId);
  if (existing?.status === "connected" && !parsed.data.replace) {
    res.status(409).json({ error: "Already connected. Confirm to replace the connection." });
    return;
  }
  const state = signToken(
    STATE_PURPOSE,
    {
      t: tenantId,
      a: admin.id,
      r: returnUrl(req),
      n: randomBytes(16).toString("hex"),
    } satisfies OAuthState,
    STATE_TTL_MS,
  );
  res.json({ url: loginDialogUrl(state) });
});

/** The pending choice behind a completion token, if it belongs to this admin. */
async function pendingFor(req: Request, token: unknown) {
  const claims = verifyToken<CompletionClaims>(COMPLETE_PURPOSE, token);
  const admin = (req as RequestWithAdmin).admin!;
  const tenantId = getTenantId(req);
  if (!claims || claims.t !== tenantId || claims.a !== admin.id) return null;
  const [row] = await db
    .select()
    .from(socialConnectionPendingTable)
    .where(
      and(
        eq(socialConnectionPendingTable.id, claims.p),
        eq(socialConnectionPendingTable.tenantId, tenantId),
        eq(socialConnectionPendingTable.adminId, admin.id),
        gt(socialConnectionPendingTable.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

router.get("/social-connections/meta/pending", ...guard, async (req, res): Promise<void> => {
  const row = await pendingFor(req, req.query.token);
  if (!row) {
    res.status(404).json({ error: "This connection attempt has expired. Start again." });
    return;
  }
  res.json({
    pages: row.pages.map((p: PendingPage) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      igUsername: p.igUsername,
    })),
  });
});

router.post("/social-connections/meta/complete", ...guard, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const admin = (req as RequestWithAdmin).admin!;
  if (!(await publishingAvailable(tenantId))) {
    res.status(403).json({ error: "Publishing to Meta is not switched on." });
    return;
  }
  const parsed = CompleteMetaConnectBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await pendingFor(req, parsed.data.token);
  const page = row?.pages.find((p: PendingPage) => p.pageId === parsed.data.pageId);
  if (!row || !page) {
    res.status(404).json({ error: "This connection attempt has expired. Start again." });
    return;
  }
  const existing = await loadConnection(tenantId);
  if (existing?.status === "connected" && !parsed.data.replace) {
    res.status(409).json({ error: "Already connected. Confirm to replace the connection." });
    return;
  }

  // Consume the pending choice first: a second complete with the same token finds nothing.
  const consumed = await db
    .delete(socialConnectionPendingTable)
    .where(eq(socialConnectionPendingTable.id, row.id))
    .returning({ id: socialConnectionPendingTable.id });
  if (consumed.length === 0) {
    res.status(404).json({ error: "This connection attempt has expired. Start again." });
    return;
  }

  const now = new Date();
  const values = {
    tenantId,
    provider: PROVIDER,
    status: "connected",
    metaUserId: row.metaUserId,
    pageId: page.pageId,
    pageName: page.pageName,
    igUserId: page.igUserId,
    igUsername: page.igUsername,
    pageToken: page.token,
    scopes: row.scopes,
    statusReason: null,
    connectedByAdminId: admin.id,
    connectedAt: now,
    lastHealthCheckAt: now,
    updatedAt: now,
  };
  await db
    .insert(socialConnectionsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [socialConnectionsTable.tenantId, socialConnectionsTable.provider],
      set: values,
    });

  // A different Page means the held posts were meant for the old one.
  if (existing?.pageId && existing.pageId !== page.pageId) {
    await cancelOpenPublications([tenantId], "The club connected a different Facebook Page.");
  } else {
    await releaseHeld(tenantId, now);
  }
  res.json(await presentConnection(tenantId));
});

router.delete("/social-connections/meta", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  await db
    .update(socialConnectionsTable)
    .set({ status: "disconnected", pageToken: null, statusReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(socialConnectionsTable.tenantId, tenantId),
        eq(socialConnectionsTable.provider, PROVIDER),
      ),
    );
  await db
    .delete(socialConnectionPendingTable)
    .where(eq(socialConnectionPendingTable.tenantId, tenantId));
  await cancelOpenPublications([tenantId], "The club disconnected Meta.");
  res.json(await presentConnection(tenantId));
});

export default router;
