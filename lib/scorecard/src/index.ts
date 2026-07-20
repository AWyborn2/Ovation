export type {
  MatchDetail,
  MatchScorecardLine,
  MatchOppositionLine,
  OpponentClub,
  JuniorMatchDetail,
  JuniorInnings,
  JuniorBattingLine,
  JuniorBowlingLine,
} from "@workspace/api-client-react";
export * from "./types";
export {
  DEFAULT_BRAND,
  deriveClubColors,
  ACCENT_HEX,
  snapHexToAccentToken,
  resolveAccentToken,
  type AccentToken,
  type ClubBrand,
  // Deprecated aliases — kept so downstream imports compile during the sweep.
  HALLS_HEAD_BRAND,
  deriveHallsHeadColors,
  type HallsHeadBrand,
} from "./brand";
export {
  DEFAULT_TEAM_COLORS,
  HALLS_HEAD_COLORS,
  deriveOppositionColors,
  hexToRgb,
  luminance,
} from "./colors";
export { formatDismissal } from "./dismissal";
export { oversToBalls, ballsToOvers, sumOvers, economy } from "./overs";
export { buildScorecard } from "./mapping";
export { buildJuniorScorecard } from "./junior-mapping";
export * from "./match-summary-types";
export {
  matchToSummaryInput,
  juniorMatchToSummaryInput,
  seasonLabel,
  deriveWinner,
  topBatters,
  topBowlers,
} from "./match-summary-input";
