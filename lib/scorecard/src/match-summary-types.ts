/**
 * Types for the match-summary share-card input, extracted from the web client's
 * share-card module so they can be shared across web, mobile, and any future
 * consumer via the @workspace/scorecard package.
 */

export type MatchSummaryTeam = {
  name: string;
  shortName?: string | null;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  logoUrl?: string | null;
};

export type MatchSummaryBatter = {
  name: string;
  runs: number;
  balls?: number | null;
  notOut?: boolean;
};

export type MatchSummaryBowler = {
  name: string;
  wickets: number;
  runs: number;
  overs: string;
};

export type MatchSummaryInnings = {
  teamKey: "club" | "opposition";
  inningsNum: 1 | 2;
  totalRuns: string;
  wickets: string;
  overs: string;
  declared?: boolean;
  topBatters: MatchSummaryBatter[];
  topBowlers: MatchSummaryBowler[];
};

/** Self-contained input for a match-summary share card. */
export type MatchSummaryInput = {
  kind: "matchSummary";
  matchTitle: string;
  matchType?: string | null;
  date?: string | null;
  venue?: string | null;
  result: string;
  resultWinner: "club" | "opposition" | "draw";
  club: MatchSummaryTeam;
  opposition: MatchSummaryTeam;
  innings: MatchSummaryInnings[];
  headline?: string;
  junior?: boolean;
};
