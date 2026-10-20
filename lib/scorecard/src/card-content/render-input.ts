/**
 * Content → the input a pack template binds (ADR-010 layout contract). A
 * field projection only: the content is already display-ready, and a hidden
 * field is blanked so the template drops its box. `namesResolved` tells the
 * binder the names are final, so it does not shorten them a second time.
 */

import type { CardContent, MatchDayFixtureContent } from "./types";

export interface ContentInputOptions {
  /** The title slide has a cover photo (and `title.coverPhoto` is on). */
  hasCoverPhoto?: boolean;
}

/** The input for one slide's content, with only `visible` fields shown. */
export function contentInput(
  content: CardContent,
  visible: ReadonlySet<string>,
  opts: ContentInputOptions = {},
): Record<string, unknown> {
  if (content.page === "fixture") return fixtureInput(content, visible);
  const blank = {
    kind: "matchDay",
    roundLabel: visible.has("title.round") ? content.roundLabel : "",
    oppositionName: "",
    homeAway: "HOME",
    venue: "",
    date: content.dateRange,
    startTime: "",
    namesResolved: true,
  };
  return {
    ...blank,
    carouselPage: {
      page: content.page,
      title: content.heading,
      fixtureCount: content.fixtureCount,
      sponsors: content.page === "sponsors" ? content.sponsors : [],
      ...(content.page === "title" && opts.hasCoverPhoto && visible.has("title.coverPhoto")
        ? { hasCoverPhoto: true }
        : {}),
    },
  };
}

function fixtureInput(
  c: MatchDayFixtureContent,
  visible: ReadonlySet<string>,
): Record<string, unknown> {
  return {
    kind: "matchDay",
    grade: c.grade,
    roundLabel: visible.has("fixture.round") ? c.roundLabel : "",
    oppositionName: c.opposition.name,
    oppositionLogoUrl: visible.has("fixture.oppositionCrest") ? c.opposition.crestUrl : null,
    homeAway: c.homeAway,
    venue: c.venue,
    date: c.date,
    startTime: c.startTime,
    junior: c.junior,
    ...(c.junior && c.juniorTeamName ? { juniorTeamName: c.juniorTeamName } : {}),
    namesResolved: true,
  };
}
