import { loadCentralMatchDetail, loadMatchDetail } from "./match-detail";
import { getTenantCentralClubId } from "./tenant";
import { topPerformerPlayerId } from "./match-top-performer";

const CENTRAL_KEY = /^matchSummary:central:(\d+)$/;

/**
 * The featured player of an existing match-result draft (the club's top
 * performer), for a "player" card photo rule applied after the draft was made.
 * Reloads the match: native drafts carry their match id, central drafts the
 * central match id in their source key (players mapped through the tenant's
 * `player_id_map` crosswalk). Junior drafts never feature anyone. Null when the
 * match can't be loaded — the rule then falls back to a grade photo.
 */
export async function matchDraftFeaturedPlayer(
  tenantId: number,
  draft: { sourceKey: string | null; sourceMatchId: number | null; sourceMatchIsJunior: boolean },
): Promise<number | null> {
  if (draft.sourceMatchIsJunior) return null;
  try {
    const central = draft.sourceKey ? CENTRAL_KEY.exec(draft.sourceKey) : null;
    if (central) {
      const clubId = await getTenantCentralClubId(tenantId);
      const detail = await loadCentralMatchDetail({ tenantId, clubId }, Number(central[1]));
      return detail ? topPerformerPlayerId(detail.lines) : null;
    }
    if (draft.sourceMatchId == null) return null;
    const detail = await loadMatchDetail(draft.sourceMatchId, tenantId);
    return detail ? topPerformerPlayerId(detail.lines) : null;
  } catch {
    return null;
  }
}
