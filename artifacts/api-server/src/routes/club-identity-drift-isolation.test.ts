import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  awardWinnersTable,
  awardsTable,
  clubCorrectionsTable,
  lifeMembersTable,
  playerCurationTable,
  playerIdMapTable,
  tenantsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

/**
 * Identity drift admin endpoint (hybrid stats plan U17; R9, R10, R16).
 *
 * Tenant A reads central club 9871, tenant B reads 9873, tenant C reads 9874
 * (a club central has nothing for). Central:
 *
 *   M1  A v OPP — Ann bats for A.
 *   M3  B v OPP — Bob bats for B.
 *
 * Tenant A's layer names five players: Ann (present), GONE (a GUID central no
 * longer has at all — with an award, a life membership and a correction
 * hanging off it), DUPE (merged into Ann, also gone), Bob (in central, but
 * never for club A) and a pre-digital `club:<uuid>` player.
 *
 * Covers: a missing keeper GUID is listed with its dependent rows; a missing
 * merged-away GUID is listed; a GUID that only appears for ANOTHER club is
 * drift for this one; synthetic keys are never listed; nothing is listed once
 * every GUID is back; a club central has nothing for lists nothing; only the
 * club's own admin can read it, and tenant B's admin never sees tenant A's
 * drift.
 *
 * Real-DB integration (CI's API job: DATABASE_URL and CENTRAL_DATABASE_URL are
 * the same throwaway Postgres, migrations applied). The central rows are
 * written through the TENANT `db` with raw SQL, only when the database is
 * local — the app itself never writes central.
 */

const isLocalDb = (() => {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    const centralHost = new URL(process.env.CENTRAL_DATABASE_URL ?? "").hostname;
    const local = ["localhost", "127.0.0.1", "::1", "postgres"];
    return local.includes(host) && local.includes(centralHost);
  } catch {
    return false;
  }
})();

const STAMP = Date.now();
const PASSWORD = "correct horse battery";
const CLUB_A = 9871;
const OPP = 9872;
const CLUB_B = 9873;
const CLUB_C = 9874;
const M1 = 987_101;
const M3 = 987_103;
const LINE_BASE = 9_871_000;
const ANN = "98710000-0000-4000-8000-00000000000a";
const GONE = "98710000-0000-4000-8000-00000000000d";
const DUPE = "98710000-0000-4000-8000-00000000000e";
const BOB = "98710000-0000-4000-8000-00000000000b";
const SYNTHETIC = "club:98710000-0000-4000-8000-0000000000ff";

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB_A, "Drift CC"],
    [OPP, "Drift Opp CC"],
    [CLUB_B, "Drift Other CC"],
    [CLUB_C, "Drift Empty CC"],
  ] as const) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`C${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name, club] of [
    [ANN, "Ann Able", CLUB_A],
    [BOB, "Bob Other", CLUB_B],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, 0, ${club}, '2024/25', '2024/25', 1)
    `);
  }
  for (const [m, home] of [
    [M1, CLUB_A],
    [M3, CLUB_B],
  ] as const) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`identity-drift-${m}`}, '2024/25', 'A Grade', 'g', 'One Day', '4', '2024-11-02', 'Drift Oval',
        'Completed', ${home}, ${OPP}, 'Home', 'Opp', '5/150', '10/120', ${home}, ${home}, 'won')
    `);
  }
  await bat(M1, CLUB_A, ANN);
  await bat(M3, CLUB_B, BOB);
}

let lineId = LINE_BASE;
const bat = (m: number, club: number, guid: string) =>
  db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
      runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${m}, 1, ${club}, 'x', 1, ${guid}, 'x', 10, 10, 0, 0, 100, 'b Bowler', 'bowled', null)
  `);
const roster = (m: number, club: number, guid: string) =>
  db.execute(sql`
    insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
    values (${lineId++}, ${m}, ${club}, 'x', ${guid}, 'x')
  `);

