/**
 * The junior projection end to end against a real database (junior PlayHQ sync plan U5;
 * KTD5–KTD10, R8–R13, R22, AE2, AE4). The planners are unit-tested in lib/db
 * (junior-project.test.ts); this proves the writes: fixtures, team lists, participants,
 * scored matches with stable ids, corrections / admin lines / merges surviving a re-sync,
 * the participant metadata recompute, a disabled tenant getting nothing and 2025/26 ignored.
 *
 * CI only: needs DATABASE_URL on a local Postgres (like shirt-number-sync.db.test.ts). The
 * playhq landing schema is applied to it, as the ingest suites do, and read directly.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  tenantsTable,
  juniorFixturesTable,
  juniorTeamListsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorStatCorrectionsTable,
  juniorParticipantMergesTable,
  JUNIOR_SYNC_ID_START,
} from "@workspace/db";
import { type LoadRows, type Queryable } from "@workspace/db/playhq-ingest";
import { projectDumpJuniors } from "./playhq-ingest";

const isLocalDb = (() => {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    return ["localhost", "127.0.0.1", "::1", "postgres"].includes(host);
  } catch {
    return false;
  }
})();

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const STAMP = Date.now();
const DAY = 86_400_000;
const NOW = Date.now();

const ORG = randomUUID();
const OPP = randomUUID();
const ORG_B = randomUUID();
const ASSOC = randomUUID();

const SEASON = randomUUID();
const G9 = randomUUID();
const G4 = randomUUID();
const G6 = randomUUID();
const G_OLD = randomUUID();
const G_B = randomUUID();

const OURS = randomUUID();
const THEIRS = randomUUID();

/** Scored Year 9 match, played 2 days ago. */
const M_SCORED = randomUUID();
/** Unscored Year 4 match, played 2 days ago (AE4). */
const M_UNSCORED = randomUUID();
/** Upcoming Year 6 match in 3 days, with a named side. */
const M_UPCOMING = randomUUID();
/** A second upcoming match whose list an admin saved. */
const M_ADMIN_LIST = randomUUID();
/** A 2025/26 scored match (AE2). */
const M_OLD = randomUUID();
/** The disabled club's junior match. */
const M_B = randomUUID();

const P1 = randomUUID(); // own, bats and bowls
const P2 = randomUUID(); // own, private on PlayHQ
const P3 = randomUUID(); // own, merged into KEEP by an admin
const P4 = randomUUID(); // own, upcoming side only
const KEEP = randomUUID();
const Q1 = randomUUID(); // opposition
const Q2 = randomUUID(); // opposition

const LOADER_MATCH_ID = 90_000_000 + (STAMP % 1_000_000);
const admin = { query: (text: string, params?: unknown[]) => db.$client.query(text, params) };
const reader = admin as unknown as Queryable;
const quiet = { info() {}, warn() {}, error() {} } as unknown as Parameters<
  typeof projectDumpJuniors
>[4];

let tenantId: number;
let tenantBId: number;

function scorecard(matchId: string) {
  return {
    id: matchId,
    status: "COMPLETED",
    matchSummary: {
      resultText: "Hawks won",
      teams: [
        { id: OURS, scoreText: "5-120", wonToss: true, isWinner: true },
        { id: THEIRS, scoreText: "100", wonToss: false, isWinner: false },
      ],
    },
    teams: [
      {
        id: OURS,
        players: [
          { participantId: P1, name: "Ollie Green", shortName: "O Green" },
          { participantId: P2, name: "Private Player", shortName: "Private Player" },
          { participantId: P3, name: "Sam Taylor", shortName: "S Taylor" },
        ],
      },
      {
        id: THEIRS,
        players: [
          { participantId: Q1, name: "Rival One", shortName: "R One" },
          { participantId: Q2, name: "Rival Two", shortName: "R Two" },
        ],
      },
    ],
    innings: [
      {
        inningsOrder: 1,
        battingTeamId: OURS,
        batting: [
          {
            participantId: P1,
            playerShortName: "O Green",
            batOrder: 1,
            runsScored: 40,
            ballsFaced: 30,
            dismissalText: "b: R Two",
          },
          {
            participantId: P3,
            playerShortName: "S Taylor",
            batOrder: 2,
            runsScored: 12,
            ballsFaced: 20,
            dismissalText: "not out",
          },
        ],
        bowling: [
          {
            participantId: Q2,
            playerShortName: "R Two",
            oversBowled: 4,
            runsConceded: 22,
            wicketsTaken: 1,
          },
        ],
      },
      {
        inningsOrder: 2,
        battingTeamId: THEIRS,
        batting: [
          {
            participantId: Q1,
            playerShortName: "R One",
            batOrder: 1,
            runsScored: 55,
            ballsFaced: 60,
            dismissalText: "c: O Green b: S Taylor",
          },
        ],
        bowling: [
          {
            participantId: P3,
            playerShortName: "S Taylor",
            oversBowled: 3,
            runsConceded: 10,
            wicketsTaken: 2,
          },
        ],
      },
    ],
  };
}

