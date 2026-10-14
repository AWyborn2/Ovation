/**
 * Match-summary auto-draft engine — generates a matchSummary social-card draft
 * for each committed match scorecard. Drafts land in the social_drafts queue
 * for admin review, same as the existing milestone/roundup/recap engines.
 *
 * Two entry points:
 *   - `generateMatchSummaryDrafts`  — senior matches
 *   - `generateJuniorMatchSummaryDrafts` — junior matches
 *
 * Both are idempotent: re-ingesting a match upserts the card input on the
 * existing draft (if it hasn't been dismissed) rather than creating a duplicate.
 */

import {
  db,
  clubsTable,
  socialDraftsTable,
  socialSettingsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
} from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import type { MatchDetail, JuniorMatchDetail } from "@workspace/api-zod";
import { matchToSummaryInput, juniorMatchToSummaryInput } from "@workspace/scorecard";
import { getTenantBrand } from "./tenant-brand";
import { familyAllows, resolveFamilyConfig } from "./social-families";
import { loadMatchDetail, loadCentralMatchDetail } from "./match-detail";
import { overlayNativeOpponents } from "./club-brand";
import {
  loadJuniorNaming,
  loadJuniorTeamPublishing,
  splitScores,
  type JuniorNaming,
} from "./junior-helpers";
import {
  juniorFamilyAllows,
  juniorResultAutoReady,
  juniorTeamPublishMode,
} from "./junior-publishing";
import {
  draftKeys,
  findDraftByKey,
  upsertDraftByKey,
  type DraftUpsertResult,
} from "./draft-upsert";
import { topPerformerPlayerId } from "./match-top-performer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DraftResult = { drafted: number; skipped: number; errors: string[] };

type SocialSettings = typeof socialSettingsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function loadSocialSettings(tenantId: number): Promise<SocialSettings | null> {
  const [row] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return row ?? null;
}

/**
 * Should a draft be generated for this grade? Follows the "results" family
 * (lib/social-families.ts), which a tenant that never saved family switches
 * derives from engineMatchSummary + matchSummaryGradeConfig. False when:
 *   - The results family is OFF
 *   - The grade is explicitly disabled
 *   - The grade has no override AND the default for the match type
 *     (senior/junior) is OFF
 *
 * Default: senior ON, junior OFF (junior content is opt-in per grade).
 */
export function shouldDraftGrade(
  settings: SocialSettings | null,
  grade: string | null,
  junior: boolean,
): boolean {
  if (!settings) return false;
  return familyAllows(resolveFamilyConfig(settings), "results", grade, junior);
}

// ---------------------------------------------------------------------------
// Junior match loader — sanctioned cross-boundary read.
// The social-drafts engine reads junior_* tables directly (rather than going
// through /api/juniors routes) because it runs server-side in a batch context
// with no HTTP request. This is the ONLY non-juniors-route consumer of these
// tables; the isolation invariant (junior tables never blended with senior
// stats) is preserved because the output feeds juniorMatchToSummaryInput which
// produces a card marked junior:true, rendered in the distinct brown palette.
// ---------------------------------------------------------------------------

/**
 * Load a junior match in the JuniorMatchDetail shape needed by
 * `juniorMatchToSummaryInput`. Returns null when the match doesn't exist.
 *
 * Card names use the club's public naming (KTD12): withheld private players,
 * the club's style for its own side, initials for the opposition. A batch caller
 * may pass a club-wide `naming` loaded once; otherwise it is loaded for the
 * match's participants.
 */
