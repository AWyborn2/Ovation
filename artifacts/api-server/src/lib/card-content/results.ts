/**
 * The result content builders (ADR-010 P7): the only place a completed
 * match's scorecard becomes the content its result card prints. The results
 * sweep (`match-summary-drafter.ts`), the results and match summary carousels
 * (`carousel-content.ts`) and Create a Card's prefill (`routes/social-prefill.ts`)
 * all call them, so an auto-queued card, a carousel slide and a card made by
 * hand say the same thing (`results.db.test.ts` holds them to it).
 *
 * The caller loads the scorecards (and decides which matches qualify); this
 * maps them, resolves the club's names once, and dates each result in club time.
 *
 * Juniors: a junior result is built only from the junior tables' scorecard
 * (`loadJuniorMatchDetail`) and flagged junior; senior and junior content never
 * share a slide.
 */

import type { JuniorMatchDetail, MatchDetail } from "@workspace/api-zod";
import { juniorMatchToSummaryInput, matchToSummaryInput } from "@workspace/scorecard";
import type { CardNames } from "@workspace/scorecard/card-names";
import { resultContent, type ResultContent } from "@workspace/scorecard/card-content";
import { parseMatchDate } from "../match-date";
import { getTenantBrand } from "../tenant-brand";
import { contentNames } from "./match-day";
import { contentJuniorNames } from "./junior-names";

/** A scorecard to build a result from: the club's or central's, or a junior match's. */
export type ResultSource =
  | { junior?: false; matchId: number; detail: MatchDetail }
  | { junior: true; matchId: number; detail: JuniorMatchDetail };

export interface BuildResultsOptions {
  /** The club's names, when the caller already has them. */
  names?: CardNames;
  /**
   * The club's junior names (junior override tables only), when the caller
   * already has them. A junior side never takes the senior names.
   */
  juniorNames?: CardNames;
  onNamesError?: (err: unknown) => void;
}

/**
 * A scorecard's club-time day, YYYY-MM-DD. A timestamp crosses midnight in
 * club time, not UTC or the browser's; other formats go through `parseMatchDate`.
 */
export function resultDay(value: string | null | undefined): string | null {
  if (value && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    if (!Number.isFinite(+date)) return null;
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Perth",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    return ["year", "month", "day"].map((k) => p.find((x) => x.type === k)!.value).join("-");
  }
  return parseMatchDate(value ?? null);
}

/** A junior match's grade as its cards name it: the age group, else the grade. */
export const juniorResultGrade = (d: Pick<JuniorMatchDetail, "ageGroup" | "grade">) =>
  d.ageGroup || d.grade || "Juniors";

async function build(
  tenantId: number,
  kind: ResultContent["kind"],
  sources: readonly ResultSource[],
  opts: BuildResultsOptions,
): Promise<ResultContent[]> {
  if (!sources.length) return [];
  const names = sources.some((s) => !s.junior)
    ? (opts.names ?? (await contentNames(tenantId, opts.onNamesError)))
    : {};
  // A junior result takes the club's junior names only (juniors isolation).
  const juniorNames = sources.some((s) => s.junior)
    ? (opts.juniorNames ?? (await contentJuniorNames(tenantId, opts.onNamesError)))
    : {};
  const brand = sources.some((s) => s.junior) ? await getTenantBrand(tenantId) : null;
  return sources.map((s) =>
    s.junior
      ? resultContent(juniorMatchToSummaryInput(s.detail, brand!), {
          kind,
          matchId: s.matchId,
          junior: true,
          grade: juniorResultGrade(s.detail),
          day: resultDay(s.detail.matchDate),
          names: juniorNames,
        })
      : resultContent(matchToSummaryInput(s.detail), {
          kind,
          matchId: s.matchId,
          grade: s.detail.grade,
          day: resultDay(s.detail.matchDate),
          names,
        }),
  );
}

/** Each match's results-set content (scores, no top performers), in `sources` order. */
export function buildResultsContent(
  tenantId: number,
  sources: readonly ResultSource[],
  opts: BuildResultsOptions = {},
): Promise<ResultContent[]> {
  return build(tenantId, "results", sources, opts);
}

/**
 * Each match's match summary content, in `sources` order: the single result
 * card the sweep drafts, the match summary carousel slide and Create a Card's
 * prefill.
 */
export function buildMatchSummaryContent(
  tenantId: number,
  sources: readonly ResultSource[],
  opts: BuildResultsOptions = {},
): Promise<ResultContent[]> {
  return build(tenantId, "matchSummary", sources, opts);
}
