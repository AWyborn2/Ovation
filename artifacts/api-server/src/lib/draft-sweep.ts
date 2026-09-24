import { eq } from "drizzle-orm";
import { db, socialSettingsTable } from "@workspace/db";
import {
  runPostCommitSocial,
  runBatchPostCommitSocial,
  type PostCommitSocialOpts,
  type BatchPostCommitSocialOpts,
  type Logger as PostCommitLogger,
} from "./post-commit-social";

import { generateMatchSummaryDrafts } from "./match-summary-drafter";
import { generateMatchDayDrafts } from "./engines/match-day";
import { generateTeamListDrafts } from "./engines/team-list";
import { ensureSettings } from "./social-cards-helpers";
import { tenantIsCentral, getTenantCentralClubId } from "./tenant";

type Logger = PostCommitLogger & {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * One drafting sweep for every club type (Social Studio, KTD10).
 *
 * - `import` / `batch`: a native import just committed — the post-commit
 *   engines run against the tenant's own tables.
 * - `scheduled`: the periodic job. A central-data club drafts match summaries
 *   for central matches past its watermark; every club gets its match-day and
 *   team-list cards.
 * - `fixtures`: the fixtures projection just refreshed a tenant's schedule —
 *   only the fixture-driven engines run.
 *
 * Every engine writes through source keys, so running a sweep twice drafts
 * nothing new.
 */
export type SweepScope =
  | ({ kind: "import" } & Omit<PostCommitSocialOpts, "tenantId" | "logger">)
  | ({ kind: "batch" } & Omit<BatchPostCommitSocialOpts, "tenantId" | "logger">)
  | { kind: "scheduled"; now?: Date }
  | { kind: "fixtures"; now?: Date };

export type SweepSummary = {
  centralMatches: number;
  matchSummaries: number;
  matchDay: number;
  teamLists: number;
};

/** Most central matches drafted in one sweep. */
export const CENTRAL_SWEEP_LIMIT = 40;

/**
 * A central match dated further back than this is history, not news — even if
 * its id is past the watermark (e.g. a reload of the central dataset).
 */
export const CENTRAL_RECENT_MS = 21 * 24 * 60 * 60 * 1000;

export async function runDraftSweep(
  tenantId: number,
  scope: SweepScope,
  logger: Logger,
): Promise<SweepSummary> {
  const summary: SweepSummary = { centralMatches: 0, matchSummaries: 0, matchDay: 0, teamLists: 0 };

  if (scope.kind === "import") {
    const { kind: _kind, ...opts } = scope;
    await runPostCommitSocial({ ...opts, tenantId, logger });
    return summary;
  }
  if (scope.kind === "batch") {
    const { kind: _kind, ...opts } = scope;
    await runBatchPostCommitSocial({ ...opts, tenantId, logger });
    return summary;
  }

  const now = scope.now ?? new Date();
  if (scope.kind === "scheduled" && (await tenantIsCentral(tenantId))) {
    try {
      const central = await sweepCentralMatches(tenantId, now, logger);
      summary.centralMatches = central.seen;
      summary.matchSummaries = central.drafted;
    } catch (err) {
      logger.error({ err, tenantId }, "central draft sweep failed");
    }
  }

  try {
    summary.matchDay = (await generateMatchDayDrafts(tenantId, now)).drafted;
  } catch (err) {
    logger.error({ err, tenantId }, "match-day drafts failed");
  }
  try {
    summary.teamLists = (await generateTeamListDrafts(tenantId, now)).drafted;
  } catch (err) {
    logger.error({ err, tenantId }, "team-list drafts failed");
  }

  if (scope.kind === "scheduled") {
    await db
      .update(socialSettingsTable)
      .set({ lastSweepAt: now })
      .where(eq(socialSettingsTable.tenantId, tenantId));
  }
  return summary;
}

/**
 * Draft match summaries for a central-data club's matches past its watermark,
 * then advance the watermark. The first sweep only records the club's newest
 * match, so switching drafting on never floods the queue with history.
 */
export async function sweepCentralMatches(
  tenantId: number,
  now: Date,
  logger: Logger,
): Promise<{ seen: number; drafted: number }> {
  const { centralClubMaxMatchId, centralClubMatchesAfter } =
    await import("@workspace/db/central-queries");
  const settings = await ensureSettings(tenantId);
  const clubId = await getTenantCentralClubId(tenantId);

  if (settings.centralSweepWatermark == null) {
    await setWatermark(tenantId, await centralClubMaxMatchId(clubId));
    return { seen: 0, drafted: 0 };
  }

  const { matches, lastSeenId } = await centralClubMatchesAfter(
    clubId,
    settings.centralSweepWatermark,
    CENTRAL_SWEEP_LIMIT,
  );
  if (lastSeenId == null) return { seen: 0, drafted: 0 };

  const recent = matches.filter((m) => {
    const t = m.matchDate ? Date.parse(m.matchDate) : NaN;
    return Number.isNaN(t) || now.getTime() - t <= CENTRAL_RECENT_MS;
  });
  if (recent.length < matches.length) {
    logger.info(
      { tenantId, skipped: matches.length - recent.length },
      "central sweep skipped matches dated outside the recent window",
    );
  }

  const result = await generateMatchSummaryDrafts(
    tenantId,
    recent.map((m) => m.matchId),
    { kind: "central", clubId, seenAt: now },
  );
  if (result.errors.length > 0) {
    logger.warn({ tenantId, errors: result.errors }, "central match summary drafts had errors");
  }
  await setWatermark(tenantId, lastSeenId);
  return { seen: matches.length, drafted: result.drafted };
}

async function setWatermark(tenantId: number, matchId: number): Promise<void> {
  await db
    .update(socialSettingsTable)
    .set({ centralSweepWatermark: matchId })
    .where(eq(socialSettingsTable.tenantId, tenantId));
}
