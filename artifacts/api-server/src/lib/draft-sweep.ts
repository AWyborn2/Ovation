import { and, desc, eq, isNull } from "drizzle-orm";
import { db, matchesTable, socialSettingsTable, tenantsTable } from "@workspace/db";
import { notEmptyFixture } from "./grades-helpers";
import {
  runPostCommitSocial,
  runBatchPostCommitSocial,
  type PostCommitSocialOpts,
  type BatchPostCommitSocialOpts,
  type Logger as PostCommitLogger,
} from "./post-commit-social";

import {
  generateCentralStumpsDrafts,
  generateMatchSummaryDrafts,
  type MatchSummarySource,
} from "./match-summary-drafter";
import { generateMatchDayDrafts } from "./engines/match-day";
import { generateTeamListDrafts } from "./engines/team-list";
import {
  generateRoundGameDayDrafts,
  generateRoundTeamListDrafts,
  generateWeekendWrapDrafts,
} from "./engines/round-sets";
import { ensureSettings } from "./social-cards-helpers";
import { familyAllows, resolveFamilyConfig } from "./social-families";
import { generateRoundUpDrafts } from "./roundup";
import { tenantIsCentral, getTenantCentralClubId, NATIVE_STATS_TENANT_ID } from "./tenant";
import { loadAutoPost, persistDueDrafts } from "./effective-draft-state";
import { notifyDraftsReady } from "./draft-notifications";
import { runPublishSweep } from "./publishing/publish-worker";
import { scheduleAutoPublish } from "./publishing/auto-publish";
import { checkConnectionHealth } from "./publishing/connection-health";
import { fillMissingDraftPhotos } from "./draft-enrich";
import { draftCentralAchievements } from "./central-achievements";
import { syncDebutCaps } from "./debut-caps";
import { matchResultCardsOn, resolveRoundSchedules } from "./round-schedules";
import { runAvailabilitySchedule } from "./availability-schedule";

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
 *   and achievement cards (centuries, five-fors, debuts, career milestones)
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
  /** Century / five-for / debut / milestone cards drafted from central matches. */
  achievements: number;
  matchDay: number;
  teamLists: number;
  /** Round sets drafted on the club's schedule (game day, team lists, weekend wrap). */
  roundSets: number;
  /** Drafts moved to ready because their auto-post deadline passed. */
  promoted: number;
  /** A Grade / Female A Grade debut caps issued (debut-caps.ts). */
  debutCaps?: number;
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
  const summary: SweepSummary = {
    centralMatches: 0,
    matchSummaries: 0,
    achievements: 0,
    matchDay: 0,
    teamLists: 0,
    roundSets: 0,
    promoted: 0,
  };

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
  // Debut caps first, so a debut card drafted below can carry the new number.
  // Only recent debuts mint here; older ones wait for the catch-up script.
  if (scope.kind === "scheduled") {
    try {
      const caps = await syncDebutCaps(tenantId, {
        since: perthDay(new Date(now.getTime() - CENTRAL_RECENT_MS)),
        commit: true,
      });
      summary.debutCaps = caps.minted;
      for (const p of caps.plans) {
        if (p.toMint.length) {
          logger.info({ tenantId, category: p.category, caps: p.toMint }, "debut caps issued");
        }
        if (p.held && p.awaitingCatchUp.length) {
          logger.warn({ tenantId, category: p.category, held: p.held }, "debut caps held");
        }
      }
    } catch (err) {
      logger.error({ err, tenantId }, "debut caps failed");
    }
    // Player availability (plan 2026-10-06-002 U4): send, remind and cut-off on
    // the club's schedule. A no-op unless the club has switched it on.
    try {
      const avail = await runAvailabilitySchedule(tenantId, now, { logger });
      if (avail.ran.length || avail.retried) {
        logger.info(
          { tenantId, roundId: avail.roundId, ran: avail.ran, retried: avail.retried },
          "availability round",
        );
      }
    } catch (err) {
      logger.error({ err, tenantId }, "availability schedule failed");
    }
  }
  if (scope.kind === "scheduled" && (await tenantIsCentral(tenantId))) {
    try {
      const central = await sweepCentralMatches(tenantId, now, logger);
      summary.centralMatches = central.seen;
      summary.matchSummaries = central.drafted;
      summary.achievements = central.achievements;
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

  // Round sets on the club's schedule. The weekend wrap reads results, so it
  // only runs on the scheduled sweep, not on a fixtures refresh.
  const roundEngines = [generateRoundGameDayDrafts, generateRoundTeamListDrafts];
  if (scope.kind === "scheduled") roundEngines.push(generateWeekendWrapDrafts);
  for (const engine of roundEngines) {
    try {
      summary.roundSets += (await engine(tenantId, now)).drafted;
    } catch (err) {
      logger.error({ err, tenantId, engine: engine.name }, "round set drafts failed");
    }
  }

  try {
    await fillMissingDraftPhotos(tenantId);
  } catch (err) {
    logger.error({ err, tenantId }, "draft photo fill failed");
  }

  if (scope.kind === "scheduled") {
    // Auto-post (KTD4): store what already reads as ready, then tell the club
    // once for the whole batch. With auto-publish on, fresh drafts are
    // scheduled to Facebook / Instagram instead and skip the notice.
    try {
      if ((await loadAutoPost(tenantId)).enabled) {
        const promoted = await persistDueDrafts(tenantId, now);
        summary.promoted = promoted.length;
        const autoPublished = await scheduleAutoPublish(tenantId, now);
        await notifyDraftsReady(
          tenantId,
          promoted.filter((id) => !autoPublished.has(id)),
          logger,
        );
      }
    } catch (err) {
      logger.error({ err, tenantId }, "auto-post promotion failed");
    }
    // Meta publishing: the daily connection check first (a revoked token
    // holds posts instead of failing them), then anything due goes out now
    // rather than waiting for the five-minute publish job. Both are no-ops
    // while publishing is off.
    try {
      await checkConnectionHealth(tenantId, now, logger);
    } catch (err) {
      logger.error({ err, tenantId }, "meta health check failed");
    }
    try {
      await runPublishSweep({ tenantId, now }, logger);
    } catch (err) {
      logger.error({ err, tenantId }, "publish sweep failed");
    }
    await db
      .update(socialSettingsTable)
      .set({ lastSweepAt: now })
      .where(eq(socialSettingsTable.tenantId, tenantId));
  }
  return summary;
}

export type TenantSweepResult = { tenantId: number; ok: boolean } & SweepSummary;

/**
 * Sweep one tenant, or every active (not suspended) tenant when `tenantId` is null. A
 * tenant whose sweep throws is logged and reported `ok: false`; the rest still run. Shared
 * by `POST /internal/draft-sweep` and the PlayHQ runner's hourly `POST /internal/playhq/sweep`.
 * `null` when the one tenant asked for does not exist.
 */
export async function sweepTenants(
  tenantId: number | null,
  scope: "scheduled" | "fixtures",
  logger: Logger,
): Promise<TenantSweepResult[] | null> {
  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(tenantId != null ? eq(tenantsTable.id, tenantId) : isNull(tenantsTable.suspendedAt));
  if (tenantId != null && tenants.length === 0) return null;
  const results: TenantSweepResult[] = [];
  for (const t of tenants) {
    try {
      const summary = await runDraftSweep(t.id, { kind: scope }, logger);
      results.push({ tenantId: t.id, ok: true, ...summary });
    } catch (err) {
      logger.error({ err, tenantId: t.id }, "draft sweep failed");
      results.push({
        tenantId: t.id,
        ok: false,
        centralMatches: 0,
        matchSummaries: 0,
        achievements: 0,
        matchDay: 0,
        teamLists: 0,
        roundSets: 0,
        promoted: 0,
      });
    }
  }
  return results;
}

/** The Perth calendar date (YYYY-MM-DD) of an instant — central match dates are Perth dates. */
function perthDay(t: Date): string {
  return new Date(t.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Draft match summaries and achievement cards for a central-data club's matches
 * past its watermark, then advance the watermark. The first sweep starts the
 * watermark just before the club's earliest match in the recent window, so it
 * drafts the last few weeks' results but never floods the queue with history.
 */
export async function sweepCentralMatches(
  tenantId: number,
  now: Date,
  logger: Logger,
): Promise<{ seen: number; drafted: number; achievements: number }> {
  const { centralClubSweepStart, centralClubMatchesAfter } =
    await import("@workspace/db/central-queries");
  const settings = await ensureSettings(tenantId);
  const clubId = await getTenantCentralClubId(tenantId);

  let watermark = settings.centralSweepWatermark;
  if (watermark == null) {
    watermark = await centralClubSweepStart(
      clubId,
      perthDay(new Date(now.getTime() - CENTRAL_RECENT_MS)),
    );
    await setWatermark(tenantId, watermark);
  }

  const { matches, lastSeenId } = await centralClubMatchesAfter(
    clubId,
    watermark,
    CENTRAL_SWEEP_LIMIT,
  );
  if (lastSeenId == null) return { seen: 0, drafted: 0, achievements: 0 };

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

  // A match in progress (a two-day game between its days) counts in stats but isn't over: no
  // result card, achievements or round-up yet. A multi-day one gets its "Stumps, Day 1" card
  // once day 1 is behind us. It holds the watermark (below), so the sweep that sees it
  // completed drafts its result as new.
  const live = recent.filter((m) => m.status === "IN_PROGRESS");
  const done = recent.filter((m) => m.status !== "IN_PROGRESS");
  const today = perthDay(now);
  const stumpsDue = live.filter(
    (m) => m.compType !== "One Day" && m.compType !== "T20" && !!m.matchDate && m.matchDate < today,
  );
  if (stumpsDue.length) {
    const stumps = await generateCentralStumpsDrafts(
      tenantId,
      clubId,
      stumpsDue.map((m) => m.matchId),
      now,
    );
    if (stumps.errors.length)
      logger.warn({ tenantId, errors: stumps.errors }, "central stumps drafts had errors");
  }

  // A club posting its results as a round carousel only ("perRound") gets no per-match
  // result cards; the carousel engine drafts the round instead.
  const perMatch = matchResultCardsOn(
    resolveRoundSchedules(settings.roundSchedules).weekendWrap.mode,
  );
  const result = perMatch
    ? await generateMatchSummaryDrafts(
        tenantId,
        done.map((m) => m.matchId),
        { kind: "central", clubId, seenAt: now },
      )
    : { drafted: 0, skipped: done.length, errors: [] as string[] };
  if (result.errors.length > 0) {
    logger.warn({ tenantId, errors: result.errors }, "central match summary drafts had errors");
  }
  // Centuries, five-fors, debuts and career milestones from the same matches
  // (achievements family; the per-grade switches apply inside).
  let achievements = 0;
  try {
    achievements = (
      await draftCentralAchievements(
        tenantId,
        clubId,
        done.map((m) => m.matchId),
        now,
      )
    ).drafted;
  } catch (err) {
    logger.error({ err, tenantId }, "central achievement drafts failed");
  }
  await draftCentralRoundUps(tenantId, settings, done, logger);
  // Never past a recent match still in progress: re-reading from it is harmless (drafting is
  // keyed, unchanged cards are no-ops) and drafts its result when it completes. Matches outside
  // the recent window never hold it, so one that is never finished can't stall the sweep.
  const hold = live.length ? Math.min(...live.map((m) => m.matchId)) - 1 : null;
  await setWatermark(tenantId, hold ?? lastSeenId);
  return { seen: matches.length, drafted: result.drafted, achievements };
}

/**
 * The weekly round-up for a central-data club: once per (grade, season) that
 * just had a new match, exactly as a native import triggers one per affected
 * grade. Gated by the round-up family; keyed by the latest round, so the same
 * round refreshes its cards and the next round gets its own.
 */
async function draftCentralRoundUps(
  tenantId: number,
  settings: Parameters<typeof resolveFamilyConfig>[0],
  recent: { grade: string; season: number | null }[],
  logger: Logger,
): Promise<void> {
  const families = resolveFamilyConfig(settings);
  if (!families.roundup.enabled) return;
  const pairs = new Map<string, { grade: string; season: number }>();
  for (const m of recent) {
    if (m.season != null) pairs.set(`${m.season}|${m.grade}`, { grade: m.grade, season: m.season });
  }
  for (const { grade, season } of pairs.values()) {
    if (!familyAllows(families, "roundup", grade, false)) continue;
    try {
      await generateRoundUpDrafts(tenantId, grade, season, null);
    } catch (err) {
      logger.error({ err, tenantId, grade, season }, "central round-up drafts failed");
    }
  }
}

/** Most past matches drafted by one backfill call. */
export const BACKFILL_MATCH_LIMIT = 60;

/** What a backfill drafts: Match Result cards, achievement cards, or both. */
export type BackfillInclude = "results" | "achievements";

export type BackfillMatchesInput = {
  /** Season start year (2024 = 2024/25). */
  season: number;
  grade?: string;
  /** Only these matches — still limited to the club's own senior matches in the season. */
  matchIds?: number[];
  /** Default `["results"]`: Match Result cards only. */
  include?: BackfillInclude[];
};

export type BackfillMatchesResult = {
  considered: number;
  /** Match Result cards drafted (new or refreshed). */
  drafted: number;
  skipped: number;
  capped: boolean;
  errors: string[];
  /** Achievement cards drafted, present when `include` asked for them. */
  achievements?: number;
};

/**
 * Draft Match Result cards for a club's PAST matches, on demand (the sweep only
 * ever drafts what's new). Candidates are the club's own senior matches for the
 * season (and grade), newest first:
 *   - a central-data club: its central matches — junior / pathway grades never
 *     map, so they never appear (juniors isolation); explicit `matchIds` are
 *     intersected with that list, so another club's match id drafts nothing;
 *   - the native club (tenant #1): its own match tables;
 *   - any other tenant: nothing (the native tables aren't theirs).
 * Drafting goes through the same engine and source keys as the sweep, so a
 * re-run refreshes nothing and adds nothing. The sweep watermark is never read
 * or moved.
 *
 * With `include: ["achievements"]` a central-data club also gets the
 * centuries, five-fors, debuts and career milestones of those matches, exactly
 * as the sweep drafts them. The native club's achievement cards come from its
 * imports (they need the pre-import career snapshot), so it drafts none here.
 */
export async function backfillMatchDrafts(
  tenantId: number,
  input: BackfillMatchesInput,
  now: Date = new Date(),
): Promise<BackfillMatchesResult> {
  const pick = (ids: number[]) => {
    const wanted = input.matchIds ? new Set(input.matchIds) : null;
    const chosen = wanted ? ids.filter((id) => wanted.has(id)) : ids;
    return {
      ids: chosen.slice(0, BACKFILL_MATCH_LIMIT),
      capped: chosen.length > BACKFILL_MATCH_LIMIT,
    };
  };

  const include = new Set<BackfillInclude>(input.include?.length ? input.include : ["results"]);
  let ids: number[];
  let capped: boolean;
  let source: MatchSummarySource;
  if (await tenantIsCentral(tenantId)) {
    const { centralClubMatches } = await import("@workspace/db/central-queries");
    const clubId = await getTenantCentralClubId(tenantId);
    const rows = await centralClubMatches(clubId, { grade: input.grade, season: input.season });
    ({ ids, capped } = pick(rows.map((r) => r.id)));
    source = { kind: "central", clubId, seenAt: now };
  } else if (tenantId === NATIVE_STATS_TENANT_ID) {
    const conditions = [eq(matchesTable.season, input.season), notEmptyFixture];
    if (input.grade) conditions.push(eq(matchesTable.grade, input.grade));
    const rows = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(and(...conditions))
      .orderBy(desc(matchesTable.id));
    ({ ids, capped } = pick(rows.map((r) => r.id)));
    source = { kind: "native" };
  } else {
    return { considered: 0, drafted: 0, skipped: 0, capped: false, errors: [] };
  }

  const result = include.has("results")
    ? await generateMatchSummaryDrafts(tenantId, ids, source)
    : { drafted: 0, skipped: 0, errors: [] as string[] };
  const out: BackfillMatchesResult = { considered: ids.length, ...result, capped };
  if (include.has("achievements")) {
    out.achievements =
      source.kind === "central"
        ? (await draftCentralAchievements(tenantId, source.clubId, ids, now)).drafted
        : 0;
  }
  return out;
}

async function setWatermark(tenantId: number, matchId: number): Promise<void> {
  await db
    .update(socialSettingsTable)
    .set({ centralSweepWatermark: matchId })
    .where(eq(socialSettingsTable.tenantId, tenantId));
}
