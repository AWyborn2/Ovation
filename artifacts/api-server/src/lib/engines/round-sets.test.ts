/**
 * Balanced card sets U5 — round sets drafted on the club's schedule (game day
 * and team lists per round) and the schedule settings API. Real-DB
 * integration test (needs DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, like } from "drizzle-orm";
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
import { generateRoundGameDayDrafts, generateRoundTeamListDrafts, weekendOf } from "./round-sets";
import { generateMatchDayDrafts } from "./match-day";
import { generateTeamListDrafts } from "./team-list";

const STAMP = Date.now();
// Game day: Thursday 6 pm Perth (10:00 UTC). Team lists: Friday 12 pm Perth (04:00 UTC).
const THU_6PM = new Date("2026-10-08T10:00:00Z");
const FRI_1PM = new Date("2026-10-09T05:00:00Z");
const SAT = (h: number) => new Date(`2026-10-10T0${h}:00:00Z`);

let tenantId: number;
let adminId: number;
let cookie: string;
const fx: Record<string, number> = {};

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-round-sets";
  const [t] = await db
    .insert(tenantsTable)
    .values({ slug: `rounds-${STAMP}`, centralClubId: 9941, name: "Rounds Club", plan: "pro" })
    .returning();
  tenantId = t.id;
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `rounds_${STAMP}`, displayName: "Rounds", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  await db.insert(socialSettingsTable).values({
    tenantId,
    familyConfig: {
      results: { enabled: true, grades: {} },
      achievements: { enabled: false, grades: {} },
      roundup: { enabled: false, grades: {} },
      // Juniors draft only when a grade is switched on.
      matchday: { enabled: true, grades: { "Under 15": true } },
    },
    roundSchedules: {
      gameDay: { mode: "perRound", day: 4, hour: 18 },
      teamLists: { mode: "perRound", day: 5, hour: 12 },
    },
  });
  const grades = ["A Grade", "B Grade", "C Grade", "D Grade", "Female A", "Female B", "T20"];
  for (const [i, grade] of grades.entries()) {
    const [row] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade,
        roundLabel: "Round 5",
        opponentName: `${grade} Rivals`,
        venue: "Home Oval",
        startAt: SAT(i % 2 === 0 ? 4 : 5),
        isHome: true,
      })
      .returning();
    fx[grade] = row.id;
  }
  const extra = await db
    .insert(fixturesTable)
    .values([
      {
        tenantId,
        grade: "Under 15",
        roundLabel: "Round 5",
        opponentName: "Junior Rivals",
        venue: "Junior Oval",
        startAt: SAT(1),
        isHome: false,
      },
      {
        tenantId,
        grade: "A Grade",
        roundLabel: "Round 6",
        opponentName: "Next Week",
        venue: "Home Oval",
        startAt: new Date("2026-10-17T04:00:00Z"),
        isHome: true,
      },
    ])
    .returning();
  fx.junior = extra[0].id;
  fx.nextWeek = extra[1].id;
  await db.insert(teamListsTable).values([
    {
      tenantId,
      fixtureId: fx["A Grade"],
      isPublished: true,
      players: [
        { order: 1, playerId: 4, displayName: "Sam Keeper", role: "C" },
        { order: 2, playerId: 90001, displayName: "Fill In" },
      ],
    },
    {
      tenantId,
      fixtureId: fx["B Grade"],
      isPublished: true,
      players: [{ order: 1, playerId: 5, displayName: "Alex Stone" }],
    },
    {
      tenantId,
      fixtureId: fx["C Grade"],
      isPublished: false,
      players: [{ order: 1, playerId: 6, displayName: "Not Yet" }],
    },
  ]);
});

afterAll(async () => {
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const draftsLike = (prefix: string) =>
  db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        like(socialDraftsTable.sourceKey, `${prefix}%`),
      ),
    );

describe("round sets on a schedule", () => {
  it("drafts nothing before the club's chosen time", async () => {
    await generateRoundGameDayDrafts(tenantId, new Date(THU_6PM.getTime() - 60_000));
    expect(await draftsLike("gameday-round:")).toHaveLength(0);
  });

  it("drafts the week's round once at the chosen time, seniors and juniors apart", async () => {
    const first = await generateRoundGameDayDrafts(tenantId, THU_6PM);
    const again = await generateRoundGameDayDrafts(tenantId, FRI_1PM);
    expect(first.drafted).toBe(2);
    expect(again.drafted).toBe(0);
    const rows = await draftsLike("gameday-round:");
    const senior = rows.find((r) => !r.sourceMatchIsJunior)!;
    const junior = rows.find((r) => r.sourceMatchIsJunior)!;
    expect(senior.sourceKey).toBe(`gameday-round:${weekendOf(SAT(4))}:ROUND 5:senior`);
    const input = senior.cardInput as { kind: string; roundLabel: string; fixtures: unknown[] };
    expect(input.kind).toBe("roundFixtures");
    expect(input.roundLabel).toBe("ROUND 5");
    // Every senior grade of the round (the Studio splits it 4 + 3), not next week's.
    expect(input.fixtures).toHaveLength(7);
    expect(JSON.stringify(input)).not.toContain("Next Week");
    expect(junior.cardInput).toMatchObject({ kind: "roundFixtures", junior: true });
  });

  it("drafts no per-match cards for a card on a round schedule", async () => {
    await generateMatchDayDrafts(tenantId, FRI_1PM);
    await generateTeamListDrafts(tenantId, FRI_1PM);
    expect(await draftsLike("matchday:")).toHaveLength(0);
    expect(await draftsLike("teamlist:")).toHaveLength(0);
  });

  it("puts the round's published team lists in one set, fill-ins left out", async () => {
    await generateRoundTeamListDrafts(tenantId, FRI_1PM);
    const rows = await draftsLike("teamlists-round:");
    expect(rows).toHaveLength(1);
    const input = rows[0].cardInput as {
      kind: string;
      teams: { grade: string; players: { surname: string }[] }[];
    };
    expect(input.kind).toBe("teamListRound");
    expect(input.teams.map((t) => t.grade)).toEqual(["A Grade", "B Grade"]);
    expect(input.teams[0].players.map((p) => p.surname)).toEqual(["KEEPER"]);
  });

  it("stops refreshing a round once it has started", async () => {
    await db
      .update(fixturesTable)
      .set({ venue: "Moved Oval" })
      .where(eq(fixturesTable.id, fx["A Grade"]));
    const r = await generateRoundGameDayDrafts(tenantId, SAT(6));
    expect(r).toEqual({ drafted: 0, refreshed: 0 });
  });
});

describe("round schedule settings", () => {
  const api = () => request(app);

  it("returns every card's schedule, saved or default", async () => {
    const res = await api()
      .get("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId));
    expect(res.status).toBe(200);
    expect(res.body.settings.roundSchedules).toEqual({
      gameDay: { mode: "perRound", day: 4, hour: 18 },
      teamLists: { mode: "perRound", day: 5, hour: 12 },
      weekendWrap: { mode: "off", day: 0, hour: 19 },
    });
  });

  it("saves one card without touching the others, and rejects a per-match wrap", async () => {
    const ok = await api()
      .patch("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send({ roundSchedules: { weekendWrap: { mode: "perRound", day: 1, hour: 8 } } });
    expect(ok.status).toBe(200);
    expect(ok.body.roundSchedules.weekendWrap).toEqual({ mode: "perRound", day: 1, hour: 8 });
    expect(ok.body.roundSchedules.gameDay).toEqual({ mode: "perRound", day: 4, hour: 18 });

    const bad = await api()
      .patch("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send({ roundSchedules: { weekendWrap: { mode: "perFixture", day: 1, hour: 8 } } });
    expect(bad.status).toBe(400);

    const outOfRange = await api()
      .patch("/api/social-settings")
      .set("Cookie", cookie)
      .set("x-tenant-id", String(tenantId))
      .send({ roundSchedules: { gameDay: { mode: "perRound", day: 7, hour: 25 } } });
    expect(outOfRange.status).toBe(400);
  });
});
