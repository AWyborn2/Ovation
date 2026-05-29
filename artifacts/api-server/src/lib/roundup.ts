import {
  db,
  playerGradeSeasonStatsTable,
  playersTable,
  socialDraftsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

type SocialDraft = SocialDraftRow;

type PerformerRow = {
  playerId: number;
  runs: number;
  wickets: number;
  dismissals: number;
  surname: string;
  givenName: string;
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

const fullName = (s: { givenName: string; surname: string }) =>
  `${s.givenName} ${s.surname}`.trim();

const insertDraft = async (
  engine: "roundup" | "recap",
  grade: string,
  headline: string,
  category: string,
  performer: PerformerRow,
  value: number,
  sourceImportId: number | null,
): Promise<SocialDraft> => {
  const [row] = await db
    .insert(socialDraftsTable)
    .values({
      engine,
      status: "pending",
      cardInput: {
        kind: "gradeLeader",
        grade,
        category,
        playerName: fullName(performer),
        value,
        headline,
      },
      appPath: `/players/${performer.playerId}`,
      sourceImportId,
    })
    .returning();
  return row;
};

// Generates "top performer" drafts for a single (grade, season) by querying the
// season-scoped snapshot table (player_grade_season_stats), so we never blend
// historic totals into a single round/season call-out.
export async function generateRoundUpDrafts(
  grade: string,
  season: number,
  sourceImportId: number | null,
): Promise<SocialDraft[]> {
  const stats = await queryPerformers(grade, { season });
  const created: SocialDraft[] = [];
  const headline = `${grade} ${season} Round-up`;
  const topRuns = [...stats].sort((a, b) => b.runs - a.runs)[0];
  const topWkts = [...stats].sort((a, b) => b.wickets - a.wickets)[0];
  const topKeeper = [...stats].sort((a, b) => b.dismissals - a.dismissals)[0];
  if (topRuns && topRuns.runs > 0)
    created.push(await insertDraft("roundup", grade, headline, "Runs", topRuns, topRuns.runs, sourceImportId));
  if (topWkts && topWkts.wickets > 0)
    created.push(await insertDraft("roundup", grade, headline, "Wickets", topWkts, topWkts.wickets, sourceImportId));
  if (topKeeper && topKeeper.dismissals > 0)
    created.push(await insertDraft("roundup", grade, headline, "Dismissals", topKeeper, topKeeper.dismissals, sourceImportId));
  return created;
}

// Season recap: same shape as round-up but headline + scope differs (season-wide
// aggregate of every committed import). The aggregation is already season-
// scoped, so functionally recap reuses the same query — the distinction is
// intent and caption template (engine="recap").
export async function generateRecapDrafts(
  grade: string,
  season: number,
): Promise<SocialDraft[]> {
  const stats = await queryPerformers(grade, { season });
  const created: SocialDraft[] = [];
  const headline = `${grade} ${season} Season Recap`;
  const topRuns = [...stats].sort((a, b) => b.runs - a.runs)[0];
  const topWkts = [...stats].sort((a, b) => b.wickets - a.wickets)[0];
  const topKeeper = [...stats].sort((a, b) => b.dismissals - a.dismissals)[0];
  if (topRuns && topRuns.runs > 0)
    created.push(await insertDraft("recap", grade, headline, "Leading Run-Scorer", topRuns, topRuns.runs, null));
  if (topWkts && topWkts.wickets > 0)
    created.push(await insertDraft("recap", grade, headline, "Leading Wicket-Taker", topWkts, topWkts.wickets, null));
  if (topKeeper && topKeeper.dismissals > 0)
    created.push(await insertDraft("recap", grade, headline, "Most Dismissals", topKeeper, topKeeper.dismissals, null));
  return created;
}
