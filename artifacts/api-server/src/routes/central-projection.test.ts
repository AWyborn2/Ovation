// PlayHQ → central projector (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md).
//
// Real database: the playhq landing schema, the central_projector role and its crosswalks are
// applied to the central database, and projection connects AS that role — so these tests also
// prove the role can do its job and nothing more. Setup writes go through the tenant `db` pool,
// which is the same local Postgres as CENTRAL_DATABASE_URL in CI.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@workspace/db";
import {
  assertProjectorScope,
  closeCentralProjectorPool,
  getCentralProjectorPool,
  inspectProjectorScope,
  projectToCentral,
  type LoadRows,
} from "@workspace/db/playhq-ingest";
import { projectDumpToCentral } from "../lib/playhq-ingest";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const centralUrl = process.env.CENTRAL_DATABASE_URL!;
const admin = {
  query: (text: string, params?: unknown[]) => db.$client.query(text, params),
};

// Two clubs known to central (high ids, clear of the CI fixture), one unknown.
const CLUB_A = 9911; // lower id → "home" by the builder convention
const CLUB_B = 9912;
const CLUB_X = 9913; // known only from a tenant's settings
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ORG_X = randomUUID(); // not in central
const GRADE = randomUUID();
const JUNIOR_GRADE = randomUUID();
const TEAM_A = randomUUID();
const TEAM_B = randomUUID();
const TEAM_X = randomUUID();
const MATCH = randomUUID();
const JUNIOR_MATCH = randomUUID();
const UNKNOWN_MATCH = randomUUID();
const ABANDONED = randomUUID();
const P = Array.from({ length: 6 }, () => randomUUID()); // A: 0-2, B: 3-5
const SEASON = "Summer 2026/27";

let projector: ReturnType<typeof getCentralProjectorPool>;

function projectorUrl(): string {
  const u = new URL(centralUrl);
  u.username = "central_projector";
  u.password = "test";
  return u.toString();
}

/** A PlayHQ scorecard: B bats first (all out 97), A chases 98/1; A catches, B runs out. */
function scorecard(opts: { fielderCatch?: string } = {}) {
  const bat = (
    id: string,
    name: string,
    order: number,
    runs: number,
    text: string,
    type: string,
  ) => ({
    participantId: id,
    playerShortName: name,
    batOrder: order,
    batInstance: 1,
    runsScored: runs,
    ballsFaced: runs + 5,
    foursScored: 1,
    sixesScored: 0,
    strikeRate: "50.00",
    dismissalText: text,
    dismissalType: type,
  });
  return {
    id: MATCH,
    status: "COMPLETED",
    matchSummary: {
      resultText: "Club A won by 9 wickets",
      teams: [
        {
          id: TEAM_B,
          displayName: "Club B A Grade",
          isHome: true,
          wonToss: true,
          isWinner: false,
          scoreText: "97",
        },
        {
          id: TEAM_A,
          displayName: "Club A A Grade",
          isHome: false,
          wonToss: false,
          isWinner: true,
          scoreText: "1-98",
        },
      ],
    },
    teams: [
      {
        id: TEAM_A,
        players: [
          { name: "Alice Able", shortName: "A Able", participantId: P[0] },
          { name: "Ben Baker", shortName: "B Baker", participantId: P[1] },
          { name: "Carl Cole", shortName: "C Cole", participantId: P[2] },
        ],
      },
      {
        id: TEAM_B,
        players: [
          { name: "Dan Dunn", shortName: "D Dunn", participantId: P[3] },
          { name: "Eve Ellis", shortName: "E Ellis", participantId: P[4] },
          { name: "Fred Fox", shortName: "F Fox", participantId: P[5] },
        ],
      },
    ],
    innings: [
      {
        inningsOrder: 1,
        inningsNumber: 1,
        battingTeamId: TEAM_B,
        batting: [
          bat(P[3]!, "D Dunn", 1, 60, `c: ${opts.fielderCatch ?? "A Able"} b: B Baker`, "Caught"),
          bat(P[4]!, "E Ellis", 2, 30, "c&b: B Baker", "Caught"),
          bat(P[5]!, "F Fox", 3, 7, "not out", "Not Out"),
        ],
        bowling: [
          {
            participantId: P[1],
            playerShortName: "B Baker",
            bowlOrder: 1,
            oversBowled: 8.3,
            maidensBowled: 1,
            runsConceded: 40,
            wicketsTaken: 2,
            economy: "4.70",
            wideBalls: 1,
            noBalls: 0,
          },
        ],
        fielding: [
          {
            participantId: opts.fielderCatch ? P[2] : P[0],
            playerShortName: "x",
            totalCatches: 1,
            stumpings: 0,
            runOuts: 0,
          },
          {
            participantId: P[1],
            playerShortName: "B Baker",
            totalCatches: 1,
            stumpings: 0,
            runOuts: 0,
          },
        ],
        fallOfWickets: [
          { order: 1, participantId: P[3], runs: 60 },
          { order: 2, participantId: P[4], runs: 90 },
        ],
      },
      {
        inningsOrder: 2,
        inningsNumber: 1,
        battingTeamId: TEAM_A,
        batting: [
          bat(P[0]!, "A Able", 1, 50, "not out", "Not Out"),
          bat(P[1]!, "B Baker", 2, 40, "run out (D Dunn)", "Run Out"),
          bat(P[2]!, "C Cole", 3, 0, "did not bat", "Did Not Bat"),
        ],
        bowling: [],
        fielding: [
          {
            participantId: P[3],
            playerShortName: "D Dunn",
            totalCatches: 0,
            stumpings: 0,
            runOuts: 1,
          },
        ],
        fallOfWickets: [{ order: 1, participantId: P[1], runs: 90 }],
      },
    ],
  };
}

