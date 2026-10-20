/**
 * Saved content is read back from a draft's jsonb: check its shape before a
 * carousel renders it, so a bad payload fails closed instead of printing
 * blanks.
 */

import type { CardContent, ContentTeam } from "./types";

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

/** The content, when `raw` is well-formed Match Day content; else null. */
export function readCardContent(raw: unknown): CardContent | null {
  if (!object(raw) || raw.kind !== "matchDay") return null;
  switch (raw.page) {
    case "title":
      return bookend(raw) ? withoutBadOptionalData(raw, ["livestream"]) : null;
    case "sponsors":
      return bookend(raw) &&
        Array.isArray(raw.sponsors) &&
        raw.sponsors.every((s) => object(s) && str(s.name) && str(s.logoUrl))
        ? (raw as unknown as CardContent)
        : null;
    case "fixture": {
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
        ? withoutBadOptionalData(raw, ["ladder", "lastMeeting", "milestoneWatch"])
        : null;
    }
    default:
      return null;
  }
}
