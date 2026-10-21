import { and, or, sql } from "drizzle-orm";
import { centralDb, centralClubsTable, centralMatchesTable } from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { appGradeFromCentral } from "./grades";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Last meeting (ADR-010 P5): the most recent finished senior match between a
// club and one opponent in the same app grade, before a fixture, told from the
// club's side. Read from `central.matches` (symmetric, so both orientations).
//
// Rules (DBA T5.0, decisions/dba/match-day-carousel-content.md §3):
//   - Grades compare by app grade (`appGradeFromCentral`), never raw label, so
//     "A Grade" and "A Grade: Wyllie Cup" are one family. A label that maps to
//     no app grade (junior, pathway, charity) never counts (juniors isolation).
//     T20 and mid-year sub-competitions fold into their base grade: that is
//     the grade family the card names.
//   - Only finished matches: in-progress, abandoned, cancelled and forfeited
//     matches are not a meeting.
//   - Club lineage: a renamed or merged club is the same club. Each side is
//     widened to its lineage family (`central.clubs.parent_club_id`), so a
//     meeting under an earlier id still counts.
//   - `before` (the fixture's club-time day) is exclusive, so a re-run on
//     match day never returns that day's own match.
//   - Any candidate whose date can't be read hides the field: without its
//     date the latest meeting can't be told, and an older one shown as the
//     last would be wrong.
// ---------------------------------------------------------------------------

/** How the last meeting went for the club. */
export type LastMeetingOutcome = "won" | "lost" | "tied" | "noResult";

export interface CentralLastMeeting {
  matchId: number;
  /** YYYY-MM-DD. */
  date: string;
  season: string | null;
  round: string | null;
  appGrade: string;
  outcome: LastMeetingOutcome;
  /** "24 runs", "3 wickets": from the result text when it says; else null. */
  margin: string | null;
  resultText: string | null;
}

/** A central match the read considers (the columns the pure pick needs). */
export interface LastMeetingCandidate {
  matchId: number;
  grade: string | null;
  season: string | null;
  round: string | null;
  matchDate: string | null;
  status: string | null;
  homeClubId: number | null;
  awayClubId: number | null;
  winnerClubId: number | null;
  resultText: string | null;
}

const NOT_A_MEETING = /in[ _]?progress|abandon|cancel|forfeit|postpone|scheduled|upcoming/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDay(y: number, m: number, d: number): string | null {
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d)
    return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * A central match date as YYYY-MM-DD, or null when it can't be read: ISO
 * (PlayHQ rows), "12 Jan 2024", and day-first "12/01/2024" (Australian sources).
 */
