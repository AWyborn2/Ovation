import {
  db,
  playerGradeSeasonStatsTable,
  playersTable,
  milestoneEventsTable,
  importsTable,
  premiershipsTable,
  matchesTable,
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

// Per-row high score / best bowling for a (grade, season) — kept as raw strings
// so the card can show "87*" or "5/22" verbatim rather than a re-summed number.
const queryInningsRows = async (grade: string, season: number): Promise<InningsRow[]> =>
  db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
      highScore: playerGradeSeasonStatsTable.highScore,
      bestBowling: playerGradeSeasonStatsTable.bestBowling,
    })
    .from(playerGradeSeasonStatsTable)
    .innerJoin(playersTable, eq(playerGradeSeasonStatsTable.playerId, playersTable.id))
    .where(
      and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        eq(playerGradeSeasonStatsTable.season, season),
        lt(playerGradeSeasonStatsTable.playerId, FILL_IN_THRESHOLD),
      ),
    );

const fullName = (s: { givenName: string; surname: string }) =>
  `${s.givenName} ${s.surname}`.trim();

/** A player card's link; an unmapped central player links to the players list. */
export const playerPath = (playerId: number | null): string =>
  playerId == null ? "/players" : `/players/${playerId}`;

const seasonLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

// Leading numeric part of a score, e.g. "87*" -> 87, "112 (retired)" -> 112.
const parseHighScore = (hs: string | null): number | null => {
  if (!hs) return null;
  const m = hs.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

// "5/22" -> { wkts: 5, runs: 22 }. Best = most wickets, then fewest runs.
const parseBowling = (bb: string | null): { wkts: number; runs: number } | null => {
  if (!bb) return null;
  const m = bb.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { wkts: Number(m[1]), runs: Number(m[2]) };
};

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
async function latestRound(grade: string, season: number): Promise<number | null> {
  const [row] = await db
    .select({ round: sql<number | null>`max(${matchesTable.round})` })
    .from(matchesTable)
    .where(and(eq(matchesTable.grade, grade), eq(matchesTable.season, season)));
  return row?.round == null ? null : Number(row.round);
}

const topBatting = (rows: PerformerRow[]) => [...rows].sort((a, b) => b.runs - a.runs)[0];
const topBowling = (rows: PerformerRow[]) => [...rows].sort((a, b) => b.wickets - a.wickets)[0];
const topKeeping = (rows: PerformerRow[]) =>
  [...rows].sort((a, b) => b.dismissals - a.dismissals)[0];

const bestInnings = (rows: InningsRow[]) =>
  rows
    .map((r) => ({ r, n: parseHighScore(r.highScore) }))
    .filter((x): x is { r: InningsRow; n: number } => x.n != null)
    .sort((a, b) => b.n - a.n)[0];

const bestBowlingPerformance = (rows: InningsRow[]) =>
  rows
    .map((r) => ({ r, b: parseBowling(r.bestBowling) }))
    .filter((x): x is { r: InningsRow; b: { wkts: number; runs: number } } => x.b != null)
    .sort((a, b) => b.b.wkts - a.b.wkts || a.b.runs - b.b.runs)[0];

//** Everything a round-up needs for one (grade, season), from either read path. */
export type RoundUpData = {
  performers: PerformerRow[];
  innings: InningsRow[];
  latestRound: number | null;
};

/**
 * Where a (grade, season)'s figures come from. A central-data club reads its
 * own club's scorecards from the central DB (senior grades only, private
 * players omitted, ids crosswalked); every other tenant keeps the native
 * season snapshot tables exactly as before.
 */
async function loadRoundUpData(
  tenantId: number,
  grade: string,
  season: number,
): Promise<RoundUpData> {
  if (await tenantIsCentral(tenantId)) return loadCentralGradeSeason(tenantId, grade, season);
  const performers = await queryPerformers(grade, { season });
  const innings = await queryInningsRows(grade, season);
  return { performers, innings, latestRound: await latestRound(grade, season) };
}

// Generates "top performer" drafts for a single (grade, season) from season-
// scoped figures (the native player_grade_season_stats snapshot, or the central
// scorecards for that season), so we never blend historic totals into a single
// round/season call-out.
export async function generateRoundUpDrafts(
  tenantId: number,
  grade: string,
  season: number,
  sourceImportId: number | null,
): Promise<SocialDraft[]> {
  const {
    performers: stats,
    innings,
    latestRound: round,
  } = await loadRoundUpData(tenantId, grade, season);
  const created: SocialDraft[] = [];
  const headline = `${grade} ${seasonLabel(season)} Round-up`;
  const keyBase = `roundup:${season}:${grade}:${round ?? "none"}`;

  const topRuns = topBatting(stats);
  const topWkts = topBowling(stats);
  const topKeeper = topKeeping(stats);
  const bestBat = bestInnings(innings);
  const bestBowl = bestBowlingPerformance(innings);

  if (topRuns && topRuns.runs > 0)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "roundup",
        gradeLeaderCard(grade, "Runs", topRuns, topRuns.runs, headline),
        playerPath(topRuns.playerId),
        sourceImportId,
      ),
    );
  if (topWkts && topWkts.wickets > 0)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "roundup",
        gradeLeaderCard(grade, "Wickets", topWkts, topWkts.wickets, headline),
        playerPath(topWkts.playerId),
        sourceImportId,
      ),
    );
  if (bestBowl)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "roundup",
        gradeLeaderCard(
          grade,
          "Best Bowling",
          bestBowl.r,
          bestBowl.r.bestBowling ?? `${bestBowl.b.wkts}/${bestBowl.b.runs}`,
          headline,
        ),
        playerPath(bestBowl.r.playerId),
        sourceImportId,
      ),
    );
  if (bestBat)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "roundup",
        gradeLeaderCard(
          grade,
          "Best Innings",
          bestBat.r,
          bestBat.r.highScore ?? String(bestBat.n),
          headline,
        ),
        playerPath(bestBat.r.playerId),
        sourceImportId,
      ),
    );
  if (topKeeper && topKeeper.dismissals > 0)
    created.push(
      await insertCard(
        keyBase,
        tenantId,
        "roundup",
        gradeLeaderCard(grade, "Dismissals", topKeeper, topKeeper.dismissals, headline),
        playerPath(topKeeper.playerId),
        sourceImportId,
      ),
    );
  return created;
}

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
