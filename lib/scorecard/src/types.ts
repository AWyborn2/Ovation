/**
 * Framework-agnostic view-model for the branded two-innings digital scorecard.
 * Built once from the match-detail API DTO (see mapping.ts) and consumed by both
 * the web (React) and mobile (React Native) match pages so they stay in sync.
 */

/** Colour scheme for one team's cards (header, rows, totals). */
export interface TeamColors {
  primary: string; // main header background
  secondary: string; // accent / innings badge bg, total text
  text: string; // header text colour
  accentText: string; // innings badge text
  rowOdd: string;
  rowEven: string;
  rowText: string;
  totalBg: string;
  totalText: string;
  borderColor: string;
}

/** A team as it appears on a card: identity + branding. */
export interface ScorecardTeam {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  colors: TeamColors;
  isHallsHead: boolean;
}

/** One batter's line on a batting card. */
export interface ScorecardBatsman {
  /** Player id for linking, or null (opposition / fill-in / no record). */
  playerId: number | null;
  name: string;
  /** Formatted dismissal, e.g. "c Smith b Jones". Empty when unknown. */
  dismissal: string;
  notOut: boolean;
  runs: number | null;
  balls: number | null;
  fours: number | null;
  sixes: number | null;
  strikeRate: number | null;
}

/** One bowler's line on a bowling card. */
export interface ScorecardBowler {
  playerId: number | null;
  name: string;
  overs: string | null;
  maidens: number | null;
  runs: number | null;
  wickets: number | null;
  economy: number | null;
  wides: number | null;
  noBalls: number | null;
}

/**
 * Innings extras. wides/noBalls come from the bowling lines; `other` is the
 * unattributed remainder (byes, leg-byes, penalties) derived from the innings
 * total minus the sum of batter runs minus wides/no-balls.
 */
export interface ScorecardExtras {
  total: number;
  wides: number;
  noBalls: number;
  other: number;
}

/** One innings: the batting side, the bowling side, and their figures. */
export interface ScorecardInnings {
  battingTeam: ScorecardTeam;
  bowlingTeam: ScorecardTeam;
  inningsLabel: string; // "1ST INNINGS", "2ND INNINGS"
  batsmen: ScorecardBatsman[];
  didNotBat: string[];
  bowlers: ScorecardBowler[];
  extras: ScorecardExtras;
  totalRuns: number | null;
  wickets: number | null;
  oversTotal: string | null;
}

/** The whole match as ordered innings (true batting order). */
export interface Scorecard {
  innings: ScorecardInnings[];
  /** True when batting order came from real data (clubBattedFirst not null). */
  orderKnown: boolean;
}
