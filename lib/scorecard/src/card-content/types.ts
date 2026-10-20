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
  /** The club's livestream or scores link (P5); absent when the club has none. */
  livestream?: ContentLivestream;
}

/** A link the title page prints: "Watch live" and the address, shortened. */
export interface ContentLivestream {
  /** The https address as the club saved it. */
  url: string;
  /** "youtube.com/@ourclub": no scheme, no "www.", no trailing slash. */
  label: string;
}

/** Both teams' season ladder positions (P5), as the card prints them. */
export interface ContentLadder {
  /** "3RD". */
  club: string;
  /** "5TH", or null when the opposition has no place on the same table. */
  opposition: string | null;
  /** Teams on the table. */
  teams: number;
  /** The table's name when the grade publishes several ("One Day"); else null. */
  tableName: string | null;
}

/** The last time the two clubs met in this grade (P5), from the club's side. */
export interface ContentLastMeeting {
  outcome: "won" | "lost" | "tied" | "noResult";
  /** "Won by 24 runs · 2025/26". */
  line: string;
  /** YYYY-MM-DD. */
  date: string;
  season: string | null;
}

/** A player in this fixture's side within reach of a club milestone (P5, senior only). */
export interface ContentMilestoneWatch {
  /** "J. Smith". */
  playerName: string;
  /** "J. Smith needs 12 for 1,000 club runs". */
  line: string;
}

/** Match Day sponsors slide: the club's sponsors without a team of their own. */
export interface MatchDaySponsorsContent {
  kind: "matchDay";
  page: "sponsors";
  heading: string;
  dateRange: string;
  roundLabel: string;
  fixtureCount: number;
  sponsors: Array<{ name: string; logoUrl: string }>;
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
  /**
   * Optional data (P5). Each is loaded only when its field is visible and is
   * absent when the data is missing or the read failed, so the field hides
   * (never "TBC"). Never set on a junior fixture.
   */
  ladder?: ContentLadder;
  lastMeeting?: ContentLastMeeting;
  milestoneWatch?: ContentMilestoneWatch;
}

export type MatchDayContent =
  MatchDayTitleContent | MatchDayFixtureContent | MatchDaySponsorsContent;

/** Content per kind; more kinds join as they move onto the pipeline (P7). */
export type CardContent = MatchDayContent;
