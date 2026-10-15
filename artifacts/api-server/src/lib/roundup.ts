import {
  db,
  playerGradeSeasonStatsTable,
  playersTable,
  milestoneEventsTable,
  importsTable,
  premiershipsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { eq, and, inArray, lt, sql } from "drizzle-orm";
import { BOARD_STAT_LABEL, type BoardKey } from "./milestone-detector";
import { tenantIsCentral } from "./tenant";
import {
  loadCentralGradeSeason,
  loadCentralRecapMilestones,
  type MilestoneCardRow,
} from "./roundup-central";
import { upsertDraftByKey } from "./draft-upsert";
import { premiershipSeasons } from "../routes/premierships";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";

// Fill-ins (playerId >= FILL_IN_THRESHOLD) are excluded from every stats derivation.

type SocialDraft = SocialDraftRow;

/**
 * `playerId` is the app player id, or null for a central participant with no
 * `player_id_map` row (the card is still drafted, just without a player link).
 */
export type PerformerRow = {
  playerId: number | null;
  runs: number;
  wickets: number;
  dismissals: number;
  surname: string;
  givenName: string;
};

export type InningsRow = {
  playerId: number | null;
  surname: string;
  givenName: string;
  highScore: string | null;
  bestBowling: string | null;
};

const queryPerformers = async (
  grade: string,
  seasonFilter: { season: number } | "all",
): Promise<PerformerRow[]> => {
  const fillInFloor = lt(playerGradeSeasonStatsTable.playerId, FILL_IN_THRESHOLD);
  const where =
    seasonFilter === "all"
      ? and(eq(playerGradeSeasonStatsTable.grade, grade), fillInFloor)
      : and(
          eq(playerGradeSeasonStatsTable.grade, grade),
          eq(playerGradeSeasonStatsTable.season, seasonFilter.season),
          fillInFloor,
        );
  const rows = await db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      runs: sql<number>`coalesce(sum(${playerGradeSeasonStatsTable.runs}), 0)`,
      wickets: sql<number>`coalesce(sum(${playerGradeSeasonStatsTable.wickets}), 0)`,
      dismissals: sql<number>`coalesce(sum(${playerGradeSeasonStatsTable.catches} + ${playerGradeSeasonStatsTable.stumpings}), 0)`,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
    })
    .from(playerGradeSeasonStatsTable)
    .innerJoin(playersTable, eq(playerGradeSeasonStatsTable.playerId, playersTable.id))
    .where(where)
    .groupBy(playerGradeSeasonStatsTable.playerId, playersTable.surname, playersTable.givenName);
  return rows.map((r) => ({
    playerId: r.playerId,
    runs: Number(r.runs),
    wickets: Number(r.wickets),
    dismissals: Number(r.dismissals),
    surname: r.surname,
    givenName: r.givenName,
  }));
};

const fullName = (s: { givenName: string; surname: string }) =>
  `${s.givenName} ${s.surname}`.trim();

/** A player card's link; an unmapped central player links to the players list. */
export const playerPath = (playerId: number | null): string =>
  playerId == null ? "/players" : `/players/${playerId}`;

const seasonLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

type GradeLeaderCard = {
  kind: "gradeLeader";
  grade: string;
  category: string;
  playerName: string;
  value: string | number;
  headline: string;
};

const gradeLeaderCard = (
  grade: string,
  category: string,
  performer: { givenName: string; surname: string },
  value: string | number,
  headline: string,
): GradeLeaderCard => ({
  kind: "gradeLeader",
  grade,
  category,
  playerName: fullName(performer),
  value,
  headline,
});

/** What makes one card distinct within a round-up or recap (its key suffix). */
function cardIdentity(cardInput: Record<string, unknown>): string {
  if (cardInput.kind === "gradeLeader") return String(cardInput.category ?? "");
  if (cardInput.kind === "milestone")
    return `milestone:${String(cardInput.playerName ?? "")}:${String(cardInput.tierLabel ?? "")}`;
  return String(cardInput.kind ?? "card");
}

// Keyed draft upsert — cardInput is an opaque ShareCardInput JSON blob. A
// re-import of the same round refreshes the same card instead of adding one.
const insertCard = async (
  keyBase: string,
  tenantId: number,
  engine: "roundup" | "recap",
  cardInput: Record<string, unknown>,
  appPath: string,
  sourceImportId: number | null,
): Promise<SocialDraft> => {
  const { draft } = await upsertDraftByKey({
    tenantId,
    engine,
    family: "roundup",
    sourceKey: `${keyBase}:${cardIdentity(cardInput)}`,
    cardInput,
    appPath,
    sourceImportId,
  });
  return draft;
};

/** Latest round played in a (grade, season) — the round a round-up belongs to. */
const topBatting = (rows: PerformerRow[]) => [...rows].sort((a, b) => b.runs - a.runs)[0];
const topBowling = (rows: PerformerRow[]) => [...rows].sort((a, b) => b.wickets - a.wickets)[0];
const topKeeping = (rows: PerformerRow[]) =>
  [...rows].sort((a, b) => b.dismissals - a.dismissals)[0];

/**
 * A (grade, season)'s season figures from either read path. The grade-leader
 * round-up that once drafted from these is retired (plan 2026-10-15-001 R5);
 * the season recap still reads `performers`.
 */
export type RoundUpData = {
  performers: PerformerRow[];
  innings: InningsRow[];
  latestRound: number | null;
};

