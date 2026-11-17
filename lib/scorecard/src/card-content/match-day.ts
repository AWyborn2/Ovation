/**
 * Match Day content (ADR-010 P2), pure: a fixture becomes the content its
 * slide prints, and that content becomes the input a pack template binds.
 *
 * The server builder (`api-server/src/lib/card-content/match-day.ts`) loads
 * the fixtures and the club's names and calls these, for the 48-hour sweep
 * and the Weekend Carousel alike, so the two cannot drift.
 */

import {
  resolveCardCrest,
  resolveCardCompetition,
  resolveCardTeamName,
  teamMonogram,
  type CardNames,
} from "../card-names";
import { isJuniorGradeLabel } from "../junior-grade";
import { clampSponsorsPerSlide, sponsorsSplit } from "../kind-templates/tile-grid";
import type {
  ContentLadder,
  ContentLastMeeting,
  ContentLivestream,
  ContentMilestoneWatch,
  ContentNextHomeGame,
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type DayOfMonth = { day: number; month: number; year?: number };

/** Two days as a short span: "13 Nov", "13–22 Nov", "28 Nov – 2 Dec", years only when they differ. */
function daySpan(a: DayOfMonth, b: DayOfMonth): string {
  const years = a.year !== undefined && b.year !== undefined && a.year !== b.year;
  const one = (d: DayOfMonth) => `${d.day} ${MONTHS[d.month]}${years ? ` ${d.year}` : ""}`;
  if (!years && a.month === b.month) return a.day === b.day ? one(b) : `${a.day}–${one(b)}`;
  return `${one(a)} – ${one(b)}`;
}

/**
 * A YYYY-MM-DD range as the app writes dates: "13–22 Nov", "28 Nov – 2 Dec",
 * "28 Dec 2026 – 3 Jan 2027". It says nothing about whether the range is past
 * or to come, so a set built for one weekend reads right whenever it is seen.
 * A range it can't read comes back as it was given.
 */
export function shortDateRange(from: string, to: string): string {
  const parse = (s: string): DayOfMonth | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return month >= 1 && month <= 12 && day >= 1 && day <= 31
      ? { year, month: month - 1, day }
      : null;
  };
  const a = parse(from);
  const b = parse(to || from);
  if (!a || !b) return [from, to].filter(Boolean).join(" – ");
  return a.year! > b.year! ||
    (a.year === b.year && (a.month > b.month || (a.month === b.month && a.day > b.day)))
    ? daySpan(b, a)
    : daySpan(a, b);
}

/** A stored set title written from its raw range ("2026-11-13 – 2026-11-22") as `shortDateRange`; other text as it is. */
export function readableDateRange(text: string): string {
  const m = /^\s*(\d{4}-\d{2}-\d{2})\s*[–—-]\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(text);
  return m ? shortDateRange(m[1]!, m[2]!) : text;
}

/**
 * A card's printed dates ("SAT 13 NOV – SUN 22 NOV", "SAT 31 – SUN 1 JAN",
 * "SAT 8 NOV") as a short span ("13–22 Nov"), for a cover's date chip; "" when
 * the text holds no date, so the chip drops rather than print something else.
 */
export function shortDateSpanFromLabel(label: string | null | undefined): string {
  const parts = (label ?? "")
    .split(/\s[–—-]\s|–/)
    .map((part) => {
      const m = /(\d{1,2})(?:\s+([A-Za-z]{3}))?/.exec(part);
      if (!m) return null;
      const month = m[2] ? MONTHS.findIndex((x) => x.toLowerCase() === m[2]!.toLowerCase()) : -1;
      return { day: Number(m[1]), month };
    })
    .filter((p): p is { day: number; month: number } => p !== null && p.day >= 1 && p.day <= 31);
  if (parts.length === 0 || parts.length > 2) return "";
  const last = parts[parts.length - 1]!;
  if (last.month < 0) return "";
  const first = parts[0]!;
  // "SAT 31 – SUN 1 JAN": a first day without its month is in the last day's
  // month, or the month before when it comes later in the month.
  const firstMonth =
    first.month >= 0 ? first.month : first.day > last.day ? (last.month + 11) % 12 : last.month;
  return daySpan({ day: first.day, month: firstMonth }, last);
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
      crestUrl: resolveCardCrest(names, rawName, fixture.opponentLogoUrl),
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
  /** The club's livestream link (`social_settings.livestream_url`); the title page only. */
  livestreamUrl?: string | null;
}

const heading = (h: string) => h.trim() || "Match day";