export async function loadJuniorMatchDetail(
  matchId: number,
  tenantId: number,
  preloadedNaming?: JuniorNaming,
) {
  const [matchRow] = await db
    .select({
      match: juniorMatchesTable,
      opponentClubId: clubsTable.id,
      opponentClubName: clubsTable.name,
      opponentClubShortName: clubsTable.shortName,
      opponentClubLogoUrl: clubsTable.logoUrl,
      opponentClubLogoUrl128: clubsTable.logoUrl128,
      opponentClubBackgroundColour: clubsTable.backgroundColour,
      opponentClubPrimaryColour: clubsTable.primaryColour,
    })
    .from(juniorMatchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, juniorMatchesTable.opponentClubId))
    .where(and(eq(juniorMatchesTable.id, matchId), eq(juniorMatchesTable.tenantId, tenantId)));

  if (!matchRow) return null;
  const match = matchRow.match;

  const opponentClubRaw =
    matchRow.opponentClubId != null && matchRow.opponentClubName != null
      ? {
          id: matchRow.opponentClubId,
          name: matchRow.opponentClubName,
          shortName: matchRow.opponentClubShortName,
          logoUrl: matchRow.opponentClubLogoUrl,
          logoUrl128: matchRow.opponentClubLogoUrl128,
          backgroundColour: matchRow.opponentClubBackgroundColour,
          primaryColour: matchRow.opponentClubPrimaryColour,
        }
      : null;
  const [opponentClub] = await overlayNativeOpponents([opponentClubRaw]);

  const [battingRows, bowlingRows, rosterRows] = await Promise.all([
    db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.matchId, matchId))
      .orderBy(juniorMatchBattingTable.innings, juniorMatchBattingTable.batOrder),
    db
      .select()
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.matchId, matchId))
      .orderBy(juniorMatchBowlingTable.innings, juniorMatchBowlingTable.id),
    db
      .select()
      .from(juniorMatchRostersTable)
      .where(eq(juniorMatchRostersTable.matchId, matchId))
      .orderBy(juniorMatchRostersTable.id),
  ]);
  const naming =
    preloadedNaming ??
    (await loadJuniorNaming(tenantId, [
      ...battingRows.map((r) => r.participantId),
      ...bowlingRows.map((r) => r.participantId),
      ...rosterRows.map((r) => r.participantId),
    ]));

  const battingLine = (b: typeof juniorMatchBattingTable.$inferSelect) => {
    return {
      id: b.id,
      ...naming.line(b),
      isHallsHead: b.isHallsHead,
      batOrder: b.batOrder,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.strikeRate,
      // Mode only: the card JSON never carries the fielder or bowler PlayHQ names.
      dismissal: naming.dismissal(b.dismissal),
    };
  };
  const bowlingLine = (b: typeof juniorMatchBowlingTable.$inferSelect) => {
    return {
      id: b.id,
      ...naming.line(b),
      isHallsHead: b.isHallsHead,
      overs: b.overs,
      maidens: b.maidens,
      runs: b.runs,
      wickets: b.wickets,
      economy: b.economy,
      wides: b.wides,
      noBalls: b.noBalls,
    };
  };

  const inningsNums = Array.from(
    new Set([...battingRows.map((b) => b.innings ?? 1), ...bowlingRows.map((b) => b.innings ?? 1)]),
  ).sort((a, b) => a - b);

  const innings = inningsNums.map((n) => {
    const bats = battingRows.filter((b) => (b.innings ?? 1) === n);
    const bowls = bowlingRows.filter((b) => (b.innings ?? 1) === n);
    return {
      innings: n,
      battingTeam: bats[0]?.battingTeam ?? null,
      isHallsHead: bats[0]?.isHallsHead ?? false,
      batting: bats.map(battingLine),
      bowling: bowls.map(bowlingLine),
    };
  });

  const rosters = rosterRows.map((r) => ({
    id: r.id,
    ...naming.line(r),
    teamName: r.teamName,
    isHallsHead: r.isHallsHead,
  }));

  const { hhScore, opponentScore } = splitScores(match);

  return {
    id: match.id,
    playhqMatchId: match.playhqMatchId,
    season: match.season,
    grade: match.grade,
    ageGroup: match.ageGroup,
    teamName: match.teamName,
    competition: match.competition,
    association: match.association,
    round: match.round,
    matchDate: match.matchDate,
    venue: match.venue,
    venueOval: match.venueOval,
    venueAddress: match.venueAddress,
    venueSuburb: match.venueSuburb,
    status: match.status,
    opponentName: match.opponentName,
    hhResult: match.hhResult,
    winner: match.winner,
    tossWinner: match.tossWinner,
    hhBattedFirst: match.hhBattedFirst,
    hhScore,
    opponentScore,
    team1: match.team1,
    team2: match.team2,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    opponentClub,
    innings,
    rosters,
  };
}

// ---------------------------------------------------------------------------
// Draft upsert — insert new or update existing (re-ingest regeneration)
// ---------------------------------------------------------------------------

/**
 * A keyed upsert only counts as drafted when it wrote a card (new or
 * refreshed). Re-running over matches whose cards are unchanged — or already
 * posted — drafts nothing, so a repeat backfill reports 0.
 */
function draftOutcome(result: DraftUpsertResult | undefined): "drafted" | "skipped" {
  return result && (result.action === "unchanged" || result.action === "stale")
    ? "skipped"
    : "drafted";
}