// Native milestones unlocked in a (grade, season): milestone_events don't carry
// a grade directly, so we join through the import that produced them.
async function loadNativeRecapMilestones(
  tenantId: number,
  grade: string,
  season: number,
): Promise<MilestoneCardRow[]> {
  const rows = await db
    .select({
      playerId: milestoneEventsTable.playerId,
      boardKey: milestoneEventsTable.boardKey,
      tierIndex: milestoneEventsTable.tierIndex,
      tierLabel: milestoneEventsTable.tierLabel,
      value: milestoneEventsTable.value,
      threshold: milestoneEventsTable.threshold,
      payload: milestoneEventsTable.payload,
    })
    .from(milestoneEventsTable)
    .innerJoin(importsTable, eq(milestoneEventsTable.sourceImportId, importsTable.id))
    .where(
      and(
        eq(milestoneEventsTable.tenantId, tenantId),
        eq(importsTable.grade, grade),
        eq(importsTable.season, season),
      ),
    );

  if (rows.length === 0) return [];

  // Names may be embedded in payload; fall back to a players lookup otherwise.
  const missing = rows.filter((r) => !(r.payload as { name?: string } | null)?.name);
  const nameById = new Map<number, string>();
  if (missing.length > 0) {
    const ids = Array.from(new Set(missing.map((r) => r.playerId)));
    const players = await db
      .select({
        id: playersTable.id,
        surname: playersTable.surname,
        givenName: playersTable.givenName,
      })
      .from(playersTable)
      .where(sql`${playersTable.id} = ANY(${ids})`);
    for (const p of players) nameById.set(p.id, fullName(p));
  }

  return rows.map((r) => ({
    playerId: r.playerId,
    playerName:
      (r.payload as { name?: string } | null)?.name ?? nameById.get(r.playerId) ?? "Unknown",
    tierLabel: r.tierLabel,
    tierIndex: r.tierIndex,
    milestoneLabel: BOARD_STAT_LABEL[r.boardKey as BoardKey] ?? r.boardKey,
    value: r.value,
    threshold: r.threshold,
  }));
}

// Milestones unlocked in a (grade, season), from whichever read path the club
// uses. One card per (player, tier), keyed identically on both paths.
async function generateMilestoneRecapCards(
  tenantId: number,
  grade: string,
  season: number,
  headline: string,
  central: boolean,
): Promise<SocialDraft[]> {
  const keyBase = `recap:${season}:${grade}`;
  const rows = central
    ? await loadCentralRecapMilestones(tenantId, grade, season)
    : await loadNativeRecapMilestones(tenantId, grade, season);

  const created: SocialDraft[] = [];
  for (const r of rows) {
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "recap",
        {
          kind: "milestone",
          playerName: r.playerName,
          tierLabel: r.tierLabel,
          tierIndex: r.tierIndex,
          milestoneLabel: r.milestoneLabel,
          currentValue: r.value,
          threshold: r.threshold,
          headline,
        },
        playerPath(r.playerId),
        null,
      ),
    );
  }
  return created;
}

// A premiership card, if the club won this grade in this season. `year` is the
// calendar year of the win, so map it to its season start year the same way the
// honour boards do (premiershipSeasons) rather than comparing it to `season`.
// The premierships table is tenant-scoped curated content (a central club's is
// seeded from central.premiers), so it reads the same way for every club.
async function generatePremiershipRecapCards(
  tenantId: number,
  grade: string,
  season: number,
  headline: string,
): Promise<SocialDraft[]> {
  const keyBase = `recap:${season}:${grade}`;
  const prems = await db
    .select()
    .from(premiershipsTable)
    .where(
      and(
        eq(premiershipsTable.tenantId, tenantId),
        eq(premiershipsTable.grade, grade),
        inArray(premiershipsTable.year, [season, season + 1]),
      ),
    );
  const created: SocialDraft[] = [];
  for (const p of prems.filter((p) => premiershipSeasons(p.year, p.matchDate)[0] === season)) {
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "recap",
        {
          kind: "premiership",
          grade,
          year: season,
          competition: p.competition,
          result: p.result,
          mom: p.mom,
          headline,
        },
        "/premierships",
        null,
      ),
    );
  }
  return created;
}

// Season recap: a multi-card highlight of a (grade, season) — champion batsman &
// bowler, milestones unlocked that season, and a premiership card if won.
export async function generateRecapDrafts(
  tenantId: number,
  grade: string,
  season: number,
): Promise<SocialDraft[]> {
  const central = await tenantIsCentral(tenantId);
  const stats = central
    ? (await loadCentralGradeSeason(tenantId, grade, season)).performers
    : await queryPerformers(grade, { season });
  const created: SocialDraft[] = [];
  const headline = `${grade} ${seasonLabel(season)} Season Recap`;
  const keyBase = `recap:${season}:${grade}`;

  const topRuns = topBatting(stats);
  const topWkts = topBowling(stats);
  const topKeeper = topKeeping(stats);

  if (topRuns && topRuns.runs > 0)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "recap",
        gradeLeaderCard(grade, "Champion Batsman", topRuns, topRuns.runs, headline),
        playerPath(topRuns.playerId),
        null,
      ),
    );
  if (topWkts && topWkts.wickets > 0)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "recap",
        gradeLeaderCard(grade, "Champion Bowler", topWkts, topWkts.wickets, headline),
        playerPath(topWkts.playerId),
        null,
      ),
    );
  if (topKeeper && topKeeper.dismissals > 0)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "recap",
        gradeLeaderCard(grade, "Most Dismissals", topKeeper, topKeeper.dismissals, headline),
        playerPath(topKeeper.playerId),
        null,
      ),
    );

  created.push(...(await generateMilestoneRecapCards(tenantId, grade, season, headline, central)));
  created.push(...(await generatePremiershipRecapCards(tenantId, grade, season, headline)));

  return created;
}
