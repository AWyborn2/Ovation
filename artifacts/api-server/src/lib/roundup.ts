import {
  db,
  playerGradeSeasonStatsTable,
  playersTable,
  socialDraftsTable,
  milestoneEventsTable,
  importsTable,
  premiershipsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { BOARD_STAT_LABEL, type BoardKey } from "./milestone-detector";

type SocialDraft = SocialDraftRow;

type PerformerRow = {
  playerId: number;
  runs: number;
  wickets: number;
  dismissals: number;
  surname: string;
  givenName: string;
};

type InningsRow = {
  playerId: number;
  surname: string;
  givenName: string;
  highScore: string | null;
  bestBowling: string | null;
};

const queryPerformers = async (
  grade: string,
  seasonFilter: { season: number } | "all",
): Promise<PerformerRow[]> => {
  const where = seasonFilter === "all"
    ? eq(playerGradeSeasonStatsTable.grade, grade)
    : and(
        eq(playerGradeSeasonStatsTable.grade, grade),
        eq(playerGradeSeasonStatsTable.season, seasonFilter.season),
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
    .groupBy(
      playerGradeSeasonStatsTable.playerId,
      playersTable.surname,
      playersTable.givenName,
    );
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
const queryInningsRows = async (
  grade: string,
  season: number,
): Promise<InningsRow[]> =>
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
      ),
    );

const fullName = (s: { givenName: string; surname: string }) =>
  `${s.givenName} ${s.surname}`.trim();

const seasonLabel = (year: number) =>
  `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

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

// Generic draft inserter — cardInput is an opaque ShareCardInput JSON blob.
const insertCard = async (
  engine: "roundup" | "recap",
  cardInput: Record<string, unknown>,
  appPath: string,
  sourceImportId: number | null,
): Promise<SocialDraft> => {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({ engine, status: "pending", cardInput, appPath, sourceImportId })
    .returning();
  return row;
};

const topBatting = (rows: PerformerRow[]) =>
  [...rows].sort((a, b) => b.runs - a.runs)[0];
const topBowling = (rows: PerformerRow[]) =>
  [...rows].sort((a, b) => b.wickets - a.wickets)[0];
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

// Generates "top performer" drafts for a single (grade, season) by querying the
// season-scoped snapshot table (player_grade_season_stats), so we never blend
// historic totals into a single round/season call-out.
export async function generateRoundUpDrafts(
  grade: string,
  season: number,
  sourceImportId: number | null,
): Promise<SocialDraft[]> {
  const stats = await queryPerformers(grade, { season });
  const innings = await queryInningsRows(grade, season);
  const created: SocialDraft[] = [];
  const headline = `${grade} ${seasonLabel(season)} Round-up`;

  const topRuns = topBatting(stats);
  const topWkts = topBowling(stats);
  const topKeeper = topKeeping(stats);
  const bestBat = bestInnings(innings);
  const bestBowl = bestBowlingPerformance(innings);

  if (topRuns && topRuns.runs > 0)
    created.push(
      await insertCard(
        "roundup",
        gradeLeaderCard(grade, "Runs", topRuns, topRuns.runs, headline),
        `/players/${topRuns.playerId}`,
        sourceImportId,
      ),
    );
  if (topWkts && topWkts.wickets > 0)
    created.push(
      await insertCard(
        "roundup",
        gradeLeaderCard(grade, "Wickets", topWkts, topWkts.wickets, headline),
        `/players/${topWkts.playerId}`,
        sourceImportId,
      ),
    );
  if (bestBowl)
    created.push(
      await insertCard(
        "roundup",
        gradeLeaderCard(
          grade,
          "Best Bowling",
          bestBowl.r,
          bestBowl.r.bestBowling ?? `${bestBowl.b.wkts}/${bestBowl.b.runs}`,
          headline,
        ),
        `/players/${bestBowl.r.playerId}`,
        sourceImportId,
      ),
    );
  if (bestBat)
    created.push(
      await insertCard(
        "roundup",
        gradeLeaderCard(
          grade,
          "Best Innings",
          bestBat.r,
          bestBat.r.highScore ?? String(bestBat.n),
          headline,
        ),
        `/players/${bestBat.r.playerId}`,
        sourceImportId,
      ),
    );
  if (topKeeper && topKeeper.dismissals > 0)
    created.push(
      await insertCard(
        "roundup",
        gradeLeaderCard(grade, "Dismissals", topKeeper, topKeeper.dismissals, headline),
        `/players/${topKeeper.playerId}`,
        sourceImportId,
      ),
    );
  return created;
}

// Milestones unlocked in a (grade, season): milestone_events don't carry a grade
// directly, so we join through the import that produced them.
async function generateMilestoneRecapCards(
  grade: string,
  season: number,
  headline: string,
): Promise<SocialDraft[]> {
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
    .where(and(eq(importsTable.grade, grade), eq(importsTable.season, season)));

  if (rows.length === 0) return [];

  // Names may be embedded in payload; fall back to a players lookup otherwise.
  const missing = rows.filter((r) => !(r.payload as { name?: string } | null)?.name);
  const nameById = new Map<number, string>();
  if (missing.length > 0) {
    const ids = Array.from(new Set(missing.map((r) => r.playerId)));
    const players = await db
      .select({ id: playersTable.id, surname: playersTable.surname, givenName: playersTable.givenName })
      .from(playersTable)
      .where(sql`${playersTable.id} = ANY(${ids})`);
    for (const p of players) nameById.set(p.id, fullName(p));
  }

  const created: SocialDraft[] = [];
  for (const r of rows) {
    const name = (r.payload as { name?: string } | null)?.name ?? nameById.get(r.playerId) ?? "Unknown";
    created.push(
      await insertCard(
        "recap",
        {
          kind: "milestone",
          playerName: name,
          tierLabel: r.tierLabel,
          tierIndex: r.tierIndex,
          milestoneLabel: BOARD_STAT_LABEL[r.boardKey as BoardKey] ?? r.boardKey,
          currentValue: r.value,
          threshold: r.threshold,
          headline,
        },
        `/players/${r.playerId}`,
        null,
      ),
    );
  }
  return created;
}

// A premiership card, if the club won this grade in this season (year = start year).
async function generatePremiershipRecapCards(
  grade: string,
  season: number,
  headline: string,
): Promise<SocialDraft[]> {
  const prems = await db
    .select()
    .from(premiershipsTable)
    .where(and(eq(premiershipsTable.grade, grade), eq(premiershipsTable.year, season)));
  const created: SocialDraft[] = [];
  for (const p of prems) {
    created.push(
      await insertCard(
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
  grade: string,
  season: number,
): Promise<SocialDraft[]> {
  const stats = await queryPerformers(grade, { season });
  const created: SocialDraft[] = [];
  const headline = `${grade} ${seasonLabel(season)} Season Recap`;

  const topRuns = topBatting(stats);
  const topWkts = topBowling(stats);
  const topKeeper = topKeeping(stats);

  if (topRuns && topRuns.runs > 0)
    created.push(
      await insertCard(
        "recap",
        gradeLeaderCard(grade, "Champion Batsman", topRuns, topRuns.runs, headline),
        `/players/${topRuns.playerId}`,
        null,
      ),
    );
  if (topWkts && topWkts.wickets > 0)
    created.push(
      await insertCard(
        "recap",
        gradeLeaderCard(grade, "Champion Bowler", topWkts, topWkts.wickets, headline),
        `/players/${topWkts.playerId}`,
        null,
      ),
    );
  if (topKeeper && topKeeper.dismissals > 0)
    created.push(
      await insertCard(
        "recap",
        gradeLeaderCard(grade, "Most Dismissals", topKeeper, topKeeper.dismissals, headline),
        `/players/${topKeeper.playerId}`,
        null,
      ),
    );

  created.push(...(await generateMilestoneRecapCards(grade, season, headline)));
  created.push(...(await generatePremiershipRecapCards(grade, season, headline)));

  return created;
}
