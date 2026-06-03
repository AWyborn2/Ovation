import {
  db,
  playersTable,
  playerGradeStatsTable,
  milestoneEventsTable,
  socialDraftsTable,
  socialSettingsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  detectCrossings,
  BOARD_STAT_LABEL,
  type BoardKey,
} from "./milestone-detector";
import {
  detectAndQueueMatchMilestones,
  type MatchMilestoneContext,
} from "./match-milestone-detector";
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
 * Per-player game count in a single grade from `player_grade_stats`. Capture
 * this BEFORE a match commit so debut detection can see who crossed 0→1 in the
 * grade.
 */
export async function snapshotGradeGames(
  grade: string,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      playerId: playerGradeStatsTable.playerId,
      games: playerGradeStatsTable.games,
    })
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.grade, grade));
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.playerId, Number(r.games ?? 0));
  return map;
}

/**
 * Queue career-tier-crossing milestone cards: compare post-recompute career
 * totals against `beforeMap` and write a `milestone_events` + `social_drafts`
 * row for each crossing. `sourceImportId` stamps the originating import (for a
 * batch, the representative/first committed match). Caller gates on
 * `socialSettings.engineMilestone`.
 */
async function queueCareerCrossings(
  sourceImportId: number,
  beforeMap: Map<number, CareerTotals>,
): Promise<void> {
  const afterMap = await snapshotCareerTotals();
  const crossings = detectCrossings(beforeMap, afterMap);
  if (crossings.length === 0) return;
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
        sourceImportId: sourceImportId,
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
      sourceImportId: sourceImportId,
    });
  }
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
  /** Present only for per-match commits; drives debut/cap/century/5-for cards. */
  matchContext?: MatchMilestoneContext;
}): Promise<void> {
  const { importId, affectedGrades, season, beforeMap, logger, matchContext } =
    opts;
  const [socialSettings] = await db.select().from(socialSettingsTable).limit(1);

  if (socialSettings?.engineMilestone) {
    try {
      await queueCareerCrossings(importId, beforeMap);
    } catch (err) {
      logger.error({ err }, "milestone detection failed");
    }
  }

  if (matchContext && socialSettings?.engineMilestone) {
    try {
      await detectAndQueueMatchMilestones(matchContext);
    } catch (err) {
      logger.error({ err }, "match milestone detection failed");
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

/**
 * Post-commit social generation for a whole-season batch of matches committed
 * together. Career-tier crossings are detected ONCE for the entire batch (the
 * `beforeMap` is captured before any match is written), stamped with the first
 * committed match's import id. Per-match milestone detection runs once per match
 * (ordered by round) — its fire-once de-dup means debut/new-cap moments only
 * emit a single card across the batch. Round-up drafts run once per affected
 * (grade, season). All gated on the social settings engines.
 */
export async function runBatchPostCommitSocial(opts: {
  /** Representative import id (the first committed match) for crossing events. */
  sourceImportId: number;
  beforeMap: Map<number, CareerTotals>;
  /** Distinct (grade, season) pairs touched by the batch, for round-ups. */
  affected: Array<{ grade: string; season: number }>;
  /** One context per committed match, ordered by round so de-dup is stable. */
  matchContexts: MatchMilestoneContext[];
  logger: Logger;
}): Promise<void> {
  const { sourceImportId, beforeMap, affected, matchContexts, logger } = opts;
  const [socialSettings] = await db.select().from(socialSettingsTable).limit(1);

  if (socialSettings?.engineMilestone) {
    try {
      await queueCareerCrossings(sourceImportId, beforeMap);
    } catch (err) {
      logger.error({ err }, "milestone detection failed");
    }
    for (const ctx of matchContexts) {
      try {
        await detectAndQueueMatchMilestones(ctx);
      } catch (err) {
        logger.error({ err }, "match milestone detection failed");
      }
    }
  }

  try {
    if (socialSettings?.engineRoundUp) {
      for (const { grade, season } of affected) {
        await generateRoundUpDrafts(grade, season, sourceImportId);
      }
    }
  } catch (err) {
    logger.error({ err }, "auto roundup failed");
  }
}
