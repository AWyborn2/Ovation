// The side a club names in PlayHQ becomes its fixture's team list and a Team List draft
// with one of the selected players' photos (Ash, 5 Oct 2026), end to end through
// POST /api/internal/playhq/ingest. An admin's own list is never overwritten.
//
// Real database, as internal-playhq-ingest.test.ts: the playhq landing schema and the
// playhq_ingest role are applied to the central database and ingest connects as that role.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  fixturesTable,
  teamListsTable,
  playersTable,
  playerIdMapTable,
  clubPhotosTable,
  clubPhotoPlayersTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
  notificationsTable,
} from "@workspace/db";
import { closePlayhqIngestPool, projectTeamLists } from "@workspace/db/playhq-ingest";
import { teamListKey } from "../lib/engines/team-list";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const SECRET = "test-playhq-team-lists-secret";
const STAMP = Date.now();

const ORG = randomUUID();
const OPP = randomUUID();
const SEASON = randomUUID();
const GRADE = randomUUID();
const MATCH = randomUUID();
const TEAM_OURS = randomUUID();
const TEAM_THEIRS = randomUUID();
const P_CAPTAIN = randomUUID();
const P_PHOTO = randomUUID();
const P_NEW = randomUUID();
const P_OPP = randomUUID();

const centralUrl = process.env.CENTRAL_DATABASE_URL!;
const admin = { query: (text: string, params?: unknown[]) => db.$client.query(text, params) };
let tenantId: number;
let playerIds: number[] = [];
const START = new Date(Date.now() + 3 * 86_400_000).toISOString();

type Named = { participantId: string; name: string; shortName: string; roles: string[] };
const named = (participantId: string, name: string, roles: string[] = []): Named => ({
  participantId,
  name,
  shortName: name,
  roles,
});

function dump(ours: Named[]) {
  const at = new Date().toISOString();
  const team = (id: string, org: string, name: string, players: Named[]) => ({
    id,
    displayName: `${name} F Grade`,
    name: "F Grade",
    owningOrganisation: { id: org, name },
    players,
    nonPlayingMembers: [],
  });
  const match = {
    id: MATCH,
    status: "UPCOMING",
    statusId: 0,
    matchType: "One Day",
    matchTypeId: 2,
    round: { id: randomUUID(), name: "Round 1", shortName: "R1" },
    grade: { id: GRADE, name: "F Grade" },
    matchSchedule: [{ matchDay: 1, startDateTime: START }],
    venue: { name: "Home Oval", playingSurface: { name: "Home Oval - 1" } },
    teams: [
      team(TEAM_OURS, ORG, "Lineup Cricket Club", ours),
      team(TEAM_THEIRS, OPP, "Rivals Cricket Club", [named(P_OPP, "Otto Opposition")]),
    ],
  };
  const { teams, ...listed } = match;
  return {
    version: "2.0.0",
    exportedAt: at,
    origin: "https://play.cricket.com.au",
    records: [
      {
        key: "plan|1",
        kind: "plan",
        id: at,
        meta: {},
        fetchedAt: at,
        data: { orgId: ORG, seasons: "current", kinds: ["matches"], lineups: "upcoming" },
      },
      {
        key: `grade|${GRADE}`,
        kind: "grade",
        id: GRADE,
        meta: {},
        fetchedAt: at,
        data: {
          gradeId: GRADE,
          gradeName: "F Grade",
          seasonId: SEASON,
          seasonName: "Summer 2026/27",
          sourceOrgId: ORG,
          teamIds: [TEAM_OURS],
          teamNames: ["F Grade"],
        },
      },
      {
        key: `matches|${GRADE}`,
        kind: "matches",
        id: GRADE,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        // The grade listing carries the teams without their players.
        data: {
          matches: [
            { ...listed, teams: teams.map(({ players: _p, nonPlayingMembers: _n, ...t }) => t) },
          ],
        },
      },
      {
        key: `lineup|${MATCH}`,
        kind: "lineup",
        id: MATCH,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: match,
      },
    ],
  };
}

