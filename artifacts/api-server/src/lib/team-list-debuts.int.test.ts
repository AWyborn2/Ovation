/**
 * Automatic DEBUT badges on team lists: from the PlayHQ (central) match
 * records, a register-linked player with no senior game for the club before
 * the fixture is debuting; anyone the records place in an earlier senior game
 * is not; an unmapped player and a native club get nothing automatic. Real-DB
 * integration test (DATABASE_URL, with CENTRAL_DATABASE_URL on the same CI
 * DB); it writes its own central rows under club ids no other suite uses and
 * removes them.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, playerIdMapTable, tenantsTable } from "@workspace/db";
import { invalidateTenantConfigCache } from "./tenant";
import { autoDebutPlayerIds, isDebut } from "./team-list-debuts";

const CLUB = 9961;
const OPP = 9962;
const BASE = 9_600_000 + (Date.now() % 50_000) * 10;
const LINE_BASE = BASE * 10;
const STAMP = Date.now();
const G_VET = "99610000-0000-4000-8000-000000000001";
const G_JUNIOR = "99610000-0000-4000-8000-000000000002";
const G_FRESH = "99610000-0000-4000-8000-000000000003";
const G_LATER = "99610000-0000-4000-8000-000000000004";
const FIXTURE_AT = new Date("2026-11-21T02:00:00Z");

let tenantId: number;
let nativeTenantId: number;
let lineId = LINE_BASE;

async function match(id: number, grade: string, date: string, guids: string[]) {
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${`debut-${id}`}, '2026/27', ${grade}, ${`g-${id}`}, 'One Day', '3', ${date},
      'Debut Oval', 'Completed', ${CLUB}, ${OPP}, 'Debut CC', 'Rivals CC', '7/210', '10/150', ${CLUB},
      ${CLUB}, 'Debut CC won')
  `);
  for (const guid of guids) {
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
        participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${lineId++}, ${id}, 1, ${CLUB}, 'Debut CC', 3, ${guid}, 'x', 10, 12, 1, 0, 83.3,
        'bowled', 'bowled', null)
    `);
  }
}

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `debuts-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      name: "Debut Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const [n] = await db
    .insert(tenantsTable)
    .values({
      slug: `debuts-native-${STAMP}`,
      centralClubId: CLUB + 2,
      readsFromCentral: false,
      name: "Native Club",
      plan: "pro",
    })
    .returning();
  nativeTenantId = n.id;
  invalidateTenantConfigCache(tenantId);
  await db.insert(playerIdMapTable).values([
    { tenantId, participantId: G_VET, playerId: 51 },
    { tenantId, participantId: G_JUNIOR, playerId: 52 },
    { tenantId, participantId: G_FRESH, playerId: 53 },
    { tenantId, participantId: G_LATER, playerId: 54 },
  ]);
  await match(BASE + 1, "A Grade", "2025-12-06", [G_VET]);
  // Junior games never count: still a senior debutant.
  await match(BASE + 2, "Under 17", "2025-12-07", [G_JUNIOR]);
  // A senior game after the fixture doesn't make this one not a debut.
  await match(BASE + 3, "B Grade", "2026-12-05", [G_LATER]);
});

afterAll(async () => {
  for (const t of ["match_batting", "matches"]) {
    await db.execute(
      sql.raw(`delete from central.${t} where match_id >= ${BASE} and match_id < ${BASE + 10}`),
    );
  }
  await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, nativeTenantId));
});

describe("automatic team-list debuts", () => {
  it("marks players with no earlier senior game for the club, never an unmapped or fill-in id", async () => {
    const ids = await autoDebutPlayerIds(tenantId, [51, 52, 53, 54, 77, 90001, null], FIXTURE_AT);
    expect(ids.sort()).toEqual([52, 53, 54]);
  });

  it("a native club gets nothing automatic (its records can have gaps)", async () => {
    expect(await autoDebutPlayerIds(nativeTenantId, [51, 52], FIXTURE_AT)).toEqual([]);
  });

  it("an admin's override wins over the automatic call", () => {
    const auto = new Set([52]);
    expect(isDebut({ order: 1, playerId: 52, displayName: "A" }, auto)).toBe(true);
    expect(isDebut({ order: 1, playerId: 52, displayName: "A", debut: false }, auto)).toBe(false);
    expect(isDebut({ order: 1, playerId: 51, displayName: "B", debut: true }, auto)).toBe(true);
    expect(isDebut({ order: 1, displayName: "Free Typed" }, auto)).toBe(false);
  });
});
