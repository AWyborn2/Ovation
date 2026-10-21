/**
 * Saved content is read back from a draft's jsonb: check its shape before a
 * carousel renders it, so a bad payload fails closed instead of printing
 * blanks.
 */

import type {
  CardContent,
  ContentTeam,
  MatchDayFixtureContent,
  ResultContent,
  TeamListContent,
} from "./types";

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown) => v === null || typeof v === "string";

function team(v: unknown): v is ContentTeam {
  return object(v) && str(v.name) && str(v.rawName) && strOrNull(v.crestUrl) && str(v.monogram);
}

function bookend(v: Record<string, unknown>): boolean {
  return (
    str(v.heading) &&
    str(v.dateRange) &&
    str(v.roundLabel) &&
    Number.isSafeInteger(v.fixtureCount) &&
    Number(v.fixtureCount) >= 0
  );
}

/** Optional data (P5) checks: a malformed value is dropped, so its field hides. */
const OPTIONAL_DATA: Record<string, (v: unknown) => boolean> = {
  livestream: (v) => object(v) && str(v.url) && /^https:\/\//i.test(v.url) && str(v.label),
  ladder: (v) =>
    object(v) &&
    str(v.club) &&
    strOrNull(v.opposition) &&
    Number.isSafeInteger(v.teams) &&
    strOrNull(v.tableName),
  lastMeeting: (v) =>
    object(v) &&
    ["won", "lost", "tied", "noResult"].includes(v.outcome as string) &&
    str(v.line) &&
    str(v.date) &&
    strOrNull(v.season),
  milestoneWatch: (v) => object(v) && str(v.playerName) && str(v.line),
};

function withoutBadOptionalData(
  raw: Record<string, unknown>,
  keys: readonly string[],
): CardContent {
  const out = { ...raw };
  for (const k of keys) if (k in out && !OPTIONAL_DATA[k]!(out[k])) delete out[k];
  return out as unknown as CardContent;
}

const optional = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v);

/** The sponsors page; the blocks added in P6 are optional (older carousels lack them). */
function sponsorsPage(v: Record<string, unknown>): boolean {
  return (
    Array.isArray(v.sponsors) &&
    v.sponsors.every(
      (s) =>
        object(s) &&
        str(s.name) &&
        str(s.logoUrl) &&
        optional(s.tier, (t) => t === "major" || t === "standard") &&
        optional(s.teamSponsor, (t) => typeof t === "boolean"),
    ) &&
    optional(v.thankYou, str) &&
    optional(v.cta, str) &&
    optional(v.nextHomeGame, (g) => g === null || (object(g) && str(g.match) && str(g.when))) &&
    optional(v.socials, (l) => Array.isArray(l) && l.every(str))
  );
}

/** The content, when `raw` is well-formed content of a known kind; else null. */
export function readCardContent(raw: unknown): CardContent | null {
  if (!object(raw)) return null;
  if (raw.kind === "results" || raw.kind === "matchSummary") {
    if (raw.page === "result") return result(raw);
    // A junior day slide: junior only, one day, one kind, every result well-formed.
    return raw.page === "day" &&
      raw.junior === true &&
      str(raw.day) &&
      str(raw.date) &&
      Array.isArray(raw.results) &&
      raw.results.length > 0 &&
      raw.results.every((r) => {
        const c = result(r);
        return (
          c !== null &&
          c.junior &&
          c.source.junior === true &&
          c.day === raw.day &&
          c.kind === raw.kind
        );
      })
      ? (raw as unknown as CardContent)
      : null;
  }
  if (raw.kind === "teamList") return teamList(raw);
  if (raw.kind !== "matchDay") return null;
  switch (raw.page) {
    case "title":
      return bookend(raw) ? withoutBadOptionalData(raw, ["livestream"]) : null;
    case "sponsors":
      return bookend(raw) && sponsorsPage(raw) ? (raw as unknown as CardContent) : null;
    case "day":
      // Junior only, one day, every fixture well-formed and of that day.
      return raw.junior === true &&
        str(raw.day) &&
        str(raw.date) &&
        Array.isArray(raw.fixtures) &&
        raw.fixtures.length > 0 &&
        raw.fixtures.every((f) => {
          const c = fixture(f);
          return c !== null && c.junior && c.day === raw.day;
        })
        ? (raw as unknown as CardContent)
        : null;
    case "fixture":
      return fixture(raw);
    default:
      return null;
  }
}

