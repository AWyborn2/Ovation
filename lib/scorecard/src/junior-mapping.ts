import type {
  JuniorMatchDetail,
  JuniorInnings,
  JuniorBattingLine,
  JuniorBowlingLine,
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
import { HALLS_HEAD_BRAND, deriveHallsHeadColors } from "./brand";
import { deriveOppositionColors } from "./colors";
import { formatDismissal } from "./dismissal";
import { sumOvers } from "./overs";

const INNINGS_LABELS = [
  "1ST INNINGS",
  "2ND INNINGS",
  "3RD INNINGS",
  "4TH INNINGS",
];

/** A junior line counts as "not out" when no out-dismissal is recorded. */
function isNotOut(dismissal: string | null | undefined): boolean {
  if (!dismissal) return true;
  const d = dismissal.trim().toLowerCase();
  if (d === "") return true;
  return d.includes("not out") || d.startsWith("retired");
}

/**
 * Junior overs are stored as a real in ball-notation (e.g. 4.5 = 4 overs and 5
 * balls). Stringify to the ball-notation the shared overs helpers + cards
 * expect ("4.5"), trimming any float artefacts.
 */
function oversToString(overs: number | null | undefined): string | null {
  if (overs == null) return null;
  const whole = Math.floor(overs);
  const balls = Math.round((overs - whole) * 10);
  return balls === 0 ? String(whole) : `${whole}.${balls}`;
}

/**
 * Parse a junior team score string into runs + wickets. Junior scores arrive in
 * varied free-text shapes (e.g. "120/3", "3/120", "120"); we take the larger
 * number as runs and a small (<=10) second number as wickets.
 */
function parseJuniorScore(raw: string | null | undefined): {
  runs: number | null;
  wickets: number | null;
} {
  if (!raw) return { runs: null, wickets: null };
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length === 0) return { runs: null, wickets: null };
  if (nums.length === 1) return { runs: parseInt(nums[0], 10), wickets: null };
  const a = parseInt(nums[0], 10);
  const b = parseInt(nums[1], 10);
  const runs = Math.max(a, b);
  const small = Math.min(a, b);
  return { runs, wickets: small <= 10 ? small : null };
}

function hallsHeadTeam(): ScorecardTeam {
  const b = HALLS_HEAD_BRAND;
  return {
    name: "Halls Head",
    shortName: "HHCC",
    logoUrl: b.logoUrl128 ?? b.logoUrl ?? null,
    colors: deriveHallsHeadColors(b.primaryColour, b.secondaryColour),
    isHallsHead: true,
  };
}

function oppositionTeam(
  name: string | null | undefined,
  club: OpponentClub | null | undefined,
): ScorecardTeam {
  return {
    name: club?.name ?? (name?.trim() || "Opposition"),
    shortName: club?.shortName ?? null,
    logoUrl: club?.logoUrl128 ?? club?.logoUrl ?? null,
    colors: deriveOppositionColors(club?.primaryColour, club?.secondaryColour),
    isHallsHead: false,
  };
}

function buildBatsman(l: JuniorBattingLine): ScorecardBatsman {
  const notOut = isNotOut(l.dismissal);
  return {
    // Junior participant ids are strings; the shared card links by numeric id
    // only, so junior names always render as plain text.
    playerId: null,
    name: l.playerName || "—",
    dismissal: formatDismissal(l.dismissal, notOut),
    notOut,
    runs: l.runs ?? null,
    balls: l.balls ?? null,
    fours: l.fours ?? null,
    sixes: l.sixes ?? null,
    strikeRate: l.strikeRate ?? null,
  };
}

function buildBowler(l: JuniorBowlingLine): ScorecardBowler {
  return {
    playerId: null,
    name: l.playerName || "—",
    overs: oversToString(l.overs),
    maidens: l.maidens ?? null,
    runs: l.runs ?? null,
    wickets: l.wickets ?? null,
    economy: l.economy ?? null,
    wides: l.wides ?? null,
    noBalls: l.noBalls ?? null,
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

function buildInnings(
  inn: JuniorInnings,
  hh: ScorecardTeam,
  opp: ScorecardTeam,
  hhScore: { runs: number | null; wickets: number | null },
  oppScore: { runs: number | null; wickets: number | null },
  label: string,
): ScorecardInnings {
  const battingTeam = inn.isHallsHead ? hh : opp;
  const bowlingTeam = inn.isHallsHead ? opp : hh;
  const batsmen = inn.batting.map(buildBatsman);
  const bowlers = inn.bowling.map(buildBowler);
  const score = inn.isHallsHead ? hhScore : oppScore;
  return {
    battingTeam,
    bowlingTeam,
    inningsLabel: label,
    batsmen,
    didNotBat: [],
    bowlers,
    extras: buildExtras(score.runs, batsmen, bowlers),
    totalRuns: score.runs,
    wickets: score.wickets,
    oversTotal: sumOvers(bowlers.map((b) => b.overs)),
  };
}

/**
 * Map a junior match-detail DTO into the shared scorecard view-model so the
 * branded batting/bowling cards can render junior matches with the same look as
 * the senior scorecard. Innings arrive from the API already in true batting
 * order; private participants are masked server-side before this runs. When the
 * junior opponent was matched to a club in the shared register the opposition
 * shows that club's crest + colours, otherwise it falls back to the neutral
 * scheme.
 */
export function buildJuniorScorecard(match: JuniorMatchDetail): Scorecard {
  const hh = hallsHeadTeam();
  const opp = oppositionTeam(match.opponentName, match.opponentClub ?? null);
  const hhScore = parseJuniorScore(match.hhScore);
  const oppScore = parseJuniorScore(match.opponentScore);

  const innings = (match.innings ?? []).map((inn, i) =>
    buildInnings(
      inn,
      hh,
      opp,
      hhScore,
      oppScore,
      INNINGS_LABELS[i] ?? `${i + 1} INNINGS`,
    ),
  );

  // The API orders innings by recorded innings number, so the order is real.
  return { innings, orderKnown: innings.length > 0 };
}
