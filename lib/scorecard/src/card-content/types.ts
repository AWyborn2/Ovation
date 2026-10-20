/**
 * Card content (ADR-010): what a card says, resolved and display-ready —
 * names already short, dates formatted in the club's time zone, fallbacks
 * applied. Built once on the server (`api-server/src/lib/card-content/`) and
 * snapshotted into a saved carousel; pack templates only lay it out.
 * Pure data: no DB, no DOM.
 */

/** A team as a card prints it. */
export interface ContentTeam {
  /** The club's short name, else the automatic one, else the raw name. */
  name: string;
  /** The name the source had, before shortening. */
  rawName: string;
  /** The crest, when there is one; the monogram stands in otherwise. */
  crestUrl: string | null;
  monogram: string;
}

/** Match Day title slide: the weekend's heading. */
export interface MatchDayTitleContent {
  kind: "matchDay";
  page: "title";
  heading: string;
  /** "SAT 12 OCT – SUN 13 OCT". */
  dateRange: string;
  /** "ROUND 5", "MIXED ROUNDS", or "" when unknown. */
  roundLabel: string;
  fixtureCount: number;
}

/** A sponsor as the sponsors page prints it. */
export interface ContentSponsor {
  name: string;
  logoUrl: string;
  /** Larger on the page when `sponsors.tiers` is on. Absent (saved before P6) = standard. */
  tier?: "major" | "standard";
  /** Assigned to a team: shown only when `sponsors.teamSponsors` is on. Absent = false. */
  teamSponsor?: boolean;
}

/** The club's next home game, as the sponsors page prints it. */
export interface ContentNextHomeGame {
  /** "A GRADE v ROCKINGHAM": the grade and short opposition name. */
  match: string;
  /** "SAT 17 OCT · 12:30 PM · LAKELANDS OVAL"; the ground is left out when unknown. */
  when: string;
}

/**
 * Match Day sponsors slide: the club's sponsors, and (P6) the page's optional
 * blocks. Each optional value is held whatever the toggles say; the template
 * input shows only the visible ones, so a per-carousel override needs no rebuild.
 * Fields added in P6 are optional: carousels saved before it read unchanged.
 */
export interface MatchDaySponsorsContent {
  kind: "matchDay";
  page: "sponsors";
  heading: string;
  dateRange: string;
  roundLabel: string;
  fixtureCount: number;
  /** Club sponsors in sponsor order, then team sponsors. */
  sponsors: ContentSponsor[];
  /** "THANK YOU TO OUR SPONSORS". */
  thankYou?: string;
  /** "SUPPORT THE BUSINESSES THAT SUPPORT US", or the club's website. */
  cta?: string;
  nextHomeGame?: ContentNextHomeGame | null;
  /** "@ourclub", "Our Cricket Club", "ourclub.com.au", in print order. */
  socials?: string[];
}

/** The values a fixture came from, unshortened (the sweep's draft input keeps them). */
export interface MatchDayFixtureSource {
  grade: string;
  roundLabel: string | null;
  opponentName: string;
  opponentLogoUrl: string | null;
  venue: string | null;
}

/** Match Day fixture slide: one fixture. */
export interface MatchDayFixtureContent {
  kind: "matchDay";
  page: "fixture";
  fixtureId: number;
  /** Built from junior sources only (juniors isolation); never mixed with senior. */
  junior: boolean;
  /** A junior side's own name ("Under 13 Blue"), when PlayHQ gives one. */
  juniorTeamName: string | null;
  /** The competition label as the card prints it. */
  grade: string;
  /** "ROUND 5", or "" when the fixture has none. */
  roundLabel: string;
  opposition: ContentTeam;
  homeAway: "HOME" | "AWAY";
  /** "" when the fixture has no ground (never "TBC"). */
  venue: string;
  /** ISO instant of the first ball. */
  startAt: string;
  /** The club-time day, YYYY-MM-DD (junior sets group on it). */
  day: string;
  /** "SAT 12 OCT". */
  date: string;
  /** "12:30 PM". */
  startTime: string;
  source: MatchDayFixtureSource;
}

export type MatchDayContent =
  MatchDayTitleContent | MatchDayFixtureContent | MatchDaySponsorsContent;

/** Content per kind; more kinds join as they move onto the pipeline (P7). */
export type CardContent = MatchDayContent;
