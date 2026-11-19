/**
 * Create → Carousel set: the seasons and rounds a set is filled from
 * (GET /weekend-carousel/rounds, GET /juniors/carousel-rounds) and their
 * agreement with the sources a pick loads (GET /weekend-carousel/sources?ids=).
 * Real Postgres for the app tables; central's club matches and scorecards are
 * stubbed per club, the way the other carousel suites stub central.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  adminsTable,
  fixturesTable,
  juniorFixturesTable,
  juniorMatchesTable,
  clubHistoryBoundariesTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import type { CarouselRounds } from "../lib/carousel-rounds";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { juniorCarouselFixtureId } from "../lib/junior-carousel-content";

const central = vi.hoisted(() => ({
  byClub: new Map<number, unknown[]>(),
  calls: [] as number[],
}));
vi.mock("@workspace/db/central-queries", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  centralClubMatches: async (clubId: number) => {
    central.calls.push(clubId);
    return central.byClub.get(clubId) ?? [];
  },
}));
// A scorecard for each stubbed central match, so the sources build its result slide.
vi.mock("../lib/match-detail", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadCentralMatchDetail: async (_source: unknown, id: number) => {
    for (const rows of central.byClub.values())
      for (const m of rows as Array<Record<string, unknown>>)
        if (m.id === id) return { ...m, abandoned: false, lines: [] };
    return null;
  },
}));

const STAMP = Date.now();
const CLUB_A = 97_000 + (STAMP % 1000);
const CLUB_B = 98_000 + (STAMP % 1000);
const DAY = 24 * 60 * 60 * 1000;
let tenantA = 0;
let tenantB = 0;
let cookieA = "";
let cookieB = "";
const juniorMatchIds = [900_000_000 + (STAMP % 100_000), 900_100_000 + (STAMP % 100_000)];

/** A central match row as centralClubMatches shapes it (the club's perspective). */
const cm = (
  id: number,
  grade: string,
  season: number,
  round: number | null,
  matchDate: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  grade,
  season,
  round,
  stage: null,
  competition: grade,
  matchDate,
  venue: "Home Oval",
  result: "Won by 20 runs",
  clubWon: true,
  opponent: "Visitors",
  clubScore: "180/7",
  opponentScore: "160/10",
  abandoned: false,
  playerCount: 11,
  opponentClub: null,
  ...extra,
});

const clubDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date(ms));