beforeAll(async () => {
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "central-projector.sql"), "utf8"));
  await admin.query(`alter role central_projector with password 'test'`);
  process.env.CENTRAL_PROJECTOR_DATABASE_URL = projectorUrl();
  process.env.CENTRAL_PROJECTOR_DB_SSL = "0";
  projector = getCentralProjectorPool();

  await admin.query(
    `insert into central.club_playhq_orgs (playhq_org_id, club_id, source) values ($1, $2, 'manual'), ($3, $4, 'manual')
     on conflict (playhq_org_id) do update set club_id = excluded.club_id`,
    [ORG_A, CLUB_A, ORG_B, CLUB_B],
  );
  await admin.query(
    `insert into playhq.grades (id, name, season_name, is_junior) values
       ($1, 'A Grade Test Cup 2026/27', $3, false), ($2, 'Under 16 Test', $3, true)
     on conflict (id) do nothing`,
    [GRADE, JUNIOR_GRADE, SEASON],
  );
  const ins = (
    id: string,
    grade: string,
    homeTeam: string,
    homeName: string,
    homeOrg: string,
    awayTeam: string,
    awayName: string,
    awayOrg: string,
    status = "COMPLETED",
  ) =>
    admin.query(
      `insert into playhq.matches (id, grade_id, status, match_type, round_name, start_at, venue_name,
          surface_name, result_text, home_team_id, away_team_id, home_team_name, away_team_name,
          home_org_id, away_org_id, home_score, away_score, raw)
       values ($1, $2, $3, 'One Day', 'Round 1', '2026-10-03T23:30:00Z', 'Rec Reserve', 'Rec Reserve - Oval 1',
          'Club A won by 9 wickets', $4, $5, $6, $7, $8, $9, '97', '1-98', '{}')
       on conflict (id) do update set status = excluded.status`,
      [id, grade, status, homeTeam, awayTeam, homeName, awayName, homeOrg, awayOrg],
    );
  await ins(MATCH, GRADE, TEAM_B, "Club B A Grade", ORG_B, TEAM_A, "Club A A Grade", ORG_A);
  await ins(JUNIOR_MATCH, JUNIOR_GRADE, TEAM_B, "Club B U16", ORG_B, TEAM_A, "Club A U16", ORG_A);
  await ins(
    UNKNOWN_MATCH,
    GRADE,
    TEAM_X,
    "Club X A Grade",
    ORG_X,
    randomUUID(),
    "Club Y A Grade",
    randomUUID(),
  );
  await ins(
    ABANDONED,
    GRADE,
    TEAM_B,
    "Club B A Grade",
    ORG_B,
    TEAM_A,
    "Club A A Grade",
    ORG_A,
    "ABANDONED",
  );
  await admin.query(
    `insert into playhq.scorecards (match_id, grade_id, status, raw, fetched_at) values ($1, $2, 'COMPLETED', $3, now())
     on conflict (match_id) do update set raw = excluded.raw`,
    [MATCH, GRADE, JSON.stringify(scorecard())],
  );
  await admin.query(
    `insert into playhq.players (participant_id, full_name) values ($1, 'Able, Alice') on conflict do nothing`,
    [P[0]],
  );
});

