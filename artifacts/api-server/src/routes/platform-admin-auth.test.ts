import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, platformAdminsTable } from "@workspace/db";
import { hashPassword, PLATFORM_SESSION_COOKIE } from "../lib/auth";

/**
 * Platform-admin (super-admin) auth (Phase 2e). Seeds one platform admin and
 * exercises the apex login/me/logout surface. Real-DB integration test (needs
 * DATABASE_URL; central NOT required).
 */

const STAMP = Date.now();
const EMAIL = `super+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("platform-admin auth", () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-platform-admin";
    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
  });

  afterAll(async () => {
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("logs in with valid credentials and sets the platform cookie", async () => {
    const res = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    expect(res.body.email).toBe(EMAIL);
    expect(String(res.headers["set-cookie"])).toContain(PLATFORM_SESSION_COOKIE);
  });

  it("rejects a wrong password (401)", async () => {
    await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: "not the password" })
      .expect(401);
  });

  it("returns the admin from /me with a valid session", async () => {
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const cookie = String(login.headers["set-cookie"][0]).split(";")[0];

    const me = await request(app)
      .get("/api/platform/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(me.body.email).toBe(EMAIL);
  });

  it("is 401 from /me without a cookie", async () => {
    await request(app).get("/api/platform/auth/me").expect(401);
  });
});