const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA)).set("Cookie", cookieA);
const asB = (r: request.Test) => r.set("x-tenant-id", String(tenantB)).set("Cookie", cookieB);
const rounds = async (as: typeof asA, setType: string, path = "/api/weekend-carousel/rounds") => {
  const res = await as(request(app).get(path).query({ setType }));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as CarouselRounds;
};
const allIds = (r: CarouselRounds) => r.seasons.flatMap((s) => s.rounds.flatMap((x) => x.gameIds));

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "carousel-rounds-test";
  const make = async (key: string, clubId: number) => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `rounds-${key}-${STAMP}`,
        name: `Rounds ${key}`,
        plan: "pro",
        centralClubId: clubId,
        readsFromCentral: true,
        playhqOrgId: `rounds-org-${key}-${STAMP}`,
        playhqSyncEnabled: true,
        juniorSyncEnabled: true,
      })
      .returning();
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `rounds-${key}-${STAMP}`,
        displayName: key,
        passwordHash: "x",
      })
      .returning();
    return [
      t.id,
      `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`,
    ] as const;
  };
  [tenantA, cookieA] = await make("a", CLUB_A);
  [tenantB, cookieB] = await make("b", CLUB_B);

  // Senior fixtures: two upcoming rounds, one unlabelled game, a bye, and tenant B's.
  const now = Date.now();
  const f = { grade: "A Grade", opponentName: "Visitors", isHome: true, source: "manual" };
  await db.insert(fixturesTable).values([
    { ...f, tenantId: tenantA, roundLabel: "Round 9", startAt: new Date(now + 9 * DAY) },
    { ...f, tenantId: tenantA, roundLabel: "Round 8", startAt: new Date(now + 2 * DAY) },
    {
      ...f,
      tenantId: tenantA,
      grade: "B Grade",
      roundLabel: "Round 8",
      startAt: new Date(now + 3 * DAY),
    },
    { ...f, tenantId: tenantA, roundLabel: null, startAt: new Date(now + 4 * DAY) },
    {
      ...f,
      tenantId: tenantA,
      roundLabel: "Round 8",
      opponentName: "Bye",
      startAt: new Date(now + 2 * DAY),
    },
    { ...f, tenantId: tenantB, roundLabel: "Round 8", startAt: new Date(now + 2 * DAY) },
  ]);

  // Junior fixtures (no round label) and junior results, tenant A only.
  const season = seasonStartYearFor(new Date(now));
  await db.insert(juniorFixturesTable).values([
    {
      tenantId: tenantA,
      playhqMatchId: `rounds-jf-${STAMP}`,
      seasonStartYear: season,
      ageGroup: "Year 7",
      grade: "Year 7 Gold",
      teamName: "Hawks",
      opponentName: "Rovers",
      startAt: new Date(now + 2 * DAY),
      status: "UPCOMING",
    },
  ]);
  await db.insert(juniorMatchesTable).values([
    {
      id: juniorMatchIds[0],
      tenantId: tenantA,
      season: "2021/22",
      seasonStartYear: 2021,
      round: "4",
      ageGroup: "Year 7",
      matchDate: "2021-11-13",
      opponentName: "Rovers",
      hhResult: "Won",
    },
    {
      id: juniorMatchIds[1],
      tenantId: tenantB,
      season: "2021/22",
      seasonStartYear: 2021,
      round: "4",
      ageGroup: "Year 7",
      matchDate: "2021-11-13",
      opponentName: "Rovers",
      hhResult: "Won",
    },
  ]);

  // Tenant A's central history; B Grade's central figures start in 2015.
  await db
    .insert(clubHistoryBoundariesTable)
    .values({ tenantId: tenantA, grade: "B Grade", startSeason: 2015 });
  central.byClub.set(CLUB_A, [
    cm(9_100_001, "A Grade", 2025, 6, "2025-11-22"),
    cm(9_100_002, "B Grade", 2025, 6, "2025-11-23"),
    cm(9_100_003, "A Grade", 2025, 7, "2025-11-29"),
    cm(9_100_004, "A Grade", 2025, 8, "2025-12-06", { result: null }),
    cm(9_100_005, "A Grade", 2021, 3, "2021-10-30"),
    cm(9_100_006, "A Grade", 2021, null, "2022-03-19", { stage: "Grand Final" }),
    cm(9_100_007, "A Grade", 2021, null, "2022-01-08"),
    cm(9_100_008, "B Grade", 2012, 2, "2012-10-20"),
  ]);
  central.byClub.set(CLUB_B, [cm(9_200_001, "A Grade", 2025, 6, "2025-11-22")]);
});

afterAll(async () => {
  const ids = [tenantA, tenantB].filter(Boolean);
  if (!ids.length) return;
  await db.delete(fixturesTable).where(inArray(fixturesTable.tenantId, ids));
  await db.delete(juniorFixturesTable).where(inArray(juniorFixturesTable.tenantId, ids));
  await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.id, juniorMatchIds));
  await db
    .delete(clubHistoryBoundariesTable)
    .where(inArray(clubHistoryBoundariesTable.tenantId, ids));
  for (const id of ids) {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
  }
});

describe("GET /weekend-carousel/rounds (results)", () => {
  it("lists every central season newest first, rounds in date order, Other games last", async () => {
    const body = await rounds(asA, "results");
    expect(body.seasons.map((s) => s.label)).toEqual(["2025/26", "2021/22"]);
    const [s2025, s2021] = body.seasons;
    expect(s2025.rounds.map((r) => [r.label, r.from, r.to])).toEqual([
      ["Round 6", "2025-11-22", "2025-11-23"],
      ["Round 7", "2025-11-29", "2025-11-29"],
    ]);
    expect(s2025.rounds[0].gameIds).toEqual([-9_100_001, -9_100_002]);
    expect(s2021.rounds.map((r) => [r.label, r.other])).toEqual([
      ["Round 3", false],
      ["Grand Final", false],
      ["Other games", true],
    ]);
    expect(s2021.rounds[2].gameIds).toEqual([-9_100_007]);
  });

  it("opens on the most recent completed round; a pending result is not a round yet", async () => {
    const body = await rounds(asA, "results");
    expect(body.defaultSeason).toBe(2025);
    expect(body.defaultRounds).toEqual(["r:round 7"]);
    expect(allIds(body)).not.toContain(-9_100_004);
  });

  it("leaves out seasons before the club's history boundary", async () => {
    const body = await rounds(asA, "matchSummary");
    expect(allIds(body)).not.toContain(-9_100_008);
    expect(body.seasons.map((s) => s.season)).not.toContain(2012);
  });

  it("never lists another club's rounds, or junior games", async () => {
    central.calls.length = 0;
    const a = await rounds(asA, "results");
    const b = await rounds(asB, "results");
    expect(central.calls).toEqual([CLUB_A, CLUB_B]);
    expect(allIds(a)).not.toContain(-9_200_001);
    expect(allIds(b)).toEqual([-9_200_001]);
    // Junior results sit in their own namespace and never reach the senior picker.
    expect(allIds(a).some((id) => id <= -1_000_000_000)).toBe(false);
  });

  it("needs an admin", async () => {
    const res = await request(app)
      .get("/api/weekend-carousel/rounds")
      .set("x-tenant-id", String(tenantA));
    expect(res.status).toBe(401);
  });
});

