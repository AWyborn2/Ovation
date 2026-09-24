/**
 * Social Studio U11 — the landscape format switch round-trips through the
 * settings API and is off by default. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
let tenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-landscape";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `landscape-${STAMP}`, centralClubId: 9993, name: "Wide Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `wide_${STAMP}`, displayName: "Wide", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
});

afterAll(async () => {
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("sizeLandscape", () => {
  it("is off by default and round-trips through PATCH / GET", async () => {
    const api = request(app);
    const first = await api
      .get("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));
    expect(first.body.settings.sizeLandscape).toBe(false);

    const saved = await api
      .patch("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send({ sizeLandscape: true });
    expect(saved.status).toBe(200);
    expect(saved.body.sizeLandscape).toBe(true);

    const again = await api
      .get("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));
    expect(again.body.settings.sizeLandscape).toBe(true);
  });
});