const post = (ours: Named[]) =>
  request(app)
    .post("/api/internal/playhq/ingest")
    .set("x-sync-secret", SECRET)
    .send({ collector: "manual", planName: "preweekend", dump: dump(ours) });

async function teamList() {
  const [fx] = await db
    .select()
    .from(fixturesTable)
    .where(and(eq(fixturesTable.tenantId, tenantId), eq(fixturesTable.playhqMatchId, MATCH)));
  const [list] = await db
    .select()
    .from(teamListsTable)
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fx.id)));
  return { fx, list };
}

beforeAll(async () => {
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  await admin.query(fs.readFileSync(path.join(SQL_DIR, "playhq-ingest-role.sql"), "utf8"));
  await admin.query(`alter role playhq_ingest with password 'test'`);
  const u = new URL(centralUrl);
  u.username = "playhq_ingest";
  u.password = "test";
  process.env.PLAYHQ_INGEST_DATABASE_URL = u.toString();
  process.env.PLAYHQ_SYNC_SECRET = SECRET;
  await closePlayhqIngestPool();

  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `playhq-lineups-${STAMP}`,
      centralClubId: 9903,
      name: "Lineup Test Club",
      plan: "pro",
      playhqOrgId: ORG,
      playhqSyncEnabled: true,
    })
    .returning();
  tenantId = t.id;
  await db.insert(socialSettingsTable).values({
    tenantId,
    familyConfig: {
      results: { enabled: false, grades: {} },
      achievements: { enabled: false, grades: {} },
      roundup: { enabled: false, grades: {} },
      matchday: { enabled: true, grades: {} },
    },
  });
  const players = await db
    .insert(playersTable)
    .values([
      { surname: `Skipper${STAMP}`, givenName: "Cam" },
      { surname: `Snapped${STAMP}`, givenName: "Pat" },
    ])
    .returning();
  playerIds = players.map((p) => p.id);
  await db.insert(playerIdMapTable).values([
    { tenantId, participantId: P_CAPTAIN, playerId: playerIds[0] },
    { tenantId, participantId: P_PHOTO, playerId: playerIds[1] },
  ]);
  // Only Pat has a library photo, so Pat is the card's photo.
  const [photo] = await db
    .insert(clubPhotosTable)
    .values({
      tenantId,
      objectPath: `/objects/library/lineup-${STAMP}`,
      thumbPath: `/objects/library/lineup-${STAMP}-thumb`,
      width: 100,
      height: 100,
    })
    .returning();
  await db
    .insert(clubPhotoPlayersTable)
    .values({ tenantId, photoId: photo.id, playerId: playerIds[1] });
});

afterAll(async () => {
  await closePlayhqIngestPool();
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  await db.delete(clubPhotoPlayersTable).where(eq(clubPhotoPlayersTable.tenantId, tenantId));
  await db.delete(clubPhotosTable).where(eq(clubPhotosTable.tenantId, tenantId));
  await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
  await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  await admin.query(`delete from playhq.match_lineups where match_id = $1`, [MATCH]);
  await admin.query(`delete from playhq.fixture_changes where match_id = $1`, [MATCH]);
  await admin.query(`delete from playhq.matches where id = $1`, [MATCH]);
  await admin.query(`delete from playhq.teams where grade_id = $1`, [GRADE]);
  await admin.query(`delete from playhq.grades where id = $1`, [GRADE]);
  await admin.query(`delete from playhq.scrape_runs where org_id = $1`, [ORG]);
  delete process.env.PLAYHQ_SYNC_SECRET;
  delete process.env.PLAYHQ_INGEST_DATABASE_URL;
});

