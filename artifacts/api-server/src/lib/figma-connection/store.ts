/**
 * A club's own Figma connection (template library release 2, ADR-012, R2-E).
 *
 * One `figma_connections` row per tenant: a pasted personal access token
 * (`token`) or a Sign in with Figma grant (`oauth`, with a refresh token and
 * an expiry). Tokens are sealed with `secret-box` before they are stored and
 * opened only to call Figma. They are never returned, logged or put in an
 * error: every Figma failure here becomes a fixed message.
 */
import { createHash, createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  figmaConnectionPendingTable,
  figmaConnectionsTable,
  type FigmaConnectionRow,
} from "@workspace/db";
import { env } from "../../config";
import { getSessionSecret } from "../auth";
import { needsReseal, open, seal } from "../secret-box";
import { createFigmaClient, type FigmaClient, type FigmaFetch } from "../template-import/figma";

const FIGMA_API = "https://api.figma.com";
const FIGMA_AUTHORIZE = "https://www.figma.com/oauth";
const FIGMA_TIMEOUT_MS = 15_000;
/** Scopes Sign in with Figma asks for: who signed in, and reading file content. */
export const FIGMA_OAUTH_SCOPES = ["current_user:read", "file_content:read"] as const;
/** An OAuth access token this close to expiry is refreshed before use. */
export const REFRESH_WITHIN_MS = 5 * 60 * 1000;

export const RECONNECT_REASONS = {
  refused: "Figma no longer accepts this connection. Connect Figma again.",
  refreshFailed: "Figma sign-in expired and couldn't be renewed. Sign in with Figma again.",
} as const;

/** What a club sees about its connection; never the token. */
export type FigmaConnectionView = {
  connected: boolean;
  method: "oauth" | "token" | null;
  status: "connected" | "needs_reconnect" | null;
  figmaHandle: string | null;
  statusReason: string | null;
  connectedAt: string | null;
  oauthAvailable: boolean;
};

/** A Figma call that failed, as the club route answers it. No token, no Figma body. */
export class FigmaConnectionError extends Error {
  constructor(
    readonly status: 400 | 409 | 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "FigmaConnectionError";
  }
}

// ── HTTP seam ───────────────────────────────────────────────────────────────

/** The slice of fetch used for Figma's account and OAuth endpoints. */
export type FigmaHttp = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

let httpOverride: FigmaHttp | null = null;

/** Test seam: every Figma call this module and the club client make goes through `http`. */
export function setFigmaHttp(http: FigmaHttp | null): void {
  httpOverride = http;
}

function http(): FigmaHttp {
  return httpOverride ?? (fetch as unknown as FigmaHttp);
}

async function call(
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await http()(url, { ...init, signal: AbortSignal.timeout(FIGMA_TIMEOUT_MS) });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Not JSON: the status decides.
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    throw new FigmaConnectionError(502, "Couldn't reach Figma. Try again in a minute.");
  }
}

// ── Figma accounts ──────────────────────────────────────────────────────────

export type FigmaUser = { id: string; handle: string };

/**
 * Who a token belongs to (`GET /v1/me`). Null when Figma refuses the token
 * (401/403); throws for anything else.
 */
export async function figmaMe(token: string, auth: "personal" | "oauth"): Promise<FigmaUser | null> {
  const headers: Record<string, string> =
    auth === "oauth" ? { Authorization: `Bearer ${token}` } : { "X-Figma-Token": token };
  const res = await call(`${FIGMA_API}/v1/me`, { headers });
  if (res.status === 401 || res.status === 403) return null;
  const body = res.body as { id?: unknown; handle?: unknown } | null;
  if (!res.ok || typeof body?.id !== "string") {
    throw new FigmaConnectionError(502, `Figma answered ${res.status}. Try again in a minute.`);
  }
  return { id: body.id, handle: typeof body.handle === "string" ? body.handle : "" };
}

// ── OAuth ───────────────────────────────────────────────────────────────────

