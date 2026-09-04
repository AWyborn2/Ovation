import { useMemo } from "react";
import { useListHonourBoards, getListHonourBoardsQueryKey } from "@workspace/api-client-react";
import { DEFAULT_BOARDS, mergeBoardsMeta, type BoardMeta } from "@workspace/scorecard";

// The honour-board maths (tier thresholds, board membership, milestone and
// approaching-board computation, formatting) lives in @workspace/scorecard so
// the website and the mobile app share one implementation. This module only
// adds the React data hook on top.
export {
  BOARDS,
  DEFAULT_BOARDS,
  HONOUR_TIER_CONFIG,
  MILESTONE_BOARDS,
  CONFIGURABLE_MILESTONE_BOARDS,
  DEFAULT_MILESTONE_THRESHOLDS,
  aggregateCareer,
  statToAggregated,
  getAvailableSeasons,
  buildTiers,
  computeBoard,
  getMilestoneStatus,
  getSeasonCrossings,
  getSeasonPromotions,
  getPlayerSeasonCrossings,
  getRecentPromotions,
  getApproachingMilestones,
  mergeBoardsMeta,
  type BoardKey,
  type BoardMeta,
  type BoardMetaOverride,
  type TierDef,
  type TierConfig,
  type AggregatedPlayer,
  type BoardRow,
  type BoardTier,
  type MilestoneThresholds,
  type MilestoneStatus,
  type SeasonCrossing,
  type PlayerSeasonCrossings,
  type PromotionEntry,
  type ApproachingEntry,
} from "@workspace/scorecard";

/**
 * Fetches honour-board metadata from the API and merges it on top of the
 * static defaults so admin label/title/subtitle edits show up on the public
 * page. Falls back to `DEFAULT_BOARDS` until the API responds.
 */
export function useBoardsMeta(): BoardMeta[] {
  const { data } = useListHonourBoards({
    query: { queryKey: getListHonourBoardsQueryKey(), staleTime: 60_000 },
  });
  return useMemo(() => mergeBoardsMeta(data, DEFAULT_BOARDS), [data]);
}