async function seedPlayhq() {
  await admin.query(
    `insert into playhq.organisations (id, name) values ($1, 'Hawks Junior CC'), ($2, 'Rivals Junior CC'),
       ($3, 'Other Junior CC'), ($4, 'Peel Junior Cricket Association')`,
    [ORG, OPP, ORG_B, ASSOC],
  );
  const grade = (id: string, name: string, season: string) =>
    admin.query(
      `insert into playhq.grades (id, name, season_id, season_name, owner_org_id, source_org_id, is_junior)
       values ($1, $2, $3, $4, $5, $6, true)`,
      [id, name, SEASON, season, ASSOC, ORG],
    );
  await grade(G9, "Year 9 Boys Peel", "Summer 2026/27");
  await grade(G4, "Year 4 Gold", "Summer 2026/27");
  await grade(G6, "Year 6 Blue", "Summer 2026/27");
  await grade(G_OLD, "Year 9 Boys Peel", "Summer 2025/26");
  await grade(G_B, "Year 7 Red", "Summer 2026/27");

  const match = (
    id: string,
    gradeId: string,
    status: string,
    startAt: Date,
    home: [string, string, string] = [OURS, "Hawks Blue", ORG],
    away: [string, string, string] = [THEIRS, "Rivals Red", OPP],
  ) =>
    admin.query(
      `insert into playhq.matches (id, grade_id, status, round_name, start_at, venue_name,
         home_team_id, home_team_name, home_org_id, home_score,
         away_team_id, away_team_name, away_org_id, away_score, winner_team_id, raw, fetched_at)
       values ($1, $2, $3, 'Round 3', $4, 'Hawks Oval', $5, $6, $7, $8, $9, $10, $11, $12, $13, '{}'::jsonb, now())`,
      [
        id,
        gradeId,
        status,
        startAt,
        home[0],
        home[1],
        home[2],
        status === "COMPLETED" ? "5-120" : null,
        away[0],
        away[1],
        away[2],
        status === "COMPLETED" ? "100" : null,
        status === "COMPLETED" ? OURS : null,
      ],
    );
  await match(M_SCORED, G9, "COMPLETED", new Date(NOW - 2 * DAY));
  await match(M_UNSCORED, G4, "COMPLETED", new Date(NOW - 2 * DAY));
  await match(M_UPCOMING, G6, "UPCOMING", new Date(NOW + 3 * DAY));
  await match(M_ADMIN_LIST, G6, "UPCOMING", new Date(NOW + 4 * DAY));
  await match(M_OLD, G_OLD, "COMPLETED", new Date("2025-11-08T01:00:00Z"));
  await match(M_B, G_B, "UPCOMING", new Date(NOW + 3 * DAY), [randomUUID(), "Other Blue", ORG_B]);

  for (const id of [M_SCORED, M_OLD])
    await admin.query(
      `insert into playhq.scorecards (match_id, grade_id, status, raw, fetched_at)
       values ($1, $2, 'COMPLETED', $3::jsonb, now())`,
      [id, id === M_OLD ? G_OLD : G9, JSON.stringify(scorecard(id))],
    );
  // The unscored grade publishes a scorecard with no lines.
  await admin.query(
    `insert into playhq.scorecards (match_id, grade_id, status, raw, fetched_at)
     values ($1, $2, 'COMPLETED', $3::jsonb, now())`,
    [M_UNSCORED, G4, JSON.stringify({ id: M_UNSCORED, status: "COMPLETED", innings: [] })],
  );
  const side = [
    { participantId: P1, name: "Ollie Green", shortName: "O Green", roles: ["Captain"] },
    { participantId: P4, name: "Nova Newcomer", shortName: "N Newcomer", roles: [] },
  ];
  for (const id of [M_UPCOMING, M_ADMIN_LIST])
    await admin.query(
      `insert into playhq.match_lineups (match_id, team_id, players, fetched_at)
       values ($1, $2, $3::jsonb, now()), ($1, $4, $5::jsonb, now())`,
      [
        id,
        OURS,
        JSON.stringify(side),
        THEIRS,
        JSON.stringify([{ participantId: Q1, name: "Rival One" }]),
      ],
    );
}

