import { createHmac } from "node:crypto";
import { env } from "../../config";
import { DestinationError, type DestinationErrorKind } from "./destination";

/**
 * A thin Graph API client (Meta publishing KTD10, KTD14, KTD15).
 *
 * - The version is pinned in config, so a bump is a config change.
 * - Tokens travel in the Authorization header, never in a URL, and every call
 *   carries `appsecret_proof`. POST parameters go in the form body.
 * - Errors come back as `DestinationError` with a retry class, and their text
 *   is redacted: no token or proof ever reaches a log, a thrown error or a
 *   stored `last_error`.
 */

export type GraphRequest = {
  method: "GET" | "POST" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
};
export type GraphResponse = { status: number; json: unknown };
export type GraphTransport = (req: GraphRequest) => Promise<GraphResponse>;

const fetchTransport: GraphTransport = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
};

let transport: GraphTransport = fetchTransport;

/** Test seam: route Graph calls through `t` (null restores fetch). */
export function setGraphTransport(t: GraphTransport | null): void {
  transport = t ?? fetchTransport;
}

const GRAPH_HOST = "https://graph.facebook.com";

/** Meta access tokens start "EAA"; hex proofs are 64 chars. */
const TOKEN_SHAPES = [/EAA[A-Za-z0-9_-]{10,}/g, /\b[a-f0-9]{64}\b/g];

/** Strip anything token- or proof-shaped, plus the exact secrets in play. */
export function redact(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join("[redacted]");
  for (const re of TOKEN_SHAPES) out = out.replace(re, "[redacted]");
  return out;
}

export function appSecretProof(token: string): string {
  const secret = env.META_APP_SECRET();
  if (!secret) throw new DestinationError("permanent", "META_APP_SECRET is not set");
  return createHmac("sha256", secret).update(token).digest("hex");
}

// Rate limits and Meta-side blips (KTD10), plus Instagram's publishing limit (9).
const TRANSIENT_CODES = new Set([1, 2, 4, 9, 17, 32, 341, 613, 80001]);

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    error_user_msg?: string;
  };
};

export function classifyGraphError(
  status: number,
  body: unknown,
): {
  kind: DestinationErrorKind;
  code?: number;
  message: string;
} {
  const err = (body as GraphErrorBody | null)?.error;
  const code = err?.code;
  const message = err?.error_user_msg || err?.message || `Meta responded ${status}`;
  let kind: DestinationErrorKind;
  if (code === 190 || code === 102 || code === 463 || code === 467) kind = "token";
  else if (code === 506) kind = "duplicate";
  else if (err?.is_transient || (code != null && TRANSIENT_CODES.has(code))) kind = "transient";
  else if (status >= 500 || status === 429) kind = "transient";
  else kind = "permanent";
  return { kind, code, message };
}

export type GraphParams = Record<string, string | number | boolean | undefined>;

function encode(params: GraphParams): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v));
  return usp.toString();
}

/**
 * One Graph call as `token`. GET parameters go in the query (never the
 * token); POST parameters go in the form body.
 */
export async function graph<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: GraphParams,
  token: string,
): Promise<T> {
  const proof = appSecretProof(token);
  const base = `${GRAPH_HOST}/${env.META_GRAPH_VERSION()}/${path.replace(/^\//, "")}`;
  const all = { ...params, appsecret_proof: proof };
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const req: GraphRequest =
    method === "GET"
      ? { method, url: `${base}?${encode(all)}`, headers }
      : {
          method,
          url: base,
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: encode(all),
        };
  let res: GraphResponse;
  try {
    res = await transport(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DestinationError("transient", redact(`network error: ${msg}`, [token, proof]));
  }
  if (res.status >= 200 && res.status < 300 && !(res.json as GraphErrorBody | null)?.error) {
    return res.json as T;
  }
  const c = classifyGraphError(res.status, res.json);
  throw new DestinationError(c.kind, redact(c.message, [token, proof]), c.code);
}

/**
 * App-authenticated OAuth calls (code and token exchange). The app secret goes
 * in the POST body, never a URL.
 */
export async function oauthExchange(params: GraphParams): Promise<{ access_token: string }> {
  const appId = env.META_APP_ID();
  const secret = env.META_APP_SECRET();
  if (!appId || !secret) throw new DestinationError("permanent", "Meta app is not configured");
  const url = `${GRAPH_HOST}/${env.META_GRAPH_VERSION()}/oauth/access_token`;
  let res: GraphResponse;
  try {
    res = await transport({
      method: "POST",
      url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encode({ ...params, client_id: appId, client_secret: secret }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DestinationError("transient", redact(`network error: ${msg}`, [secret]));
  }
  const json = res.json as { access_token?: string } | null;
  if (res.status >= 200 && res.status < 300 && json?.access_token) {
    return { access_token: json.access_token };
  }
  const c = classifyGraphError(res.status, res.json);
  throw new DestinationError(c.kind, redact(c.message, [secret]), c.code);
}
