import { db, playhqGradeDecisionsTable } from "@workspace/db";
import {
  assertProjectorScope,
  centralProjectorConfigured,
  getCentralProjectorPool,
  loadMatchIdsForGradeKey,
  playhqGradeKey,
  projectToCentral,
  type UnclassifiedGrade,
} from "@workspace/db/playhq-ingest";
import { clearMilestonesCache } from "./milestones-cache";

/**
 * Platform decisions about PlayHQ competitions Ovation can't place in a grade
 * (schema/playhq_grade_decisions.ts): which names still need a decision, and projecting a new
 * decision's matches straight away through the central projector (the app itself never writes
 * `central`).
 */

/** Keys of every competition a platform admin has already decided on. */
export async function decidedKeys(): Promise<Set<string>> {
  const rows = await db
    .select({ gradeKey: playhqGradeDecisionsTable.gradeKey })
    .from(playhqGradeDecisionsTable);
  return new Set(rows.map((r) => r.gradeKey));
}

/** `grades` without the competitions that already have a decision. */
export async function withoutDecidedGrades(
  grades: UnclassifiedGrade[],
): Promise<UnclassifiedGrade[]> {
  if (grades.length === 0) return grades;
  const decided = await decidedKeys();
  return grades.filter((g) => !decided.has(playhqGradeKey(g.gradeName)));
}

export interface ApplyResult {
  applied: boolean;
  created: number;
  updated: number;
  skipped: number;
}

const CHUNK = 100;

/**
 * Project a competition's matches now, so a new decision shows without waiting for the next sync
 * to touch them. Not applied (and no error) when the projector isn't configured: the decision
 * is still saved and takes effect on the next sync. Matches already projected under another
 * grade are updated in place (the projection upserts on the PlayHQ match id).
 */
export async function applyGradeDecision(
  gradeKey: string,
  log?: { error: (obj: unknown, msg?: string) => void },
): Promise<ApplyResult> {
  const none: ApplyResult = { applied: false, created: 0, updated: 0, skipped: 0 };
  if (!centralProjectorConfigured()) return none;
  try {
    const pool = getCentralProjectorPool();
    await assertProjectorScope(pool);
    const ids = await loadMatchIdsForGradeKey(pool, gradeKey);
    const total = { created: 0, updated: 0, skipped: 0 };
    for (let i = 0; i < ids.length; i += CHUNK) {
      const s = await projectToCentral(pool, { matchIds: ids.slice(i, i + CHUNK) });
      total.created += s.created;
      total.updated += s.updated;
      total.skipped += s.skipped.length;
    }
    const { clearCentralQueriesCache } = await import("@workspace/db/central-queries");
    clearCentralQueriesCache();
    clearMilestonesCache();
    return { applied: true, ...total };
  } catch (err) {
    log?.error({ err, gradeKey }, "grade decision not applied");
    return none;
  }
}
