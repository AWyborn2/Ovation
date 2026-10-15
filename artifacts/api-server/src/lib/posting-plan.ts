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

/** The tenant's settings row and its effective plan, for pipeline code. */
export async function loadPostingPlan(
  tenantId: number,
): Promise<{ settings: SocialSettingsRow | null; plan: PostingPlan }> {
  const [settings] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const central = await tenantIsCentral(tenantId);
  return { settings: settings ?? null, plan: resolvePostingPlan(settings ?? null, central) };
}

/** Should `row` draft a card for this grade? */
export function planAllows(
  plan: PostingPlan,
  row: PostingRowId,
  grade: string | null,
  junior: boolean,
): boolean {
  return rowAllows(plan.rows[row], grade, junior);
}

/** Does `row` draft one card per event (it may also draft a round carousel)? */
export function planIndividual(plan: PostingPlan, row: PostingRowId): boolean {
  return rowIndividual(plan.rows[row]);
}

/** Does `row` draft one club-wide carousel per round? */
export function planRound(plan: PostingPlan, row: PostingRowId): boolean {
  return rowRound(plan.rows[row]);
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
