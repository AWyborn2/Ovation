import { buildJuniorScorecard, DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import type {
  Scorecard,
  ScorecardBatsman,
  ScorecardBowler,
} from "@workspace/scorecard";
import type { JuniorMatchDetail } from "@workspace/api-client-react";
import type {
  MatchSummaryTeam,
  MatchSummaryInnings,
  MatchSummaryBatter,
  MatchSummaryBowler,
  ShareCardInput,
} from "./share-card";
import { fmtJuniorDate } from "./juniors";

// Private participants are masked to this name server-side. We additionally drop
// such lines from the featured top-performer lists so a private junior is never
// celebrated on a public card (innings totals still come from the scorecard, so
// they stay correct even with the line excluded).
const MASK_NAME = "Private Player";

// Junior club brand: the brown palette is applied by the renderer; the team
// chrome (innings header bars, result banner) uses club brown so the whole card
// reads as junior content rather than the senior navy.
const JUNIOR_BROWN = "#42342B";
const JUNIOR_GOLD = "#FBAC27";

/** Top scorers by runs, excluding masked private participants. */
function topBatters(batsmen: ScorecardBatsman[]): MatchSummaryBatter[] {
  return [...batsmen]
    .filter((b) => b.name !== MASK_NAME)
    .sort((a, b) => (b.runs ?? -1) - (a.runs ?? -1))
    .slice(0, 3)
    .map((b) => ({
      name: b.name,
      runs: b.runs ?? 0,
      balls: b.balls,
      notOut: b.notOut,
    }));
}

/** Best bowlers by wickets then fewest runs, excluding masked private participants. */
function topBowlers(bowlers: ScorecardBowler[]): MatchSummaryBowler[] {
  return [...bowlers]
    .filter((b) => b.name !== MASK_NAME)
    .filter((b) => (b.wickets ?? 0) > 0 || !!b.overs)
    .sort(
      (a, b) =>
        (b.wickets ?? 0) - (a.wickets ?? 0) ||
        (a.runs ?? Number.MAX_SAFE_INTEGER) - (b.runs ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 3)
    .map((b) => ({
      name: b.name,
      wickets: b.wickets ?? 0,
      runs: b.runs ?? 0,
      overs: b.overs ?? "",
    }));
}

/** Winner from the HHCC-perspective junior result text, defaulting to a draw. */
function deriveWinner(
  result: string | null | undefined,
): "club" | "opposition" | "draw" {
  const r = (result ?? "").toLowerCase();
  if (/\bwon\b|\bwin\b|\bvictor/.test(r)) return "club";
  if (/\blost\b|\bloss\b|\bdefeat/.test(r)) return "opposition";
  return "draw";
}

/**
 * Map a junior match-detail DTO into a junior `matchSummary` share-card input.
 * Mirrors the senior `matchToSummaryInput` but builds via `buildJuniorScorecard`
 * (which masks private participants), forces the junior brown club chrome, sets
 * `junior: true` so the card renders in the brown palette with a "JUNIOR MATCH"
 * eyebrow, and excludes any masked private players from the featured lists.
 *
 * `brand` (the current tenant's brand) supplies the club team's name/shortName
 * when a match has no recorded innings to derive them from; the neutral default
 * when omitted, never Halls Head's.
 */
export function juniorMatchToSummaryInput(
  match: JuniorMatchDetail,
  brand?: ClubBrand | null,
): ShareCardInput {
  const sc: Scorecard = buildJuniorScorecard(match);

  const first = sc.innings[0];
  const clubScTeam = first
    ? first.battingTeam.isHallsHead
      ? first.battingTeam
      : first.bowlingTeam
    : null;
  // The tenant's own club always wears the junior brown chrome, regardless of
  // innings order; its name/shortName/logo come from the resolved scorecard
  // team, falling back to the tenant brand when there's no innings data yet.
  const clubTeam: MatchSummaryTeam = {
    name: clubScTeam?.name ?? brand?.name ?? DEFAULT_BRAND.name,
    shortName: clubScTeam?.shortName ?? brand?.shortName ?? null,
    primaryColor: JUNIOR_BROWN,
    secondaryColor: JUNIOR_GOLD,
    textColor: JUNIOR_GOLD,
    logoUrl: clubScTeam?.logoUrl ?? brand?.logoUrl ?? null,
  };
  const oppScTeam = first
    ? first.battingTeam.isHallsHead
      ? first.bowlingTeam
      : first.battingTeam
    : null;
  const oppTeam: MatchSummaryTeam = {
    name: oppScTeam?.name ?? match.opponentName ?? "Opposition",
    shortName: oppScTeam?.shortName ?? null,
    primaryColor: oppScTeam?.colors.primary ?? "#1f2733",
    secondaryColor: oppScTeam?.colors.secondary ?? "#9aa6b2",
    textColor: oppScTeam?.colors.text ?? "#ffffff",
    logoUrl: oppScTeam?.logoUrl ?? null,
  };

  const innings: MatchSummaryInnings[] = sc.innings
    .filter((inn) => inn.totalRuns != null || inn.batsmen.length > 0)
    .map((inn, i) => {
      // The free-text match score can fail to parse (missing/garbled source
      // data) even when real batting lines are recorded — defaulting straight
      // to "0" would show a misleading "0/0" over genuine stats. Derive the
      // total from the recorded batting when the parse comes back null;
      // only fall back to "0" when there's truly no data of any kind.
      const battingRecorded = inn.batsmen.length > 0;
      const totalRuns =
        inn.totalRuns ??
        (battingRecorded
          ? inn.batsmen.reduce((s, b) => s + (b.runs ?? 0), 0)
          : 0);
      const wickets =
        inn.wickets ??
        (battingRecorded
          ? inn.batsmen.filter((b) => !b.notOut && b.dismissal).length
          : 0);
      return {
        teamKey: inn.battingTeam.isHallsHead
          ? ("club" as const)
          : ("opposition" as const),
        inningsNum: (i + 1) as 1 | 2,
        totalRuns: String(totalRuns),
        wickets: String(wickets),
        overs: inn.oversTotal ?? "",
        topBatters: topBatters(inn.batsmen),
        topBowlers: topBowlers(inn.bowlers),
      };
    });

  const matchTitle =
    [match.ageGroup, match.round].filter(Boolean).join(" • ") ||
    "Junior Match";

  const isNoResult =
    !match.innings.length || /no result|not recorded|abandon/i.test(match.status ?? "");

  return {
    kind: "matchSummary",
    junior: true,
    matchTitle,
    matchType: match.competition ?? match.season ?? null,
    date: match.matchDate ? fmtJuniorDate(match.matchDate) : null,
    venue: match.venue ?? null,
    result: match.hhResult ?? match.status ?? "Result unavailable",
    resultWinner: isNoResult ? "draw" : deriveWinner(match.hhResult),
    club: clubTeam,
    opposition: oppTeam,
    innings,
  };
}