async function cleanCentral(): Promise<void> {
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.matches where match_id in (${M1}, ${M3})`);
  await db.execute(
    sql`delete from central.players where participant_id in (${ANN}, ${BOB}, ${GONE}, ${DUPE})`,
  );
  await db.execute(
    sql`delete from central.clubs where club_id in (${CLUB_A}, ${OPP}, ${CLUB_B}, ${CLUB_C})`,
  );
}

type Item = {
  participantId: string;
  kind: string;
  playerId: number | null;
  displayName: string | null;
  stillInCentral: boolean;
  mergedIntoParticipantId: string | null;
  mergedIntoDisplayName: string | null;
  mergeStatus: string | null;
  mergedFrom: string[];
  curatedRows: { table: string; rowId: number; label: string }[];
  corrections: { id: number; playhqMatchId: string; field: string }[];
};

describe.skipIf(!isLocalDb)("club identity drift admin (tenant-scoped)", () => {
  let a: number;
  let b: number;
  let c: number;
  let cookieA: string;
  let cookieB: string;
  let cookieC: string;

  const drift = (tenantId: number, cookie?: string) => {
    const r = request(app).get("/api/club-identity-drift").set("x-tenant-id", String(tenantId));
    return cookie ? r.set("Cookie", cookie) : r;
  };
  const itemsOf = async (tenantId: number, cookie: string) =>
    (await drift(tenantId, cookie).expect(200)).body as Item[];

  async function makeTenant(label: string, club: number): Promise<number> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `identity-drift-${label}-${STAMP}`,
        centralClubId: club,
        name: `Identity Drift ${label}`,
        readsFromCentral: true,
      })
      .returning();
    return row.id;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-identity-drift";
    await cleanCentral();
    await seedCentral();
    a = await makeTenant("a", CLUB_A);
    b = await makeTenant("b", CLUB_B);
    c = await makeTenant("c", CLUB_C);
    await db.insert(playerIdMapTable).values([
      { tenantId: a, participantId: ANN, playerId: 701 },
      { tenantId: a, participantId: GONE, playerId: 702 },
      { tenantId: a, participantId: DUPE, playerId: 703 },
      { tenantId: a, participantId: SYNTHETIC, playerId: 704 },
      { tenantId: a, participantId: BOB, playerId: 705 },
      // Tenant B reuses the same ints for ITS players: ids are per-tenant.
      { tenantId: b, participantId: BOB, playerId: 702 },
      { tenantId: c, participantId: GONE, playerId: 702 },
    ]);
    await db.insert(playerCurationTable).values({
      tenantId: a,
      participantId: DUPE,
      mergedIntoParticipantId: ANN,
      mergeStatus: "confirmed",
    });
    for (const tenantId of [a, b]) {
      const [award] = await db
        .insert(awardsTable)
        .values({ tenantId, key: `drift-champion-${STAMP}`, title: "Club Champion" })
        .returning();
      await db
        .insert(awardWinnersTable)
        .values({ tenantId, awardId: award.id, season: 2019, playerId: 702, name: "Gary Gone" });
      await db
        .insert(lifeMembersTable)
        .values({ tenantId, name: "Gary Gone", inductionYear: 2020, playerId: 702 });
    }
    await db.insert(clubCorrectionsTable).values({
      tenantId: a,
      playhqMatchId: `identity-drift-${M1}`,
      participantId: GONE,
      field: "runs",
      previousValue: 40,
      newValue: 55,
      createdBy: "admin:owner-a",
    });
    const passwordHash = await hashPassword(PASSWORD);
    const cookieFor = async (tenantId: number, username: string) => {
      const [admin] = await db
        .insert(adminsTable)
        .values({ tenantId, username, displayName: username, passwordHash })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    };
    cookieA = await cookieFor(a, "drift-owner-a");
    cookieB = await cookieFor(b, "drift-owner-b");
    cookieC = await cookieFor(c, "drift-owner-c");
  });

  afterAll(async () => {
    await purgeTestTenants([a, b, c]);
    await cleanCentral();
  });

  it("refuses anyone who isn't the club's own admin", async () => {
    await drift(a).expect(401);
    await drift(a, cookieB).expect(401);
    await drift(b, cookieA).expect(401);
  });

  it("lists a missing keeper GUID with the curated rows and corrections that depend on it", async () => {
    const items = await itemsOf(a, cookieA);
    // Most-depended-on first; Ann (present) and the synthetic player are never listed.
    expect(items.map((i) => i.participantId)).toEqual([GONE, DUPE, BOB]);
    const gone = items[0]!;
    expect(gone).toMatchObject({
      kind: "keeper",
      playerId: 702,
      // Gone from central entirely: the name comes from the club's own rows.
      displayName: "Gary Gone",
      stillInCentral: false,
      mergedIntoParticipantId: null,
      mergeStatus: null,
      mergedFrom: [],
    });
    expect(gone.curatedRows.map((r) => [r.table, r.label]).sort()).toEqual([
      ["award_winners", "Club Champion (2019)"],
      ["life_members", "Gary Gone (2020)"],
    ]);
    expect(gone.corrections).toEqual([
      { id: expect.any(Number), playhqMatchId: `identity-drift-${M1}`, field: "runs" },
    ]);
  });

  it("lists a merge whose merged-away GUID has disappeared", async () => {
    const dupe = (await itemsOf(a, cookieA)).find((i) => i.participantId === DUPE)!;
    expect(dupe).toMatchObject({
      kind: "merged_away",
      playerId: 703,
      stillInCentral: false,
      mergedIntoParticipantId: ANN,
      mergedIntoDisplayName: "Ann Able",
      mergeStatus: "confirmed",
      curatedRows: [],
      corrections: [],
    });
  });

  it("treats a GUID that only ever appears for another club as drift for this one", async () => {
    const bob = (await itemsOf(a, cookieA)).find((i) => i.participantId === BOB)!;
    expect(bob).toMatchObject({
      kind: "keeper",
      playerId: 705,
      displayName: "Bob Other",
      stillInCentral: true,
    });
  });

  it("a tenant-2 admin can't see tenant-1 drift", async () => {
    // B's own crosswalk is intact (Bob plays for club B) — and it shares
    // player id 702 and the same curated rows as A's drifted player.
    expect(await itemsOf(b, cookieB)).toEqual([]);
    // Asking for A's drift with B's session is refused, not answered with B's.
    const res = await drift(a, cookieB).expect(401);
    expect(JSON.stringify(res.body)).not.toContain(GONE);
  });

  it("lists nothing for a club the association has no players for at all", async () => {
    expect(await itemsOf(c, cookieC)).toEqual([]);
  });

  it("lists nothing once every GUID has a line for the club again", async () => {
    await roster(M1, CLUB_A, GONE);
    await roster(M1, CLUB_A, DUPE);
    await roster(M1, CLUB_A, BOB);
    expect(await itemsOf(a, cookieA)).toEqual([]);
  });

  it("never writes: the club's stored links are untouched", async () => {
    const rows = await db.execute(
      sql`select count(*)::int as n from player_id_map where tenant_id = ${a}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(5);
  });
});
