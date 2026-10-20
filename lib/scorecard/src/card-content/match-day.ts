/**
 * Match Day content (ADR-010 P2), pure: a fixture becomes the content its
 * slide prints, and that content becomes the input a pack template binds.
 *
 * The server builder (`api-server/src/lib/card-content/match-day.ts`) loads
 * the fixtures and the club's names and calls these, for the 48-hour sweep
 * and the Weekend Carousel alike, so the two cannot drift.
 */

import {
  cardTeamCrest,
  resolveCardCompetition,
  resolveCardTeamName,
  teamMonogram,
  type CardNames,
} from "../card-names";
import { isJuniorGradeLabel } from "../junior-grade";
import type {
  MatchDayFixtureContent,
  MatchDaySponsorsContent,
  MatchDayTitleContent,
} from "./types";

/**
 * Pilot clubs are all in Western Australia and tenants carry no time zone yet,
 * so fixture times are formatted in Perth time (the server runs in UTC).
 */
export const CLUB_TIME_ZONE = "Australia/Perth";

/** "SAT 12 OCT". */
export function formatFixtureDate(d: Date, timeZone = CLUB_TIME_ZONE): string {
  return d
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone })
    .replace(/,/g, "")
    .toUpperCase();
}

/** "12:30 PM". */
export function formatFixtureTime(d: Date, timeZone = CLUB_TIME_ZONE): string {
  return d
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .toUpperCase();
}

/** The club-time day of an instant, YYYY-MM-DD. */
export function clubDay(d: Date, timeZone = CLUB_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  return ["year", "month", "day"].map((k) => parts.find((p) => p.type === k)!.value).join("-");
}

/** "SAT 12 OCT – SUN 13 OCT" for a YYYY-MM-DD range. */
export function dateRangeLabel(from: string, to: string, timeZone = CLUB_TIME_ZONE): string {
  const day = (s: string) => formatFixtureDate(new Date(`${s}T12:00:00Z`), timeZone);
  return `${day(from)} – ${day(to)}`;
}

/** "5" / "R5" / "round 5" → "ROUND 5"; anything else upper-cased as it is. */
export function normaliseRoundLabel(raw: string | null | undefined): string {
  const text = (raw ?? "").trim().replace(/\s+/g, " ");
  const numeric = text.match(/^(?:(?:round|r)\s*\.?\s*)?(\d+)$/i);
  return numeric ? `ROUND ${Number(numeric[1])}` : text.toUpperCase();
}

/**
 * One label for a set of fixtures' rounds: the round they share, "MIXED
 * ROUNDS" when they differ, and "" when any is unknown (a known round for one
 * team does not establish the round of another).
 */
export function combinedRoundLabel(labels: ReadonlyArray<string | null | undefined>): string {
  const normalised = labels.map(normaliseRoundLabel);
  if (new Set(normalised.filter(Boolean)).size > 1) return "MIXED ROUNDS";
  if (!normalised.length || normalised.some((l) => !l)) return "";
  return normalised[0]!;
}

/** The fixture fields a Match Day slide is built from (a `fixtures` row fits). */
export interface MatchDayFixtureLike {
  id: number;
  grade: string;
  roundLabel: string | null;
  opponentName: string;
  opponentLogoUrl: string | null;
  venue: string | null;
  startAt: Date;
  isHome: boolean;
}

export interface MatchDayFixtureOptions {
  /** The club's short names and crests (`loadCardNames`); absent → automatic names. */
  names?: CardNames | null;
  timeZone?: string;
  junior?: boolean;
  juniorTeamName?: string | null;
  /** The label a junior slide prints for its grade ("Under 13 — Blue"); default the grade. */
  gradeLabel?: string;
}

/** One fixture's content. Core fields only; optional data joins in P5. */
export function matchDayFixtureContent(
  fixture: MatchDayFixtureLike,
  opts: MatchDayFixtureOptions = {},
): MatchDayFixtureContent {
  const tz = opts.timeZone ?? CLUB_TIME_ZONE;
  const names = opts.names ?? null;
  const rawName = fixture.opponentName.trim();
  const name = resolveCardTeamName(names, rawName) || rawName;
  const gradeRaw = opts.gradeLabel ?? fixture.grade;
  return {
    kind: "matchDay",
    page: "fixture",
    fixtureId: fixture.id,
    // A junior-looking grade in the senior fixtures is treated as junior too (fail closed).
    junior: opts.junior === true || isJuniorGradeLabel(fixture.grade),
    juniorTeamName: opts.juniorTeamName ?? null,
    grade: resolveCardCompetition(names, gradeRaw) || gradeRaw,
    roundLabel: normaliseRoundLabel(fixture.roundLabel),
    opposition: {
      name,
      rawName,
      crestUrl: fixture.opponentLogoUrl || cardTeamCrest(names, rawName),
      monogram: teamMonogram(name),
    },
    homeAway: fixture.isHome ? "HOME" : "AWAY",
    venue: (fixture.venue ?? "").trim(),
    startAt: fixture.startAt.toISOString(),
    day: clubDay(fixture.startAt, tz),
    date: formatFixtureDate(fixture.startAt, tz),
    startTime: formatFixtureTime(fixture.startAt, tz),
    source: {
      grade: gradeRaw,
      roundLabel: fixture.roundLabel,
      opponentName: fixture.opponentName,
      opponentLogoUrl: fixture.opponentLogoUrl ?? null,
      venue: fixture.venue,
    },
  };
}

/**
 * The card input the 48-hour sweep saves for a fixture's draft. Exactly what
 * the sweep saved before the content pipeline (raw names; the renderer
 * shortens them), so existing auto-queued drafts are never rewritten.
 */
export function matchDayDraftInput(content: MatchDayFixtureContent): Record<string, unknown> {
  const s = content.source;
  return {
    kind: "matchDay",
    roundLabel: (s.roundLabel ?? "").toUpperCase(),
    oppositionName: s.opponentName,
    oppositionLogoUrl: s.opponentLogoUrl ?? null,
    homeAway: content.homeAway,
    venue: s.venue ?? "",
    date: content.date,
    startTime: content.startTime,
    grade: s.grade,
  };
}

export interface MatchDayBookendOptions {
  heading: string;
  from: string;
  to: string;
  /** Each fixture slide's round, as its source gave it. */
  roundLabels: ReadonlyArray<string | null | undefined>;
  fixtureCount: number;
  timeZone?: string;
}

const heading = (h: string) => h.trim() || "This weekend";

export function matchDayTitleContent(opts: MatchDayBookendOptions): MatchDayTitleContent {
  return {
    kind: "matchDay",
    page: "title",
    heading: heading(opts.heading),
    dateRange: dateRangeLabel(opts.from, opts.to, opts.timeZone),
    roundLabel: combinedRoundLabel(opts.roundLabels),
    fixtureCount: opts.fixtureCount,
  };
}

export function matchDaySponsorsContent(
  opts: MatchDayBookendOptions & { sponsors: Array<{ name: string; logoUrl: string }> },
): MatchDaySponsorsContent {
  return {
    ...matchDayTitleContent(opts),
    page: "sponsors",
    sponsors: opts.sponsors.map((s) => ({ name: s.name, logoUrl: s.logoUrl })),
  };
}
