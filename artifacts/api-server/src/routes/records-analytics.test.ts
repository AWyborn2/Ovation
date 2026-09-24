import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  beats,
  formatRecordValue,
  parseBestBowling,
  parseHighScore,
  rankLeaders,
  recordsFilterFrom,
  walkProgression,
  type ProgressionCandidate,
} from "../lib/records-analytics";

/**
 * Records analytics endpoints (stats plan U9 / KTD5): `/records` filters,
 * `/records/leaders` and `/records/progression`.
 *
 * The first block is pure (the progression walk, value parsing, ranking) and
 * runs anywhere. The second is a real-DB integration suite (DATABASE_URL +
 * CENTRAL_DATABASE_URL, with the CI central fixture from
 * seed-ci-central-fixture.ts); it skips cleanly without a database — imports
 * are dynamic because `@workspace/db` throws at module load when
 * DATABASE_URL is unset.
 */

const hs = (runs: number, season: number, matchId: number): ProgressionCandidate<string> => ({
  player: `p${matchId}`,
  grade: "A Grade",
  season,
  matchId,
  matchDate: null,
  value: { primary: runs, secondary: 0 },
});

describe("record progression walk", () => {
  it("emits only strict breaks: 120, 98, 145, 145, 187 → 120, 145, 187", () => {
    const rows = [
      hs(120, 2019, 1),
      hs(98, 2020, 2),
      hs(145, 2021, 3),
      hs(145, 2022, 4),
      hs(187, 2023, 5),
    ];
    const points = walkProgression("highScore", rows);
    expect(points.map((p) => p.value.primary)).toEqual([120, 145, 187]);
    // The tie in 2022 didn't take the record from the 2021 holder.
    expect(points[1]!.player).toBe("p3");
    expect(points.every((p) => p.dated)).toBe(true);
  });

  it("walks chronologically regardless of input order", () => {
    const rows = [hs(187, 2023, 5), hs(145, 2021, 3), hs(120, 2019, 1)];
    expect(walkProgression("highScore", rows).map((p) => p.season)).toEqual([2019, 2021, 2023]);
  });

  it("orders by match date within a season, and a match's best innings first", () => {
    const a = { ...hs(80, 2020, 9), matchDate: "2020-10-03" };
    const b = { ...hs(90, 2020, 2), matchDate: "2020-11-14" };
    const c = { ...hs(60, 2020, 9), matchDate: "2020-10-03" };
    expect(walkProgression("highScore", [b, c, a]).map((p) => p.value.primary)).toEqual([80, 90]);
  });

  it("puts a season snapshot after the same season's scorecard innings", () => {
    const match = hs(145, 2021, 3);
    const snapshot: ProgressionCandidate<string> = {
      ...hs(145, 2021, 0),
      player: "snapshot",
      matchId: null,
      seasonLevel: true,
    };
    const points = walkProgression("highScore", [snapshot, match]);
    expect(points).toHaveLength(1);
    expect(points[0]!.matchId).toBe(3);
  });

  it("starts from a curated season record that predates the scorecards", () => {
    const curated: ProgressionCandidate<string> = {
      ...hs(160, 1998, 0),
      matchId: null,
      seasonLevel: true,
    };
    const points = walkProgression("highScore", [hs(120, 2019, 1), curated, hs(187, 2023, 5)]);
    expect(points.map((p) => p.value.primary)).toEqual([160, 187]);
    expect(points[0]!.season).toBe(1998);
  });

  it("ends at an undated curated record that beats every dated row", () => {
    const undated: ProgressionCandidate<string> = {
      ...hs(201, 0, 0),
      season: null,
      player: "baseline",
    };
    const points = walkProgression("highScore", [hs(120, 2019, 1), hs(187, 2023, 5)], [undated]);
    expect(points.map((p) => p.value.primary)).toEqual([120, 187, 201]);
    expect(points[2]).toMatchObject({ dated: false, season: null, matchId: null });
  });

  it("drops an undated record that doesn't beat the dated record", () => {
    const undated: ProgressionCandidate<string> = { ...hs(187, 0, 0), season: null };
    const points = walkProgression("highScore", [hs(187, 2023, 5)], [undated]);
    expect(points).toHaveLength(1);
    expect(points[0]!.dated).toBe(true);
  });

  it("best bowling: more wickets break it, equal wickets need fewer runs", () => {
    const bowl = (w: number, r: number, season: number, matchId: number) => ({
      ...hs(0, season, matchId),
      value: { primary: w, secondary: r },
    });
    const points = walkProgression("bestBowling", [
      bowl(5, 40, 2019, 1),
      bowl(5, 40, 2020, 2),
      bowl(5, 22, 2021, 3),
      bowl(4, 5, 2022, 4),
      bowl(7, 60, 2023, 5),
    ]);
    expect(points.map((p) => formatRecordValue("bestBowling", p.value))).toEqual([
      "5/40",
      "5/22",
      "7/60",
    ]);
  });
});