/** A fixture slide's content, when well-formed. */
function fixture(raw: unknown): MatchDayFixtureContent | null {
  if (!object(raw) || raw.kind !== "matchDay" || raw.page !== "fixture") return null;
  const s = raw.source;
  return Number.isSafeInteger(raw.fixtureId) &&
    typeof raw.junior === "boolean" &&
    strOrNull(raw.juniorTeamName) &&
    str(raw.grade) &&
    str(raw.roundLabel) &&
    team(raw.opposition) &&
    (raw.homeAway === "HOME" || raw.homeAway === "AWAY") &&
    str(raw.venue) &&
    str(raw.startAt) &&
    str(raw.day) &&
    str(raw.date) &&
    str(raw.startTime) &&
    object(s) &&
    str(s.grade) &&
    strOrNull(s.roundLabel) &&
    str(s.opponentName) &&
    strOrNull(s.opponentLogoUrl) &&
    strOrNull(s.venue)
    ? (withoutBadOptionalData(raw, [
        "ladder",
        "lastMeeting",
        "milestoneWatch",
      ]) as MatchDayFixtureContent)
    : null;
}

const int = (v: unknown) => Number.isSafeInteger(v);

/** A result card's content, when well-formed (its source is the card input it renders). */
function result(raw: unknown): ResultContent | null {
  if (!object(raw) || raw.page !== "result") return null;
  const s = raw.source;
  return (raw.kind === "results" || raw.kind === "matchSummary") &&
    int(raw.matchId) &&
    typeof raw.junior === "boolean" &&
    str(raw.grade) &&
    str(raw.roundLabel) &&
    strOrNull(raw.day) &&
    str(raw.date) &&
    team(raw.club) &&
    team(raw.opposition) &&
    typeof raw.hasPerformers === "boolean" &&
    object(s) &&
    s.kind === "matchSummary" &&
    str(s.matchTitle) &&
    str(s.result) &&
    ["club", "opposition", "draw"].includes(s.resultWinner as string) &&
    object(s.club) &&
    str(s.club.name) &&
    object(s.opposition) &&
    str(s.opposition.name) &&
    Array.isArray(s.innings) &&
    s.innings.every(
      (i) => object(i) && Array.isArray(i.topBatters) && Array.isArray(i.topBowlers),
    ) &&
    // Juniors isolation: a junior source is only ever junior content.
    (s.junior !== true || raw.junior === true)
    ? (raw as unknown as ResultContent)
    : null;
}

/** A team list card's content, when well-formed. */
function teamList(raw: Record<string, unknown>): TeamListContent | null {
  const s = raw.source;
  return raw.page === "team" &&
    int(raw.fixtureId) &&
    typeof raw.junior === "boolean" &&
    strOrNull(raw.juniorTeamName) &&
    str(raw.grade) &&
    str(raw.roundLabel) &&
    team(raw.opposition) &&
    ["HOME", "AWAY", ""].includes(raw.homeAway as string) &&
    str(raw.venue) &&
    str(raw.date) &&
    str(raw.startTime) &&
    strOrNull(raw.day) &&
    object(s) &&
    s.kind === "teamList" &&
    Array.isArray(s.players) &&
    s.players.length > 0 &&
    s.players.every((p) => object(p) && str(p.surname) && typeof p.order === "number") &&
    (s.junior !== true || raw.junior === true)
    ? (raw as unknown as TeamListContent)
    : null;
}