afterAll(async () => {
  await closeCentralProjectorPool();
  const ids = [MATCH, JUNIOR_MATCH, UNKNOWN_MATCH, ABANDONED];
  const cm = await admin.query(
    `select match_id from central.matches where playhq_match_id = any($1::text[])`,
    [ids],
  );
  const mids = cm.rows.map((r: { match_id: number }) => r.match_id);
  for (const t of [
    "match_batting",
    "match_bowling",
    "match_rosters",
    "fall_of_wickets",
    "fielding",
  ])
    await admin.query(`delete from central.${t} where match_id = any($1::int[])`, [mids]);
  await admin.query(`delete from central.matches where match_id = any($1::int[])`, [mids]);
  await admin.query(`delete from central.players where participant_id = any($1::text[])`, [P]);
  await admin.query(`delete from central.club_playhq_orgs where playhq_org_id = any($1::text[])`, [
    [ORG_A, ORG_B],
  ]);
  await admin.query(`delete from playhq.scorecards where match_id = any($1::uuid[])`, [ids]);
  await admin.query(`delete from playhq.matches where id = any($1::uuid[])`, [ids]);
  await admin.query(`delete from playhq.grades where id = any($1::uuid[])`, [
    [GRADE, JUNIOR_GRADE],
  ]);
  await admin.query(`delete from playhq.players where participant_id = any($1::uuid[])`, [P]);
});

const centralMatch = async () =>
  (await admin.query(`select * from central.matches where playhq_match_id = $1`, [MATCH])).rows[0];
const lines = async (table: string, matchId: number) =>
  (await admin.query(`select * from central.${table} where match_id = $1 order by id`, [matchId]))
    .rows;