export function matchDayTitleContent(opts: MatchDayBookendOptions): MatchDayTitleContent {
  const livestream = livestreamContent(opts.livestreamUrl);
  return {
    kind: "matchDay",
    page: "title",
    heading: heading(opts.heading),
    dateRange: dateRangeLabel(opts.from, opts.to, opts.timeZone),
    roundLabel: combinedRoundLabel(opts.roundLabels),
    fixtureCount: opts.fixtureCount,
    ...(livestream ? { livestream } : {}),
  };
}

/** A sponsor as the club lists it (an active `sponsors` row fits). */
export interface MatchDaySponsorLike {
  name: string;
  logoUrl: string;
  tier?: string | null;
  /** Grades the sponsor backs: a team sponsor when any is a real grade. */
  grades?: readonly string[] | null;
  /** The caller's own team-sponsor test, when it has one (it wins over `grades`). */
  teamSponsor?: boolean;
  /** The club's presenting sponsor. */
  presenting?: boolean;
}

/**
 * Whether the club sponsors page shows a sponsor (Ash, 17 Nov 2026): the
 * presenting and major sponsors always, even when tagged to a grade; any
 * other sponsor tagged to a grade only while "Team sponsors too"
 * (`sponsors.teamSponsors`) is on.
 */
export function sponsorOnClubPage(
  s: { teamSponsor?: boolean; tier?: string | null; presenting?: boolean },
  teamSponsorsOn: boolean,
): boolean {
  return teamSponsorsOn || !s.teamSponsor || s.tier === "major" || s.presenting === true;
}

export interface MatchDaySponsorsOptions extends MatchDayBookendOptions {
  /** Active sponsors in sponsor order, presenting sponsor included or not as the caller chooses. */
  sponsors: readonly MatchDaySponsorLike[];
  /** The club's next senior home game (fixture content from the server), when there is one. */
  nextHomeGame?: MatchDayFixtureContent | null;
  /** The club's social handles and website, in print order. */
  socials?: readonly string[];
}

export const SPONSORS_THANK_YOU = "THANK YOU TO OUR SPONSORS";
export const SPONSORS_CTA = "SUPPORT THE BUSINESSES THAT SUPPORT US";
const MAX_SOCIALS = 3;

/** "SAT 17 OCT · 12:30 PM · LAKELANDS OVAL"; parts the fixture lacks are left out. */
export function nextHomeGameContent(f: MatchDayFixtureContent): ContentNextHomeGame {
  return {
    match: `${f.grade} v ${f.opposition.name}`,
    when: [f.date, f.startTime, f.venue].filter(Boolean).join(" · "),
  };
}

/**
 * The sponsors page (P6). Club sponsors come first in sponsor order, then the
 * sponsors assigned to a team; every optional block is held here and the
 * visible fields pick what prints (`contentInput`), so a per-carousel override
 * re-projects without a rebuild.
 */
export function matchDaySponsorsContent(opts: MatchDaySponsorsOptions): MatchDaySponsorsContent {
  const isTeam = (s: MatchDaySponsorLike) =>
    s.teamSponsor ?? (s.grades ?? []).some((g) => g.trim() !== "");
  const sponsor = (s: MatchDaySponsorLike) => ({
    name: s.name,
    logoUrl: s.logoUrl,
    tier: s.tier === "major" ? ("major" as const) : ("standard" as const),
    teamSponsor: isTeam(s),
    ...(s.presenting ? { presenting: true } : {}),
  });
  const socials = [...new Set((opts.socials ?? []).map((s) => s.trim()).filter(Boolean))];
  // The livestream link belongs to the title page.
  const { livestream: _livestream, ...bookend } = matchDayTitleContent(opts);
  return {
    ...bookend,
    page: "sponsors",
    sponsors: [...opts.sponsors.filter((s) => !isTeam(s)), ...opts.sponsors.filter(isTeam)].map(
      sponsor,
    ),
    thankYou: SPONSORS_THANK_YOU,
    cta: SPONSORS_CTA,
    nextHomeGame: opts.nextHomeGame ? nextHomeGameContent(opts.nextHomeGame) : null,
    socials: socials.slice(0, MAX_SOCIALS),
  };
}

/**
 * The sponsors page as the carousel's slides (Halls Head, Oct 2026): one
 * page while the sponsors it shows fit `perPage` (the club's sponsors per
 * slide, or a design's own), else as few pages as hold them, shared evenly
 * (`sponsorsSplit`: 20 at 12 is 10 and 10), the major sponsors first. Each
 * page keeps the thank-you; the next home game and the socials close the
 * last. The sponsors shown are the ones the page input would show
 * (`contentInput`): team sponsors only while their field is on, majors first
 * while tiers are on, so each page re-projects to itself.
 */
