/**
 * A Grade debut caps from the PlayHQ (central) path: a club with a cap
 * register gets the next number for a new A Grade debutant from the hourly
 * sweep, once; an older uncapped player is never numbered. Real-DB integration
 * test (DATABASE_URL, with CENTRAL_DATABASE_URL on the same CI DB); it writes
 * its own central rows under club ids no other suite uses and removes them.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  availabilitySettingsTable,
  capRegisterTable,
  captionTemplatesTable,
  playerIdMapTable,
  socialSettingsTable,
  socialDraftsTable,
  squadMembersTable,
  tenantsTable,
} from "@workspace/db";
import { invalidateTenantConfigCache } from "./tenant";
import { runDraftSweep } from "./draft-sweep";
import { syncDebutCaps } from "./debut-caps";

const CLUB = 9951;
const OPP = 9952;
const BASE = 9_500_000 + (Date.now() % 50_000) * 10;
const LINE_BASE = BASE * 10;
const STAMP = Date.now();
const NOW = new Date("2026-11-20T10:00:00Z");
const log = { error: () => {}, warn: () => {}, info: () => {} };
const G_CAPPED = "99510000-0000-4000-8000-000000000001";
const G_NEW = "99510000-0000-4000-8000-000000000002";
const G_OLD = "99510000-0000-4000-8000-000000000003";

let tenantId: number;
let lineId = LINE_BASE;

async function aGradeMatch(id: number, date: string, players: Array<[string, number]>) {
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${`caps-${id}`}, '2026/27', 'A Grade', 'grade-a', 'One Day', '4', ${date},
      'Cap Oval', 'Completed', ${CLUB}, ${OPP}, 'Cap CC', 'Rivals CC', '7/210', '10/150', ${CLUB},
      ${CLUB}, 'Cap CC won')
  `);
  for (const [guid, bat] of players) {
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
        participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${lineId++}, ${id}, 1, ${CLUB}, 'Cap CC', ${bat}, ${guid}, 'x', 10, 12, 1, 0, 83.3,
        'bowled', 'bowled', null)
    `);
  }
}

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `caps-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      name: "Cap Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  invalidateTenantConfigCache(tenantId);
  await db.insert(playerIdMapTable).values([
    { tenantId, participantId: G_CAPPED, playerId: 41 },
    { tenantId, participantId: G_NEW, playerId: 42 },
    { tenantId, participantId: G_OLD, playerId: 43 },
  ]);
  for (const [guid, name] of [
    [G_CAPPED, "Casey Capped"],
    [G_NEW, "Nico Newcap"],
    [G_OLD, "Olly Oldgame"],
  ]) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${guid}, ${name}, 0, ${CLUB}, '2018/19', '2026/27', 1)
      on conflict (participant_id) do nothing
    `);
  }
  // The club's register: #7 is Casey (debut 2019). Olly played one A Grade game
  // in 2018, before the register's newest cap, and was never capped.
  await db.insert(capRegisterTable).values({
    tenantId,
    capNumber: 7,
    category: "male",
    name: "Casey Capped",
    playerId: 41,
  });
  await aGradeMatch(BASE + 1, "2018-12-01", [[G_OLD, 9]]);
  await aGradeMatch(BASE + 2, "2019-01-12", [[G_CAPPED, 1]]);
  // Nico debuts this month (within the sweep's recent window).
  await aGradeMatch(BASE + 3, "2026-11-15", [
    [G_CAPPED, 1],
    [G_NEW, 4],
  ]);
});

afterAll(async () => {
  for (const t of ["match_batting", "matches"]) {
    await db.execute(
      sql.raw(`delete from central.${t} where match_id >= ${BASE} and match_id < ${BASE + 10}`),
    );
  }
  await db.execute(
    sql`delete from central.players where participant_id in (${G_CAPPED}, ${G_NEW}, ${G_OLD})`,
  );
  await db.delete(capRegisterTable).where(eq(capRegisterTable.tenantId, tenantId));
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
  // The scheduled sweep fills the empty squad register from the season's games.
  await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, tenantId));
  await db
    .delete(availabilitySettingsTable)
    .where(eq(availabilitySettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

const maleCaps = () =>
  db
    .select()
    .from(capRegisterTable)
    .where(and(eq(capRegisterTable.tenantId, tenantId), eq(capRegisterTable.category, "male")))
    .orderBy(capRegisterTable.capNumber);

describe("debut caps from PlayHQ matches", () => {
  it("the catch-up preview lists the new debutant and the older uncapped player, writing nothing", async () => {
    const { plans, minted } = await syncDebutCaps(tenantId, { since: null, commit: false });
    expect(minted).toBe(0);
    const male = plans.find((p) => p.category === "male")!;
    expect(male.frontier).toBe("2019-01-12");
    expect(male.toMint).toEqual([
      expect.objectContaining({ capNumber: 8, playerId: 42, name: "Nico Newcap", games: 1 }),
    ]);
    expect(male.olderUncapped.map((d) => d.playerId)).toEqual([43]);
    // No female register: nothing for that category.
    expect(plans.find((p) => p.category === "female")!.held).toMatch(/no cap register/);
    expect(await maleCaps()).toHaveLength(1);
  });

  it("the hourly sweep issues the next cap once", async () => {
    const first = await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);
    expect(first.debutCaps).toBe(1);
    const again = await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);
    expect(again.debutCaps).toBe(0);
    expect((await maleCaps()).map((c) => [c.capNumber, c.playerId, c.name, c.autoCreated])).toEqual(
      [
        [7, 41, "Casey Capped", false],
        [8, 42, "Nico Newcap", true],
      ],
    );
  });
});
