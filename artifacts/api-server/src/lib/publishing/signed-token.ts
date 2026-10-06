import { createHmac, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "../auth";

/**
 * Short-lived signed tokens for the Meta connect flow (KTD3): the OAuth
 * `state` and the completion token handed back to the admin's browser. Each
 * carries a purpose, so one kind can never be replayed as the other, and an
 * expiry. Signed with the session secret; they carry ids only, never secrets.
 */

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function mac(purpose: string, body: string): string {
  return b64url(createHmac("sha256", getSessionSecret()).update(`${purpose}.${body}`).digest());
}

export function signToken(purpose: string, payload: object, ttlMs: number): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }), "utf8"));
  return `${body}.${mac(purpose, body)}`;
}

export function verifyToken<T extends object>(purpose: string, token: unknown): T | null {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(purpose, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(unb64url(body).toString("utf8")) as T & { exp?: number };
    if (typeof obj.exp !== "number" || obj.exp < Date.now()) return null;
    return obj;
  } catch {
    return null;
  }
}
