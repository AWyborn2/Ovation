import {
  db,
  playersTable,
  playerGradeStatsTable,
  milestoneEventsTable,
  socialDraftsTable,
  socialSettingsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  detectCrossings,
  BOARD_STAT_LABEL,
  type BoardKey,
} from "./milestone-detector";
import { generateRoundUpDrafts } from "./roundup";

export type CareerTotals = {
  games: number;
  runs: number;
  wickets: number;
  dismissals: number;
};

type Logger = { error: (obj: unknown, msg?: string) => void };

/**
 * Snapshot career totals (summed across all grades) per player from the derived
 * `player_grade_stats` table. Call once before a commit to capture the "before"
 * state, then again (implicitly inside `runPostCommitSocial`) for the "after".
 */
export async function snapshotCareerTotals(): Promise<Map<number, CareerTotals>> {
  const rows = await db
    .select({
      playerId: playerGradeStatsTable.playerId,
      games: sql<number>`coalesce(sum(${playerGradeStatsTable.games}), 0)`,
      runs: sql<number>`coalesce(sum(${playerGradeStatsTable.runs}), 0)`,
      wickets: sql<number>`coalesce(sum(${playerGradeStatsTable.wickets}), 0)`,
      dismissals: sql<number>`coalesce(sum(${playerGradeStatsTable.catches} + ${playerGradeStatsTable.stumpings}), 0)`,
    })
    .from(playerGradeStatsTable)
    .groupBy(playerGradeStatsTable.playerId);
  const map = new Map<number, CareerTotals>();
  for (const r of rows) {
    map.set(r.playerId, {
      games: Number(r.games),
      runs: Number(r.runs),
      wickets: Number(r.wickets),
      dismissals: Number(r.dismissals),
    });
  }
  return map;
}

/**
 * Shared post-commit social generation, used by both the CSV and per-match
 * import commit paths. Runs AFTER the commit transaction so social drafts are
 * never created for a rolled-back import.
 *
 *  - Milestone detection: compares post-recompute career totals against the
 *    supplied `beforeMap`, queueing milestone events + drafts for tier crossings
 *    (gated on `socialSettings.engineMilestone`).
 *  - Round-up drafts: top performers per affected grade for the season (gated on
 *    `socialSettings.engineRoundUp`).
 */
export async function runPostCommitSocial(opts: {
  importId: number;
  affectedGrades: string[];
  season: number;
  beforeMap: Map<number, CareerTotals>;
  logger: Logger;
}): Promise<void> {
  const { importId, affectedGrades, season, beforeMap, logger } = opts;
  const [socialSettings] = await db.select().from(socialSettingsTable).limit(1);

  try {
    if (!socialSettings?.engineMilestone) throw new Error("__skip_milestone__");
    const afterMap = await snapshotCareerTotals();
    const crossings = detectCrossings(beforeMap, afterMap);
    if (crossings.length > 0) {
      const playerIds = Array.from(new Set(crossings.map((c) => c.playerId)));
      const playerRows = await db
        .select({
          id: playersTable.id,
          surname: playersTable.surname,
          givenName: playersTable.givenName,
        })
        .from(playersTable)
        .where(sql`${playersTable.id} = ANY(${playerIds})`);
      const nameById = new Map(
        playerRows.map((p) => [p.id, `${p.givenName} ${p.surname}`.trim()]),
      );
      for (const c of crossings) {
        const name = nameById.get(c.playerId) ?? "Unknown";
        const [event] = await db
          .insert(milestoneEventsTable)
          .values({
            playerId: c.playerId,
            boardKey: c.boardKey,
            tierIndex: c.tierIndex,
            tierLabel: c.tierLabel,
            value: c.value,
            threshold: c.threshold,
            source: "import",
            sourceImportId: importId,
            payload: { name },
          })
          .returning();
        await db.insert(socialDraftsTable).values({
          engine: "milestone",
          status: "pending",
          cardInput: {
            kind: "milestone",
            playerName: name,
            tierLabel: c.tierLabel,
            tierIndex: c.tierIndex,
            milestoneLabel: BOARD_STAT_LABEL[c.boardKey as BoardKey],
            currentValue: c.value,
            threshold: c.threshold,
          },
          appPath: `/players/${c.playerId}`,
          milestoneEventId: event.id,
          sourceImportId: importId,
        });
      }
    }
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "__skip_milestone__") {
      logger.error({ err }, "milestone detection failed");
    }
  }

  try {
    if (socialSettings?.engineRoundUp) {
      for (const grade of affectedGrades) {
        await generateRoundUpDrafts(grade, season, importId);
      }
    }
  } catch (err) {
    logger.error({ err }, "auto roundup failed");
  }
}
