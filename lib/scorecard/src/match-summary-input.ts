/**
 * Mapper functions that convert match-detail DTOs into MatchSummaryInput — a
 * self-contained, framework-agnostic input for the match-summary share card.
 *
 * Moved from the web client so web, mobile, and any future consumer can share
 * the same logic via @workspace/scorecard.
 */

import { buildScorecard } from "./mapping";
import { buildJuniorScorecard } from "./junior-mapping";
import { DEFAULT_BRAND, type ClubBrand } from "./brand";
import type { Scorecard, ScorecardTeam, ScorecardBatsman, ScorecardBowler } from "./types";
import type { MatchDetail, JuniorMatchDetail } from "@workspace/api-zod";
import type {
  MatchSummaryTeam,
  MatchSummaryInnings,
  MatchSummaryBatter,
  MatchSummaryBowler,
  MatchSummaryInput,
} from "./match-summary-types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

/** Junior match dates arrive as free text; show them as DD/MM/YYYY or as-is. */
function fmtJuniorDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return d;
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
export function topBatters(
  batsmen: ScorecardBatsman[],
  excludeName?: string,
): MatchSummaryBatter[] {
  return [...batsmen]
    .filter((b) => !excludeName || b.name !== excludeName)
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
export function topBowlers(bowlers: ScorecardBowler[], excludeName?: string): MatchSummaryBowler[] {
  return [...bowlers]
    .filter((b) => !excludeName || b.name !== excludeName)
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

/** Winner from the club-perspective result text, defaulting to a draw. */
/** Lower-case words of a team name, for matching it inside a result line. */
function nameWords(name: string | null | undefined): string[] {
  return (name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^(cricket|club|inc|the|district|grade|1s|2s|3s|4s)$/.test(w));
}

/** How many of a team's name words appear in `text`. */
function nameHits(text: string, names: readonly (string | null | undefined)[]): number {
  const words = new Set(names.flatMap(nameWords));
  let hits = 0;
  for (const w of words) if (new RegExp(`\\b${w}\\b`).test(text)) hits++;
  return hits;
}

export interface WinnerTeams {
  club?: readonly (string | null | undefined)[];
  opposition?: readonly (string | null | undefined)[];
}

/**
 * Who won, from a result line. A club's own result line is written from its
 * side ("Won by 5 wickets", "Lost to Rockingham"); a central (PlayHQ) result
 * line names the winning side ("Claremont-Nedlands - 1s won by 106 runs").
 * With `teams`, the side named before "won" / "def." / "beat" is the winner;
 * without a name there, the line is read from the club's side.
 */
export function deriveWinner(
  result: string | null | undefined,
  teams: WinnerTeams = {},
): "club" | "opposition" | "draw" {
  const r = (result ?? "").toLowerCase();
  if (/\btie[d]?\b|no result|abandon/.test(r)) return "draw";
  const verb = /\b(won|win|wins|def(?:eated|\.)?|beat|beats)\b/.exec(r);
  if (verb) {
    const subject = r.slice(0, verb.index);
    const club = nameHits(subject, teams.club ?? []);
    const opp = nameHits(subject, teams.opposition ?? []);
    if (opp > club) return "opposition";
    if (club > opp) return "club";
  }
  // "Defeated by X" is a loss; "Def. X" / "Defeated X" / "Beat X" a win.
  if (/\bdefeated by\b|\bdefeat\b/.test(r)) return "opposition";
  if (/\bwon\b|\bwin\b|\bvictor|\bdef(?:\.|eated\b)|\bbeat\b/.test(r)) return "club";
  if (/\blost\b|\bloss\b/.test(r)) return "opposition";
  return "draw";
}

// ---------------------------------------------------------------------------
// Senior match mapper
// ---------------------------------------------------------------------------

/** Map a stored match into a `matchSummary` share-card input. */
export function matchToSummaryInput(match: MatchDetail): MatchSummaryInput {
  const sc: Scorecard = buildScorecard(match);
  const roundLabel = match.stage?.trim() || (match.round != null ? `Round ${match.round}` : "");
  const matchTitle = [match.grade, roundLabel].filter(Boolean).join(" • ");

  // Guard: match exists but no scorecard data yet (thin data).
  const first = sc.innings[0];
  if (!first) {
    return {
      kind: "matchSummary" as const,
      matchTitle,
      roundLabel,
      matchType: match.competition ?? seasonLabel(match.season),
      date: match.matchDate ? formatMatchDate(match.matchDate) : null,
      venue: match.venue ?? null,
      result: match.result ?? "Result pending",
      resultWinner: "draw" as const,
      club: {
        name: "Club",
        shortName: null,
        primaryColor: "#333F48",
        secondaryColor: "#FBAC27",
        textColor: "#ffffff",
        logoUrl: null,
      },
      opposition: {
        name: match.opponent ?? "Opposition",
        shortName: null,
        primaryColor: "#1f2733",
        secondaryColor: "#9aa6b2",
        textColor: "#ffffff",
        logoUrl: null,
      },
      innings: [],
    };
  }

  const clubTeam = first.battingTeam.isHallsHead ? first.battingTeam : first.bowlingTeam;
  const oppTeam = first.battingTeam.isHallsHead ? first.bowlingTeam : first.battingTeam;

  const innings: MatchSummaryInnings[] = sc.innings
    .filter((inn) => inn.totalRuns != null || inn.batsmen.length > 0)
    .map((inn, i) => ({
      teamKey: inn.battingTeam.isHallsHead ? ("club" as const) : ("opposition" as const),
      inningsNum: (i + 1) as 1 | 2,
      totalRuns: String(inn.totalRuns ?? 0),
      wickets: String(inn.wickets ?? 0),
      overs: inn.oversTotal ?? "",
      topBatters: topBatters(inn.batsmen),
      topBowlers: topBowlers(inn.bowlers),
    }));

  return {
    kind: "matchSummary",
    matchTitle,
    roundLabel,
    matchType: match.competition ?? seasonLabel(match.season),
    date: match.matchDate ? formatMatchDate(match.matchDate) : null,
    venue: match.venue ?? null,
    result: match.abandoned ? "Match abandoned" : (match.result ?? "Result unavailable"),
    // The recorded winner when the data has one (central); otherwise read
    // the result line, which may name the winning side.
    resultWinner: match.abandoned
      ? "draw"
      : match.clubWon === true
        ? "club"
        : match.clubWon === false
          ? "opposition"
          : deriveWinner(match.result, {
              club: [clubTeam.name, clubTeam.shortName],
              opposition: [oppTeam.name, oppTeam.shortName, match.opponent],
            }),
    club: toTeam(clubTeam),
    opposition: toTeam(oppTeam),
    innings,
  };
}

// ---------------------------------------------------------------------------
// Junior match mapper
// ---------------------------------------------------------------------------

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
): MatchSummaryInput {
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
        inn.totalRuns ?? (battingRecorded ? inn.batsmen.reduce((s, b) => s + (b.runs ?? 0), 0) : 0);
      const wickets =
        inn.wickets ??
        (battingRecorded ? inn.batsmen.filter((b) => !b.notOut && b.dismissal).length : 0);
      return {
        teamKey: inn.battingTeam.isHallsHead ? ("club" as const) : ("opposition" as const),
        inningsNum: (i + 1) as 1 | 2,
        totalRuns: String(totalRuns),
        wickets: String(wickets),
        overs: inn.oversTotal ?? "",
        topBatters: topBatters(inn.batsmen, MASK_NAME),
        topBowlers: topBowlers(inn.bowlers, MASK_NAME),
      };
    });

  const matchTitle = [match.ageGroup, match.round].filter(Boolean).join(" • ") || "Junior Match";

  const isNoResult =
    !match.innings.length || /no result|not recorded|abandon/i.test(match.status ?? "");

  return {
    kind: "matchSummary",
    junior: true,
    matchTitle,
    roundLabel: match.round?.trim() ?? "",
    matchType: match.competition ?? match.season ?? null,
    date: match.matchDate ? fmtJuniorDate(match.matchDate) : null,
    venue: match.venue ?? null,
    result: match.hhResult ?? match.status ?? "Result unavailable",
    resultWinner: isNoResult
      ? "draw"
      : deriveWinner(match.hhResult, {
          club: [clubTeam.name, clubTeam.shortName],
          opposition: [oppTeam.name, oppTeam.shortName],
        }),
    club: clubTeam,
    opposition: oppTeam,
    innings,
  };
}