export function centralMatchDay(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/"/g, "").trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (named) {
    const mon = MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    return mon ? isoDay(Number(named[3]), mon, Number(named[1])) : null;
  }
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (dmy) return isoDay(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

/** "won by 24 runs" → "24 runs"; null when the text gives no margin. */
export function resultMargin(resultText: string | null): string | null {
  const m = (resultText ?? "").match(/\bwon\s+by\s+(.+?)\s*\.?$/i);
  return m ? m[1]!.trim() : null;
}

/**
 * The lineage family of each club: every club linked to it through
 * `parent_club_id`, in either direction. Pure. A club absent from `clubs`
 * is a family of one.
 */
export function lineageFamilies(
  clubs: ReadonlyArray<{ clubId: number; parentClubId: number | null }>,
): (clubId: number) => number[] {
  const parent = new Map<number, number>();
  const root = (id: number): number => {
    let r = id;
    const seen = new Set<number>();
    while (parent.has(r) && !seen.has(r)) {
      seen.add(r);
      r = parent.get(r)!;
    }
    return r;
  };
  for (const c of clubs) {
    if (c.parentClubId == null || c.parentClubId === c.clubId) continue;
    const a = root(c.clubId);
    const b = root(c.parentClubId);
    if (a !== b) parent.set(a, b);
  }
  const members = new Map<number, number[]>();
  for (const c of clubs) {
    for (const id of [c.clubId, c.parentClubId]) {
      if (id == null) continue;
      const list = members.get(root(id)) ?? [];
      if (!list.includes(id)) list.push(id);
      members.set(root(id), list);
    }
  }
  return (clubId) => [...(members.get(root(clubId)) ?? [clubId])].sort((x, y) => x - y);
}

/**
 * The last meeting among `candidates`, from the side of `clubFamily`. Pure:
 * the read's rules (grade family, finished only, `before` exclusive, both
 * orientations, unreadable dates hide) live here so they're tested directly.
 */
export function pickLastMeeting(
  candidates: readonly LastMeetingCandidate[],
  opts: {
    clubFamily: readonly number[];
    opponentFamily: readonly number[];
    appGrade: string;
    before: string;
  },
): CentralLastMeeting | null {
  const club = new Set(opts.clubFamily);
  const opp = new Set(opts.opponentFamily);
  if ([...club].some((id) => opp.has(id))) return null;
  let best: { m: LastMeetingCandidate; day: string } | null = null;
  for (const m of candidates) {
    const pair =
      (m.homeClubId != null && club.has(m.homeClubId) && opp.has(m.awayClubId ?? NaN)) ||
      (m.awayClubId != null && club.has(m.awayClubId) && opp.has(m.homeClubId ?? NaN));
    if (!pair) continue;
    if (appGradeFromCentral(m.grade) !== opts.appGrade) continue;
    if (NOT_A_MEETING.test(m.status ?? "")) continue;
    const day = centralMatchDay(m.matchDate);
    if (!day) {
      // A meeting we can't date might be the latest one.
      if ((m.matchDate ?? "").trim()) return null;
      continue;
    }
    if (day >= opts.before) continue;
    if (!best || day > best.day || (day === best.day && m.matchId > best.m.matchId))
      best = { m, day };
  }
  if (!best) return null;
  const { m, day } = best;
  const outcome: LastMeetingOutcome =
    m.winnerClubId != null && club.has(m.winnerClubId)
      ? "won"
      : m.winnerClubId != null && opp.has(m.winnerClubId)
        ? "lost"
        : /\btie[sd]?\b/i.test(m.resultText ?? "")
          ? "tied"
          : "noResult";
  return {
    matchId: m.matchId,
    date: day,
    season: m.season,
    round: m.round,
    appGrade: opts.appGrade,
    outcome,
    margin: outcome === "won" || outcome === "lost" ? resultMargin(m.resultText) : null,
    resultText: m.resultText,
  };
}

/** Every club's lineage link, cached (the register is small and rarely changes). */
async function clubLineageLinks(): Promise<Array<{ clubId: number; parentClubId: number | null }>> {
  return withCentralCache(cacheKey("clubLineageLinks", []), () =>
    centralDb
      .select({ clubId: centralClubsTable.clubId, parentClubId: centralClubsTable.parentClubId })
      .from(centralClubsTable),
  );
}

/**
 * The club's last finished senior meeting with the opponent in `appGrade`
 * before `before` (YYYY-MM-DD, exclusive), lineage aware. Null — the field
 * hides — when there is none, the grade isn't a senior app grade, the two are
 * one club, or a candidate's date can't be read. `clubId` is required: never
 * defaulted, so an omitted club is a compile error, not another club's read.
 */
export async function centralLastMeeting(opts: {
  clubId: number;
  opponentClubId: number;
  appGrade: string;
  before: string;
}): Promise<CentralLastMeeting | null> {
  const { clubId, opponentClubId, before } = opts;
  const appGrade = appGradeFromCentral(opts.appGrade);
  if (!appGrade || clubId === opponentClubId || !/^\d{4}-\d{2}-\d{2}$/.test(before)) return null;
  return withCentralCache(
    cacheKey("centralLastMeeting", [clubId, opponentClubId, appGrade, before]),
    async () => {
      const familyOf = lineageFamilies(await clubLineageLinks());
      const clubFamily = familyOf(clubId);
      const opponentFamily = familyOf(opponentClubId);
      const m = centralMatchesTable;
      const rows = await centralDb
        .select({
          matchId: m.matchId,
          grade: m.grade,
          season: m.season,
          round: m.round,
          matchDate: m.matchDate,
          status: m.status,
          homeClubId: m.homeClubId,
          awayClubId: m.awayClubId,
          winnerClubId: m.winnerClubId,
          resultText: m.resultText,
        })
        .from(m)
        .where(
          or(
            and(inList(m.homeClubId, clubFamily), inList(m.awayClubId, opponentFamily)),
            and(inList(m.homeClubId, opponentFamily), inList(m.awayClubId, clubFamily)),
          ),
        )
        .orderBy(sql`${m.matchId} desc`);
      return pickLastMeeting(rows, { clubFamily, opponentFamily, appGrade, before });
    },
  );
}