describe("PlayHQ named side → team list → Team List draft", () => {
  it("copies the club's own side as a published list, linked to the register, captain marked", async () => {
    const res = await post([
      named(P_CAPTAIN, "Cam Skipper", ["Captain"]),
      named(P_PHOTO, "Pat Snapped"),
      named(P_NEW, "Nina Newcomer"),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([]);
    const { list } = await teamList();
    expect(list).toMatchObject({ source: "playhq", isPublished: true });
    expect(list.players).toEqual([
      { order: 1, playerId: playerIds[0], displayName: "Cam Skipper", role: "C" },
      { order: 2, playerId: playerIds[1], displayName: "Pat Snapped" },
      { order: 3, displayName: "Nina Newcomer" },
    ]);
  });

  it("drafts the Team List card with the selected player's library photo", async () => {
    const { fx } = await teamList();
    const [draft] = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKey, teamListKey(fx.id)),
        ),
      );
    expect(draft.status).toBe("awaiting_review");
    expect(draft.cardInput).toMatchObject({
      kind: "teamList",
      players: [{ surname: "SKIPPER", role: "C" }, { surname: "SNAPPED" }, { surname: "NEWCOMER" }],
    });
    expect(draft.photoSource).toBe("auto:library-player");
    expect(draft.photoUrl).toContain(`lineup-${STAMP}`);
  });

  it("follows a changed selection, and never overwrites a list the admin has saved", async () => {
    await post([named(P_CAPTAIN, "Cam Skipper", ["Captain"]), named(P_PHOTO, "Pat Snapped")]);
    expect((await teamList()).list.players).toHaveLength(2);

    const { fx } = await teamList();
    const mine = [{ order: 1, displayName: "Admin Pick" }];
    await db
      .update(teamListsTable)
      .set({ players: mine, source: "admin" })
      .where(eq(teamListsTable.fixtureId, fx.id));
    const res = await post([named(P_NEW, "Nina Newcomer")]);
    expect(res.status).toBe(200);
    const { list } = await teamList();
    expect(list.source).toBe("admin");
    expect(list.players).toEqual(mine);
  });
});

