import { and, eq } from "drizzle-orm";
import {
  centralDb,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralMatchesTable,
} from "../central";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { canonicalizeLines, type CentralMerges } from "./merges";
import { centralPlayerNames } from "./privacy";
import { clubInvolvedWhere, inList } from "./where";

// ---------------------------------------------------------------------------
// Each participant's first match in a cap-bearing grade (A Grade / Female A
// Grade) for a club, for the cap register (central-cap-sync in the API). Keyed
// by participant GUID (merged GUIDs folded onto their keeper); the caller maps
// GUIDs to its player ids. Deliberately UNCACHED, like the drafting-sweep
// reads: the sweep must see the match that just loaded.
// ---------------------------------------------------------------------------

export interface GradeDebutMatch {
  matchId: number;
  grade: string | null;
  season: string | null;
  matchDate: string | null;
}

export interface GradeDebutLine {
  participantId: string | null;
  matchId: number | null;
  /** Batting position (rosters and bowling lines have none). */
  batOrder: number | null;
}

export interface CentralGradeDebut {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
  /** App grade ("A Grade" / "Female A Grade"). */
  grade: string;
  matchId: number;
  matchDate: string | null;
  season: number | null;
  /** Batting position in the debut match; null when the player didn't bat. */
  batOrder: number | null;
  /** Matches the player has in the grade for the club. */
  games: number;
}

/**
 * Pure fold: per (participant, grade), the earliest match (by date, then match
 * id) and the number of matches in the grade. A roster, batting or bowling line
 * each counts as an appearance (the central "games" rule).
 */
export function foldGradeDebuts(input: {
  matches: readonly GradeDebutMatch[];
  lines: readonly GradeDebutLine[];
  grades: readonly string[];
}): Array<Omit<CentralGradeDebut, "displayName" | "isPrivate">> {
  const wanted = new Set(input.grades);
  const meta = new Map<number, { grade: string; date: string | null; season: number | null }>();
  for (const m of input.matches) {
    const grade = appGradeFromCentral(m.grade);
    if (grade && wanted.has(grade)) {
      meta.set(m.matchId, { grade, date: m.matchDate, season: parseSeasonStartYear(m.season) });
    }
  }
  const byKey = new Map<
    string,
    { pid: string; grade: string; matches: Map<number, number | null> }
  >();
  for (const l of input.lines) {
    if (!l.participantId || l.matchId == null) continue;
    const m = meta.get(l.matchId);
    if (!m) continue;
    const key = `${l.participantId}|${m.grade}`;
    let e = byKey.get(key);
    if (!e) byKey.set(key, (e = { pid: l.participantId, grade: m.grade, matches: new Map() }));
    const prev = e.matches.get(l.matchId);
    const bat =
      l.batOrder == null ? (prev ?? null) : prev == null ? l.batOrder : Math.min(prev, l.batOrder);
    e.matches.set(l.matchId, bat);
  }
  const earlier = (a: number, b: number): number => {
    const ma = meta.get(a)!;
    const mb = meta.get(b)!;
    return (ma.date ?? "￿").localeCompare(mb.date ?? "￿") || a - b;
  };
  const out: Array<Omit<CentralGradeDebut, "displayName" | "isPrivate">> = [];
  for (const e of byKey.values()) {
    const first = [...e.matches.keys()].sort(earlier)[0]!;
    const m = meta.get(first)!;
    out.push({
      participantId: e.pid,
      grade: e.grade,
      matchId: first,
      matchDate: m.date,
      season: m.season,
      batOrder: e.matches.get(first) ?? null,
      games: e.matches.size,
    });
  }
  return out;
}

/** Every participant's first match in each of `grades` for the club. */
export async function centralGradeDebuts(
  clubId: number,
  grades: readonly string[],
  merges?: CentralMerges | null,
): Promise<CentralGradeDebut[]> {
  const matches = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      season: centralMatchesTable.season,
      matchDate: centralMatchesTable.matchDate,
    })
    .from(centralMatchesTable)
    .where(clubInvolvedWhere(clubId));
  const wanted = new Set(grades);
  const ids = matches
    .filter((m) => {
      const g = appGradeFromCentral(m.grade);
      return g !== null && wanted.has(g);
    })
    .map((m) => m.matchId);
  if (ids.length === 0) return [];

  const [batting, bowling, rosters] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        batOrder: centralMatchBattingTable.batOrder,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, ids),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, ids),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, ids),
        ),
      ),
  ]);
  const lines = canonicalizeLines<GradeDebutLine>(
    [
      ...batting,
      ...bowling.map((b) => ({ ...b, batOrder: null })),
      ...rosters.map((r) => ({ ...r, batOrder: null })),
    ],
    merges,
  );
  const folded = foldGradeDebuts({ matches, lines, grades });
  const names = await centralPlayerNames([...new Set(folded.map((d) => d.participantId))], merges);
  return folded.map((d) => ({
    ...d,
    displayName: names.get(d.participantId)?.displayName ?? null,
    isPrivate: names.get(d.participantId)?.isPrivate ?? false,
  }));
}

/**
 * Which of `participantIds` have already played a senior game for the club
 * (a roster, batting or bowling line in any senior grade), optionally only
 * counting matches before `before` (YYYY-MM-DD). Everyone else in the list is
 * a club debutant — the team list's automatic DEBUT badge. Junior and pathway
 * grades never count. Merged GUIDs fold onto their keeper, so pass keepers.
 * Uncached: a team list is checked against the latest results.
 */
export async function centralClubSeniorPlayers(
  clubId: number,
  participantIds: readonly string[],
  opts: { before?: string | null; merges?: CentralMerges | null } = {},
): Promise<Set<string>> {
  const out = new Set<string>();
  if (participantIds.length === 0) return out;
  // Every GUID that folds onto a requested keeper counts for that keeper.
  const ids = new Set(participantIds);
  for (const [from, to] of opts.merges ?? []) {
    if (ids.has(to)) ids.add(from);
  }
  const wanted = [...ids];
  const [batting, bowling, rosters] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.participantId, wanted),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.participantId, wanted),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchRostersTable.participantId,
        matchId: centralMatchRostersTable.matchId,
      })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.participantId, wanted),
        ),
      ),
  ]);
  const lines = canonicalizeLines(
    [...batting, ...bowling, ...rosters].map((l) => ({ ...l, batOrder: null })),
    opts.merges,
  );
  const matchIds = [
    ...new Set(lines.map((l) => l.matchId).filter((id): id is number => id != null)),
  ];
  if (matchIds.length === 0) return out;
  const matches = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      matchDate: centralMatchesTable.matchDate,
    })
    .from(centralMatchesTable)
    .where(inList(centralMatchesTable.matchId, matchIds));
  const senior = new Set(
    matches
      .filter((m) => appGradeFromCentral(m.grade) !== null)
      .filter((m) => !opts.before || !m.matchDate || m.matchDate < opts.before)
      .map((m) => m.matchId),
  );
  for (const l of lines) {
    if (l.participantId && l.matchId != null && senior.has(l.matchId)) out.add(l.participantId);
  }
  return out;
}