describe("GET /weekend-carousel/rounds (team list, match day)", () => {
  it("groups the tenant's fixtures by round label and opens on the next round", async () => {
    for (const setType of ["teamList", "matchDay"]) {
      const body = await rounds(asA, setType);
      const season = body.seasons.find((s) => s.season === seasonStartYearFor(new Date()))!;
      const labels = season.rounds.map((r) => r.label);
      expect(labels).toEqual(["Round 8", "Round 9", "Other games"]);
      expect(season.rounds.find((r) => r.label === "Round 8")!.gameIds).toHaveLength(2);
      expect(body.defaultRounds).toEqual(["r:round 8"]);
      expect(body.defaultSeason).toBe(season.season);
    }
  });

  it("never lists another tenant's fixtures or any junior fixture", async () => {
    const a = await rounds(asA, "matchDay");
    const b = await rounds(asB, "matchDay");
    expect(allIds(b)).toHaveLength(1);
    expect(allIds(a)).not.toContain(allIds(b)[0]);
    expect(allIds(a).every((id) => id > 0)).toBe(true);
  });
});

describe("GET /juniors/carousel-rounds", () => {
  it("lists junior fixtures only, unlabelled, under Other games", async () => {
    const body = await rounds(asA, "matchDay", "/api/juniors/carousel-rounds");
    const [fixture] = await db
      .select()
      .from(juniorFixturesTable)
      .where(eq(juniorFixturesTable.tenantId, tenantA));
    expect(body.seasons).toHaveLength(1);
    expect(body.seasons[0].rounds).toEqual([
      expect.objectContaining({
        key: "other",
        label: "Other games",
        other: true,
        gameIds: [juniorCarouselFixtureId(fixture.id)],
      }),
    ]);
    // No labelled junior round: the picker opens on dates instead.
    expect(body.defaultRounds).toEqual([]);
    expect(body.defaultSeason).toBeNull();
  });

  it("lists junior results from junior tables, tenant-scoped, never central", async () => {
    central.calls.length = 0;
    const body = await rounds(asA, "results", "/api/juniors/carousel-rounds");
    expect(central.calls).toEqual([]);
    expect(body.seasons.map((s) => s.label)).toEqual(["2021/22"]);
    expect(body.seasons[0].rounds).toEqual([
      expect.objectContaining({
        label: "Round 4",
        from: "2021-11-13",
        gameIds: [-(juniorMatchIds[0] + 1_000_000_000)],
      }),
    ]);
    expect(body.defaultRounds).toEqual(["r:round 4"]);
    const b = await rounds(asB, "results", "/api/juniors/carousel-rounds");
    expect(allIds(b)).toEqual([-(juniorMatchIds[1] + 1_000_000_000)]);
  });
});

