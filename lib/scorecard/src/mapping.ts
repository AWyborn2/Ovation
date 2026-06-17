import type {
  MatchDetail,
  MatchScorecardLine,
  MatchOppositionLine,
  OpponentClub,
} from "@workspace/api-client-react";
import type {
  Scorecard,
  ScorecardBatsman,
  ScorecardBowler,
  ScorecardExtras,
  ScorecardInnings,
  ScorecardTeam,
} from "./types";
import { deriveOppositionColors } from "./colors";
import { DEFAULT_BRAND, deriveClubColors, type ClubBrand } from "./brand";
import { formatDismissal } from "./dismissal";
import { economy, sumOvers } from "./overs";

/** Fill-in players have synthetic ids; they show but never link/aggregate. */
const FILL_IN_THRESHOLD = 90000;

const INNINGS_LABELS = ["1ST INNINGS", "2ND INNINGS"];

function hhName(line: MatchScorecardLine): string {
  const isFillIn = line.playerId >= FILL_IN_THRESHOLD;
  if (isFillIn) return "Fill-in";
  return `${line.givenName} ${line.surname}`.trim() || "Unknown";
}

function hhLinkId(line: MatchScorecardLine): number | null {
  return line.playerId >= FILL_IN_THRESHOLD ? null : line.playerId;
}

function oppName(line: MatchOppositionLine): string {
  return line.name?.trim() || "—";
}

/** Parse a stored score string "runs / wickets" (e.g. "187 / 10"). */
function parseScore(
  score: string | null | undefined,
): { wickets: number | null; runs: number | null } {
  if (!score) return { wickets: null, runs: null };
  const m = /(\d+)\s*\/\s*(\d+)/.exec(score);
  if (!m) {
    // A bare number is treated as runs.
    const n = /^\s*(\d+)\s*$/.exec(score);
    return { wickets: null, runs: n ? parseInt(n[1], 10) : null };
  }
  return { runs: parseInt(m[1], 10), wickets: parseInt(m[2], 10) };
}

function strikeRate(
  runs: number | null | undefined,
  balls: number | null | undefined,
): number | null {
  if (runs == null || !balls) return null;
  return (runs / balls) * 100;
}

function buildBatsman(
  playerId: number | null,
  name: string,
  line: {
    runs?: number | null;
    balls?: number | null;
    fours?: number | null;
    sixes?: number | null;
    notOut?: boolean;
    dismissal?: string | null;
  },
): ScorecardBatsman {
  return {
    playerId,
    name,
    dismissal: formatDismissal(line.dismissal, line.notOut ?? false),
    notOut: line.notOut ?? false,
    runs: line.runs ?? null,
    balls: line.balls ?? null,
    fours: line.fours ?? null,
    sixes: line.sixes ?? null,
    strikeRate: strikeRate(line.runs, line.balls),
  };
}

function buildBowler(
  playerId: number | null,
  name: string,
  line: {
    overs?: string | null;
    maidens?: number | null;
    runsConceded?: number | null;
    wickets?: number | null;
    wides?: number | null;
    noBalls?: number | null;
  },
): ScorecardBowler {
  return {
    playerId,
    name,
    overs: line.overs ?? null,
    maidens: line.maidens ?? null,
    runs: line.runsConceded ?? null,
    wickets: line.wickets ?? null,
    economy: economy(line.runsConceded, line.overs),
    wides: line.wides ?? null,
    noBalls: line.noBalls ?? null,
  };
}

/** Derive innings extras from the total minus batter runs, attributing wides/no-balls. */
function buildExtras(
  totalRuns: number | null,
  batsmen: ScorecardBatsman[],
  bowlers: ScorecardBowler[],
): ScorecardExtras {
  const wides = bowlers.reduce((s, b) => s + (b.wides ?? 0), 0);
  const noBalls = bowlers.reduce((s, b) => s + (b.noBalls ?? 0), 0);
  if (totalRuns == null) {
    return { total: wides + noBalls, wides, noBalls, other: 0 };
  }
  const batRuns = batsmen.reduce((s, b) => s + (b.runs ?? 0), 0);
  const total = Math.max(0, totalRuns - batRuns);
  const other = Math.max(0, total - wides - noBalls);
  return { total, wides, noBalls, other };
}

