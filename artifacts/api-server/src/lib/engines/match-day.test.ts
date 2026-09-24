/**
 * Social Studio automation U3 — match day family engines (match-day card and
 * team list) and the family switches on the settings API. Real-DB integration
 * test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../../app";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  teamListsTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { generateMatchDayDrafts, matchDayKey } from "./match-day";
import { generateTeamListDrafts, teamListKey } from "./team-list";

const STAMP = Date.now();
const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-10T00:00:00Z");

let tenantId: number;
let adminId: number;
let cookie: string;

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-families";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `families-${STAMP}`, centralClubId: 9931, name: "Families Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId,
      username: `families_${STAMP}`,
      displayName: "Families Admin",
      passwordHash: "x",
    })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values({
    tenantId,
    familyConfig: {
      results: { enabled: true, grades: {} },
      achievements: { enabled: false, grades: {} },
      roundup: { enabled: false, grades: {} },
      matchday: { enabled: true, grades: {} },
    },
  });
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  // The settings API's ensureSettings seeds default caption templates.
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId]));
});

async function fixture(hoursOut: number, grade = "A Grade") {
  const [row] = await db
    .insert(fixturesTable)
    .values({
      tenantId,
      grade,
      roundLabel: "Round 3",
      opponentName: "Rivals",
      venue: "Home Oval",
      startAt: new Date(NOW.getTime() + hoursOut * HOUR),
      isHome: true,
    })
    .returning();
  return row;
}

async function draftsFor(key: string) {
  return db
    .select()
    .from(socialDraftsTable)
    .where(and(eq(socialDraftsTable.tenantId, tenantId), eq(socialDraftsTable.sourceKey, key)));
}

describe("match-day engine", () => {
  it("a fixture 47 hours out gets one draft; a second sweep adds none", async () => {
    const f = await fixture(47);
    const far = await fixture(50);
    await generateMatchDayDrafts(tenantId, NOW);
    await generateMatchDayDrafts(tenantId, NOW);
    const rows = await draftsFor(matchDayKey(f.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].family).toBe("matchday");
    expect(rows[0].cardInput).toMatchObject({
      kind: "matchDay",
      oppositionName: "Rivals",
      homeAway: "HOME",
      roundLabel: "ROUND 3",
    });
    expect(await draftsFor(matchDayKey(far.id))).toHaveLength(0);
  });

  it("a per-grade override skips that grade", async () => {
    await db
      .update(socialSettingsTable)
      .set({
        familyConfig: {
          results: { enabled: true, grades: {} },
          achievements: { enabled: false, grades: {} },
          roundup: { enabled: false, grades: {} },
          matchday: { enabled: true, grades: { "C Grade": false } },
        },
      })
      .where(eq(socialSettingsTable.tenantId, tenantId));
    const f = await fixture(20, "C Grade");
    await generateMatchDayDrafts(tenantId, NOW);
    expect(await draftsFor(matchDayKey(f.id))).toHaveLength(0);
  });
});

describe("team-list engine", () => {
  it("drafts a published XI, without fill-ins, and refreshes on a changed selection", async () => {
    const f = await fixture(72);
    const draft = await fixture(72);
    await db.insert(teamListsTable).values([
      {
        tenantId,
        fixtureId: f.id,
        isPublished: true,
        players: [
          { order: 2, playerId: 5, displayName: "Alex Stone", role: "WK" },
          { order: 1, playerId: 4, displayName: "Sam Keeper", role: "C" },
          { order: 3, playerId: 90001, displayName: "Fill In" },
        ],
      },
      { tenantId, fixtureId: draft.id, isPublished: false, players: [] },
    ]);
    await generateTeamListDrafts(tenantId, NOW);
    const [row] = await draftsFor(teamListKey(f.id));
    expect(row.cardInput).toMatchObject({
      kind: "teamList",
      players: [
        { order: 1, surname: "KEEPER", role: "C" },
        { order: 2, surname: "STONE", role: "WK" },
      ],
    });
    expect(await draftsFor(teamListKey(draft.id))).toHaveLength(0);

    await db
      .update(teamListsTable)
      .set({ players: [{ order: 1, playerId: 6, displayName: "Jo Newman" }] })
      .where(eq(teamListsTable.fixtureId, f.id));
    const res = await generateTeamListDrafts(tenantId, NOW);
    expect(res.refreshed).toBeGreaterThanOrEqual(1);
    const rows = await draftsFor(teamListKey(f.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].cardInput).toMatchObject({ players: [{ surname: "NEWMAN" }] });
  });
});

describe("family switches on the settings API", () => {
  const api = (method: "get" | "patch", path: string) =>
    request(app)[method](`/api${path}`).set("Cookie", cookie).set("x-tenant-id", String(tenantId));

  it("toggling a family is saved, mirrored to the engine flag, and honoured by the next sweep", async () => {
    const res = await api("patch", "/social-settings").send({
      familyConfig: { matchday: { enabled: false }, achievements: { enabled: true } },
    });
    expect(res.status).toBe(200);
    expect(res.body.familyConfig.matchday.enabled).toBe(false);
    expect(res.body.engineMilestone).toBe(true);

    const got = await api("get", "/social-settings");
    expect(got.body.settings.familyConfig.achievements.enabled).toBe(true);

    const f = await fixture(10);
    const sweep = await generateMatchDayDrafts(tenantId, NOW);
    expect(sweep.drafted).toBe(0);
    expect(await draftsFor(matchDayKey(f.id))).toHaveLength(0);
  });
});
