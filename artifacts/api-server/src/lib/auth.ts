import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, adminsTable, type AdminRow } from "@workspace/db";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "hhcc_session";
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

export async function getAdminByUsername(username: string): Promise<AdminRow | null> {
  const [row] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.username, username.toLowerCase()));
  return row ?? null;
}

export async function ensureSeedAdmin(): Promise<void> {
  const existing = await db.select({ id: adminsTable.id }).from(adminsTable).limit(1);
  if (existing.length > 0) return;
  const seedPassword = process.env["ADMIN_PASSWORD"];
  if (!seedPassword) {
    // Nothing we can do until the operator sets one.
    return;
  }
  const passwordHash = await hashPassword(seedPassword);
  await db.insert(adminsTable).values({
    username: "owner",
    displayName: "Owner",
    passwordHash,
  });
}

export function generateRandomPassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
}
