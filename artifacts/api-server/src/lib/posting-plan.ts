import { db, socialSettingsTable, type SocialSettingsRow } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  defaultPostingPlan,
  invalidPostingPlan,
  normalizePostingPlan,
  postingPlanToLegacy,
  rowAllows,
  rowHasJuniors,
  rowIndividual,
  rowJuniorPackaging,
  rowRound,
  type JuniorPackaging,
  type JuniorRunsBar,
  type PostingPlan,
  type PostingRowId,
} from "@workspace/scorecard/posting-plan";
import { mergeRoundSchedules, resolveRoundSchedules } from "./round-schedules";
import type { FamilyConfig } from "./social-families";
import { tenantIsCentral } from "./tenant";

/**
 * The club's effective Posting Plan (ADR-004): the saved version 2 plan, or
 * the code default for its data source when nothing (or an older plan) is
 * stored. Every drafting gate reads this, never the legacy columns directly.
 */
export function resolvePostingPlan(
  settings: SocialSettingsRow | null,
  central: boolean,
): PostingPlan {
  return normalizePostingPlan(settings?.postingPlan, defaultPostingPlan(central));
}

// ---------------------------------------------------------------------------
// Drafting gates

/** The achievement cards and which row decides them. */
export type AchievementKind =
  "milestone" | "debut" | "century" | "fiveFor" | "hatTrick" | "fiveCatches";

const ACHIEVEMENT_ROW: Record<AchievementKind, PostingRowId> = {
  milestone: "milestones",
  debut: "debuts",
  century: "bigMoments",
  fiveFor: "bigMoments",
  hatTrick: "bigMoments",
  fiveCatches: "bigMoments",
};

/** Rows that can draft one carousel per round. */
export type CarouselRow = "results" | "gameDay" | "teamLists";

/** Every drafting decision the engines make, read row by row from the plan. */
export interface DraftingGates {
  /** Results: may per-match result cards draft at all (drafter entry, stumps, junior)? */
  resultsAny(): boolean;
  /** Results: one card per match for this grade (junior age groups included). */
  resultsMatch(grade: string | null, junior: boolean): boolean;
  /** Results: the central sweep drafts per-match cards (not carousel-only). */
  resultsPerMatchCentral(): boolean;
  /** Results: the round carousel. */
  resultsCarousel(): boolean;
  /** Results: does the row list this grade (junior age groups included), whatever the packaging? */
  resultsGrade(grade: string | null, junior: boolean): boolean;
  /** Any achievement row on (early exit). */
  achievementsAny(): boolean;
  /** An achievement card for a grade; a native career crossing has no grade. */
  achievement(kind: AchievementKind, grade: string | null, junior?: boolean): boolean;
  /** Runs a junior innings needs to be a Big Moment (R11). */
  juniorRunsBar(): JuniorRunsBar;
  gameDayIndividual(): boolean;
  gameDayRound(): boolean;
  gameDayGrade(grade: string | null, junior: boolean): boolean;
  teamListsIndividual(): boolean;
  teamListsRound(): boolean;
  teamListsGrade(grade: string | null, junior: boolean): boolean;
  clubLeaderboards(): boolean;
  ladders(): boolean;
  ladderGrade(grade: string): boolean;
  /** Any junior age group switched on for this row. */
  juniorsAny(row: CarouselRow): boolean;
  /** How a carousel row packages its junior slides (KTD6). */
  juniorPackaging(row: CarouselRow): JuniorPackaging;
}

export function draftingGates(settings: SocialSettingsRow | null, central: boolean): DraftingGates {
  return planGates(resolvePostingPlan(settings, central));
}

export async function loadDraftingGates(tenantId: number): Promise<DraftingGates> {
  const [settings] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return planGates(resolvePostingPlan(settings ?? null, await tenantIsCentral(tenantId)));
}

export function planGates(plan: PostingPlan): DraftingGates {
  const r = plan.rows;
  return {
    resultsAny: () => rowIndividual(r.results),
    resultsMatch: (g, j) => rowIndividual(r.results) && rowAllows(r.results, g, j),
    resultsPerMatchCentral: () => rowIndividual(r.results),
    resultsCarousel: () => rowRound(r.results),
    resultsGrade: (g, j) => rowAllows(r.results, g, j),
    achievementsAny: () => r.milestones.enabled || r.bigMoments.enabled || r.debuts.enabled,
    achievement: (k, g, j = false) =>
      g == null ? r[ACHIEVEMENT_ROW[k]].enabled : rowAllows(r[ACHIEVEMENT_ROW[k]], g, j),
    juniorRunsBar: () => plan.bigMoments.juniorRunsBar,
    gameDayIndividual: () => rowIndividual(r.gameDay),
    gameDayRound: () => rowRound(r.gameDay),
    gameDayGrade: (g, j) => rowAllows(r.gameDay, g, j),
    teamListsIndividual: () => rowIndividual(r.teamLists),
    teamListsRound: () => rowRound(r.teamLists),
    teamListsGrade: (g, j) => rowAllows(r.teamLists, g, j),
    clubLeaderboards: () => rowRound(r.clubLeaderboards),
    ladders: () => rowRound(r.ladders),
    ladderGrade: (g) => rowAllows(r.ladders, g, false),
    juniorsAny: (row) => rowHasJuniors(r[row]),
    juniorPackaging: (row) => rowJuniorPackaging(r[row]),
  };
}

/**
 * Columns to write when an admin saves a plan: the plan itself plus the
 * legacy family switches and round-schedule modes it collapses to, so a
 * rollback to an earlier build keeps drafting (widest-wins) and the cards
 * that still read those columns stay in step. Day and hour are kept.
 */
export function postingPlanWrite(
  current: SocialSettingsRow,
  submitted: unknown,
  central: boolean,
):
  | { error: string }
  | { columns: Partial<SocialSettingsRow> & { familyConfig?: FamilyConfig }; plan: PostingPlan } {
  const plan = normalizePostingPlan(submitted, resolvePostingPlan(current, central));
  const problem = invalidPostingPlan(plan, { central });
  if (problem) return { error: problem };
  const legacy = postingPlanToLegacy(plan);
  const schedules = resolveRoundSchedules(current.roundSchedules);
  const roundSchedules = mergeRoundSchedules(current.roundSchedules, {
    gameDay: { ...schedules.gameDay, mode: legacy.modes.gameDay },
    teamLists: { ...schedules.teamLists, mode: legacy.modes.teamLists },
    weekendWrap: { ...schedules.weekendWrap, mode: legacy.modes.weekendWrap },
  });
  // The plan replaces each family wholesale (a merge would keep stale grade
  // overrides); the engine flags mirror it as syncFamilySettings does.
  const familyConfig: FamilyConfig = legacy.families;
  return {
    plan,
    columns: {
      familyConfig,
      engineMatchSummary: familyConfig.results.enabled,
      engineMilestone: familyConfig.achievements.enabled,
      engineRoundUp: familyConfig.roundup.enabled,
      matchSummaryGradeConfig: Object.fromEntries(
        Object.entries(familyConfig.results.grades).map(([g, enabled]) => [g, { enabled }]),
      ),
      roundSchedules,
      postingPlan: plan,
    },
  };
}