export function splitSponsorsContent(
  content: MatchDaySponsorsContent,
  visible: ReadonlySet<string>,
  perPage?: number,
): MatchDaySponsorsContent[] {
  const shown = content.sponsors.filter((s) =>
    sponsorOnClubPage(s, visible.has("sponsors.teamSponsors")),
  );
  const ordered = visible.has("sponsors.tiers")
    ? [...shown.filter((s) => s.tier === "major"), ...shown.filter((s) => s.tier !== "major")]
    : shown;
  const shares = sponsorsSplit(ordered.length, clampSponsorsPerSlide(perPage));
  if (shares.length <= 1) return [content];
  let at = 0;
  return shares.map((n, i) => {
    const last = i === shares.length - 1;
    const page = {
      ...content,
      sponsors: ordered.slice(at, at + n),
      nextHomeGame: last ? content.nextHomeGame : null,
      socials: last ? content.socials : [],
    };
    at += n;
    return page;
  });
}

// ---------------------------------------------------------------------------
// Optional data (P5), display-ready. The server builder loads the data (only
// for visible fields) and these turn it into what the card prints. Each
// returns null for data it can't print, so the field hides (never "TBC").
// ---------------------------------------------------------------------------

/** 1 → "1ST", 22 → "22ND", 13 → "13TH". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "TH" : (["ST", "ND", "RD"][(n % 10) - 1] ?? "TH");
  return `${n}${suffix}`;
}

/** The club's link as the title page prints it, or null when it isn't an https address. */
export function livestreamContent(url: string | null | undefined): ContentLivestream | null {
  const raw = (url ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) return null;
  const label = `${parsed.hostname.replace(/^www\./i, "")}${parsed.pathname}`
    .replace(/\/+$/, "")
    .toLowerCase();
  return { url: raw, label };
}

/** Both teams' places, from the ladder read; null without a club rank. */
export function ladderContent(
  positions: {
    teams: number;
    tableName: string | null;
    club: { rank: number };
    opposition: { rank: number } | null;
  } | null,
): ContentLadder | null {
  const rank = (r: number | undefined) =>
    r != null && Number.isSafeInteger(r) && r > 0 ? r : null;
  const club = rank(positions?.club.rank);
  if (!positions || club === null) return null;
  const opposition = rank(positions.opposition?.rank);
  return {
    club: ordinal(club),
    opposition: opposition === null ? null : ordinal(opposition),
    teams: positions.teams,
    tableName: positions.tableName,
  };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Won by 24 runs · 2025/26", from the last-meeting read; null when there was none. */
export function lastMeetingContent(
  meeting: {
    outcome: ContentLastMeeting["outcome"];
    margin: string | null;
    date: string;
    season: string | null;
  } | null,
): ContentLastMeeting | null {
  if (!meeting) return null;
  const result =
    meeting.outcome === "won" || meeting.outcome === "lost"
      ? `${capitalise(meeting.outcome)}${meeting.margin ? ` by ${meeting.margin}` : ""}`
      : meeting.outcome === "tied"
        ? "Tied"
        : "No result";
  const season = (meeting.season ?? "").match(/\d{4}\/\d{2,4}|\d{4}/)?.[0] ?? "";
  return {
    outcome: meeting.outcome,
    line: season ? `${result} · ${season}` : result,
    date: meeting.date,
    season: meeting.season,
  };
}

/** "Jack Smith" → "J. Smith"; one word stays as it is. */
export function shortPlayerName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "";
  return `${words[0]!.charAt(0).toUpperCase()}. ${words.slice(1).join(" ")}`;
}

/** One milestone within reach, as the milestone watch reads it. */
export interface MilestoneWithinReach {
  playerName: string;
  stat: "games" | "runs" | "wickets";
  /** The tier: 100 games, 1,000 runs. */
  tier: number;
  /** How many more: always 1 for games (this match is the milestone). */
  gap: number;
}

/** "J. Smith needs 12 for 1,000 club runs" / "J. Smith's 100th club game". */
export function milestoneWatchContent(
  m: MilestoneWithinReach | null,
): ContentMilestoneWatch | null {
  if (!m) return null;
  const name = shortPlayerName(m.playerName);
  if (!name || m.gap < 1) return null;
  const tier = m.tier.toLocaleString("en-AU");
  const line =
    m.stat === "games"
      ? `${name}'s ${ordinal(m.tier).toLowerCase()} club game`
      : `${name} needs ${m.gap} for ${tier} club ${m.stat}`;
  return { playerName: name, line };
}
