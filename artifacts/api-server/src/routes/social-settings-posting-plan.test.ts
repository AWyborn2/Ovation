/**
 * Posting Plan on /social-settings (plan 2026-10-07-001 U2). Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
import {
  findPostingStyle,
  planFromStyle,
  type PostingPlan,
} from "@workspace/scorecard/posting-plan";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

const STAMP = Date.now();
let centralId: number;
let nativeId: number;
let otherId: number;
const adminIds: number[] = [];
const cookies: Record<number, string> = {};

async function tenant(slug: string, readsFromCentral: boolean, clubId: number) {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `${slug}-${STAMP}`,
      centralClubId: clubId,
      name: slug,
      plan: "pro",
      readsFromCentral,
    })
    .returning();
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId: t.id, username: `${slug}_${STAMP}`, displayName: "A", passwordHash: "x" })
    .returning();
  adminIds.push(admin.id);
  cookies[t.id] = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  return t.id;
}

const get = (tenantId: number) =>
  request(app).get("/api/social-settings").set("x-tenant-id", String(tenantId));
const patch = (tenantId: number, body: unknown, withCookie = true) => {
  const r = request(app).patch("/api/social-settings").set("x-tenant-id", String(tenantId));
  return (withCookie ? r.set("Cookie", cookies[tenantId]) : r).send(body as object);
};
const style = (id: string): PostingPlan => planFromStyle(findPostingStyle(id)!);
const row = async (tenantId: number) =>
  (
    await db.select().from(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId))
  )[0];

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-posting-plan";
  centralId = await tenant("pp-central", true, 98501);
  nativeId = await tenant("pp-native", false, 98502);
  otherId = await tenant("pp-other", true, 98503);
});

afterAll(async () => {
  const ids = [centralId, nativeId, otherId];
  await db.delete(captionTemplatesTable).where(inArray(captionTemplatesTable.tenantId, ids));
  await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, ids));
  await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
});

beforeEach(async () => {
  await db
    .delete(socialSettingsTable)
    .where(inArray(socialSettingsTable.tenantId, [centralId, nativeId, otherId]));
});

describe("GET /social-settings postingPlan", () => {
  it("derives the plan from current settings until one is saved (AE5)", async () => {
    const res = await get(centralId).expect(200);
    const s = res.body.settings;
    expect(s.postingPlanSaved).toBe(false);
    expect(s.centralData).toBe(true);
    expect(s.postingPlan.rows.results).toMatchObject({ enabled: true, packaging: "individual" });
    expect(s.postingPlan.rows.ladders.enabled).toBe(false);
  });
});

describe("PATCH /social-settings postingPlan", () => {
  it("stores the plan and mirrors the legacy columns, keeping round-schedule times", async () => {
    await get(centralId).expect(200); // create the row
    await db
      .update(socialSettingsTable)
      .set({ roundSchedules: { teamLists: { mode: "perFixture", day: 3, hour: 9 } } })
      .where(eq(socialSettingsTable.tenantId, centralId));

    const res = await patch(centralId, { postingPlan: style("round-carousels") }).expect(200);
    expect(res.body.postingPlanSaved).toBe(true);
    expect(res.body.postingPlan.styleId).toBe("round-carousels");

    const r = await row(centralId);
    expect(r.postingPlan?.rows.ladders.enabled).toBe(true);
    expect(r.roundSchedules?.teamLists).toEqual({ mode: "perRound", day: 3, hour: 9 });
    expect(r.roundSchedules?.weekendWrap?.mode).toBe("perRound");
    expect(r.engineRoundUp).toBe(true);

    const again = await get(centralId).expect(200);
    expect(again.body.settings.postingPlan.rows.debuts.others).toBe("off");
  });

  it("collapses rows that share a family widest-wins", async () => {
    const plan = style("every-match");
    plan.rows.feats = { ...plan.rows.feats, enabled: false };
    plan.rows.gameDay = { ...plan.rows.gameDay, grades: { "C Grade": false } };
    plan.rows.teamLists = { ...plan.rows.teamLists, grades: { "C Grade": true } };
    await patch(centralId, { postingPlan: plan }).expect(200);
    const r = await row(centralId);
    const fc = r.familyConfig as Record<
      string,
      { enabled: boolean; grades: Record<string, boolean> }
    >;
    expect(fc.achievements.enabled).toBe(true);
    expect(fc.matchday.grades["C Grade"]).toBe(true);
  });

  it("rejects packaging a row doesn't support", async () => {
    const plan = style("every-match");
    plan.rows.milestones = { ...plan.rows.milestones, packaging: "round" };
    const res = await patch(centralId, { postingPlan: plan }).expect(400);
    expect(res.body.error).toMatch(/Milestones/);
  });

  it("keeps results, ladder and leaderboard carousels to central clubs (KTD12)", async () => {
    const res = await patch(nativeId, { postingPlan: style("round-carousels") }).expect(400);
    expect(res.body.error).toMatch(/association/);

    const plan = style("every-match");
    plan.rows.teamLists = { ...plan.rows.teamLists, packaging: "round" };
    await patch(nativeId, { postingPlan: plan }).expect(200);
  });

  it("needs an admin session", async () => {
    await patch(centralId, { postingPlan: style("every-match") }, false).expect(401);
  });

  it("never touches another tenant's settings", async () => {
    await get(otherId).expect(200);
    await patch(centralId, { postingPlan: style("results-only") }).expect(200);
    const other = await row(otherId);
    expect(other.postingPlan).toBeNull();
  });
});
