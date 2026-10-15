import { db, socialSettingsTable, type SocialSettingsRow } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  derivePostingPlan,
  invalidPostingPlan,
  normalizePostingPlan,
  postingPlanToLegacy,
  rowAllows,
  rowIndividual,
  rowRound,
  type PostingPlan,
  type PostingRowId,
} from "@workspace/scorecard/posting-plan";
import { resolveFamilyConfig, type FamilyConfig } from "./social-families";
import { mergeRoundSchedules, resolveRoundSchedules } from "./round-schedules";
import { tenantIsCentral } from "./tenant";

/**
 * The club's effective Posting Plan (plan 2026-10-07-001 KTD1/KTD2): the
 * saved plan, or — until an admin saves one — the plan its family switches
 * and round-schedule modes amount to. Every drafting gate reads this, never
 * the legacy columns directly.
 */
export function resolvePostingPlan(
  settings: SocialSettingsRow | null,
  central: boolean,
): PostingPlan {
  const derived = derivePostingPlan({
    families: resolveFamilyConfig(settings),
    modes: modesOf(settings),
    central,
  });
  const saved = settings?.postingPlan;
  return saved ? normalizePostingPlan(saved, derived) : derived;
}

function modesOf(settings: SocialSettingsRow | null) {
  const s = resolveRoundSchedules(settings?.roundSchedules);
  return { gameDay: s.gameDay.mode, teamLists: s.teamLists.mode, weekendWrap: s.weekendWrap.mode };
}

// ---------------------------------------------------------------------------
// Drafting gates (U3)

export type AchievementKind = "milestone" | "century" | "fiveFor" | "debut";

/**
 * Every drafting decision the engines make. A club that has never saved a
 * plan keeps today's exact rules (the legacy branch below, which is the
 * code that lived in each engine before); a saved plan is read row by row.
 * Keeping the two apart makes carry-over exact for every legacy settings
 * combination, including ones the derived plan can only approximate.
 */
export interface DraftingGates {
  /** Results: may per-match result cards draft at all (drafter entry, stumps, junior manual)? */
  resultsAny(): boolean;
  /** Results: one card per match for this grade. */
  resultsMatch(grade: string | null, junior: boolean): boolean;
  /** Results: the central sweep drafts per-match cards (not carousel-only). */
  resultsPerMatchCentral(): boolean;
  /** Results: the round carousel (weekend wrap). */
  resultsCarousel(): boolean;
  /** Any achievement row on (early exit). */
  achievementsAny(): boolean;
  achievement(kind: AchievementKind, grade: string | null): boolean;
  gradeLeadersAny(): boolean;
  gradeLeaders(grade: string): boolean;
  gameDayIndividual(): boolean;
  gameDayRound(): boolean;
  gameDayGrade(grade: string | null, junior: boolean): boolean;
  teamListsIndividual(): boolean;
  teamListsRound(): boolean;
  teamListsGrade(grade: string | null, junior: boolean): boolean;
  clubLeaderboards(): boolean;
  ladders(): boolean;
  ladderGrade(grade: string): boolean;
  /**
   * A junior-sync card (synced result, junior team list) for this age group. Unlike
   * senior grades, an age group drafts unless the club turned it off.
   */
  juniorSynced(row: "results" | "teamLists", ageGroup: string | null | undefined): boolean;
}

const ACHIEVEMENT_ROW: Record<AchievementKind, PostingRowId> = {
  milestone: "milestones",
  century: "feats",
  fiveFor: "feats",
  debut: "debuts",
};

export function draftingGates(settings: SocialSettingsRow | null, central: boolean): DraftingGates {
  if (settings?.postingPlan) return planGates(resolvePostingPlan(settings, central));
  return legacyGates(settings);
}

export async function loadDraftingGates(tenantId: number): Promise<DraftingGates> {
  const [settings] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  if (!settings?.postingPlan) return legacyGates(settings ?? null);
  return planGates(resolvePostingPlan(settings, await tenantIsCentral(tenantId)));
}