describe("rounds and sources agree", () => {
  const sources = (q: Record<string, string>) =>
    asA(
      request(app)
        .get("/api/weekend-carousel/sources")
        .query({ audience: "senior", ...q }),
    );

  it("a multi-round pick from an old season loads exactly those rounds' games", async () => {
    const body = await rounds(asA, "results");
    const s2021 = body.seasons.find((s) => s.season === 2021)!;
    const picked = s2021.rounds.filter((r) => r.label === "Round 3" || r.label === "Grand Final");
    const ids = picked.flatMap((r) => r.gameIds);
    const from = picked.map((r) => r.from).sort()[0];
    const to = picked
      .map((r) => r.to)
      .sort()
      .at(-1)!;
    const res = await sources({ setType: "results", from, to, ids: ids.join(",") });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // The unlabelled game between them is in the date range but not picked.
    expect(res.body.fixtures.map((f: { id: number }) => f.id).sort()).toEqual([...ids].sort());
    const all = await sources({ setType: "results", from, to });
    expect(all.body.fixtures.map((f: { id: number }) => f.id)).toContain(-9_100_007);
  });

  it("every round's games are the sources' games for its dates", async () => {
    const body = await rounds(asA, "matchDay");
    for (const r of body.seasons.flatMap((s) => s.rounds)) {
      const res = await sources({
        setType: "matchDay",
        from: r.from,
        to: r.to,
        ids: r.gameIds.join(","),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.fixtures.map((f: { id: number }) => f.id).sort()).toEqual(
        [...r.gameIds].sort(),
      );
    }
    // A fixture the rounds leave out (the bye) is one the sources leave out too.
    const wide = await sources({
      setType: "matchDay",
      from: clubDay(Date.now()),
      to: clubDay(Date.now() + 10 * DAY),
    });
    expect(wide.body.fixtures.map((f: { id: number }) => f.id).sort()).toEqual(allIds(body).sort());
  });
});

describe("round 9 retest: next round and finals order", () => {
  // A fixed "today" (Thu 19 Nov 2026, club time); only Date is faked, so the
  // database and HTTP timers run as normal.
  const TODAY = new Date("2026-11-19T02:00:00Z");
  const CLUB_C = 96_000 + (STAMP % 1000);
  let tenantC = 0;
  let cookieC = "";
  const asC = (r: request.Test) => r.set("x-tenant-id", String(tenantC)).set("Cookie", cookieC);
  const at = (day: string) => new Date(`${day}T05:30:00Z`);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `rounds-c-${STAMP}`,
        name: "Rounds c",
        plan: "pro",
        centralClubId: CLUB_C,
        readsFromCentral: true,
      })
      .returning();
    tenantC = t.id;
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t.id,
        username: `rounds-c-${STAMP}`,
        displayName: "c",
        passwordHash: "x",
      })
      .returning();
    cookieC = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    const f = { tenantId: tenantC, opponentName: "Visitors", isHome: true, source: "manual" };
    await db.insert(fixturesTable).values([
      // Round 1 was in October, but Female A Grade plays its Round 1 on 28 Nov.
      { ...f, grade: "A Grade", roundLabel: "Round 1", startAt: at("2026-10-10") },
      { ...f, grade: "B Grade", roundLabel: "Round 1", startAt: at("2026-10-10") },
      { ...f, grade: "Female A Grade", roundLabel: "Round 1", startAt: at("2026-11-28") },
      { ...f, grade: "A Grade", roundLabel: "Round 6", startAt: at("2026-11-14") },
      { ...f, grade: "A Grade", roundLabel: "Round 7", startAt: at("2026-11-21") },
      { ...f, grade: "B Grade", roundLabel: "Round 7", startAt: at("2026-11-22") },
      { ...f, grade: "A Grade", roundLabel: "Round 8", startAt: at("2026-11-28") },
    ]);
    central.byClub.set(CLUB_C, [
      cm(9_300_001, "A Grade", 2025, 17, "2026-02-14"),
      cm(9_300_002, "A Grade", 2025, null, "2026-02-21", { stage: "Semi Final" }),
      cm(9_300_003, "B Grade", 2025, 18, "2026-02-28"),
      cm(9_300_004, "A Grade", 2025, null, "2026-03-07", { stage: "Grand Final" }),
      cm(9_300_005, "B Grade", 2025, null, "2026-02-21", { stage: "Qualifying Final" }),
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (!tenantC) return;
    await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantC));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantC));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantC));
  });

  it("opens Team List and Match Day on the next round, not one a late game stretches", async () => {
    for (const setType of ["teamList", "matchDay"]) {
      const body = await rounds(asC, setType);
      expect(body.defaultSeason).toBe(2026);
      expect(body.defaultRounds).toEqual(["r:round 7"]);
      const r1 = body.seasons[0].rounds.find((r) => r.label === "Round 1")!;
      expect([r1.from, r1.to, r1.gameIds.length]).toEqual(["2026-10-10", "2026-11-28", 3]);
    }
  });

  it("keeps Results opening on the most recent completed round", async () => {
    const body = await rounds(asC, "results");
    expect(body.defaultSeason).toBe(2025);
    expect(body.defaultRounds).toEqual(["r:grand final"]);
  });

  it("sorts finals after every numbered round, in finals order", async () => {
    const body = await rounds(asC, "matchSummary");
    expect(body.seasons[0].rounds.map((r) => r.label)).toEqual([
      "Round 17",
      "Round 18",
      "Qualifying Final",
      "Semi Final",
      "Grand Final",
    ]);
  });
});
