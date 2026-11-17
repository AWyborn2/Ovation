import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, adminsTable, platformAdminsTable, tenantsTable } from "@workspace/db";
import app from "../app";
import {
  encodePlatformSession,
  encodeSession,
  ensureSeedPlatformAdmin,
  getPlatformAdminById,
  hashPassword,
  PLATFORM_SESSION_COOKIE,
  SESSION_COOKIE,
  verifyPassword,
} from "../lib/auth";
import { env } from "../config";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = `dev-auth-${stamp}@example.com`;
const password = "fixture-password-dev-auth";
let platformId: number;
let clubId: number;
const tenantIds: number[] = [];
let platformCookie: string;
let clubCookie: string;

function development() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("REPLIT_DEPLOYMENT", "");
}
const clubRequest = (path: string, tenant = tenantIds[0]) =>
  request(app).get(path).set("Host", "dev-auth.replit.dev").set("x-tenant-id", String(tenant));

describe("development platform-admin-only access", () => {
  beforeAll(async () => {
    const passwordHash = await hashPassword(password);
    const [platform] = await db
      .insert(platformAdminsTable)
      .values({
        email,
        passwordHash,
        displayName: "Dev auth fixture",
      })
      .returning();
    platformId = platform.id;
    platformCookie = `${PLATFORM_SESSION_COOKIE}=${encodePlatformSession({
      platformAdminId: platformId,
      issuedAt: Date.now(),
      epoch: 0,
    })}`;
    for (let i = 0; i < 3; i++) {
      const [tenant] = await db
        .insert(tenantsTable)
        .values({
          slug: `dev-auth-${stamp}-${i}`,
          centralClubId: -1_900_000_000 + Math.floor(Math.random() * 100_000_000),
          name: `Dev auth fixture ${i}`,
          suspendedAt: i === 2 ? new Date() : null,
        })
        .returning();
      tenantIds.push(tenant.id);
    }
    const [club] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantIds[0],
        username: "owner",
        displayName: "Club fixture",
        passwordHash,
      })
      .returning();
    clubId = club.id;
    clubCookie = `${SESSION_COOKIE}=${encodeSession({
      adminId: clubId,
      issuedAt: Date.now(),
      epoch: 0,
    })}`;
  });

  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    if (tenantIds.length) {
      await db.delete(adminsTable).where(inArray(adminsTable.tenantId, tenantIds));
      await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
    }
    if (platformId)
      await db.delete(platformAdminsTable).where(eq(platformAdminsTable.id, platformId));
  });

  it("requires authentication and rejects an existing club session in development", async () => {
    development();
    await clubRequest("/api/auth/me").expect(401);
    await clubRequest("/api/auth/me").set("Cookie", clubCookie).expect(401);
    await clubRequest("/api/admins").set("Cookie", clubCookie).expect(401);
    await clubRequest("/api/auth/me")
      .set("Cookie", `${PLATFORM_SESSION_COOKIE}=invalid`)
      .expect(401);
  });

  it("blocks club password login even when the club password is correct", async () => {
    development();
    await request(app)
      .post("/api/auth/login")
      .set("Host", "dev-auth.replit.dev")
      .set("x-tenant-id", String(tenantIds[0]))
      .send({ username: "owner", password })
      .expect(403);
    await request(app)
      .post("/api/auth/password-reset/fixture-token")
      .send({ password })
      .expect(403);
  });

  it("uses platform login and the same session to administer two active clubs", async () => {
    development();
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email, password })
      .expect(200);
    expect(login.headers["set-cookie"]).toBeDefined();
    const ids = [];
    for (const tenantId of tenantIds.slice(0, 2)) {
      const me = await clubRequest("/api/auth/me", tenantId)
        .set("Cookie", platformCookie)
        .expect(200);
      expect(me.body.username).toBe(`__dev_platform_${platformId}`);
      expect(me.body.id).not.toBe(clubId);
      expect(me.body.passwordHash).toBeUndefined();
      ids.push(me.body.id);
      await clubRequest("/api/admins", tenantId).set("Cookie", platformCookie).expect(200);
    }
    expect(ids[0]).not.toBe(ids[1]);
    const again = await clubRequest("/api/auth/me").set("Cookie", platformCookie).expect(200);
    expect(again.body.id).toBe(ids[0]);
  });

  it("does not allow a platform session to bypass club suspension", async () => {
    development();
    await clubRequest("/api/auth/me", tenantIds[2]).set("Cookie", platformCookie).expect(401);
  });

  it("signing out from a club also clears the development platform session", async () => {
    development();
    const out = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", platformCookie)
      .expect(204);
    const cookies = out.headers["set-cookie"] as unknown as string[];
    expect(
      cookies.some((c) => c.startsWith(`${PLATFORM_SESSION_COOKIE}=`) && c.includes("Expires=")),
    ).toBe(true);
  });

  it.each([
    ["production", "1"],
    ["development", "1"],
    ["test", ""],
  ])(
    "keeps club/platform separation with NODE_ENV=%s and deployment=%s",
    async (nodeEnv, deployment) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("REPLIT_DEPLOYMENT", deployment);
      expect(env.devPlatformAdminOnly()).toBe(false);
      await clubRequest("/api/auth/me").set("Cookie", platformCookie).expect(401);
      const me = await clubRequest("/api/auth/me").set("Cookie", clubCookie).expect(200);
      expect(me.body.id).toBe(clubId);
      await request(app)
        .post("/api/auth/login")
        .set("Host", "dev-auth.replit.dev")
        .set("x-tenant-id", String(tenantIds[0]))
        .send({ username: "owner", password })
        .expect(200);
    },
  );

  it("only reconciles configured credentials in development and revokes old sessions", async () => {
    const changedPassword = "changed-fixture-password";
    vi.stubEnv("PLATFORM_ADMIN_EMAIL", email);
    vi.stubEnv("PLATFORM_ADMIN_PASSWORD", changedPassword);
    vi.stubEnv("NODE_ENV", "production");
    await ensureSeedPlatformAdmin();
    expect(
      await verifyPassword(password, (await getPlatformAdminById(platformId))!.passwordHash),
    ).toBe(true);
    development();
    await ensureSeedPlatformAdmin();
    const admin = (await getPlatformAdminById(platformId))!;
    expect(await verifyPassword(changedPassword, admin.passwordHash)).toBe(true);
    expect(admin.sessionEpoch).toBe(1);
    await clubRequest("/api/auth/me").set("Cookie", platformCookie).expect(401);
    await ensureSeedPlatformAdmin();
    expect((await getPlatformAdminById(platformId))!.sessionEpoch).toBe(1);
    await request(app)
      .post("/api/platform/auth/login")
      .send({ email, password: changedPassword })
      .expect(200);
  });

  it("log out everywhere revokes the actual platform session across all clubs", async () => {
    development();
    const admin = (await getPlatformAdminById(platformId))!;
    const cookie = `${PLATFORM_SESSION_COOKIE}=${encodePlatformSession({
      platformAdminId: platformId,
      issuedAt: Date.now(),
      epoch: admin.sessionEpoch,
    })}`;
    await clubRequest("/api/auth/me").set("Cookie", cookie).expect(200);
    await request(app)
      .post("/api/auth/logout-all")
      .set("Host", "dev-auth.replit.dev")
      .set("x-tenant-id", String(tenantIds[0]))
      .set("Cookie", cookie)
      .expect(204);
    for (const tenantId of tenantIds.slice(0, 2)) {
      await clubRequest("/api/auth/me", tenantId).set("Cookie", cookie).expect(401);
    }
    await request(app).get("/api/platform/auth/me").set("Cookie", cookie).expect(401);
  });
});
