/**
 * Content → the input a pack template binds (ADR-010 layout contract). A
 * field projection only: the content is already display-ready, and a hidden
 * field is blanked so the template drops its box. `namesResolved` tells the
 * binder the names are final, so it does not shorten them a second time.
 */

import type { CardContent, MatchDayFixtureContent, MatchDaySponsorsContent } from "./types";

export interface ContentInputOptions {
  /**
   * The slide has its photo: the title slide's cover (shown when
   * `title.coverPhoto` is on) or the sponsors page's background (`sponsors.background`).
   */
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
      ...(content.page === "sponsors" ? sponsorsPage(content, visible) : { sponsors: [] }),
      ...(opts.hasCoverPhoto &&
      visible.has(content.page === "title" ? "title.coverPhoto" : "sponsors.background")
        ? { hasCoverPhoto: true }
        : {}),
    },
  };
}

/**
 * The sponsors page's template input (P6). With none of its optional fields
 * on, it is exactly the page as it was: club sponsors in sponsor order. Each
 * optional block is added only when its field is on and it has a value.
 */
function sponsorsPage(
  c: MatchDaySponsorsContent,
  visible: ReadonlySet<string>,
): Record<string, unknown> {
  const shown = c.sponsors.filter((s) => visible.has("sponsors.teamSponsors") || !s.teamSponsor);
  const majors = visible.has("sponsors.tiers") ? shown.filter((s) => s.tier === "major") : [];
  const ordered = majors.length ? [...majors, ...shown.filter((s) => s.tier !== "major")] : shown;
  // The thank-you names the sponsors, so the no-sponsor page keeps its club thank-you.
  const thanks = visible.has("sponsors.thankYou") && ordered.length > 0;
  const extras = visible.has("sponsors.nextHomeGame");
  const socials = extras ? (c.socials ?? []).filter(Boolean).join(" · ") : "";
  return {
    sponsors: ordered.map((s) => ({ name: s.name, logoUrl: s.logoUrl })),
    ...(majors.length ? { majorCount: majors.length } : {}),
    ...(thanks && c.thankYou ? { thankYou: c.thankYou } : {}),
    ...(thanks && c.cta ? { cta: c.cta } : {}),
    ...(extras && c.nextHomeGame ? { nextHome: { ...c.nextHomeGame } } : {}),
    ...(socials ? { socials } : {}),
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
