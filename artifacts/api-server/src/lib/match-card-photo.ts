import type { MatchDetail } from "@workspace/api-zod";
import { matchToSummaryInput, preferredPhotoTypes } from "@workspace/scorecard";
import type { DataSource } from "./tenant";
import { loadMatchDetailForSource } from "./match-detail";
import { draftKeys } from "./draft-upsert";
import { draftPhotoGrade, photoRuleKinds, pickDraftPhoto } from "./draft-enrich";
import { topPerformerPlayerId } from "./match-top-performer";

export type MatchCardPhoto = { url: string | null; source: string | null };

/**
 * The library photo for a match's on-demand result card (the match page's
 * Share window), picked exactly as the social queue picks it for that match's
 * result draft: the same grade, rule kinds (a Grand Final win tries the
 * premiership rule first), featured player (the club's top performer) and
 * random-rule seed (the draft's source key). Null when the match is missing.
 */
export async function matchCardPhoto(
  source: DataSource,
  matchId: number,
): Promise<MatchCardPhoto | null> {
  const detail = await loadMatchDetailForSource(source, matchId);
  if (!detail) return null;
  const cardInput = matchToSummaryInput(detail as MatchDetail) as unknown as Record<
    string,
    unknown
  >;
  const photo = await pickDraftPhoto(source.tenantId, {
    playerId: null,
    grade: draftPhotoGrade(cardInput),
    junior: false,
    kind: "matchSummary",
    ruleKinds: photoRuleKinds(cardInput),
    seed:
      source.kind === "central"
        ? draftKeys.centralMatchSummary(matchId)
        : draftKeys.matchSummary(matchId, false),
    featuredPlayerId: topPerformerPlayerId(detail.lines),
    photoTypes: preferredPhotoTypes(cardInput),
  });
  return { url: photo?.url ?? null, source: photo?.source ?? null };
}
