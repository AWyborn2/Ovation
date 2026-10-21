/**
 * Card content (ADR-010): what a card says, resolved and display-ready —
 * names already short, dates formatted in the club's time zone, fallbacks
 * applied. Built once on the server (`api-server/src/lib/card-content/`) and
 * snapshotted into a saved carousel; pack templates only lay it out.
 * Pure data: no DB, no DOM.
 */

import type { MatchSummaryInput } from "../match-summary-types";

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
  /**
   * Optional data (P5). Each is loaded only when its field is visible and is
   * absent when the data is missing or the read failed, so the field hides
   * (never "TBC"). Never set on a junior fixture.
   */
  ladder?: ContentLadder;
  lastMeeting?: ContentLastMeeting;
  milestoneWatch?: ContentMilestoneWatch;
}

/**
 * Match Day junior day slide (P3): the junior fixtures of one club-time day,
 * as compact rows under the day's heading. Junior only, never mixed with
 * senior; each fixture keeps its own content.
 */
export interface MatchDayDayContent {
  kind: "matchDay";
  page: "day";
  junior: true;
  /** The club-time day, YYYY-MM-DD. */
  day: string;
  /** "SAT 12 OCT". */
  date: string;
  fixtures: MatchDayFixtureContent[];
}

export type MatchDayContent =
  MatchDayTitleContent | MatchDayFixtureContent | MatchDayDayContent | MatchDaySponsorsContent;

// ---------------------------------------------------------------------------
// Results, match summaries and team lists (P7). Each content holds `source`:
// the card input its source made, exactly as the sweep saved it before the
// content pipeline (raw names), so a single card for a club on Standard posts
// the same input it always has. The display values beside it (short names,
// crests, normalised round) are what a carousel slide, or a single card with a
// field switched off, prints.
// ---------------------------------------------------------------------------

/** A result card: one completed match, from the club's side. */
export interface ResultContent {
  /** The results set prints the scores; a match summary adds the top performers. */
  kind: "results" | "matchSummary";
  page: "result";
  /** The source match id: the club's, central's, or the junior match's (see `junior`). */
  matchId: number;
  /** Built from junior sources only (juniors isolation); never mixed with senior. */
  junior: boolean;
  /** The competition label as the card prints it. */
  grade: string;
  /** "ROUND 5", or "" when the match has none. */
  roundLabel: string;
  /** The club-time day, YYYY-MM-DD; null when the scorecard has no usable date. */
  day: string | null;
  /** "SAT 12 OCT", or "" without a day. */
  date: string;
  club: ContentTeam;
  opposition: ContentTeam;
  /** Whether any innings lists top batters or bowlers. */
  hasPerformers: boolean;
  /** The scorecard's card input as its source made it: the single card's input. */
  source: MatchSummaryInput;
}

/**
 * A junior results or match summary day slide (P3): the junior results of one
 * club-time day, as compact rows. Junior only; each result keeps its content.
 */
export interface ResultDayContent {
  kind: "results" | "matchSummary";
  page: "day";
  junior: true;
  day: string;
  /** "SAT 12 OCT". */
  date: string;
  results: ResultContent[];
}

/** A player as a team list card prints the row. */
export interface ContentTeamListPlayer {
  order: number;
  surname: string;
  firstInitial?: string;
  role?: string;
  debut?: boolean;
  /** The published side's overseas mark (ADR-009); never on a withheld player. */
  overseas?: boolean;
  shirtNumber?: string;
}

/** A team list card: one fixture's published side. */
export interface TeamListContent {
  kind: "teamList";
  page: "team";
  /** The source fixture id: the club's fixture, or the junior fixture (see `junior`). */
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
  /** "" when the source doesn't say. */
  homeAway: "HOME" | "AWAY" | "";
  venue: string;
  /** "SAT 12 OCT". */
  date: string;
  /** "12:30 PM". */
  startTime: string;
  /** The club-time day, YYYY-MM-DD; null without a start time. */
  day: string | null;
  /** The team list card input as its source made it (players included): the single card's input. */
  source: TeamListSource;
}

/** A team list card input, as the sweep saves it. */
export interface TeamListSource {
  kind: "teamList";
  players: ContentTeamListPlayer[];
  [key: string]: unknown;
}

/** Content per kind. */
export type CardContent = MatchDayContent | ResultContent | ResultDayContent | TeamListContent;
