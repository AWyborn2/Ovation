/**
 * What the Weekend Carousel's sources route sends for a team list or a
 * scorecard (ADR-010 P7): content from the server's builders. Tests make it
 * from a card input with the same pure functions the builders call.
 */
import type { Fixture } from "@workspace/api-client-react";
import type { MatchSummaryInput } from "@workspace/scorecard";
import {
  clubDay,
  resultContent,
  teamListContent,
  type TeamListSource,
} from "@workspace/scorecard/card-content";

type FixtureLike = Pick<Fixture, "id" | "grade" | "opponentName" | "startAt"> &
  Partial<Pick<Fixture, "roundLabel" | "venue" | "opponentLogoUrl">>;

/** A team list or result's content, as the server builds it from `input`. */
export function slideContentFor(
  type: "teamList" | "results" | "matchSummary",
  fixture: FixtureLike,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const junior = input.junior === true;
  if (type === "teamList")
    return teamListContent(
      {
        id: fixture.id,
        grade: fixture.grade,
        roundLabel: fixture.roundLabel ?? null,
        opponentName: fixture.opponentName,
        opponentLogoUrl: fixture.opponentLogoUrl ?? null,
        venue: fixture.venue ?? null,
        startAt: new Date(fixture.startAt),
      },
      { players: [], ...input, kind: "teamList" } as TeamListSource,
      { junior },
    ) as unknown as Record<string, unknown>;
  const { carouselDetail: _detail, grade, ...source } = input;
  return resultContent(
    {
      matchTitle: fixture.grade,
      result: "",
      resultWinner: "club",
      club: { name: "Our Club" },
      opposition: { name: fixture.opponentName },
      innings: [],
      ...source,
      kind: "matchSummary",
    } as unknown as MatchSummaryInput,
    {
      kind: type,
      matchId: Math.abs(fixture.id),
      junior,
      grade: (typeof grade === "string" && grade) || fixture.grade,
      day: clubDay(new Date(fixture.startAt)),
    },
  ) as unknown as Record<string, unknown>;
}

/** Every fixture's content for a set, from one card input each. */
export function sourcesFor(
  type: "teamList" | "results" | "matchSummary",
  fixtures: readonly FixtureLike[],
  inputOf: (f: FixtureLike) => Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(fixtures.map((f) => [f.id, slideContentFor(type, f, inputOf(f))]));
}
