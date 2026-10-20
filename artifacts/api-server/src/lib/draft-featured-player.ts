import { loadCentralMatchDetail, loadMatchDetail } from "./match-detail";
import { getTenantCentralClubId } from "./tenant";
import { rankedPerformerPlayerIds, topPerformerPlayerId } from "./match-top-performer";

const CENTRAL_KEY = /^matchSummary:central:(\d+)$/;

type MatchDraft = {
  sourceKey: string | null;
  sourceMatchId: number | null;
  sourceMatchIsJunior: boolean;
};

/**
 * The club's scorecard lines of an existing match-result draft's match.
 * Reloads the match: native drafts carry their match id, central drafts the
 * central match id in their source key (players mapped through the tenant's
 * `player_id_map` crosswalk). Junior drafts never feature anyone. Null when the
 * match can't be loaded.
 */
async function matchDraftLines(tenantId: number, draft: MatchDraft) {
  if (draft.sourceMatchIsJunior) return null;
  try {
    const central = draft.sourceKey ? CENTRAL_KEY.exec(draft.sourceKey) : null;
    if (central) {
      const clubId = await getTenantCentralClubId(tenantId);
      const detail = await loadCentralMatchDetail({ tenantId, clubId }, Number(central[1]));
      return detail?.lines ?? null;
    }
    if (draft.sourceMatchId == null) return null;
    const detail = await loadMatchDetail(draft.sourceMatchId, tenantId);
    return detail?.lines ?? null;
  } catch {
    return null;
  }
}

/**
 * The featured player of an existing match-result draft (the club's top
 * performer), for a card photo rule applied after the draft was made. Null
 * when the match can't be loaded.
 */
export async function matchDraftFeaturedPlayer(
  tenantId: number,
  draft: MatchDraft,
): Promise<number | null> {
  const lines = await matchDraftLines(tenantId, draft);
  return lines ? topPerformerPlayerId(lines) : null;
}

/**
 * The photo candidates of an existing match-result draft: the club's players
 * in the match, best performer first. Empty when the match can't be loaded,
 * so the draft is left without a photo.
 */
export async function matchDraftCandidatePlayers(
  tenantId: number,
  draft: MatchDraft,
): Promise<number[]> {
  const lines = await matchDraftLines(tenantId, draft);
  return lines ? rankedPerformerPlayerIds(lines) : [];
}