async function upsertDraft(
  tenantId: number,
  matchId: number,
  junior: boolean,
  cardInput: Record<string, unknown>,
  appPath: string,
  opts: {
    central?: { seenAt: Date };
    grade?: string | null;
    featuredPlayerId?: number | null;
    /** `false`: never auto-ready (a junior team not set to auto-post, KTD14). */
    autoReady?: boolean;
  } = {},
): Promise<"drafted" | "skipped"> {
  const { central, grade, featuredPlayerId, autoReady } = opts;
  // Re-ingest refreshes the existing draft (keeping a revision), a posted draft
  // is only marked stale, and unchanged input is a no-op (KTD3).
  if (central) {
    // Central match ids are central's own, so they get their own key space and
    // no native source-match link. The import time is when the sweep first saw
    // the match (KTD10).
    const result = await upsertDraftByKey({
      tenantId,
      engine: "matchSummary",
      family: "results",
      sourceKey: draftKeys.centralMatchSummary(matchId),
      cardInput,
      appPath,
      sourceKind: "matchSummary",
      sourceImportedAt: central.seenAt,
      grade,
      featuredPlayerId,
    });
    return draftOutcome(result);
  }
  const result = await upsertDraftByKey({
    tenantId,
    engine: "matchSummary",
    family: "results",
    sourceKey: draftKeys.matchSummary(matchId, junior),
    cardInput,
    appPath,
    sourceKind: "matchSummary",
    sourceMatchId: matchId,
    sourceMatchIsJunior: junior,
    grade,
    featuredPlayerId,
    ...(autoReady === false ? { autoReady: false } : {}),
    // Drafts from before source keys existed: find them by match and backfill.
    findLegacy: async () => {
      const [legacy] = await db
        .select()
        .from(socialDraftsTable)
        .where(
          and(
            eq(socialDraftsTable.tenantId, tenantId),
            eq(socialDraftsTable.sourceKind, "matchSummary"),
            eq(socialDraftsTable.sourceMatchId, matchId),
            eq(socialDraftsTable.sourceMatchIsJunior, junior),
            ne(socialDraftsTable.status, "dismissed"),
          ),
        );
      return legacy ?? null;
    },
  });
  return draftOutcome(result);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Where senior match ids come from: the tenant's own match tables, or the
 * central database for a central-data club (ids are central match ids; the
 * scorecard's own side is mapped to app player ids through the crosswalk).
 */
export type MatchSummarySource =
  { kind: "native" } | { kind: "central"; clubId: number; seenAt: Date };

/**
 * Generate match-summary social-card drafts for senior matches.
 *
 * For each match: loads the full scorecard, checks grade config, dedupes,
 * builds the card input via `matchToSummaryInput`, and upserts a draft row.
 */
export async function generateMatchSummaryDrafts(
  tenantId: number,
  matchIds: number[],
  source: MatchSummarySource = { kind: "native" },
): Promise<DraftResult> {
  const result: DraftResult = { drafted: 0, skipped: 0, errors: [] };
  if (matchIds.length === 0) return result;

  const settings = await loadSocialSettings(tenantId);
  if (!resolveFamilyConfig(settings).results.enabled) {
    result.skipped = matchIds.length;
    return result;
  }

  const BATCH = 10;
  for (let i = 0; i < matchIds.length; i += BATCH) {
    const batch = matchIds.slice(i, i + BATCH);
    const outcomes = await Promise.allSettled(
      batch.map(async (matchId) => {
        const detail =
          source.kind === "central"
            ? await loadCentralMatchDetail({ tenantId, clubId: source.clubId }, matchId)
            : await loadMatchDetail(matchId, tenantId);
        if (!detail) {
          result.skipped++;
          return;
        }
        if (!shouldDraftGrade(settings, detail.grade, false)) {
          result.skipped++;
          return;
        }
        const cardInput = matchToSummaryInput(detail as MatchDetail);
        const outcome = await upsertDraft(
          tenantId,
          matchId,
          false,
          cardInput as Record<string, unknown>,
          `/matches/${matchId}`,
          {
            central: source.kind === "central" ? { seenAt: source.seenAt } : undefined,
            grade: detail.grade,
            // The club's top performer, for a "player" card photo rule.
            featuredPlayerId: topPerformerPlayerId(detail.lines),
          },
        );
        if (outcome === "drafted") result.drafted++;
        else result.skipped++;
      }),
    );
    for (const o of outcomes) {
      if (o.status === "rejected") {
        result.errors.push(o.reason instanceof Error ? o.reason.message : String(o.reason));
      }
    }
  }

  return result;
}

/**
 * "Stumps, Day 1" cards for a central-data club's two-day games in progress (Ash, 5 Oct 2026).
 * The match result card with the day-1 scores and a "Stumps, Day 1" headline, drafted once — the
 * first sweep after day 1 — and never refreshed, so day-2 play can't rewrite it. The result card
 * follows when the match is completed. Gated like result cards (results family + grade).
 */
export async function generateCentralStumpsDrafts(
  tenantId: number,
  clubId: number,
  matchIds: number[],
  seenAt: Date,
): Promise<DraftResult> {
  const result: DraftResult = { drafted: 0, skipped: 0, errors: [] };
  if (matchIds.length === 0) return result;
  const settings = await loadSocialSettings(tenantId);
  if (!resolveFamilyConfig(settings).results.enabled) {
    result.skipped = matchIds.length;
    return result;
  }
  for (const matchId of matchIds) {
    try {
      const sourceKey = draftKeys.centralStumps(matchId);
      if (await findDraftByKey(tenantId, sourceKey)) {
        result.skipped++;
        continue;
      }
      const detail = await loadCentralMatchDetail({ tenantId, clubId }, matchId);
      if (!detail || !shouldDraftGrade(settings, detail.grade, false)) {
        result.skipped++;
        continue;
      }
      const cardInput = {
        ...matchToSummaryInput(detail as unknown as MatchDetail),
        result: "Stumps, Day 1",
        resultWinner: "draw" as const,
      };
      await upsertDraftByKey({
        tenantId,
        engine: "matchSummary",
        family: "results",
        sourceKey,
        cardInput: cardInput as Record<string, unknown>,
        appPath: `/matches/${matchId}`,
        sourceKind: "matchSummary",
        sourceImportedAt: seenAt,
        grade: detail.grade,
        featuredPlayerId: topPerformerPlayerId(detail.lines),
      });
      result.drafted++;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}

/**
 * Generate match-summary social-card drafts for junior matches.
 *
 * Same flow as senior but uses the junior scorecard builder, defaults to OFF
 * per grade (juniors are opt-in), and links to the /juniors/matches/:id page.
 *
 * `synced` (the scheduled sweep's junior PlayHQ sync matches, plan U8): within an
 * enabled results family an age group drafts unless the club turned it off.
 *
 * Every synced junior result card follows its team's publishing setting (KTD14): only a
 * team explicitly set to auto-post gets an auto-ready time. Loader-era cards keep the
 * previous behaviour.
 */
export async function generateJuniorMatchSummaryDrafts(
  tenantId: number,
  matchIds: number[],
  opts: { synced?: boolean } = {},
): Promise<DraftResult> {
  const result: DraftResult = { drafted: 0, skipped: 0, errors: [] };
  if (matchIds.length === 0) return result;

  const settings = await loadSocialSettings(tenantId);
  if (!resolveFamilyConfig(settings).results.enabled) {
    result.skipped = matchIds.length;
    return result;
  }

  const families = resolveFamilyConfig(settings);
  const brand = await getTenantBrand(tenantId);
  // Club-wide naming loaded once for the batch (KTD12), and the per-team publishing map.
  const [naming, publishing] = await Promise.all([
    loadJuniorNaming(tenantId),
    loadJuniorTeamPublishing(tenantId),
  ]);

  const BATCH = 10;
  for (let i = 0; i < matchIds.length; i += BATCH) {
    const batch = matchIds.slice(i, i + BATCH);
    const outcomes = await Promise.allSettled(
      batch.map(async (matchId) => {
        const detail = await loadJuniorMatchDetail(matchId, tenantId, naming);
        if (!detail) {
          result.skipped++;
          return;
        }
        const grade = detail.ageGroup ?? detail.grade;
        const allowed = opts.synced
          ? juniorFamilyAllows(families, "results", grade)
          : shouldDraftGrade(settings, grade, true);
        if (!allowed) {
          result.skipped++;
          return;
        }
        const cardInput = juniorMatchToSummaryInput(detail as JuniorMatchDetail, brand);
        const mode = juniorTeamPublishMode(publishing, detail.ageGroup, detail.teamName);
        const outcome = await upsertDraft(
          tenantId,
          matchId,
          true,
          cardInput as Record<string, unknown>,
          `/juniors/matches/${matchId}`,
          // A synced card follows its team's mode; a loader-era card keeps auto-ready.
          { autoReady: juniorResultAutoReady(matchId, mode) },
        );
        if (outcome === "drafted") result.drafted++;
        else result.skipped++;
      }),
    );
    for (const o of outcomes) {
      if (o.status === "rejected") {
        result.errors.push(o.reason instanceof Error ? o.reason.message : String(o.reason));
      }
    }
  }

  return result;
}