export function oauthAvailable(): boolean {
  return !!env.FIGMA_CLIENT_ID();
}

/** Where Figma sends the browser back: the one callback registered with the app. */
export function figmaCallbackUrl(requestOrigin: string): string {
  const origin = env.SOCIAL_PUBLIC_ORIGIN() ?? requestOrigin;
  return `${origin.replace(/\/$/, "")}/api/figma/oauth/callback`;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The PKCE verifier for a sign-in, derived from its nonce with the session
 * secret: only the server can make it, and nothing extra is stored.
 */
export function pkceVerifier(nonce: string): string {
  return b64url(createHmac("sha256", getSessionSecret()).update(`figma-pkce.${nonce}`).digest());
}

export function figmaAuthorizeUrl(state: string, nonce: string, callbackUrl: string): string {
  const clientId = env.FIGMA_CLIENT_ID();
  if (!clientId) throw new FigmaConnectionError(503, "Sign in with Figma isn't set up.");
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: FIGMA_OAUTH_SCOPES.join(","),
    state,
    response_type: "code",
    code_challenge: b64url(createHash("sha256").update(pkceVerifier(nonce)).digest()),
    code_challenge_method: "S256",
  });
  return `${FIGMA_AUTHORIZE}?${q.toString()}`;
}

function clientAuth(): string {
  const id = env.FIGMA_CLIENT_ID();
  const secret = env.FIGMA_CLIENT_SECRET();
  if (!id || !secret) throw new FigmaConnectionError(503, "Sign in with Figma isn't set up.");
  return `Basic ${Buffer.from(`${id}:${secret}`, "utf8").toString("base64")}`;
}

export type FigmaTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date | null };

function tokensFrom(body: unknown, refreshToken: string | null): FigmaTokens | null {
  const b = body as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  if (typeof b?.access_token !== "string" || !b.access_token) return null;
  const expiresIn = typeof b.expires_in === "number" && b.expires_in > 0 ? b.expires_in : null;
  return {
    accessToken: b.access_token,
    refreshToken: typeof b.refresh_token === "string" ? b.refresh_token : refreshToken,
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000),
  };
}

