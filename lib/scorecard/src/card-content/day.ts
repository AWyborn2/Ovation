/**
 * Junior day slides (ADR-010 P3), pure: the rows a "multi-fixture" or
 * "multi-result" layout prints when the junior matches of one club-time day
 * share a slide (`groupSlides` in `card-sets.ts` decides which do).
 *
 * Rows are display-ready, so every pack lays them out the same way. A day
 * slide is junior only: building one from a senior item throws (juniors
 * isolation fails closed).
 */

import type { MatchSummaryInnings, MatchSummaryInput } from "../match-summary-types";
import { CLUB_TIME_ZONE, formatFixtureDate } from "./match-day";
import type { MatchDayDayContent, MatchDayFixtureContent } from "./types";

/** One fixture on a junior day slide. */
export interface DayFixtureRow {
  /** The grade label as the card prints it ("Under 13 — Blue"). */
  grade: string;
  opposition: string;
  /** Null when the crest field is hidden or there is none (the monogram stands in). */
  crestUrl: string | null;
  monogram: string;
  homeAway: "HOME" | "AWAY";
  venue: string;
  startTime: string;
  /** "" when the round field is hidden or unknown. */
  roundLabel: string;
}

/** One result on a junior day slide. */
export interface DayResultRow {
  grade: string;
  /** The opposition as the source names it; the card shortens it. */
  opposition: string;
  crestUrl: string | null;
  clubScore: string;
  oppositionScore: string;
  /** WIN / RESULT / DRAW / TIE / NO RESULT / ABANDONED. */
  resultWord: string;
  result: string;
  winner: "club" | "opposition" | "draw";
}

/** The day slide a set of junior fixtures share. Throws on a senior or mixed-day fixture. */
export function matchDayDayContent(
  fixtures: readonly MatchDayFixtureContent[],
): MatchDayDayContent {
  const first = fixtures[0];
  if (!first) throw new Error("A day slide needs at least one fixture.");
  for (const f of fixtures) {
    if (!f.junior) throw new Error("A day slide holds junior fixtures only.");
    if (f.day !== first.day) throw new Error("A day slide holds the fixtures of one day.");
  }
  return {
    kind: "matchDay",
    page: "day",
    junior: true,
    day: first.day,
    date: first.date,
    fixtures: [...fixtures],
  };
}

/** A day slide's fixture rows, with only `visible` fields shown. */
export function dayFixtureRows(
  content: MatchDayDayContent,
  visible: ReadonlySet<string>,
): DayFixtureRow[] {
  return content.fixtures.map((f) => ({
    grade: f.grade,
    opposition: f.opposition.name,
    crestUrl: visible.has("fixture.oppositionCrest") ? f.opposition.crestUrl : null,
    monogram: f.opposition.monogram,
    homeAway: f.homeAway,
    venue: f.venue,
    startTime: f.startTime,
    roundLabel: visible.has("fixture.round") ? f.roundLabel : "",
  }));
}

/** WIN / RESULT (a loss) / DRAW, or TIE / NO RESULT / ABANDONED when the result line says so. */
export function summaryResultWord(winner: "club" | "opposition" | "draw", result: string): string {
  if (/abandon/i.test(result)) return "ABANDONED";
  if (/no result/i.test(result)) return "NO RESULT";
  if (/\btie[d]?\b/i.test(result)) return "TIE";
  if (winner === "draw") return "DRAW";
  return winner === "club" ? "WIN" : "RESULT";
}

const score = (i: MatchSummaryInnings) => `${i.wickets}/${i.totalRuns}${i.declared ? "d" : ""}`;

/** A junior result's row. `grade` is the slide's grade label (the match's age group). */
export function dayResultRow(
  input: Pick<
    MatchSummaryInput,
    "result" | "resultWinner" | "opposition" | "innings" | "junior" | "matchTitle"
  > & { grade?: string },
): DayResultRow {
  if (input.junior !== true) throw new Error("A day slide holds junior results only.");
  const side = (key: "club" | "opposition") =>
    input.innings
      .filter((i) => i.teamKey === key)
      .map(score)
      .join(" & ") || "—";
  return {
    grade: (input.grade ?? input.matchTitle.split(/\s+[•·]\s+/)[0] ?? "").trim(),
    opposition: input.opposition.name,
    crestUrl: input.opposition.logoUrl ?? null,
    clubScore: side("club"),
    oppositionScore: side("opposition"),
    resultWord: summaryResultWord(input.resultWinner, input.result),
    result: input.result,
    winner: input.resultWinner,
  };
}

/** "SAT 12 OCT" for a YYYY-MM-DD club day (noon UTC is that day in every Australian zone). */
export function dayHeading(day: string, timeZone = CLUB_TIME_ZONE): string {
  return formatFixtureDate(new Date(`${day}T12:00:00Z`), timeZone);
}
