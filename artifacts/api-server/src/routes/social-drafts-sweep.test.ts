/**
 * Tests for POST /social-drafts/sweep — bulk match-summary draft generation.
 * Covers: validation (400), the matchIds and season+grade paths for the native
 * club (tenant #1), the junior flag, and tenant-scoping: the senior path reads
 * the native match tables (tenant #1's only), so any other tenant gets a 409
 * and can never draft tenant #1's matches. Real-DB integration test (needs
 * DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  socialSettingsTable,
  socialDraftsTable,
  matchesTable,
  importsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { NATIVE_STATS_TENANT_ID } from "../lib/tenant";
import { draftKeys } from "../lib/draft-upsert";

const STAMP = Date.now();

let tenantId: number;
let adminId: number;
let nativeAdminId: number;
let cookie: string;
let nativeCookie: string;
let importId: number;
let matchId: number;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-sweep";

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      slug: `sweep-test-${STAMP}`,
      centralClubId: 9901,
      name: "Sweep Test Club",
      plan: "pro",
    })
    .returning();
  tenantId = tenant.id;

  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId,
      username: `sweep_admin_${STAMP}`,
      displayName: "Sweep Admin",
      passwordHash: "x",
    })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

  // The native club's own admin (tenant #1 owns the native match tables).
  const [nativeAdmin] = await db
    .insert(adminsTable)
    .values({
      tenantId: NATIVE_STATS_TENANT_ID,
      username: `sweep_native_admin_${STAMP}`,
      displayName: "Sweep Native Admin",
      passwordHash: "x",
    })
    .returning();
  nativeAdminId = nativeAdmin.id;
  nativeCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: nativeAdminId, issuedAt: Date.now() })}`;

  await db.insert(socialSettingsTable).values({
    tenantId,
    engineMatchSummary: true,
    matchSummaryGradeConfig: {},
  });

  const [imp] = await db
    .insert(importsTable)
    .values({
      filename: `sweep-test-${STAMP}.csv`,
      grade: "A Grade",
      season: 2024,
      kind: "csv",
      rowCount: 1,
      status: "complete",
    })
    .returning();
  importId = imp.id;

  // A native (tenant #1) match.
  const [match] = await db
    .insert(matchesTable)
    .values({
      importId,
      season: 2024,
      grade: "A Grade",
      round: 1,
      matchDate: "2025-01-15",
      venue: "Test Oval",
      opponent: "Test CC",
      sourceKey: `sweep-test-${STAMP}`,
    })
    .returning();
  matchId = match.id;
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db
    .delete(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, NATIVE_STATS_TENANT_ID),
        eq(socialDraftsTable.sourceKey, draftKeys.matchSummary(matchId, false)),
      ),
    );
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(matchesTable).where(eq(matchesTable.id, matchId));
  await db.delete(importsTable).where(eq(importsTable.id, importId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(adminsTable).where(eq(adminsTable.id, nativeAdminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const sweep = (body: Record<string, unknown>) =>
  request(app)
    .post("/api/social-drafts/sweep")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId))
    .send(body);

const nativeSweep = (body: Record<string, unknown>) =>
  request(app)
    .post("/api/social-drafts/sweep")
    .set("Cookie", nativeCookie)
    .set("x-tenant-id", String(NATIVE_STATS_TENANT_ID))
    .send(body);

describe("POST /social-drafts/sweep", () => {
  it("returns 400 when neither matchIds nor season is provided", async () => {
    const res = await sweep({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/matchIds|season/i);
  });

  it("returns 400 with an empty body", async () => {
    const res = await sweep({ junior: false });
    expect(res.status).toBe(400);
  });

  it("the native club: accepts explicit matchIds and returns a draft result", async () => {
    const res = await nativeSweep({ matchIds: [matchId] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("drafted");
    expect(res.body).toHaveProperty("skipped");
    expect(res.body).toHaveProperty("errors");
    expect(typeof res.body.drafted).toBe("number");
  });

  it("the native club: accepts the season+grade filter path", async () => {
    const res = await nativeSweep({ season: 2024, grade: "A Grade" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("drafted");
  });

  it("accepts junior flag with season filter (junior matches are tenant-scoped)", async () => {
    const res = await sweep({ season: 2024, junior: true });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("drafted");
    // No junior matches seeded, so nothing drafted
    expect(res.body.drafted).toBe(0);
  });

  it("requires admin authentication", async () => {
    const res = request(app)
      .post("/api/social-drafts/sweep")
      .set("x-tenant-id", String(tenantId))
      .send({ matchIds: [matchId] });
    expect((await res).status).toBe(401);
  });
});

describe("POST /social-drafts/sweep — another tenant can't draft tenant #1's matches", () => {
  it("409s for explicit native match ids, season and season+grade", async () => {
    for (const body of [
      { matchIds: [matchId] },
      { season: 2024 },
      { season: 2024, grade: "A Grade" },
    ]) {
      const res = await sweep(body);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/backfill-matches/);
    }
  });

  it("drafts nothing under the other tenant", async () => {
    await sweep({ matchIds: [matchId] });
    const drafts = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, tenantId));
    expect(drafts).toHaveLength(0);
  });
});