describe("central_projector role", () => {
  it("passes its own scope check", async () => {
    await expect(assertProjectorScope(projector)).resolves.toBeUndefined();
    const scope = await inspectProjectorScope(projector);
    expect(scope).toEqual({ superuser: false, writable: [] });
  });

  it("refuses a connection that can write more (the owner)", async () => {
    const scope = await inspectProjectorScope(db.$client);
    expect(scope.superuser || scope.writable.length > 0).toBe(true);
  });

  it("cannot write a central table outside its list", async () => {
    await expect(
      projector.query(`insert into central.clubs (club_id, name) values (99999, 'nope')`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("projectToCentral", () => {
  it("dry run computes the projection but writes nothing", async () => {
    const s = await projectToCentral(projector, { matchIds: [MATCH], dryRun: true });
    expect(s).toMatchObject({ dryRun: true, considered: 1, created: 1, skipped: [] });
    expect(await centralMatch()).toBeUndefined();
  });

  it("projects a completed senior match in the builder's shape", async () => {
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s).toMatchObject({ created: 1, updated: 0, skipped: [] });
    expect(s.playersInserted).toBe(6);

    const m = await centralMatch();
    expect(m).toMatchObject({
      season: SEASON,
      grade: "A Grade Test Cup 2026/27",
      comp_type: "One Day",
      round: "Round 1",
      match_date: "2026-10-04", // 23:30Z on the 3rd is the 4th in Perth
      status: "COMPLETED",
      home_club_id: CLUB_A, // lower club id is home, whatever PlayHQ says
      away_club_id: CLUB_B,
      home_team: "Club A A Grade",
      home_score: "98/1",
      away_score: "97/10",
      toss_winner_club_id: CLUB_B,
      winner_club_id: CLUB_A,
    });
    expect(m.match_id).toBeGreaterThanOrEqual(1_000_001);

    const bat = await lines("match_batting", m.match_id);
    expect(bat).toHaveLength(6);
    expect(bat.find((r) => r.player_name === "E Ellis")).toMatchObject({
      innings: 1,
      club_id: CLUB_B,
      dismissal: "c&b: B Baker",
      dismissal_type: "caught & bowled",
      fielder: "B Baker",
    });
    expect(bat.find((r) => r.player_name === "C Cole")).toMatchObject({
      dismissal_type: "other",
      runs: 0,
    });
    const bowl = await lines("match_bowling", m.match_id);
    expect(bowl).toEqual([
      expect.objectContaining({
        innings: 1,
        club_id: CLUB_A,
        overs: 8.3,
        economy: 4.7,
        wickets: 2,
      }),
    ]);
    expect(await lines("match_rosters", m.match_id)).toHaveLength(6);
    expect((await lines("fall_of_wickets", m.match_id)).map((r) => [r.innings, r.runs])).toEqual([
      [1, 60],
      [1, 90],
      [2, 90],
    ]);
    const fielding = await lines("fielding", m.match_id);
    expect(fielding.map((r) => [r.club_id, r.participant_id, r.kind]).sort()).toEqual(
      [
        [CLUB_A, P[0], "catch"],
        [CLUB_A, P[1], "catch"],
        [CLUB_B, P[3], "run out"],
      ].sort(),
    );

    const players = (
      await admin.query(
        `select participant_id, display_name, is_private, current_club_id, first_season, last_season, matches
           from central.players where participant_id = any($1::text[])`,
        [P],
      )
    ).rows;
    expect(players).toHaveLength(6);
    expect(players.find((p) => p.participant_id === P[0])).toMatchObject({
      display_name: "Able, Alice", // playhq.players full name wins
      is_private: 0,
      current_club_id: CLUB_A,
      first_season: SEASON,
      last_season: SEASON,
      matches: 1,
    });
    expect(players.find((p) => p.participant_id === P[3])?.display_name).toBe("Dunn, Dan");
  });

  it("re-projecting is a no-op on the rows", async () => {
    const m = await centralMatch();
    const before = await lines("match_batting", m.match_id);
    const s = await projectToCentral(projector, { matchIds: [MATCH] });
    expect(s).toMatchObject({ created: 0, updated: 1, playersInserted: 0 });
    expect((await centralMatch()).match_id).toBe(m.match_id);
    const after = await lines("match_batting", m.match_id);
    const strip = (r: Record<string, unknown>) => ({ ...r, id: undefined });
    expect(after.map(strip)).toEqual(before.map(strip));
  });

  it("an amended scorecard replaces the old lines exactly", async () => {
    await admin.query(`update playhq.scorecards set raw = $2 where match_id = $1`, [
      MATCH,
      JSON.stringify(scorecard({ fielderCatch: "C Cole" })),
    ]);
    await projectToCentral(projector, { matchIds: [MATCH] });
    const m = await centralMatch();
    const fielding = await lines("fielding", m.match_id);
    expect(fielding.filter((r) => r.participant_id === P[0])).toHaveLength(0);
    expect(fielding.filter((r) => r.participant_id === P[2])).toHaveLength(1);
    expect(fielding).toHaveLength(3);
    const dunn = (await lines("match_batting", m.match_id)).find((r) => r.player_name === "D Dunn");
    expect(dunn.dismissal).toBe("c: C Cole b: B Baker");
  });

  it("never overwrites an existing player's name or privacy flag", async () => {
    await admin.query(
      `update central.players set display_name = 'Curated Name', is_private = 1 where participant_id = $1`,
      [P[1]],
    );
    await projectToCentral(projector, { matchIds: [MATCH] });
    const r = (
      await admin.query(
        `select display_name, is_private from central.players where participant_id = $1`,
        [P[1]],
      )
    ).rows[0];
    expect(r).toEqual({ display_name: "Curated Name", is_private: 1 });
  });

  it("still projects when the role can't read the privacy overrides yet", async () => {
    // Production order: the SQL can run before the republish that creates (and lets it grant)
    // player_privacy_overrides. A failed read would abort every match's transaction.
    await admin.query(`revoke select on public.player_privacy_overrides from central_projector`);
    try {
      const s = await projectToCentral(projector, { matchIds: [MATCH] });
      expect(s.skipped).toEqual([]);
      expect(s.created + s.updated).toBe(1);
    } finally {
      await admin.query(`grant select on public.player_privacy_overrides to central_projector`);
    }
  });

  it("a sync applies platform privacy overrides (P8)", async () => {
    await admin.query(
      `insert into player_privacy_overrides (participant_id, is_private) values ($1, true)
       on conflict (participant_id) do update set is_private = true`,
      [P[4]],
    );
    try {
      await projectToCentral(projector, { matchIds: [MATCH] });
      const r = await admin.query(
        `select is_private from central.players where participant_id = $1`,
        [P[4]],
      );
      expect(r.rows[0].is_private).toBe(1);
    } finally {
      await admin.query(`delete from player_privacy_overrides where participant_id = $1`, [P[4]]);
    }
  });

  it("projects an abandoned match as a result row with no lines (D3)", async () => {
    const s = await projectToCentral(projector, { matchIds: [ABANDONED] });
    expect(s).toMatchObject({ created: 1, skipped: [] });
    const m = (
      await admin.query(`select * from central.matches where playhq_match_id = $1`, [ABANDONED])
    ).rows[0];
    expect(m.status).toBe("ABANDONED");
    expect(await lines("match_batting", m.match_id)).toHaveLength(0);
  });

  it("skips juniors and matches with no known club, and says why", async () => {
    const s = await projectToCentral(projector, { matchIds: [JUNIOR_MATCH, UNKNOWN_MATCH] });
    // The junior grade never even becomes a candidate (is_junior); the unknown clubs are skipped.
    expect(s.created + s.updated).toBe(0);
    expect(s.skipped).toEqual([
      expect.objectContaining({
        playhqMatchId: UNKNOWN_MATCH,
        reason: expect.stringMatching(/central club/),
      }),
    ]);
    const n = await admin.query(
      `select count(*)::int as n from central.matches where playhq_match_id = any($1::text[])`,
      [[JUNIOR_MATCH, UNKNOWN_MATCH]],
    );
    expect(n.rows[0].n).toBe(0);
  });

  it("a tenant's own PlayHQ organisation resolves its club with no history", async () => {
    // Production's PlayHQ tables start this season, so the history-seeded crosswalk can be
    // empty for a club; the tenant settings the sync runs on fill it.
    await admin.query(
      `insert into tenants (slug, name, plan, central_club_id, playhq_org_id)
       values ($1, 'Org Fallback Club', 'pilot', $2, $3)`,
      [`org-fallback-${ORG_X.slice(0, 8)}`, CLUB_X, ORG_X],
    );
    try {
      const s = await projectToCentral(projector, { matchIds: [UNKNOWN_MATCH] });
      expect(s.skipped).toEqual([]);
      expect(s.created).toBe(1);
      const m = (
        await admin.query(
          `select home_club_id, away_club_id from central.matches where playhq_match_id = $1`,
          [UNKNOWN_MATCH],
        )
      ).rows[0];
      // Club X resolves; the other side has no club anywhere, so it is the unresolved away side.
      expect(m).toEqual({ home_club_id: CLUB_X, away_club_id: null });
    } finally {
      await admin.query(`delete from tenants where playhq_org_id = $1`, [ORG_X]);
    }
  });

  it("an opponent known only by name resolves to its central club", async () => {
    // RMDCC's WA Premier opponents: in central under the builder's spelling, never in the
    // org crosswalk or a tenant's settings. Without a club the scorecard showed one team.
    const ORG_N = randomUUID();
    const CLUB_N = 9915;
    const NAMED = randomUUID();
    await admin.query(`insert into central.clubs (club_id, name) values ($1, 'Testnamed Rovers')`, [
      CLUB_N,
    ]);
    await admin.query(
      `insert into playhq.organisations (id, name) values ($1, 'Testnamed Rovers Cricket Club')`,
      [ORG_N],
    );
    await admin.query(
      `insert into playhq.matches (id, grade_id, status, match_type, round_name, start_at, venue_name,
          surface_name, result_text, home_team_id, away_team_id, home_team_name, away_team_name,
          home_org_id, away_org_id, home_score, away_score, raw)
       values ($1, $2, 'COMPLETED', 'One Day', 'Round 2', '2026-10-10T02:30:00Z', 'Rec Reserve',
          'Rec Reserve - Oval 1', 'Club A won', $3, $4, 'Club A A Grade', 'Rovers A Grade', $5, $6,
          '1-98', '97', '{}')`,
      [NAMED, GRADE, TEAM_A, randomUUID(), ORG_A, ORG_N],
    );
    try {
      const s = await projectToCentral(projector, { matchIds: [NAMED] });
      expect(s.skipped).toEqual([]);
      const m = (
        await admin.query(
          `select home_club_id, away_club_id from central.matches where playhq_match_id = $1`,
          [NAMED],
        )
      ).rows[0];
      expect(m).toEqual({ home_club_id: CLUB_A, away_club_id: CLUB_N });
    } finally {
      await admin.query(`delete from central.matches where playhq_match_id = $1`, [NAMED]);
      await admin.query(`delete from playhq.matches where id = $1`, [NAMED]);
      await admin.query(`delete from playhq.organisations where id = $1`, [ORG_N]);
      await admin.query(`delete from central.clubs where club_id = $1`, [CLUB_N]);
    }
  });

  it("backfills a season and skips nothing it can project", async () => {
    const s = await projectToCentral(projector, { season: SEASON, orgId: ORG_A });
    expect(s.considered).toBe(2); // MATCH + ABANDONED; the junior grade is excluded
    expect(s.skipped).toEqual([]);
  });
});

describe("ingest hook (CENTRAL_PROJECTION)", () => {
  const log = { info: () => {}, warn: () => {}, error: () => {} } as never;
  const dumpRows = {
    scorecards: [{ match_id: MATCH }],
    matches: [
      { id: MATCH, status: "COMPLETED" },
      { id: ABANDONED, status: "ABANDONED" },
      { id: JUNIOR_MATCH, status: "UPCOMING" },
    ],
  } as unknown as LoadRows;
  const saved = { ...process.env };
  afterAll(() => {
    process.env.CENTRAL_PROJECTION = saved.CENTRAL_PROJECTION;
    process.env.CENTRAL_PROJECTOR_DATABASE_URL = saved.CENTRAL_PROJECTOR_DATABASE_URL;
  });

  it("off by default: does nothing", async () => {
    delete process.env.CENTRAL_PROJECTION;
    const warnings: string[] = [];
    expect(await projectDumpToCentral(dumpRows, warnings, log)).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("on without the projector URL: warns instead of failing the ingest", async () => {
    process.env.CENTRAL_PROJECTION = "on";
    const url = process.env.CENTRAL_PROJECTOR_DATABASE_URL;
    delete process.env.CENTRAL_PROJECTOR_DATABASE_URL;
    const warnings: string[] = [];
    expect(await projectDumpToCentral(dumpRows, warnings, log)).toBeUndefined();
    expect(warnings).toEqual([expect.stringMatching(/CENTRAL_PROJECTOR_DATABASE_URL is not set/)]);
    process.env.CENTRAL_PROJECTOR_DATABASE_URL = url;
  });

  it("dry: projects the dump's scorecards and result-only matches without writing", async () => {
    process.env.CENTRAL_PROJECTION = "dry";
    const warnings: string[] = [];
    const s = await projectDumpToCentral(dumpRows, warnings, log);
    // MATCH (scorecard) and ABANDONED (result only); the upcoming match is not a candidate.
    expect(s).toMatchObject({ mode: "dry", considered: 2, skipped: 0 });
    expect(warnings).toEqual([]);
  });

  it("on: writes and reports", async () => {
    process.env.CENTRAL_PROJECTION = "on";
    const warnings: string[] = [];
    const s = await projectDumpToCentral(dumpRows, warnings, log);
    expect(s).toMatchObject({ mode: "on", considered: 2, created: 0, updated: 2, skipped: 0 });
    expect(warnings).toEqual([]);
  });
});