describe("record value helpers", () => {
  it("parses scores and figures", () => {
    expect(parseHighScore("145*")).toEqual({ primary: 145, secondary: 1 });
    expect(parseHighScore("87")).toEqual({ primary: 87, secondary: 0 });
    expect(parseHighScore("")).toBeNull();
    expect(parseBestBowling("7/23")).toEqual({ primary: 7, secondary: 23 });
    expect(parseBestBowling("0/12")).toBeNull();
    expect(parseBestBowling(null)).toBeNull();
  });

  it("never lets not-out status break a tie", () => {
    expect(beats("highScore", { primary: 145, secondary: 1 }, { primary: 145, secondary: 0 })).toBe(
      false,
    );
    expect(formatRecordValue("highScore", { primary: 145, secondary: 1 })).toBe("145*");
  });

  it("ranks ties together and cuts to the limit", () => {
    const rows = [{ value: 9 }, { value: 7 }, { value: 7 }, { value: 3 }, { value: 1 }];
    expect(rankLeaders(rows, 4).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("treats no params as no filter", () => {
    expect(recordsFilterFrom({})).toBeUndefined();
    expect(recordsFilterFrom({ grade: "  " })).toBeUndefined();
    expect(recordsFilterFrom({ grade: "A Grade", fromSeason: 2019 })).toEqual({
      grade: "A Grade",
      fromSeason: 2019,
    });
  });
});

// ---------------------------------------------------------------------------
// Real-DB integration
// ---------------------------------------------------------------------------

const HAS_DB = !!process.env.DATABASE_URL && !!process.env.CENTRAL_DATABASE_URL;

const dbMod = HAS_DB ? await import("@workspace/db") : null;
const provisionMod = HAS_DB ? await import("@workspace/db/provision") : null;
const appMod = HAS_DB ? await import("../app") : null;
const supertestMod = HAS_DB ? await import("supertest") : null;

const D = dbMod as NonNullable<typeof dbMod>;
const STAMP = Date.now();

describe.skipIf(!HAS_DB)("records analytics — native (tenant #1)", () => {
  // A grade no other suite uses, so the grade-filtered reads see only our rows.
  const GRADE = `U9 Grade ${STAMP}`;
  const OTHER_GRADE = `U9 Other ${STAMP}`;
  // Fill-ins are ids >= 90000; pick one unlikely to collide with the master load.
  const FILL_IN_ID = 99_000 + (STAMP % 900);
  let importId: number;
  let alexId: number;
  let blakeId: number;
  const get = (path: string) =>
    supertestMod!.default(appMod!.default).get(path).set("x-tenant-id", "1").expect(200);

  beforeAll(async () => {
    const { db, playersTable, importsTable, matchesTable, matchPlayerLinesTable } = D;
    const pgss = D.playerGradeSeasonStatsTable;
    const [alex] = await db
      .insert(playersTable)
      .values({ surname: "Recordsu", givenName: "Alex" })
      .returning();
    const [blake] = await db
      .insert(playersTable)
      .values({ surname: "Recordsu", givenName: "Blake" })
      .returning();
    alexId = alex!.id;
    blakeId = blake!.id;
    await db
      .insert(playersTable)
      .values({ id: FILL_IN_ID, surname: "Fillin", givenName: "U9", isFillIn: true });
    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `u9-${STAMP}.csv` })
      .returning();
    importId = imp!.id;

    // Scorecard era: 120, 98, 145, 145 (Blake — a tie), 187; the fill-in's 250
    // must never count.
    const innings: [number, number, number][] = [
      [2019, alexId, 120],
      [2020, alexId, 98],
      [2021, alexId, 145],
      [2022, blakeId, 145],
      [2022, FILL_IN_ID, 250],
      [2023, alexId, 187],
    ];
    // Distinct rounds: manual uploads are unique per (grade, season, round, stage).
    for (const [i, [season, playerId, runs]] of innings.entries()) {
      const [m] = await db
        .insert(matchesTable)
        .values({ importId, grade: GRADE, season, round: i + 1, result: "Won" })
        .returning();
      await db.insert(matchPlayerLinesTable).values({
        matchId: m!.id,
        playerId,
        batted: true,
        runs,
        bowled: true,
        wickets: playerId === alexId ? 3 : 6,
        runsConceded: 40,
      });
    }

    // Season snapshot rows (what a match commit derives), plus Alex's
    // pre-scorecard baseline whose high score (201) beats every dated innings.
    await db.insert(pgss).values([
      {
        playerId: alexId,
        grade: GRADE,
        season: null,
        games: 50,
        runs: 1000,
        highScore: "201",
        hundreds: 3,
        wickets: 10,
        bestBowling: "4/30",
        catches: 5,
      },
      {
        playerId: alexId,
        grade: GRADE,
        season: 2019,
        games: 1,
        runs: 120,
        highScore: "120",
        hundreds: 1,
        wickets: 3,
        bestBowling: "3/40",
      },
      {
        playerId: alexId,
        grade: GRADE,
        season: 2020,
        games: 1,
        runs: 98,
        highScore: "98",
        wickets: 3,
        bestBowling: "3/40",
      },
      {
        playerId: alexId,
        grade: GRADE,
        season: 2021,
        games: 1,
        runs: 145,
        highScore: "145",
        hundreds: 1,
        wickets: 3,
        bestBowling: "3/40",
      },
      {
        playerId: blakeId,
        grade: GRADE,
        season: 2022,
        games: 1,
        runs: 145,
        highScore: "145",
        hundreds: 1,
        wickets: 6,
        bestBowling: "6/40",
      },
      {
        playerId: alexId,
        grade: GRADE,
        season: 2023,
        games: 1,
        runs: 187,
        highScore: "187",
        hundreds: 1,
        wickets: 3,
        bestBowling: "3/40",
      },
      {
        playerId: blakeId,
        grade: OTHER_GRADE,
        season: 2023,
        games: 1,
        runs: 5000,
        highScore: "300",
        wickets: 1,
        bestBowling: "1/1",
      },
      {
        playerId: FILL_IN_ID,
        grade: GRADE,
        season: 2022,
        games: 1,
        runs: 9999,
        highScore: "250",
        hundreds: 1,
        wickets: 9,
        bestBowling: "9/1",
      },
    ]);
  });

  afterAll(async () => {
    const { db, playersTable, importsTable } = D;
    await db.delete(importsTable).where(eq(importsTable.id, importId));
    await db.delete(playersTable).where(inArray(playersTable.id, [alexId, blakeId, FILL_IN_ID]));
  });

  it("/records without params keeps its all-time shape", async () => {
    const res = await get("/api/records");
    expect(Object.keys(res.body).sort()).toEqual(
      [
        "bestBowling",
        "highestScore",
        "mostCatches",
        "mostFifties",
        "mostGames",
        "mostHundreds",
        "mostRuns",
        "mostWickets",
      ].sort(),
    );
  });

  it("a grade filter restricts every record to that grade", async () => {
    const res = await get(`/api/records?grade=${encodeURIComponent(GRADE)}`);
    const b = res.body;
    expect(b.mostRuns).toMatchObject({ playerId: alexId, value: 1000 + 120 + 98 + 145 + 187 });
    expect(b.mostRuns.grades).toEqual([GRADE]);
    // Blake's 5000 in the other grade doesn't count; the fill-in never does.
    expect(b.highestScore).toMatchObject({ playerId: alexId, grade: GRADE, highScore: "201" });
    expect(b.bestBowling).toMatchObject({ playerId: blakeId, bestBowling: "6/40" });
    for (const key of ["mostGames", "mostRuns", "mostWickets", "mostHundreds"]) {
      expect(b[key].playerId).not.toBe(FILL_IN_ID);
    }
  });

  it("a season span drops the baseline rows", async () => {
    const res = await get(
      `/api/records?grade=${encodeURIComponent(GRADE)}&fromSeason=2021&toSeason=2023`,
    );
    expect(res.body.highestScore).toMatchObject({ highScore: "187", season: 2023 });
    expect(res.body.mostRuns).toMatchObject({ playerId: alexId, value: 145 + 187 });
  });

  it("progression walks the scorecards and ends at the record card's value", async () => {
    const [prog, card] = await Promise.all([
      get(`/api/records/progression?kind=highScore&grade=${encodeURIComponent(GRADE)}`),
      get(`/api/records?grade=${encodeURIComponent(GRADE)}`),
    ]);
    const points = prog.body.points as { value: string; dated: boolean; playerId: number }[];
    expect(points.map((p) => p.value)).toEqual(["120", "145", "187", "201"]);
    expect(points.at(-1)).toMatchObject({ dated: false, season: null, playerId: alexId });
    expect(points.at(-1)!.value).toBe(card.body.highestScore.highScore);
    expect(points.some((p) => p.playerId === FILL_IN_ID)).toBe(false);
  });

  it("best-bowling progression ends at the card's figures", async () => {
    const [prog, card] = await Promise.all([
      get(`/api/records/progression?kind=bestBowling&grade=${encodeURIComponent(GRADE)}`),
      get(`/api/records?grade=${encodeURIComponent(GRADE)}`),
    ]);
    const values = (prog.body.points as { value: string }[]).map((p) => p.value);
    expect(values.at(-1)).toBe(card.body.bestBowling.bestBowling);
    expect(values).not.toContain("9/1");
  });

  it("leaders exclude fill-ins and carry lastSeason from any grade", async () => {
    const res = await get(`/api/records/leaders?metric=runs&grade=${encodeURIComponent(GRADE)}`);
    const entries = res.body.entries as {
      playerId: number;
      value: number;
      lastSeason: number | null;
      rank: number;
    }[];
    expect(entries.map((e) => e.playerId)).toEqual([alexId, blakeId]);
    expect(entries[0]).toMatchObject({ rank: 1, value: 1550, lastSeason: 2023 });
    // Blake last played this grade in 2022, but played another grade in 2023.
    expect(entries[1]).toMatchObject({ rank: 2, value: 145, lastSeason: 2023 });
  });

  it("rejects an unknown metric", async () => {
    await supertestMod!
      .default(appMod!.default)
      .get("/api/records/leaders?metric=sixes")
      .set("x-tenant-id", "1")
      .expect(400);
  });
});

describe.skipIf(!HAS_DB)("records analytics — central", () => {
  // CI central fixture: Pinjarra (club 3) plays A Grade 2024/25 in matches
  // 1002 and 1003. Eli scores 36 then 37 and takes 2/35 twice; Drew scores 21
  // and 22 and takes 1/30.
  const PINJARRA = 3;
  const ELI = "66666666-6666-4666-8666-666666666666";
  const DREW = "55555555-5555-4555-8555-555555555555";
  let tenantId: number;
  let idOf: Map<string, number>;
  const get = (path: string) =>
    supertestMod!
      .default(appMod!.default)
      .get(path)
      .set("x-tenant-id", String(tenantId))
      .expect(200);

  beforeAll(async () => {
    const { db, tenantsTable, playerIdMapTable } = D;
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `u9-records-${STAMP}`,
        centralClubId: PINJARRA,
        name: "U9 Records",
        readsFromCentral: true,
        plan: "club",
      })
      .returning();
    tenantId = t!.id;
    await provisionMod!.mintPlayerIdMap(tenantId, PINJARRA);
    const map = await db
      .select()
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId));
    idOf = new Map(map.map((m) => [m.participantId, m.playerId]));
  });

  afterAll(async () => {
    if (!tenantId) return;
    const { db, tenantsTable, playerIdMapTable } = D;
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("a grade filter restricts the records; an unplayed grade has none", async () => {
    const a = await get("/api/records?grade=A%20Grade");
    expect(a.body.highestScore).toMatchObject({ playerId: idOf.get(ELI), highScore: "37" });
    expect(a.body.bestBowling).toMatchObject({ playerId: idOf.get(ELI), bestBowling: "2/35" });
    expect(a.body.mostRuns).toMatchObject({ playerId: idOf.get(ELI), value: 73 });

    const b = await get("/api/records?grade=B%20Grade");
    expect(b.body.mostRuns).toBeNull();
    expect(b.body.highestScore).toBeNull();

    const later = await get("/api/records?fromSeason=2025");
    expect(later.body.mostRuns).toBeNull();
  });

  it("progression ends at the card and a tie doesn't break the record", async () => {
    const score = await get("/api/records/progression?kind=highScore&grade=A%20Grade");
    expect(score.body.points.map((p: { value: string }) => p.value)).toEqual(["36", "37"]);
    expect(score.body.points[0]).toMatchObject({
      playerId: idOf.get(ELI),
      season: 2024,
      matchId: 1002,
      matchDate: "2024-10-19",
      dated: true,
    });
    const bowl = await get("/api/records/progression?kind=bestBowling&grade=A%20Grade");
    expect(bowl.body.points.map((p: { value: string }) => p.value)).toEqual(["2/35"]);
  });

  it("leaders return crosswalked ids, ranks and lastSeason", async () => {
    const runs = await get("/api/records/leaders?metric=runs");
    expect(runs.body.entries).toEqual([
      expect.objectContaining({ rank: 1, playerId: idOf.get(ELI), value: 73, lastSeason: 2024 }),
      expect.objectContaining({ rank: 2, playerId: idOf.get(DREW), value: 43, lastSeason: 2024 }),
    ]);
    const games = await get("/api/records/leaders?metric=games&limit=1");
    expect(games.body.entries).toHaveLength(1);
    expect(games.body.entries[0]).toMatchObject({ rank: 1, value: 2 });
  });
});
