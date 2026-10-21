/**
 * Result content (ADR-010 P7), pure: a completed match's card input becomes
 * the content its result card prints, for the results and match summary
 * carousels and the single match summary card alike.
 *
 * The server builder (`api-server/src/lib/card-content/results.ts`) loads the
 * scorecards and the club's names and calls these, for the sweep, the
 * carousels and Create a Card, so none of them can drift.
 */

import {
  cardTeamCrest,
  resolveCardCompetition,
  resolveCardTeamName,
  teamMonogram,
  type CardNames,
} from "../card-names";
import { isJuniorGradeLabel } from "../junior-grade";
import type { MatchSummaryInput, MatchSummaryTeam } from "../match-summary-types";
import { dayHeading, dayResultRow, type DayResultRow } from "./day";
import { normaliseRoundLabel } from "./match-day";
import type { ContentTeam, ResultContent, ResultDayContent } from "./types";

export interface ResultContentOptions {
  kind: "results" | "matchSummary";
  matchId: number;
  /** A junior match (from the junior tables). A junior-looking grade counts too (fail closed). */
  junior?: boolean;
  /** The grade as the source names it (a junior match's age group); default the title's. */
  grade?: string | null;
  /** The club-time day, YYYY-MM-DD, when the scorecard has one. */
  day?: string | null;
  /** The club's short names and crests (`loadCardNames`); absent → automatic names. */
  names?: CardNames | null;
}

/** "A Grade • Round 5" → "A Grade". */
const titleGrade = (title: string) => (title.split(/\s+[•·]\s+/)[0] ?? "").trim();

/**
 * A result's round as its source gave it: the explicit label, else what the
 * match title carries after the grade (historical inputs had no label).
 */
export function resultRoundSource(source: Pick<MatchSummaryInput, "roundLabel" | "matchTitle">) {
  if (source.roundLabel != null) return source.roundLabel;
  return source.matchTitle.split(" • ").slice(1).join(" • ").trim();
}

function contentTeam(names: CardNames | null, team: MatchSummaryTeam): ContentTeam {
  const rawName = team.name.trim();
  const name = resolveCardTeamName(names, rawName) || rawName;
  return {
    name,
    rawName,
    crestUrl: team.logoUrl || cardTeamCrest(names, rawName),
    monogram: teamMonogram(name),
  };
}

/** One match's result content. `source` is kept as it is: it is the single card's input. */
export function resultContent(
  source: MatchSummaryInput,
  opts: ResultContentOptions,
): ResultContent {
  const names = opts.names ?? null;
  const gradeRaw = (opts.grade ?? "").trim() || titleGrade(source.matchTitle);
  const day = opts.day ?? null;
  return {
    kind: opts.kind,
    page: "result",
    matchId: opts.matchId,
    junior: opts.junior === true || source.junior === true || isJuniorGradeLabel(gradeRaw),
    grade: resolveCardCompetition(names, gradeRaw) || gradeRaw,
    roundLabel: normaliseRoundLabel(resultRoundSource(source)),
    day,
    date: day ? dayHeading(day) : "",
    club: contentTeam(names, source.club),
    opposition: contentTeam(names, source.opposition),
    hasPerformers: source.innings.some((i) => i.topBatters.length || i.topBowlers.length),
    source,
  };
}

/** The optional result fields a single card's input carries (photo and sponsor are the renderer's). */
const RESULT_INPUT_FIELDS = ["result.round", "result.oppositionCrest"] as const;

/**
 * A result card with only `visible` fields shown, names final. A hidden round
 * leaves the title as the grade alone; a hidden crest leaves the monogram.
 */
function resultProjection(c: ResultContent, visible: ReadonlySet<string>): Record<string, unknown> {
  const s = c.source;
  return {
    ...s,
    ...(visible.has("result.round")
      ? {}
      : { matchTitle: titleGrade(s.matchTitle), roundLabel: "" }),
    club: { ...s.club, name: c.club.name, logoUrl: c.club.crestUrl },
    opposition: {
      ...s.opposition,
      name: c.opposition.name,
      logoUrl: visible.has("result.oppositionCrest") ? c.opposition.crestUrl : null,
    },
    namesResolved: true,
  };
}

/**
 * The single card's input (the sweep's draft, Create a Card's prefill). With
 * every field the input carries shown (Standard, Full, or no settings) it is
 * exactly the source's input, as the sweep saved it before the content
 * pipeline, so existing drafts are never rewritten. A club that hides a field
 * gets the shown fields only.
 */
export function resultDraftInput(
  content: ResultContent,
  visible?: ReadonlySet<string> | null,
): Record<string, unknown> {
  if (!visible || RESULT_INPUT_FIELDS.every((f) => visible.has(f)))
    return content.source as unknown as Record<string, unknown>;
  return resultProjection(content, visible);
}

/**
 * A result's carousel slide input: the shown fields, the results set without
 * the top performers, and the innings in detail on a match summary that has
 * them (an abandoned game with nothing to detail posts as the result card).
 */
export function resultSlideInput(
  c: ResultContent,
  visible: ReadonlySet<string>,
): Record<string, unknown> {
  const s = c.source;
  return {
    ...resultProjection(c, visible),
    grade: c.grade,
    junior: c.junior,
    carouselDetail: c.kind === "matchSummary" && c.hasPerformers,
    ...(c.kind === "results"
      ? { innings: s.innings.map((i) => ({ ...i, topBatters: [], topBowlers: [] })) }
      : {}),
  };
}

/**
 * Whether a result may share a junior day slide: built from a junior scorecard
 * and dated. A senior scorecard with a junior-looking grade prints as junior
 * (fail closed) but keeps a slide of its own.
 */
export function dayableResult(c: ResultContent): boolean {
  return c.junior && c.source.junior === true && !!c.day;
}

/** The day slide a set of junior results share. Throws on a senior, undated or other-day result. */
export function resultDayContent(results: readonly ResultContent[]): ResultDayContent {
  const first = results[0];
  if (!first) throw new Error("A day slide needs at least one result.");
  for (const r of results) {
    if (!r.junior || r.source.junior !== true)
      throw new Error("A day slide holds junior results only.");
    if (!r.day || r.day !== first.day) throw new Error("A day slide holds the results of one day.");
    if (r.kind !== first.kind) throw new Error("A day slide holds one kind of result.");
  }
  return {
    kind: first.kind,
    page: "day",
    junior: true,
    day: first.day!,
    date: dayHeading(first.day!),
    results: [...results],
  };
}

/** A junior result's row on its day slide, with only `visible` fields shown. */
export function dayResultContentRow(c: ResultContent, visible: ReadonlySet<string>): DayResultRow {
  return {
    ...dayResultRow({ ...c.source, junior: c.junior, grade: c.grade }),
    opposition: c.opposition.name,
    crestUrl: visible.has("result.oppositionCrest") ? c.opposition.crestUrl : null,
  };
}

/** A junior day slide's input: the first result's card, carrying every result as a row. */
export function resultDaySlideInput(
  c: ResultDayContent,
  visible: ReadonlySet<string>,
): Record<string, unknown> {
  const { carouselDetail: _detail, ...first } = resultSlideInput(c.results[0]!, visible);
  return {
    ...first,
    junior: true,
    carouselDay: {
      heading: c.date,
      results: c.results.map((r) => dayResultContentRow(r, visible)),
    },
  };
}
