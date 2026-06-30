import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  adminsTable,
  platformAdminsTable,
  captainsTable,
  type AdminRow,
  type PlatformAdminRow,
  type CaptainRow,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

/** Halls Head is tenant #1 — the seed admin's tenant and the dev/default tenant. */
const DEFAULT_TENANT_ID = 1;

const COOKIE_NAME = "hhcc_session";
const CAPTAIN_COOKIE_NAME = "hhcc_captain_session";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function getSessionSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET is not configured");
  return s;
}

export interface SessionPayload {
  adminId: number;
  issuedAt: number;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return b64urlEncode(createHmac("sha256", getSessionSecret()).update(payload).digest());
}

export function encodeSession(p: SessionPayload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(p), "utf8"));
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (typeof obj?.adminId !== "number" || typeof obj?.issuedAt !== "number") {
      return null;
    }
    if (Date.now() - obj.issuedAt > COOKIE_MAX_AGE_MS) return null;
    return obj as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env["NODE_ENV"] === "production",
  path: "/",
  maxAge: COOKIE_MAX_AGE_MS,
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function getAdminById(id: number): Promise<AdminRow | null> {
  const [row] = await db.select().from(adminsTable).where(eq(adminsTable.id, id));
  return row ?? null;
}

/** Look up an admin by username WITHIN a tenant (usernames are per-tenant). */
export async function getAdminByUsernameForTenant(
  tenantId: number,
  username: string,
): Promise<AdminRow | null> {
  const [row] = await db
    .select()
    .from(adminsTable)
    .where(
      and(
        eq(adminsTable.tenantId, tenantId),
        eq(adminsTable.username, username.toLowerCase()),
      ),
    );
  return row ?? null;
}

export async function ensureSeedAdmin(): Promise<void> {
  // Seed the demo tenant (Halls Head, #1) only — never blanket-seed every tenant.
  const existing = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(eq(adminsTable.tenantId, DEFAULT_TENANT_ID))
    .limit(1);
  if (existing.length > 0) return;
  const seedPassword = process.env["ADMIN_PASSWORD"];
  if (!seedPassword) {
    // Nothing we can do until the operator sets one.
    return;
  }
  const passwordHash = await hashPassword(seedPassword);
  await db.insert(adminsTable).values({
    tenantId: DEFAULT_TENANT_ID,
    username: "owner",
    displayName: "Owner",
    passwordHash,
  });
}

// ---- Platform (super) admins: the apex/concierge console, separate from clubs --

const PLATFORM_COOKIE_NAME = "ovation_platform_session";

export interface PlatformSessionPayload {
  platformAdminId: number;
  issuedAt: number;
}

export function encodePlatformSession(p: PlatformSessionPayload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(p), "utf8"));
  return `${body}.${sign(body)}`;
}

export function decodePlatformSession(
  token: string | undefined | null,
): PlatformSessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (
      typeof obj?.platformAdminId !== "number" ||
      typeof obj?.issuedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - obj.issuedAt > COOKIE_MAX_AGE_MS) return null;
    return obj as PlatformSessionPayload;
  } catch {
    return null;
  }
}

export const PLATFORM_SESSION_COOKIE = PLATFORM_COOKIE_NAME;

export async function getPlatformAdminById(
  id: number,
): Promise<PlatformAdminRow | null> {
  const [row] = await db
    .select()
    .from(platformAdminsTable)
    .where(eq(platformAdminsTable.id, id));
  return row ?? null;
}

export async function getPlatformAdminByEmail(
  email: string,
): Promise<PlatformAdminRow | null> {
  const [row] = await db
    .select()
    .from(platformAdminsTable)
    .where(eq(platformAdminsTable.email, email.toLowerCase()));
  return row ?? null;
}

export async function ensureSeedPlatformAdmin(): Promise<void> {
  const existing = await db
    .select({ id: platformAdminsTable.id })
    .from(platformAdminsTable)
    .limit(1);
  if (existing.length > 0) return;
  const email = process.env["PLATFORM_ADMIN_EMAIL"];
  const password = process.env["PLATFORM_ADMIN_PASSWORD"];
  if (!email || !password) return; // nothing to seed until the operator sets both
  const passwordHash = await hashPassword(password);
  await db.insert(platformAdminsTable).values({
    email: email.toLowerCase(),
    displayName: "Platform Admin",
    passwordHash,
  });
}

export function generateRandomPassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}

// ---- Captain sessions (a separate login role from admins) ----

export interface CaptainSessionPayload {
  captainId: number;
  issuedAt: number;
}

export function encodeCaptainSession(p: CaptainSessionPayload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(p), "utf8"));
  return `${body}.${sign(body)}`;
}

export function decodeCaptainSession(
  token: string | undefined | null,
): CaptainSessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (typeof obj?.captainId !== "number" || typeof obj?.issuedAt !== "number") {
      return null;
    }
    if (Date.now() - obj.issuedAt > COOKIE_MAX_AGE_MS) return null;
    return obj as CaptainSessionPayload;
  } catch {
    return null;
  }
}

export const CAPTAIN_SESSION_COOKIE = CAPTAIN_COOKIE_NAME;

export async function getCaptainById(id: number): Promise<CaptainRow | null> {
  const [row] = await db.select().from(captainsTable).where(eq(captainsTable.id, id));
  return row ?? null;
}

export async function getCaptainByUsername(username: string): Promise<CaptainRow | null> {
  const [row] = await db
    .select()
    .from(captainsTable)
    .where(eq(captainsTable.username, username.toLowerCase()));
  return row ?? null;
}
