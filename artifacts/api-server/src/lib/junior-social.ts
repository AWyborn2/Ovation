import { and, eq, gte, inArray, lte, ne, or, like } from "drizzle-orm";
import {
  db,
  juniorFixturesTable,
  juniorMatchesTable,
  socialDraftsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { JUNIOR_SYNC_ID_START } from "@workspace/db/schema";
import { juniorProjectionErrorText, perthDate } from "@workspace/db/playhq-ingest";
import { isJuniorSyncOn } from "./junior-sync";
import { loadJuniorTeamPublishing } from "./junior-helpers";
import {
  JUNIOR_TEAM_LIST_KEY_PREFIX,
  juniorRetimeAction,
  juniorTeamListFixtureIdOf,
  juniorTeamPublishMode,
  syncedJuniorMatchIdOf,
} from "./junior-publishing";
import { autoReadyAtFor } from "./effective-draft-state";
import { cancelDraftPublications } from "./publishing/publications";
import { generateJuniorTeamListDrafts } from "./engines/junior-team-list";
import { generateJuniorBigMomentDrafts } from "./engines/junior-big-moments";
import { generateJuniorMatchSummaryDrafts } from "./match-summary-drafter";

/**
 * Junior social in the drafting sweep (junior PlayHQ sync plan U8; KTD13-KTD15, R17-R21,
 * R23, F2, F3).
 *
 * For a club with junior sync enabled:
 *   1. re-time its unposted synced junior drafts to their team's publishing setting
 *      (KTD14), BEFORE anything can promote them;
 *   2. draft junior team-list cards (both sweep kinds), re-rendering any unposted one
 *      outside the seven-day window too, so a naming-style or privacy change reaches
 *      every queued card (KTD15);
 *   3. on the scheduled sweep, draft junior result cards for synced, scored matches
 *      finished in the last 21 days, plus any unposted synced result card (re-render).
 * For a club with junior sync switched off, its unposted synced junior drafts go back
 * to review with no auto-ready time, and nothing junior is drafted (R23).
 *
 * "Synced" drafts are the junior sync's own: `juniorteamlist:<fixture>` and the result
 * cards of junior matches in the sync id band (`id >= JUNIOR_SYNC_ID_START`). Loader-era
 * junior drafts are left alone. Junior drafts never mix with senior ones: every engine
 * here reads `junior_*` tables only and writes `sourceMatchIsJunior` drafts under
 * junior keys.
 */

/** A synced junior result card is drafted for matches dated within this window. */
export const JUNIOR_RESULTS_RECENT_MS = 21 * 24 * 60 * 60 * 1000;

const UNPOSTED = ["awaiting_review", "ready"];

export type JuniorSweepSummary = {
  enabled: boolean;
  teamLists: number;
  results: number;
  /** Junior Big Moment cards drafted (runs bar or five wickets). */
  bigMoments: number;
  /** Drafts sent back to review (switch-off, or auto-promoted for an approval team). */
  held: number;
  /** Drafts whose auto-ready time was cleared or set. */
  retimed: number;
};

type Logger = {
  error: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
};

/** Whether junior sync (the three-part gate, KTD1) is on for one tenant. */
export function tenantJuniorSyncEnabled(tenantId: number): Promise<boolean> {
  return isJuniorSyncOn(tenantId, { requireActive: true });
}

/** The tenant's unposted synced junior drafts (team lists and synced result cards). */
export async function unpostedSyncedJuniorDrafts(tenantId: number): Promise<SocialDraftRow[]> {
  const rows = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.sourceMatchIsJunior, true),
        inArray(socialDraftsTable.status, UNPOSTED),
        or(
          like(socialDraftsTable.sourceKey, `${JUNIOR_TEAM_LIST_KEY_PREFIX}%`),
          and(
            like(socialDraftsTable.sourceKey, "matchSummary:junior:%"),
            gte(socialDraftsTable.sourceMatchId, JUNIOR_SYNC_ID_START),
          ),
        ),
      ),
    );
  return rows.filter(
    (d) =>
      juniorTeamListFixtureIdOf(d.sourceKey) !== null ||
      syncedJuniorMatchIdOf(d.sourceKey) !== null,
  );
}

/**
 * An error as safe log text: code and first line, no key values or failing rows (which can
 * hold card JSON or a child's name). The projection's rule, shared.
 */
const safeError = juniorProjectionErrorText;

/**
 * Run `step` for each draft; a draft that throws is logged with its tenant and id and a
 * safe error text only, and the rest still run (one bad draft never stalls the sweep).
 * Returns how many failed.
 */
