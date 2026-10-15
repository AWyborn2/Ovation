/**
 * Ash's setup (plan 2026-10-07-001 AE1), end to end through the scheduled
 * sweep: a central club picks the "Round carousels + individual highlights"
 * style once, a round is ingested, and the sweep drafts one club-wide carousel
 * each for results, club leaderboards and ladders, plus its own card for each
 * milestone and each A Grade debut. No per-match result cards, no B Grade
 * debut card.
 *
 * Real-DB integration test (needs DATABASE_URL, and CENTRAL_DATABASE_URL
 * pointing at the same CI DB). It writes its own `central.*` and `playhq.*`
 * rows under ids no other suite uses, and removes them afterwards.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { findPostingStyle, planFromStyle } from "@workspace/scorecard/posting-plan";
import {
  db,
  tenantsTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
  squadMembersTable,
  availabilitySettingsTable,
} from "@workspace/db";
import { invalidateTenantConfigCache } from "./tenant";
import { postingPlanWrite } from "./posting-plan";
import { runDraftSweep } from "./draft-sweep";
import { draftKeys } from "./draft-upsert";
import { centralPlayerKey } from "./central-achievements";

const SQL_DIR = path.resolve(__dirname, "../../../../scripts/sql");
const CLUB = 9951;
const OPP = 9952;
const BASE = 9_500_000 + (Date.now() % 50_000) * 10;
const LINE_BASE = BASE * 10;
const STAMP = Date.now();
// Sunday 22 Nov 2026, 8pm Perth: just after the default weekend-wrap time (Sunday 7pm).
const NOW = new Date("2026-11-22T12:00:00Z");
const ROUND_DATE = "2026-11-21";
const log = { error: () => {}, warn: () => {}, info: () => {} };

const ORG = randomUUID();
const RIVAL_ORG = randomUUID();
const GRADE_A = randomUUID();
const GRADE_B = randomUUID();
const PHQ_A = randomUUID();
const PHQ_B = randomUUID();

// Three players: one crossing 1,000 career runs, an A Grade debutant, a B Grade debutant.
const STAR = "99510000-0000-4000-8000-000000000001";
const A_DEBUT = "99510000-0000-4000-8000-000000000002";
const B_DEBUT = "99510000-0000-4000-8000-000000000003";

let tenantId: number;
let lineId = LINE_BASE;

async function centralMatch(
  id: number,
  o: { grade: string; date: string; season: string; round: string; playhqId: string },
) {
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${o.playhqId}, ${o.season}, ${o.grade}, 'grade-ae1', 'One Day', ${o.round},
      ${o.date}, 'Plan Oval', 'Completed', ${CLUB}, ${OPP}, 'Plan CC', 'Rivals CC',
      '7/210', '10/150', ${CLUB}, ${CLUB}, 'Plan CC won')
  `);
}

async function batting(matchId: number, participantId: string, name: string, runs: number) {
  await db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${matchId}, 1, ${CLUB}, 'Plan CC', 1, ${participantId}, ${name},
      ${runs}, ${runs + 10}, 5, 1, 90.0, 'not out', 'notout', null)
  `);
}

async function bowling(matchId: number, participantId: string, name: string) {
  await db.execute(sql`
    insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id,
      player_name, overs, maidens, runs, wickets, economy, wides, no_balls)
    values (${lineId++}, ${matchId}, 2, ${CLUB}, 'Plan CC', ${participantId}, ${name}, 8, 1, 30, 3, 3.75, 0, 0)
  `);
}

async function playhqMatch(id: string, gradeId: string, gradeName: string) {
  await db.execute(sql`
    insert into playhq.grades (id, name, season_name, is_junior)
    values (${gradeId}::uuid, ${gradeName}, '2026/27', false)
  `);
  await db.execute(sql`
    insert into playhq.matches (id, grade_id, status, raw, fetched_at)
    values (${id}::uuid, ${gradeId}::uuid, 'COMPLETED', '{}'::jsonb, now())
  `);
  for (const [team, org, rank] of [
    ["Plan CC", ORG, 1],
    ["Rivals CC", RIVAL_ORG, 2],
  ] as const) {
    await db.execute(sql`
      insert into playhq.ladders (grade_id, ladder_name, team_id, team_name, org_id, rank, played,
        competition_points, won, lost, fetched_at)
      values (${gradeId}::uuid, 'Ladder', ${randomUUID()}::uuid, ${team}, ${org}::uuid, ${rank}, 1,
        ${rank === 1 ? 6 : 0}, ${rank === 1 ? 1 : 0}, ${rank === 1 ? 0 : 1}, now())
    `);
  }
}

beforeAll(async () => {
  // The playhq landing schema lives beside central (idempotent).
  await db.$client.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `ae1-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      playhqOrgId: ORG,
      name: "Plan Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  invalidateTenantConfigCache(tenantId);

  // The one style pick, saved as the Posting Plan page saves it.
  const [row] = await db.insert(socialSettingsTable).values({ tenantId }).returning();
  // The round-carousels style, plus the two carousels that are off by default (R13).
  const plan = planFromStyle(findPostingStyle("round-carousels", true)!);
  plan.rows.clubLeaderboards.enabled = true;
  plan.rows.ladders.enabled = true;
  const written = postingPlanWrite(row, plan, true);
  if ("error" in written) throw new Error(written.error);
  await db
    .update(socialSettingsTable)
    .set(written.columns)
    .where(eq(socialSettingsTable.tenantId, tenantId));

  // History: the star's earlier seasons (950 runs), long before the sweep window.
  await centralMatch(BASE + 1, {
    grade: "A Grade",
    date: "2019-01-12",
    season: "2018/19",
    round: "9",
    playhqId: randomUUID(),
  });
  await batting(BASE + 1, STAR, "Sam Star", 950);

  // This round: A Grade and B Grade on Saturday.
  await centralMatch(BASE + 2, {
    grade: "A Grade",
    date: ROUND_DATE,
    season: "2026/27",
    round: "4",
    playhqId: PHQ_A,
  });
  await batting(BASE + 2, STAR, "Sam Star", 60);
  await batting(BASE + 2, A_DEBUT, "Alex Newcap", 40);
  await bowling(BASE + 2, A_DEBUT, "Alex Newcap");
  await centralMatch(BASE + 3, {
    grade: "B Grade",
    date: ROUND_DATE,
    season: "2026/27",
    round: "4",
    playhqId: PHQ_B,
  });
  await batting(BASE + 3, B_DEBUT, "Billie Firstgame", 35);

  // PlayHQ's published ladders for both grades, caught up with this round.
  await playhqMatch(PHQ_A, GRADE_A, "A Grade");
  await playhqMatch(PHQ_B, GRADE_B, "B Grade");
});

afterAll(async () => {
  for (const t of ["match_batting", "match_bowling", "matches"]) {
    await db.execute(
      sql`delete from ${sql.raw(`central.${t}`)} where match_id >= ${BASE} and match_id < ${BASE + 10}`,
    );
  }
  await db.execute(
    sql`delete from playhq.ladders where grade_id in (${GRADE_A}::uuid, ${GRADE_B}::uuid)`,
  );
  await db.execute(sql`delete from playhq.matches where id in (${PHQ_A}::uuid, ${PHQ_B}::uuid)`);
  await db.execute(sql`delete from playhq.grades where id in (${GRADE_A}::uuid, ${GRADE_B}::uuid)`);
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, tenantId));
  await db
    .delete(availabilitySettingsTable)
    .where(eq(availabilitySettingsTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

describe("Ash's setup (AE1): one style pick, one sweep", () => {
  it("drafts a carousel each for results, leaderboards and ladders, and its own card per milestone and A Grade debut", async () => {
    await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);

    const drafts = await db
      .select()
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, tenantId));
    const keys = drafts.map((d) => d.sourceKey).sort();

    // One club-wide carousel per round-carousel kind.
    expect(keys).toContain("weekendwrap-round:2026:4");
    expect(keys).toContain("clubleaderboard-round:2026:4");
    expect(keys).toContain("ladder-round:2026:4");
    const ladder = drafts.find((d) => d.sourceKey === "ladder-round:2026:4")!;
    const ladderSlides = (ladder.cardInput as { carousel: { gradeLabel: string }[] }).carousel;
    expect(ladderSlides.map((s) => s.gradeLabel)).toEqual(["A GRADE", "B GRADE"]);

    // Results post only as the round carousel: no per-match result cards.
    expect(keys.filter((k) => k?.startsWith("matchSummary:"))).toEqual([]);

    // Individual highlights: the milestone and the A Grade debut, one card each.
    const highlights = drafts
      .filter((d) => d.engine === "milestone")
      .map((d) => d.sourceKey)
      .sort();
    expect(highlights).toEqual(
      [
        draftKeys.careerMilestone(centralPlayerKey(STAR), "runs", 0),
        draftKeys.debut(centralPlayerKey(A_DEBUT), "A Grade"),
      ].sort(),
    );

    // Nothing else: no grade-leader round-ups (off in this style), no B Grade debut.
    expect(drafts).toHaveLength(5);
  });
});
