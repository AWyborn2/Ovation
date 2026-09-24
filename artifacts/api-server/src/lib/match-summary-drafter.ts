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
import { loadMatchDetail } from "./match-detail";
import { overlayNativeOpponents } from "./club-brand";
import { getPrivateIds, splitScores, MASK_NAME } from "./junior-helpers";
import { draftKeys, upsertDraftByKey } from "./draft-upsert";

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
 */
async function loadJuniorMatchDetail(matchId: number, tenantId: number, privateIds: Set<string>) {
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

  const isPriv = (pid: string | null) => !!pid && privateIds.has(pid);

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

  const battingLine = (b: typeof juniorMatchBattingTable.$inferSelect) => {
    const priv = isPriv(b.participantId);
    return {
      id: b.id,
      participantId: priv ? null : b.participantId,
      playerName: priv ? MASK_NAME : (b.playerName ?? ""),
      isHallsHead: b.isHallsHead,
      isPrivate: priv,
      batOrder: b.batOrder,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.strikeRate,
      dismissal: b.dismissal,
    };
  };
  const bowlingLine = (b: typeof juniorMatchBowlingTable.$inferSelect) => {
    const priv = isPriv(b.participantId);
    return {
      id: b.id,
      participantId: priv ? null : b.participantId,
      playerName: priv ? MASK_NAME : (b.playerName ?? ""),
      isHallsHead: b.isHallsHead,
      isPrivate: priv,
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

  const rosters = rosterRows.map((r) => {
    const priv = isPriv(r.participantId);
    return {
      id: r.id,
      participantId: priv ? null : r.participantId,
      playerName: priv ? MASK_NAME : (r.playerName ?? ""),
      teamName: r.teamName,
      isHallsHead: r.isHallsHead,
      isPrivate: priv,
    };
  });

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

async function upsertDraft(
  tenantId: number,
  matchId: number,
  junior: boolean,
  cardInput: Record<string, unknown>,
  appPath: string,
): Promise<"drafted" | "skipped"> {
  // Re-ingest refreshes the existing draft (keeping a revision), a posted draft
  // is only marked stale, and unchanged input is a no-op (KTD3).
  await upsertDraftByKey({
    tenantId,
    engine: "matchSummary",
    family: "results",
    sourceKey: draftKeys.matchSummary(matchId, junior),
    cardInput,
    appPath,
    sourceKind: "matchSummary",
    sourceMatchId: matchId,
    sourceMatchIsJunior: junior,
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
  return "drafted";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate match-summary social-card drafts for senior matches.
 *
 * For each match: loads the full scorecard, checks grade config, dedupes,
 * builds the card input via `matchToSummaryInput`, and upserts a draft row.
 */
export async function generateMatchSummaryDrafts(
  tenantId: number,
  matchIds: number[],
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
        const detail = await loadMatchDetail(matchId, tenantId);
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
 * Generate match-summary social-card drafts for junior matches.
 *
 * Same flow as senior but uses the junior scorecard builder, defaults to OFF
 * per grade (juniors are opt-in), and links to the /juniors/matches/:id page.
 */
export async function generateJuniorMatchSummaryDrafts(
  tenantId: number,
  matchIds: number[],
): Promise<DraftResult> {
  const result: DraftResult = { drafted: 0, skipped: 0, errors: [] };
  if (matchIds.length === 0) return result;

  const settings = await loadSocialSettings(tenantId);
  if (!resolveFamilyConfig(settings).results.enabled) {
    result.skipped = matchIds.length;
    return result;
  }

  const brand = await getTenantBrand(tenantId);
  const privateIds = await getPrivateIds(tenantId);

  const BATCH = 10;
  for (let i = 0; i < matchIds.length; i += BATCH) {
    const batch = matchIds.slice(i, i + BATCH);
    const outcomes = await Promise.allSettled(
      batch.map(async (matchId) => {
        const detail = await loadJuniorMatchDetail(matchId, tenantId, privateIds);
        if (!detail) {
          result.skipped++;
          return;
        }
        const grade = detail.ageGroup ?? detail.grade;
        if (!shouldDraftGrade(settings, grade, true)) {
          result.skipped++;
          return;
        }
        const cardInput = juniorMatchToSummaryInput(detail as JuniorMatchDetail, brand);
        const outcome = await upsertDraft(
          tenantId,
          matchId,
          true,
          cardInput as Record<string, unknown>,
          `/juniors/matches/${matchId}`,
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