export async function eachJuniorDraft<D extends { id: number; tenantId: number }>(
  list: readonly D[],
  step: (d: D) => Promise<void>,
  logger?: Logger,
): Promise<number> {
  let failures = 0;
  for (const d of list) {
    try {
      await step(d);
    } catch (err) {
      failures++;
      logger?.error(
        { tenantId: d.tenantId, draftId: d.id, error: safeError(err) },
        "junior draft re-timing failed",
      );
    }
  }
  return failures;
}

/**
 * Back to review with no auto-ready time, with the draft's scheduled posts cancelled, in
 * one transaction: either both commit or neither does, so a failed cancel never leaves a
 * live scheduled post behind a draft already back in review (which later sweeps skip).
 * A draft already posted (or otherwise gone from the unposted states) is left alone.
 */
async function holdDraft(d: SocialDraftRow, reason: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(socialDraftsTable)
      .set({ status: "awaiting_review", autoReadyAt: null })
      .where(
        and(
          eq(socialDraftsTable.id, d.id),
          eq(socialDraftsTable.tenantId, d.tenantId),
          inArray(socialDraftsTable.status, UNPOSTED),
        ),
      )
      .returning({ id: socialDraftsTable.id });
    if (!updated) return false;
    await cancelDraftPublications(d.tenantId, d.id, reason, undefined, tx);
    return true;
  });
}

/** Each draft's team (age group, team name), from its junior fixture or junior match. */
async function draftTeams(
  tenantId: number,
  drafts: readonly SocialDraftRow[],
): Promise<Map<number, { ageGroup: string | null; teamName: string | null }>> {
  const fixtureIds = drafts.flatMap((d) => juniorTeamListFixtureIdOf(d.sourceKey) ?? []);
  const matchIds = drafts.flatMap((d) => syncedJuniorMatchIdOf(d.sourceKey) ?? []);
  const [fixtures, matches] = await Promise.all([
    fixtureIds.length
      ? db
          .select({
            id: juniorFixturesTable.id,
            ageGroup: juniorFixturesTable.ageGroup,
            teamName: juniorFixturesTable.teamName,
          })
          .from(juniorFixturesTable)
          .where(
            and(
              eq(juniorFixturesTable.tenantId, tenantId),
              inArray(juniorFixturesTable.id, fixtureIds),
            ),
          )
      : Promise.resolve([]),
    matchIds.length
      ? db
          .select({
            id: juniorMatchesTable.id,
            ageGroup: juniorMatchesTable.ageGroup,
            teamName: juniorMatchesTable.teamName,
          })
          .from(juniorMatchesTable)
          .where(
            and(
              eq(juniorMatchesTable.tenantId, tenantId),
              inArray(juniorMatchesTable.id, matchIds),
            ),
          )
      : Promise.resolve([]),
  ]);
  const fixtureTeam = new Map(fixtures.map((f) => [f.id, f]));
  const matchTeam = new Map(matches.map((m) => [m.id, m]));
  const out = new Map<number, { ageGroup: string | null; teamName: string | null }>();
  for (const d of drafts) {
    const fixtureId = juniorTeamListFixtureIdOf(d.sourceKey);
    const matchId = syncedJuniorMatchIdOf(d.sourceKey);
    const team =
      (fixtureId !== null ? fixtureTeam.get(fixtureId) : undefined) ??
      (matchId !== null ? matchTeam.get(matchId) : undefined);
    if (team) out.set(d.id, { ageGroup: team.ageGroup, teamName: team.teamName });
  }
  return out;
}

/**
 * Bring each unposted synced junior draft's timing in line with junior sync and its
 * team's publishing setting (KTD14, KTD15). Runs every sweep, so a changed team setting
 * reaches that team's queued drafts on the next one.
 */