// The tenant club's side of the scorecard, branded from the match's brand field
// (falls back to the default brand). `isHallsHead` is the view-model flag for
// "this is the tenant's side"; the field name is kept for now to avoid rippling
// through the generated API types and every scorecard consumer.
function tenantTeam(brand: ClubBrand | null | undefined): ScorecardTeam {
  const b = brand ?? DEFAULT_BRAND;
  return {
    name: b.name,
    shortName: b.shortName ?? null,
    logoUrl: b.logoUrl128 ?? b.logoUrl ?? null,
    colors: deriveClubColors(b.primaryColour, b.secondaryColour),
    isHallsHead: true,
  };
}

function oppositionTeam(
  opponent: string | null,
  club: OpponentClub | null,
): ScorecardTeam {
  return {
    name: club?.name ?? opponent ?? "Opposition",
    shortName: club?.shortName ?? null,
    logoUrl: club?.logoUrl128 ?? club?.logoUrl ?? null,
    colors: deriveOppositionColors(club?.primaryColour, club?.secondaryColour),
    isHallsHead: false,
  };
}

/**
 * Map a match-detail DTO into the ordered two-innings scorecard view-model.
 * Innings are ordered by clubBattedFirst (true/null -> tenant club bat first,
 * false -> opposition bat first). Abandoned matches with no lines still return
 * empty innings so the caller can render a clean "abandoned" state.
 */
export function buildScorecard(match: MatchDetail): Scorecard {
  const hh = tenantTeam(match.club);
  const opp = oppositionTeam(match.opponent ?? null, match.opponentClub ?? null);

  const hhScore = parseScore(match.clubScore);
  const oppScore = parseScore(match.opponentScore);

  const hhLines = match.lines ?? [];
  const oppLines = match.oppositionLines ?? [];

  // Tenant club batting innings: tenant bat, opposition bowl.
  const hhBatsmen = hhLines
    .filter((l) => l.batted)
    .map((l) => buildBatsman(hhLinkId(l), hhName(l), l));
  const hhDnb = hhLines.filter((l) => !l.batted).map((l) => hhName(l));
  const oppBowlers = oppLines
    .filter((l) => l.bowled)
    .map((l) => buildBowler(null, oppName(l), l));

  const hhBattingInnings: Omit<ScorecardInnings, "inningsLabel"> = {
    battingTeam: hh,
    bowlingTeam: opp,
    batsmen: hhBatsmen,
    didNotBat: hhDnb,
    bowlers: oppBowlers,
    extras: buildExtras(hhScore.runs, hhBatsmen, oppBowlers),
    totalRuns: hhScore.runs,
    wickets: hhScore.wickets,
    oversTotal: sumOvers(oppBowlers.map((b) => b.overs)),
  };

  // Opposition batting innings: opposition bat, HH bowl.
  const oppBatsmen = oppLines
    .filter((l) => l.batted)
    .map((l) => buildBatsman(null, oppName(l), l));
  const oppDnb = oppLines.filter((l) => !l.batted).map((l) => oppName(l));
  const hhBowlers = hhLines
    .filter((l) => l.bowled)
    .map((l) => buildBowler(hhLinkId(l), hhName(l), l));

  const oppBattingInnings: Omit<ScorecardInnings, "inningsLabel"> = {
    battingTeam: opp,
    bowlingTeam: hh,
    batsmen: oppBatsmen,
    didNotBat: oppDnb,
    bowlers: hhBowlers,
    extras: buildExtras(oppScore.runs, oppBatsmen, hhBowlers),
    totalRuns: oppScore.runs,
    wickets: oppScore.wickets,
    oversTotal: sumOvers(hhBowlers.map((b) => b.overs)),
  };

  const hhFirst = match.clubBattedFirst !== false; // true or null -> HH first
  const ordered = hhFirst
    ? [hhBattingInnings, oppBattingInnings]
    : [oppBattingInnings, hhBattingInnings];

  const innings: ScorecardInnings[] = ordered.map((inn, i) => ({
    ...inn,
    inningsLabel: INNINGS_LABELS[i] ?? `${i + 1} INNINGS`,
  }));

  return { innings, orderKnown: match.clubBattedFirst != null };
}