// R34: once a fixture is played, the side PlayHQ recorded replaces a list finalised in the
// Selection Hub (source = "selection"). Before the match, and for an admin's list always,
// the selection stands.
describe("after the match: PlayHQ's side replaces a Selection Hub list", () => {
  const DAY = 86_400_000;
  const NOW = new Date();
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
  const ids = {
    played: randomUUID(),
    lineupOnly: randomUUID(),
    noSide: randomUUID(),
    unfinished: randomUUID(),
    adminPast: randomUUID(),
    tomorrow: randomUUID(),
    stale: randomUUID(),
  };
  const hub = [{ order: 1, displayName: "Hub Pick" }];
  const fixtureOf = new Map<string, number>();

  async function playhqMatch(id: string, startAt: Date, status: string, statusId: number) {
    await admin.query(
      `insert into playhq.matches
         (id, grade_id, status, status_id, start_at, home_team_id, home_org_id,
          away_team_id, away_org_id, raw, fetched_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb, now())`,
      [id, GRADE, status, statusId, startAt.toISOString(), TEAM_OURS, ORG, TEAM_THEIRS, OPP],
    );
  }
  async function scorecard(id: string, ours: Named[]) {
    const raw = {
      id,
      status: "COMPLETED",
      teams: [
        { id: TEAM_OURS, players: ours },
        { id: TEAM_THEIRS, players: [named(P_OPP, "Otto Opposition")] },
      ],
      innings: [],
    };
    await admin.query(
      `insert into playhq.scorecards (match_id, grade_id, status, raw, fetched_at)
       values ($1, $2, 'COMPLETED', $3::jsonb, now())`,
      [id, GRADE, JSON.stringify(raw)],
    );
  }
  async function lineup(id: string, ours: Named[]) {
    await admin.query(
      `insert into playhq.match_lineups (match_id, team_id, players, fetched_at)
       values ($1, $2, $3::jsonb, now())`,
      [id, TEAM_OURS, JSON.stringify(ours)],
    );
  }
  async function fixtureWithList(matchId: string, startAt: Date, source: string) {
    const [fx] = await db
      .insert(fixturesTable)
      .values({
        tenantId,
        grade: "F Grade",
        opponentName: "Rivals",
        startAt,
        source: "playhq",
        playhqMatchId: matchId,
      })
      .returning();
    await db
      .insert(teamListsTable)
      .values({ tenantId, fixtureId: fx.id, players: hub, isPublished: true, source });
    fixtureOf.set(matchId, fx.id);
  }
  async function listOf(matchId: string) {
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(
        and(
          eq(teamListsTable.tenantId, tenantId),
          eq(teamListsTable.fixtureId, fixtureOf.get(matchId)!),
        ),
      );
    return list;
  }
  const allIds = () => Object.values(ids);

  beforeAll(async () => {
    const side = [named(P_CAPTAIN, "Cam Skipper", ["Captain"]), named(P_NEW, "Nina Newcomer")];
    // Played yesterday, finished: the scorecard's side wins over the pre-match lineup.
    await playhqMatch(ids.played, ago(1), "COMPLETED", 3);
    await scorecard(ids.played, side);
    await lineup(ids.played, [named(P_PHOTO, "Pat Snapped")]);
    await fixtureWithList(ids.played, ago(1), "selection");
    // Finished with no scorecard side loaded yet: the last named lineup is used.
    await playhqMatch(ids.lineupOnly, ago(2), "COMPLETED", 3);
    await lineup(ids.lineupOnly, [named(P_PHOTO, "Pat Snapped")]);
    await fixtureWithList(ids.lineupOnly, ago(2), "selection");
    // Finished, but PlayHQ holds no side for the club: keep the selection.
    await playhqMatch(ids.noSide, ago(1), "COMPLETED", 3);
    await fixtureWithList(ids.noSide, ago(1), "selection");
    // Started yesterday, not finished (a two-day game between its days).
    await playhqMatch(ids.unfinished, ago(1), "IN_PROGRESS", 1);
    await lineup(ids.unfinished, side);
    await fixtureWithList(ids.unfinished, ago(1), "selection");
    // An admin's list stays the record, played or not.
    await playhqMatch(ids.adminPast, ago(1), "COMPLETED", 3);
    await scorecard(ids.adminPast, side);
    await fixtureWithList(ids.adminPast, ago(1), "admin");
    // Tomorrow's selection stands before the match, whatever PlayHQ names.
    await playhqMatch(ids.tomorrow, new Date(NOW.getTime() + DAY), "UPCOMING", 0);
    await lineup(ids.tomorrow, side);
    await fixtureWithList(ids.tomorrow, new Date(NOW.getTime() + DAY), "selection");
    // Outside the 7-day window: left alone.
    await playhqMatch(ids.stale, ago(10), "COMPLETED", 3);
    await scorecard(ids.stale, side);
    await fixtureWithList(ids.stale, ago(10), "selection");
  });

  afterAll(async () => {
    await admin.query(`delete from playhq.match_lineups where match_id = any($1::uuid[])`, [
      allIds(),
    ]);
    await admin.query(`delete from playhq.scorecards where match_id = any($1::uuid[])`, [allIds()]);
    await admin.query(`delete from playhq.fixture_changes where match_id = any($1::uuid[])`, [
      allIds(),
    ]);
    await admin.query(`delete from playhq.matches where id = any($1::uuid[])`, [allIds()]);
  });

  it("a failing replacement pass is logged and skipped; the projection still runs", async () => {
    // The played-sides query (the only one reading scorecards) blows up.
    const central = {
      query: (text: string, params?: unknown[]) =>
        text.includes("playhq.scorecards")
          ? Promise.reject(new Error("invalid input syntax for type uuid"))
          : admin.query(text, params),
    } as unknown as typeof admin;
    const lines: string[] = [];
    const [summary] = await projectTeamLists({
      tenantId,
      central,
      now: NOW,
      log: (line) => lines.push(line),
    });
    expect(summary).toMatchObject({ tenantId, replacedSelection: 0 });
    expect(lines.some((l) => /played-selection replacement failed/.test(l))).toBe(true);
    expect((await listOf(ids.played)).source).toBe("selection");
  });

  it("replaces only finished, recent selection lists with PlayHQ's side, as source playhq", async () => {
    const [summary] = await projectTeamLists({ tenantId, central: admin, now: NOW, log: () => {} });
    expect(summary.replacedSelection).toBe(2);

    const played = await listOf(ids.played);
    expect(played).toMatchObject({ source: "playhq", isPublished: true });
    expect(played.players).toEqual([
      { order: 1, playerId: playerIds[0], displayName: "Cam Skipper", role: "C" },
      { order: 2, displayName: "Nina Newcomer" },
    ]);
    const lineupOnly = await listOf(ids.lineupOnly);
    expect(lineupOnly.source).toBe("playhq");
    expect(lineupOnly.players).toEqual([
      { order: 1, playerId: playerIds[1], displayName: "Pat Snapped" },
    ]);

    for (const [id, source] of [
      [ids.noSide, "selection"],
      [ids.unfinished, "selection"],
      [ids.adminPast, "admin"],
      [ids.tomorrow, "selection"],
      [ids.stale, "selection"],
    ] as const) {
      const list = await listOf(id);
      expect({ id, source: list.source, players: list.players }).toEqual({
        id,
        source,
        players: hub,
      });
    }
  });

  it("is idempotent: a second run finds nothing left to replace", async () => {
    const [summary] = await projectTeamLists({ tenantId, central: admin, now: NOW, log: () => {} });
    expect(summary.replacedSelection).toBe(0);
    expect((await listOf(ids.played)).source).toBe("playhq");
  });

  it("runs from a scorecard-only sync (the match-day / day-after plans name no lineups)", async () => {
    // The two-day game finishes; the next run lists it COMPLETED with its scorecard and
    // names no upcoming lineups.
    const at = new Date().toISOString();
    const side = [named(P_PHOTO, "Pat Snapped"), named(P_NEW, "Nina Newcomer")];
    const team = (id: string, org: string, name: string, players?: Named[]) => ({
      id,
      displayName: `${name} F Grade`,
      name: "F Grade",
      owningOrganisation: { id: org, name },
      ...(players ? { players } : {}),
    });
    const match = {
      id: ids.unfinished,
      status: "COMPLETED",
      statusId: 3,
      matchType: "Two Day",
      matchTypeId: 3,
      round: { id: randomUUID(), name: "Round 2", shortName: "R2" },
      grade: { id: GRADE, name: "F Grade" },
      matchSchedule: [{ matchDay: 1, startDateTime: ago(1).toISOString() }],
      venue: { name: "Home Oval", playingSurface: { name: "Home Oval - 1" } },
    };
    const res = await request(app)
      .post("/api/internal/playhq/ingest")
      .set("x-sync-secret", SECRET)
      .send({
        collector: "manual",
        planName: "dayafter",
        dump: {
          version: "2.0.0",
          exportedAt: at,
          origin: "https://play.cricket.com.au",
          records: [
            {
              key: "plan|1",
              kind: "plan",
              id: at,
              meta: {},
              fetchedAt: at,
              data: { orgId: ORG, seasons: "current", kinds: ["matches"], scorecards: "since" },
            },
            {
              key: `matches|${GRADE}`,
              kind: "matches",
              id: GRADE,
              meta: { gradeId: GRADE },
              fetchedAt: at,
              data: {
                matches: [
                  {
                    ...match,
                    teams: [
                      team(TEAM_OURS, ORG, "Lineup Cricket Club"),
                      team(TEAM_THEIRS, OPP, "Rivals Cricket Club"),
                    ],
                  },
                ],
              },
            },
            {
              key: `scorecard|${ids.unfinished}`,
              kind: "scorecard",
              id: ids.unfinished,
              meta: { gradeId: GRADE },
              fetchedAt: at,
              data: {
                ...match,
                teams: [
                  team(TEAM_OURS, ORG, "Lineup Cricket Club", side),
                  team(TEAM_THEIRS, OPP, "Rivals Cricket Club", [named(P_OPP, "Otto Opposition")]),
                ],
                innings: [],
              },
            },
          ],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([]);
    const list = await listOf(ids.unfinished);
    expect(list.source).toBe("playhq");
    expect(list.players).toEqual([
      { order: 1, playerId: playerIds[1], displayName: "Pat Snapped" },
      { order: 2, displayName: "Nina Newcomer" },
    ]);
  });
});
