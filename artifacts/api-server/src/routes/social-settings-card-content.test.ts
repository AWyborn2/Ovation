/**
 * Card content settings (ADR-010 P2, migration 0052): the preset, per-field
 * choices and livestream link round-trip through the settings API, are
 * cleaned and validated, default to Standard, and are tenant-scoped.
 * Real-DB integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
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
const tenantIds: number[] = [];
const adminIds: number[] = [];
const cookies: string[] = [];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-card-content";
  for (const i of [0, 1]) {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `card-content-${i}-${STAMP}`,
        centralClubId: 9970 + i,
        name: `Content Club ${i}`,
        plan: "pro",
      })
      .returning();
    tenantIds.push(t.id);
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `content_${i}_${STAMP}`,
        displayName: "Content",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    cookies.push(`${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`);
  }
});

afterAll(async () => {
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, tenantIds));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  for (const id of tenantIds) await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
});

const get = (i: number) =>
  request(app)
    .get("/api/social-settings")
    .set("Cookie", cookies[i])
    .set("x-tenant-id", String(tenantIds[i]));
const patch = (i: number, body: object) =>
  request(app)
    .patch("/api/social-settings")
    .set("Cookie", cookies[i])
    .set("x-tenant-id", String(tenantIds[i]))
    .send(body);

const STANDARD = { preset: "standard", fields: {}, juniorConsolidateByDay: true };
/** Every content kind (ADR-010 P7); a kind the club never chose is Standard. */
const ALL = (matchDay = STANDARD, over: object = {}) => ({
  matchDay,
  results: STANDARD,
  matchSummary: STANDARD,
  teamList: STANDARD,
  ...over,
});

describe("cardContent", () => {
  it("defaults to Standard with junior consolidation on, and no livestream", async () => {
    const res = await get(0).expect(200);
    expect(res.body.settings.cardContent).toEqual(ALL());
    expect(res.body.settings.livestreamUrl).toBeNull();
  });

  it("saves a preset and per-field choices, dropping unknown and core keys", async () => {
    const res = await patch(0, {
      cardContent: {
        matchDay: {
          preset: "minimal",
          fields: { "fixture.oppositionCrest": true, "fixture.venue": false, nope: true },
          juniorConsolidateByDay: false,
        },
      },
    }).expect(200);
    const saved = {
      preset: "minimal",
      fields: { "fixture.oppositionCrest": true },
      juniorConsolidateByDay: false,
    };
    expect(res.body.cardContent).toEqual(ALL(saved));
    expect((await get(0).expect(200)).body.settings.cardContent).toEqual(ALL(saved));
  });

  it("rejects an unknown preset", async () => {
    await patch(0, {
      cardContent: { matchDay: { preset: "huge", fields: {}, juniorConsolidateByDay: true } },
    }).expect(400);
  });

  it("another club's settings are untouched", async () => {
    expect((await get(1).expect(200)).body.settings.cardContent).toEqual(ALL());
  });

  it("saves a team list and a results choice beside match day (P7)", async () => {
    const teamList = {
      preset: "standard",
      fields: { "team.shirtNumbers": false, "fixture.photo": false },
      juniorConsolidateByDay: true,
    };
    const results = { preset: "minimal", fields: {}, juniorConsolidateByDay: true };
    const matchDay = { preset: "minimal", fields: {}, juniorConsolidateByDay: false };
    const res = await patch(0, { cardContent: { matchDay, results, teamList } }).expect(200);
    // A key from another kind is dropped.
    const want = ALL(matchDay, {
      results,
      teamList: { ...teamList, fields: { "team.shirtNumbers": false } },
    });
    expect(res.body.cardContent).toEqual(want);
    expect((await get(0).expect(200)).body.settings.cardContent).toEqual(want);
  });

  it("other saves leave the content choices alone", async () => {
    await patch(0, { sizeLandscape: true }).expect(200);
    expect((await get(0).expect(200)).body.settings.cardContent.matchDay.preset).toBe("minimal");
  });
});

describe("livestreamUrl", () => {
  it("saves an https link, trimmed", async () => {
    const res = await patch(0, { livestreamUrl: "  https://youtube.com/@club/live " }).expect(200);
    expect(res.body.livestreamUrl).toBe("https://youtube.com/@club/live");
  });

  it("refuses anything that is not https", async () => {
    await patch(0, { livestreamUrl: "http://example.com" }).expect(400);
    await patch(0, { livestreamUrl: "javascript:alert(1)" }).expect(400);
  });

  it("an empty link clears it", async () => {
    const res = await patch(0, { livestreamUrl: "  " }).expect(200);
    expect(res.body.livestreamUrl).toBeNull();
  });
});

describe("sponsorsPerSlide", () => {
  it("defaults to 12", async () => {
    const res = await get(0).expect(200);
    expect(res.body.settings.sponsorsPerSlide).toBe(12);
  });

  it("saves a value in range, and another club keeps its own", async () => {
    const res = await patch(0, { sponsorsPerSlide: 8 }).expect(200);
    expect(res.body.sponsorsPerSlide).toBe(8);
    expect((await get(0).expect(200)).body.settings.sponsorsPerSlide).toBe(8);
    expect((await get(1).expect(200)).body.settings.sponsorsPerSlide).toBe(12);
  });

  it("refuses a value out of range or not whole, and keeps the saved one", async () => {
    for (const bad of [2, 17, 7.5, -1]) await patch(0, { sponsorsPerSlide: bad }).expect(400);
    expect((await get(0).expect(200)).body.settings.sponsorsPerSlide).toBe(8);
  });
});
