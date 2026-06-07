import { buildScorecard } from "@workspace/scorecard";
import type {
  Scorecard,
  ScorecardTeam,
  ScorecardBatsman,
  ScorecardBowler,
} from "@workspace/scorecard";
import type { MatchDetail } from "@workspace/api-client-react";
import type {
  MatchSummaryTeam,
  MatchSummaryInnings,
  MatchSummaryBatter,
  MatchSummaryBowler,
  ShareCardInput,
} from "./share-card";

/** "2024/25" from the season start year. */
export function seasonLabel(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/** "5 Apr 2025" from an ISO date string; passes through unparseable values. */
function formatMatchDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toTeam(t: ScorecardTeam): MatchSummaryTeam {
  return {
    name: t.name,
    shortName: t.shortName,
    primaryColor: t.colors.primary,
    secondaryColor: t.colors.secondary,
    textColor: t.colors.text,
    logoUrl: t.logoUrl,
  };
}

/** Top scorers by runs (fill-ins are already excluded by buildScorecard). */
function topBatters(batsmen: ScorecardBatsman[]): MatchSummaryBatter[] {
  return [...batsmen]
    .sort((a, b) => (b.runs ?? -1) - (a.runs ?? -1))
    .slice(0, 3)
    .map((b) => ({
      name: b.name,
      runs: b.runs ?? 0,
      balls: b.balls,
      notOut: b.notOut,
    }));
}

/** Best bowlers by wickets, then by fewest runs conceded. */
function topBowlers(bowlers: ScorecardBowler[]): MatchSummaryBowler[] {
  return [...bowlers]
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

/** Winner from the HHCC-perspective result text, defaulting to a draw. */
function deriveWinner(
  result: string | null | undefined,
): "club" | "opposition" | "draw" {
  const r = (result ?? "").toLowerCase();
  if (/\bwon\b|\bwin\b|\bvictor/.test(r)) return "club";
  if (/\blost\b|\bloss\b|\bdefeat/.test(r)) return "opposition";
  return "draw";
}

/** Map a stored match into a `matchSummary` share-card input. */
export function matchToSummaryInput(match: MatchDetail): ShareCardInput {
  const sc: Scorecard = buildScorecard(match);

  const first = sc.innings[0];
  const clubTeam = first.battingTeam.isHallsHead
    ? first.battingTeam
    : first.bowlingTeam;
  const oppTeam = first.battingTeam.isHallsHead
    ? first.bowlingTeam
    : first.battingTeam;

  const innings: MatchSummaryInnings[] = sc.innings
    .filter((inn) => inn.totalRuns != null || inn.batsmen.length > 0)
    .map((inn, i) => ({
      teamKey: inn.battingTeam.isHallsHead
        ? ("club" as const)
        : ("opposition" as const),
      inningsNum: (i + 1) as 1 | 2,
      totalRuns: String(inn.totalRuns ?? 0),
      wickets: String(inn.wickets ?? 0),
      overs: inn.oversTotal ?? "",
      topBatters: topBatters(inn.batsmen),
      topBowlers: topBowlers(inn.bowlers),
    }));

  const roundLabel = match.stage
    ? match.stage
    : match.round != null
      ? `Round ${match.round}`
      : "";
  const matchTitle = [match.grade, roundLabel].filter(Boolean).join(" • ");

  return {
    kind: "matchSummary",
    matchTitle,
    matchType: match.competition ?? seasonLabel(match.season),
    date: match.matchDate ? formatMatchDate(match.matchDate) : null,
    venue: match.venue ?? null,
    result: match.abandoned
      ? "Match abandoned"
      : (match.result ?? "Result unavailable"),
    resultWinner: match.abandoned ? "draw" : deriveWinner(match.result),
    club: toTeam(clubTeam),
    opposition: toTeam(oppTeam),
    innings,
  };
}
