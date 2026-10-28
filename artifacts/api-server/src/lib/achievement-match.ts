/**
 * The match an achievement card happened in (card labels): its result card
 * input, built exactly as the result card's draft is, so a century, five-for,
 * debut or milestone card can print both scores, the result, the venue and
 * both crests. Plain central data, like every drafter (KTD8).
 */
import type { MatchDetail } from "@workspace/api-zod";
import { resultDraftInput } from "@workspace/scorecard/card-content";
import { buildMatchSummaryContent } from "./card-content/results";
import { contentNames } from "./card-content/match-day";
import { contentVisibleFields } from "./card-content/visible-fields";
import { logger } from "./logger";
import { loadCentralMatchDetail } from "./match-detail";

/**
 * Each match's result card input (the same one the result card drafts), by
 * central match id. A match that can't be read is left out: its cards draft
 * without it.
 */
export async function loadMatchContexts(
  tenantId: number,
  clubId: number,
  matchIds: readonly number[],
): Promise<Map<number, Record<string, unknown>>> {
  const out = new Map<number, Record<string, unknown>>();
  if (matchIds.length === 0) return out;
  const [names, visible] = await Promise.all([
    contentNames(tenantId),
    contentVisibleFields(tenantId, "matchSummary"),
  ]);
  for (const matchId of matchIds) {
    try {
      const detail = await loadCentralMatchDetail({ tenantId, clubId }, matchId);
      if (!detail) continue;
      const [content] = await buildMatchSummaryContent(
        tenantId,
        [{ matchId, detail: detail as unknown as MatchDetail }],
        { names },
      );
      if (content) out.set(matchId, resultDraftInput(content, visible));
    } catch (err) {
      logger.warn({ err, matchId }, "achievement card: match context unavailable");
    }
  }
  return out;
}