/** Today's rules, verbatim from the engines (familyAllows + round-schedule modes). */
function legacyGates(settings: SocialSettingsRow | null): DraftingGates {
  const f = resolveFamilyConfig(settings);
  const s = resolveRoundSchedules(settings?.roundSchedules);
  const allows = (fam: keyof FamilyConfig, grade: string | null, junior: boolean) => {
    const setting = f[fam];
    if (!setting.enabled) return false;
    const explicit = setting.grades[grade ?? ""];
    return explicit !== undefined ? explicit : !junior;
  };
  return {
    resultsAny: () => f.results.enabled,
    resultsMatch: (g, j) => settings != null && allows("results", g, j),
    resultsPerMatchCentral: () => s.weekendWrap.mode !== "perRound",
    resultsCarousel: () =>
      f.roundup.enabled && (s.weekendWrap.mode === "perRound" || s.weekendWrap.mode === "both"),
    achievementsAny: () => f.achievements.enabled,
    achievement: (_k, g) => allows("achievements", g, false),
    gradeLeadersAny: () => f.roundup.enabled,
    gradeLeaders: (g) => allows("roundup", g, false),
    gameDayIndividual: () => f.matchday.enabled && s.gameDay.mode === "perFixture",
    gameDayRound: () => f.matchday.enabled && s.gameDay.mode === "perRound",
    gameDayGrade: (g, j) => allows("matchday", g, j),
    teamListsIndividual: () => f.matchday.enabled && s.teamLists.mode === "perFixture",
    teamListsRound: () => f.matchday.enabled && s.teamLists.mode === "perRound",
    teamListsGrade: (g, j) => allows("matchday", g, j),
    clubLeaderboards: () => false,
    ladders: () => false,
    ladderGrade: () => false,
    juniorSynced: (row, ag) => {
      const setting = f[row === "results" ? "results" : "matchday"];
      return setting.enabled && setting.grades[ag ?? ""] !== false;
    },
  };
}

function planGates(plan: PostingPlan): DraftingGates {
  const r = plan.rows;
  return {
    resultsAny: () => rowIndividual(r.results),
    resultsMatch: (g, j) => rowIndividual(r.results) && rowAllows(r.results, g, j),
    resultsPerMatchCentral: () => rowIndividual(r.results),
    resultsCarousel: () => rowRound(r.results),
    achievementsAny: () => r.milestones.enabled || r.feats.enabled || r.debuts.enabled,
    // A native career crossing has no grade: the row's switch decides.
    achievement: (k, g) =>
      g == null ? r[ACHIEVEMENT_ROW[k]].enabled : rowAllows(r[ACHIEVEMENT_ROW[k]], g, false),
    gradeLeadersAny: () => r.gradeLeaders.enabled,
    gradeLeaders: (g) => rowAllows(r.gradeLeaders, g, false),
    gameDayIndividual: () => rowIndividual(r.gameDay),
    gameDayRound: () => rowRound(r.gameDay),
    gameDayGrade: (g, j) => rowAllows(r.gameDay, g, j),
    teamListsIndividual: () => rowIndividual(r.teamLists),
    teamListsRound: () => rowRound(r.teamLists),
    teamListsGrade: (g, j) => rowAllows(r.teamLists, g, j),
    clubLeaderboards: () => rowRound(r.clubLeaderboards),
    ladders: () => rowRound(r.ladders),
    ladderGrade: (g) => rowAllows(r.ladders, g, false),
    juniorSynced: (row, ag) => r[row].enabled && r[row].grades[ag ?? ""] !== false,
  };
}

/**
 * Columns to write when an admin saves a plan: the plan itself plus the
 * legacy family switches and round-schedule modes it collapses to (KTD3), so
 * a rollback to an earlier build keeps drafting (widest-wins) and the cards
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