export async function retimeJuniorDrafts(
  tenantId: number,
  syncEnabled: boolean,
  drafts?: readonly SocialDraftRow[],
  logger?: Logger,
): Promise<{ held: number; retimed: number }> {
  const list = drafts ?? (await unpostedSyncedJuniorDrafts(tenantId));
  const out = { held: 0, retimed: 0 };
  if (list.length === 0) return out;
  const [publishing, teams] = syncEnabled
    ? await Promise.all([loadJuniorTeamPublishing(tenantId), draftTeams(tenantId, list)])
    : [{}, new Map<number, { ageGroup: string | null; teamName: string | null }>()];
  await eachJuniorDraft(
    list,
    async (d) => {
      const team = teams.get(d.id);
      const action = juniorRetimeAction({
        syncEnabled,
        mode: juniorTeamPublishMode(publishing, team?.ageGroup, team?.teamName),
        status: d.status,
        autoReadyAt: d.autoReadyAt,
        untouched:
          d.reviewedAt == null &&
          d.editedAt == null &&
          d.designEditedAt == null &&
          d.createdByAdminId == null,
      });
      if (action === "hold") {
        // Already in review with no deadline: nothing to write on the draft, but with sync
        // switched off its scheduled posts are still cancelled (R23).
        if (d.status !== "ready" && d.autoReadyAt == null) {
          if (!syncEnabled) await cancelDraftPublications(d.tenantId, d.id, "Junior sync is off.");
          return;
        }
        if (
          await holdDraft(
            d,
            syncEnabled ? "This junior team needs an admin's approval." : "Junior sync is off.",
          )
        )
          out.held++;
      } else if (action === "clear" || action === "set") {
        const autoReadyAt =
          action === "set"
            ? await autoReadyAtFor(tenantId, d.sourceImportedAt ?? d.createdAt)
            : null;
        const updated = await db
          .update(socialDraftsTable)
          .set({ autoReadyAt })
          .where(
            and(
              eq(socialDraftsTable.id, d.id),
              eq(socialDraftsTable.tenantId, tenantId),
              eq(socialDraftsTable.status, "awaiting_review"),
            ),
          )
          .returning({ id: socialDraftsTable.id });
        out.retimed += updated.length;
      }
    },
    logger,
  );
  return out;
}

/** The Perth calendar date (YYYY-MM-DD) of an instant — junior match dates are Perth dates. */
function perthDay(t: Date): string {
  const day = perthDate(t);
  if (day === null) throw new RangeError("Invalid time value");
  return day;
}

/**
 * Synced junior matches due a result card: scored (only scored matches become
 * `junior_matches` rows, KTD10), finished (not in progress), dated within the last 21
 * days. Tenant-scoped; the sync id band only.
 */
export async function recentSyncedJuniorMatchIds(tenantId: number, now: Date): Promise<number[]> {
  const rows = await db
    .select({ id: juniorMatchesTable.id })
    .from(juniorMatchesTable)
    .where(
      and(
        eq(juniorMatchesTable.tenantId, tenantId),
        gte(juniorMatchesTable.id, JUNIOR_SYNC_ID_START),
        ne(juniorMatchesTable.status, "IN_PROGRESS"),
        gte(
          juniorMatchesTable.matchDate,
          perthDay(new Date(now.getTime() - JUNIOR_RESULTS_RECENT_MS)),
        ),
        lte(juniorMatchesTable.matchDate, perthDay(now)),
      ),
    );
  return rows.map((r) => r.id);
}

/** The junior part of one tenant's drafting sweep. Each step's failure is logged, never thrown. */
export async function runJuniorSocialSweep(
  tenantId: number,
  kind: "scheduled" | "fixtures",
  now: Date,
  logger: Logger,
): Promise<JuniorSweepSummary> {
  const summary: JuniorSweepSummary = {
    enabled: false,
    teamLists: 0,
    results: 0,
    bigMoments: 0,
    held: 0,
    retimed: 0,
  };
  summary.enabled = await tenantJuniorSyncEnabled(tenantId);
  const drafts = await unpostedSyncedJuniorDrafts(tenantId);

  try {
    const timing = await retimeJuniorDrafts(tenantId, summary.enabled, drafts, logger);
    summary.held = timing.held;
    summary.retimed = timing.retimed;
  } catch (err) {
    logger.error({ tenantId, error: safeError(err) }, "junior draft re-timing failed");
  }
  if (!summary.enabled) return summary;

  try {
    const rerender = drafts.flatMap((d) => juniorTeamListFixtureIdOf(d.sourceKey) ?? []);
    summary.teamLists = (await generateJuniorTeamListDrafts(tenantId, now, rerender)).drafted;
  } catch (err) {
    logger.error({ tenantId, error: safeError(err) }, "junior team-list drafts failed");
  }

  if (kind === "scheduled") {
    try {
      const ids = new Set(await recentSyncedJuniorMatchIds(tenantId, now));
      for (const d of drafts) {
        const id = syncedJuniorMatchIdOf(d.sourceKey);
        if (id !== null) ids.add(id);
      }
      const result = await generateJuniorMatchSummaryDrafts(tenantId, [...ids], { synced: true });
      summary.results = result.drafted;
      if (result.errors.length) {
        logger.warn(
          { tenantId, errors: result.errors.map((e) => safeError(new Error(e))) },
          "junior result drafts had errors",
        );
      }
      // Junior Big Moments from the same matches (plan 2026-10-15-001 U4).
      try {
        summary.bigMoments = (await generateJuniorBigMomentDrafts(tenantId, [...ids], now)).drafted;
      } catch (err) {
        logger.error({ tenantId, error: safeError(err) }, "junior big moment drafts failed");
      }
    } catch (err) {
      logger.error({ tenantId, error: safeError(err) }, "junior result drafts failed");
    }
  }
  return summary;
}