const allMatchIds = [M_SCORED, M_UNSCORED, M_UPCOMING, M_ADMIN_LIST, M_OLD, M_B];
const rowsFor = (ids: string[]) =>
  ({
    matches: ids.map((id) => ({ id })),
    scorecards: [],
    match_lineups: [],
  }) as unknown as LoadRows;

async function sync(): Promise<string[]> {
  const warnings: string[] = [];
  await projectDumpJuniors(
    rowsFor(allMatchIds),
    [{ tenantId, orgId: ORG }],
    reader,
    warnings,
    quiet,
  );
  return warnings;
}

async function syncedMatch() {
  const [m] = await db
    .select()
    .from(juniorMatchesTable)
    .where(
      and(
        eq(juniorMatchesTable.tenantId, tenantId),
        eq(juniorMatchesTable.playhqMatchId, M_SCORED.toLowerCase()),
      ),
    );
  return m;
}

async function lines(matchId: number) {
  const batting = await db
    .select()
    .from(juniorMatchBattingTable)
    .where(eq(juniorMatchBattingTable.matchId, matchId));
  const bowling = await db
    .select()
    .from(juniorMatchBowlingTable)
    .where(eq(juniorMatchBowlingTable.matchId, matchId));
  const rosters = await db
    .select()
    .from(juniorMatchRostersTable)
    .where(eq(juniorMatchRostersTable.matchId, matchId));
  return { batting, bowling, rosters };
}

const participants = (tid: number) =>
  db.select().from(juniorParticipantsTable).where(eq(juniorParticipantsTable.tenantId, tid));