/** Swap a callback's code for tokens (`POST /v1/oauth/token`). Null when Figma refuses. */
export async function exchangeCode(
  code: string,
  nonce: string,
  callbackUrl: string,
): Promise<FigmaTokens | null> {
  const res = await call(`${FIGMA_API}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: clientAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      redirect_uri: callbackUrl,
      code,
      grant_type: "authorization_code",
      code_verifier: pkceVerifier(nonce),
    }).toString(),
  });
  return res.ok ? tokensFrom(res.body, null) : null;
}

/**
 * A fresh access token (`POST /v1/oauth/refresh`). Figma keeps the refresh
 * token, so the old one carries over. Null when Figma refuses.
 */
export async function refreshTokens(refreshToken: string): Promise<FigmaTokens | null> {
  const res = await call(`${FIGMA_API}/v1/oauth/refresh`, {
    method: "POST",
    headers: {
      Authorization: clientAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ refresh_token: refreshToken }).toString(),
  });
  return res.ok ? tokensFrom(res.body, refreshToken) : null;
}

// ── The row ─────────────────────────────────────────────────────────────────

export async function loadFigmaConnection(tenantId: number): Promise<FigmaConnectionRow | null> {
  const [row] = await db
    .select()
    .from(figmaConnectionsTable)
    .where(eq(figmaConnectionsTable.tenantId, tenantId));
  return row ?? null;
}

export function presentFigmaConnection(row: FigmaConnectionRow | null): FigmaConnectionView {
  return {
    connected: !!row && row.status === "connected",
    method: row ? (row.method as "oauth" | "token") : null,
    status: row ? (row.status as "connected" | "needs_reconnect") : null,
    figmaHandle: row?.figmaHandle ?? null,
    statusReason: row?.statusReason ?? null,
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    oauthAvailable: oauthAvailable(),
  };
}

/** Store (or replace) the club's connection, sealing every token. */
export async function saveFigmaConnection(
  tenantId: number,
  adminId: number,
  method: "oauth" | "token",
  tokens: FigmaTokens,
  user: FigmaUser,
): Promise<FigmaConnectionRow> {
  const now = new Date();
  const values = {
    tenantId,
    method,
    status: "connected",
    accessToken: seal(tokens.accessToken),
    refreshToken: tokens.refreshToken ? seal(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    figmaUserId: user.id,
    figmaHandle: user.handle || null,
    statusReason: null,
    connectedByAdminId: adminId,
    connectedAt: now,
    updatedAt: now,
  };
  const [row] = await db
    .insert(figmaConnectionsTable)
    .values(values)
    .onConflictDoUpdate({ target: figmaConnectionsTable.tenantId, set: values })
    .returning();
  return row!;
}

export async function markNeedsReconnect(tenantId: number, reason: string): Promise<void> {
  await db
    .update(figmaConnectionsTable)
    .set({ status: "needs_reconnect", statusReason: reason, updatedAt: new Date() })
    .where(eq(figmaConnectionsTable.tenantId, tenantId));
}

/** Disconnect: the row and its sealed tokens go, and any sign-in in progress. */
export async function deleteFigmaConnection(tenantId: number): Promise<void> {
  await db.delete(figmaConnectionsTable).where(eq(figmaConnectionsTable.tenantId, tenantId));
  await db
    .delete(figmaConnectionPendingTable)
    .where(eq(figmaConnectionPendingTable.tenantId, tenantId));
}

const NO_CONNECTION = "Connect Figma in Social Studio settings first.";

/**
 * The access token to call Figma with: refreshed first when an OAuth token is
 * within 5 minutes of expiry (a failed refresh marks the connection
 * `needs_reconnect`), and re-sealed under the current key when it was sealed
 * under an older one.
 */
export async function usableAccessToken(
  tenantId: number,
): Promise<{ token: string; method: "oauth" | "token" }> {
  const row = await loadFigmaConnection(tenantId);
  if (!row) throw new FigmaConnectionError(409, NO_CONNECTION);
  if (row.status !== "connected") {
    throw new FigmaConnectionError(409, row.statusReason ?? RECONNECT_REASONS.refused);
  }
  const method = row.method as "oauth" | "token";
  if (
    method === "oauth" &&
    row.expiresAt &&
    row.expiresAt.getTime() - Date.now() < REFRESH_WITHIN_MS
  ) {
    const refreshed = row.refreshToken ? await refreshTokens(open(row.refreshToken)) : null;
    if (!refreshed) {
      await markNeedsReconnect(tenantId, RECONNECT_REASONS.refreshFailed);
      throw new FigmaConnectionError(409, RECONNECT_REASONS.refreshFailed);
    }
    await db
      .update(figmaConnectionsTable)
      .set({
        accessToken: seal(refreshed.accessToken),
        ...(refreshed.refreshToken ? { refreshToken: seal(refreshed.refreshToken) } : {}),
        expiresAt: refreshed.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(figmaConnectionsTable.tenantId, tenantId));
    return { token: refreshed.accessToken, method };
  }
  const token = open(row.accessToken);
  if (needsReseal(row.accessToken)) {
    await db
      .update(figmaConnectionsTable)
      .set({
        accessToken: seal(token),
        ...(row.refreshToken ? { refreshToken: seal(open(row.refreshToken)) } : {}),
      })
      .where(eq(figmaConnectionsTable.tenantId, tenantId));
  }
  return { token, method };
}

/** A Figma client on the club's own connection. */
export async function clubFigmaClient(tenantId: number): Promise<FigmaClient> {
  const { token, method } = await usableAccessToken(tenantId);
  const override = httpOverride;
  return createFigmaClient({
    token,
    auth: method === "oauth" ? "oauth" : "personal",
    fetch: override ? (override as unknown as FigmaFetch) : undefined,
  });
}
