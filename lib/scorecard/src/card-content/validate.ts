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

/** The content, when `raw` is well-formed Match Day content; else null. */
export function readCardContent(raw: unknown): CardContent | null {
  if (!object(raw) || raw.kind !== "matchDay") return null;
  switch (raw.page) {
    case "title":
      return bookend(raw) ? (raw as unknown as CardContent) : null;
    case "sponsors":
      return bookend(raw) && sponsorsPage(raw) ? (raw as unknown as CardContent) : null;
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
        ? (raw as unknown as CardContent)
        : null;
    }
    default:
      return null;
  }
}
