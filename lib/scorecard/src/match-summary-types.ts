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
  /**
   * Every batter of the innings, in batting order (full draft editor plan,
   * stages 4 and 5: the performance lists). Optional: older saved inputs have
   * only the top three. On a junior card they follow the top lists' privacy
   * rules.
   */
  batters?: MatchSummaryBatter[];
  /** Everyone who bowled in the innings, in bowling order. */
  bowlers?: MatchSummaryBowler[];
};

/** Self-contained input for a match-summary share card. */
export type MatchSummaryInput = {
  kind: "matchSummary";
  matchTitle: string;
  /** Explicit round or finals stage; optional for historical saved inputs. */
  roundLabel?: string;
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
  /**
   * A slide's share of a performance list that continues on extra slides
   * (`planTemplateSlides`, `PERFORMANCE_ROWS_KEY`); set only on planned slides.
   */
  performanceRows?: Partial<Record<string, number[]>>;
};