describe.skipIf(!isLocalDb)("junior projection (DB)", () => {
  beforeAll(async () => {
    await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
    const [a] = await db
      .insert(tenantsTable)
      .values({
        slug: `junior-proj-a-${STAMP}`,
        centralClubId: 9931,
        name: "Junior Proj A",
        plan: "pro",
      })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({
        slug: `junior-proj-b-${STAMP}`,
        centralClubId: 9932,
        name: "Junior Proj B",
        plan: "pro",
      })
      .returning();
    tenantId = a.id;
    tenantBId = b.id;
    await seedPlayhq();

    // Loader history: P1 played 2025/26 (a loader row below the sync band, AE2).
    await db.insert(juniorParticipantsTable).values([
      {
        tenantId,
        participantId: P1.toLowerCase(),
        displayName: "Ollie Green",
        lastSeason: "2025/26",
        firstSeason: "2025/26",
      },
      { tenantId, participantId: KEEP.toLowerCase(), displayName: "Keeper Kid" },
    ]);
    await db.insert(juniorMatchesTable).values({
      id: LOADER_MATCH_ID,
      tenantId,
      playhqMatchId: M_OLD.toLowerCase(),
      season: "2025/26",
      seasonStartYear: 2025,
      ageGroup: "Year 8",
      team1: "Loader Team",
      team1Score: "1/1",
      status: "Played",
    });
    await db.insert(juniorMatchRostersTable).values({
      id: LOADER_MATCH_ID,
      matchId: LOADER_MATCH_ID,
      teamName: "Loader Team",
      isHallsHead: true,
      participantId: P1.toLowerCase(),
      playerName: "Ollie Green",
    });
    // An admin-saved list for the second upcoming fixture.
    const [fx] = await db
      .insert(juniorFixturesTable)
      .values({
        tenantId,
        playhqMatchId: M_ADMIN_LIST.toLowerCase(),
        seasonStartYear: 2026,
        status: "UPCOMING",
      })
      .returning();
    await db.insert(juniorTeamListsTable).values({
      tenantId,
      juniorFixtureId: fx.id,
      players: [{ order: 1, participantId: P4.toLowerCase() }],
      isPublished: true,
      source: "admin",
    });
  });

  afterAll(async () => {
    const ids = [tenantId, tenantBId].filter(Boolean);
    if (ids.length) {
      await db
        .delete(juniorStatCorrectionsTable)
        .where(inArray(juniorStatCorrectionsTable.tenantId, ids));
      await db
        .delete(juniorParticipantMergesTable)
        .where(inArray(juniorParticipantMergesTable.tenantId, ids));
      await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.tenantId, ids));
      await db.delete(juniorFixturesTable).where(inArray(juniorFixturesTable.tenantId, ids));
      await db
        .delete(juniorParticipantsTable)
        .where(inArray(juniorParticipantsTable.tenantId, ids));
      await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
    }
    await admin.query(`delete from playhq.match_lineups where match_id = any($1::uuid[])`, [
      allMatchIds,
    ]);
    await admin.query(`delete from playhq.scorecards where match_id = any($1::uuid[])`, [
      allMatchIds,
    ]);
    await admin.query(`delete from playhq.matches where id = any($1::uuid[])`, [allMatchIds]);
    await admin.query(`delete from playhq.grades where id = any($1::uuid[])`, [
      [G9, G4, G6, G_OLD, G_B],
    ]);
    await admin.query(`delete from playhq.organisations where id = any($1::uuid[])`, [
      [ORG, OPP, ORG_B, ASSOC],
    ]);
  });

  let firstIds: { match: number; batting: number[]; bowling: number[]; rosters: number[] };

  it("projects fixtures, team lists, participants and the scored match", async () => {
    expect(await sync()).toEqual([]);

    const fixtures = await db
      .select()
      .from(juniorFixturesTable)
      .where(eq(juniorFixturesTable.tenantId, tenantId));
    const byMatch = new Map(fixtures.map((f) => [f.playhqMatchId, f]));
    // AE4: the unscored match is a finished fixture, never a junior match.
    expect(byMatch.get(M_UNSCORED.toLowerCase())).toMatchObject({
      status: "COMPLETED",
      ageGroup: "Year 4",
    });
    expect(byMatch.get(M_UPCOMING.toLowerCase())).toMatchObject({
      status: "UPCOMING",
      teamName: "Hawks Blue",
      opponentName: "Rivals Junior CC",
      isHome: true,
      seasonStartYear: 2026,
    });
    // A scored match gets no fixture; 2025/26 gets nothing.
    expect(byMatch.has(M_SCORED.toLowerCase())).toBe(false);
    expect(byMatch.has(M_OLD.toLowerCase())).toBe(false);

    // The named side becomes a published PlayHQ list; the admin's list is untouched.
    const lists = await db
      .select()
      .from(juniorTeamListsTable)
      .where(eq(juniorTeamListsTable.tenantId, tenantId));
    const listOf = (m: string) =>
      lists.find((l) => l.juniorFixtureId === byMatch.get(m.toLowerCase())?.id);
    expect(listOf(M_UPCOMING)).toMatchObject({
      source: "playhq",
      isPublished: true,
      players: [
        { order: 1, participantId: P1.toLowerCase(), role: "C" },
        { order: 2, participantId: P4.toLowerCase() },
      ],
    });
    expect(listOf(M_ADMIN_LIST)).toMatchObject({
      source: "admin",
      players: [{ order: 1, participantId: P4.toLowerCase() }],
    });

    const m = await syncedMatch();
    expect(m.id).toBeGreaterThanOrEqual(JUNIOR_SYNC_ID_START);
    expect(m).toMatchObject({
      season: "2026/27",
      hhResult: "Won",
      hhBattedFirst: true,
      team1Score: "120/5",
    });
    const l = await lines(m.id);
    expect(l.batting).toHaveLength(3);
    expect(l.bowling).toHaveLength(2);
    expect(l.rosters).toHaveLength(5);
    for (const row of [...l.batting, ...l.bowling, ...l.rosters])
      expect(row.id).toBeGreaterThanOrEqual(JUNIOR_SYNC_ID_START);
    const opp = l.batting.find((b) => !b.isHallsHead)!;
    expect(opp).toMatchObject({ participantId: Q1.toLowerCase(), playerName: "R One" });

    // Participants: the club's own players only (lineup-only P4 included); opposition never.
    const ps = await participants(tenantId);
    const ids = ps.map((p) => p.participantId);
    expect(ids).toEqual(expect.arrayContaining([P1, P2, P3, P4].map((x) => x.toLowerCase())));
    expect(ids).not.toContain(Q1.toLowerCase());
    expect(ids).not.toContain(Q2.toLowerCase());
    expect(ps.find((p) => p.participantId === P2.toLowerCase())).toMatchObject({ isPrivate: true });
    // A synced 2026/27 appearance moves the participant's last season forward.
    expect(ps.find((p) => p.participantId === P1.toLowerCase())).toMatchObject({
      firstSeason: "2025/26",
      lastSeason: "2026/27",
    });

    // The loader's 2025/26 row is untouched (AE2).
    const [loader] = await db
      .select()
      .from(juniorMatchesTable)
      .where(eq(juniorMatchesTable.id, LOADER_MATCH_ID));
    expect(loader).toMatchObject({ team1: "Loader Team", team1Score: "1/1", status: "Played" });

    firstIds = {
      match: m.id,
      batting: l.batting.map((r) => r.id).sort(),
      bowling: l.bowling.map((r) => r.id).sort(),
      rosters: l.rosters.map((r) => r.id).sort(),
    };
  });

  it("a re-run makes no new rows and keeps every id", async () => {
    expect(await sync()).toEqual([]);
    const m = await syncedMatch();
    expect(m.id).toBe(firstIds.match);
    const l = await lines(m.id);
    expect(l.batting.map((r) => r.id).sort()).toEqual(firstIds.batting);
    expect(l.bowling.map((r) => r.id).sort()).toEqual(firstIds.bowling);
    expect(l.rosters.map((r) => r.id).sort()).toEqual(firstIds.rosters);
    const fixtures = await db
      .select()
      .from(juniorFixturesTable)
      .where(eq(juniorFixturesTable.tenantId, tenantId));
    expect(fixtures).toHaveLength(3);
  });

  it("an admin correction, an admin-added line, a rename and a merge survive a re-sync", async () => {
    const m = await syncedMatch();
    const l = await lines(m.id);
    const p1Bat = l.batting.find((b) => b.participantId === P1.toLowerCase())!;

    // Correction: P1's runs 40 → 44 (written and journalled, as the admin API does).
    await db
      .update(juniorMatchBattingTable)
      .set({ runs: 44 })
      .where(eq(juniorMatchBattingTable.id, p1Bat.id));
    await db.insert(juniorStatCorrectionsTable).values({
      tenantId,
      targetTable: "junior_match_batting",
      targetId: String(p1Bat.id),
      op: "update",
      patch: { runs: 44 },
      prevValues: { runs: 40 },
      matchId: m.id,
      playhqMatchId: m.playhqMatchId,
    });
    // Admin-added line (admin id band), journalled as an insert.
    const addedId = 100_000_000 + (STAMP % 50_000_000);
    const added = {
      id: addedId,
      match_id: m.id,
      innings: 1,
      batting_team: "Hawks Blue",
      is_halls_head: true,
      bat_order: 3,
      participant_id: KEEP.toLowerCase(),
      player_name: "Keeper Kid",
      runs: 7,
      balls: 9,
    };
    await db.insert(juniorMatchBattingTable).values({
      id: addedId,
      matchId: m.id,
      innings: 1,
      battingTeam: "Hawks Blue",
      isHallsHead: true,
      batOrder: 3,
      participantId: KEEP.toLowerCase(),
      playerName: "Keeper Kid",
      runs: 7,
      balls: 9,
    });
    await db.insert(juniorStatCorrectionsTable).values({
      tenantId,
      targetTable: "junior_match_batting",
      targetId: String(addedId),
      op: "insert",
      patch: added,
      matchId: m.id,
      playhqMatchId: m.playhqMatchId,
    });
    // Rename P1.
    await db
      .update(juniorParticipantsTable)
      .set({ displayName: "Olly G" })
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, tenantId),
          eq(juniorParticipantsTable.participantId, P1.toLowerCase()),
        ),
      );
    await db.insert(juniorStatCorrectionsTable).values({
      tenantId,
      targetTable: "junior_participants",
      targetId: P1.toLowerCase(),
      op: "update",
      patch: { display_name: "Olly G" },
      prevValues: { display_name: "Ollie Green" },
      participantId: P1.toLowerCase(),
    });
    // Merge P3 into KEEP: lines re-pointed, the duplicate row deleted.
    await db.insert(juniorParticipantMergesTable).values({
      tenantId,
      duplicateParticipantId: P3.toLowerCase(),
      keeperParticipantId: KEEP.toLowerCase(),
    });
    for (const t of [juniorMatchBattingTable, juniorMatchBowlingTable, juniorMatchRostersTable])
      await db
        .update(t)
        .set({ participantId: KEEP.toLowerCase() })
        .where(and(eq(t.matchId, m.id), eq(t.participantId, P3.toLowerCase())));
    await db
      .delete(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, tenantId),
          eq(juniorParticipantsTable.participantId, P3.toLowerCase()),
        ),
      );

    expect(await sync()).toEqual([]);

    const after = await lines(m.id);
    expect(after.batting.find((b) => b.id === p1Bat.id)).toMatchObject({
      runs: 44,
      playerName: "Olly G",
    });
    expect(after.batting.find((b) => b.id === addedId)).toMatchObject({ runs: 7 });
    expect(after.batting).toHaveLength(4);
    // Merged: no line or participant for the duplicate, and the keeper keeps the lines.
    const all = [...after.batting, ...after.bowling, ...after.rosters];
    expect(all.some((r) => r.participantId === P3.toLowerCase())).toBe(false);
    expect(after.bowling.find((b) => b.isHallsHead)?.participantId).toBe(KEEP.toLowerCase());
    // Ids of the synced lines are unchanged.
    expect(after.bowling.map((r) => r.id).sort()).toEqual(firstIds.bowling);
    const ps = await participants(tenantId);
    expect(ps.some((p) => p.participantId === P3.toLowerCase())).toBe(false);
    expect(ps.find((p) => p.participantId === P1.toLowerCase())?.displayName).toBe("Olly G");
    expect(ps.find((p) => p.participantId === KEEP.toLowerCase())?.scorecardLines).toBeGreaterThan(
      0,
    );
  });

  it("privacy tightens from PlayHQ; an admin override is never touched", async () => {
    await db
      .update(juniorParticipantsTable)
      .set({ isPrivate: false, privacyOverride: true, privacyOverrideBy: "admin" })
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, tenantId),
          eq(juniorParticipantsTable.participantId, P4.toLowerCase()),
        ),
      );
    await admin.query(
      `update playhq.match_lineups set players = $2::jsonb where match_id = $1 and team_id = $3`,
      [
        M_UPCOMING,
        JSON.stringify([
          { participantId: P4, name: "Private Player", shortName: "Private Player", roles: [] },
        ]),
        OURS,
      ],
    );
    expect(await sync()).toEqual([]);
    const [p4] = (await participants(tenantId)).filter((p) => p.participantId === P4.toLowerCase());
    expect(p4).toMatchObject({
      isPrivate: true,
      privacyOverride: true,
      displayName: "Nova Newcomer",
    });
  });

  it("a disabled tenant gets no junior writes", async () => {
    expect(await participants(tenantBId)).toEqual([]);
    expect(
      await db
        .select()
        .from(juniorFixturesTable)
        .where(eq(juniorFixturesTable.tenantId, tenantBId)),
    ).toEqual([]);
    expect(
      await db.select().from(juniorMatchesTable).where(eq(juniorMatchesTable.tenantId, tenantBId)),
    ).toEqual([]);
  });
});
