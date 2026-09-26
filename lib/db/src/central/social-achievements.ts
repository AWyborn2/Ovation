import { and, eq } from "drizzle-orm";
import {
  centralDb,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralMatchesTable,
} from "../central";
import { appGradeFromCentral, parseRound, parseSeasonStartYear } from "./grades";
import { centralPlayerNames } from "./privacy";
import { classifyFieldingKind, classifyInnings } from "./scoring";
import { clubInvolvedWhere, inList } from "./where";

// ---------------------------------------------------------------------------
// Social Studio per-match achievements (central equivalent of the native
// import's match-milestone detector and career-crossing detector): for a set of
// a club's matches, the centuries, five-wicket hauls, senior debuts and career
// milestones crossed IN those matches.
//
// Rules this read follows (see
// docs/solutions/architecture-patterns/central-read-player-identity-crosswalk.md):
//   - Keyed by participant GUID; NULL/empty participant lines are dropped. The
//     caller resolves the app player id through the tenant's crosswalk.
//   - Senior only (juniors isolation): a match whose grade label doesn't map to
//     a senior app grade (junior / pathway / unmapped) or whose season can't be
//     parsed emits nothing AND adds nothing to a career running total — junior
//     runs can never push a player over a milestone, and a junior game is never
//     a debut.
//   - Private participants are OMITTED (public-facing cards; privacy.ts).
//   - Deliberately UNCACHED, like the drafting-sweep reads: the sweep must see
//     the match that just loaded, not a cached copy from before it.
// ---------------------------------------------------------------------------

/** Career tier ladders (the native honour-board tiers are passed in). */
export interface AchievementTiers {
  games: number[];
  runs: number[];
  wickets: number[];
  dismissals: number[];
}

/** A club match with the labels already resolved. `grade` is the app grade, or null when not senior. */
export interface AchievementMatchMeta {
  matchId: number;
  grade: string | null;
  season: number | null;
  matchDate: string | null;
  round: number | null;
  opponent: string | null;
}

export interface AchievementBattingLine {
  participantId: string | null;
  matchId: number | null;
  runs: number | null;
  balls: number | null;
  dismissal: string | null;
  dismissalType: string | null;
}

export interface AchievementBowlingLine {
  participantId: string | null;
  matchId: number | null;
  wickets: number | null;
  runs: number | null;
  overs: number | null;
}

export interface AchievementRosterLine {
  participantId: string | null;
  matchId: number | null;
}

export interface AchievementFieldingLine {
  participantId: string | null;
  matchId: number | null;
  kind: string | null;
}

interface AchievementBase {
  participantId: string;
  displayName: string | null;
  matchId: number;
  grade: string;
  season: number;
  round: number | null;
  opponent: string | null;
}

export type CentralAchievement =
  | (AchievementBase & { kind: "century"; runs: number; balls: number | null; notOut: boolean })
  | (AchievementBase & {
      kind: "fiveFor";
      wickets: number;
      runsConceded: number | null;
      overs: string | null;
    })
  | (AchievementBase & { kind: "debut" })
  | (AchievementBase & {
      kind: "career";
      boardKey: keyof AchievementTiers;
      tierIndex: number;
      threshold: number;
      value: number;
    });

export interface FoldAchievementsInput {
  /** The matches to report achievements for. */
  targetIds: readonly number[];
  /** Every club match (targets and history). */
  matches: readonly AchievementMatchMeta[];
  /** The club side's lines for the players involved, across the club's history. */
  batting: readonly AchievementBattingLine[];
  bowling: readonly AchievementBowlingLine[];
  rosters: readonly AchievementRosterLine[];
  fielding: readonly AchievementFieldingLine[];
  names: ReadonlyMap<string, { displayName: string | null; isPrivate: boolean }>;
  tiers: AchievementTiers;
}

const BOARD_KEYS = ["games", "runs", "wickets", "dismissals"] as const;

/**
 * Fold the club's scorecard lines into the achievements of the target matches.
 * Pure, so the juniors / privacy / ordering rules are testable without a
 * database.
 *
 *  - century: the player's best innings in the match, if 100 or more;
 *  - fiveFor: the player's best spell in the match (most wickets, then fewest
 *    runs), if 5 wickets or more;
 *  - debut: the target match is the player's first senior appearance for the
 *    club (a roster, batting or bowling line — not a fielding-only row);
 *  - career: a senior-only running total (games, runs, wickets, catches +
 *    stumpings) first reaches a tier in the target match.
 *
 * Matches are walked in (season, date, id) order.
 */
export function foldMatchAchievements(input: FoldAchievementsInput): CentralAchievement[] {
  const metaOf = new Map<number, AchievementMatchMeta & { grade: string; season: number }>();
  for (const m of input.matches) {
    if (m.grade == null || m.season == null) continue; // senior matches only
    metaOf.set(m.matchId, m as AchievementMatchMeta & { grade: string; season: number });
  }
  const targets = new Set(input.targetIds.filter((id) => metaOf.has(id)));
  if (targets.size === 0) return [];

  const isPublic = (pid: string | null): pid is string =>
    !!pid && input.names.get(pid)?.isPrivate !== true;
  const senior = (matchId: number | null): matchId is number =>
    matchId != null && metaOf.has(matchId);

  const base = (pid: string, matchId: number): AchievementBase => {
    const m = metaOf.get(matchId)!;
    return {
      participantId: pid,
      displayName: input.names.get(pid)?.displayName ?? null,
      matchId,
      grade: m.grade,
      season: m.season,
      round: m.round,
      opponent: m.opponent,
    };
  };

  const out: CentralAchievement[] = [];

  // Centuries: best innings per (player, target match).
  const bestInnings = new Map<string, AchievementBattingLine>();
  for (const b of input.batting) {
    if (!isPublic(b.participantId) || !senior(b.matchId) || !targets.has(b.matchId)) continue;
    const key = `${b.participantId}|${b.matchId}`;
    const prev = bestInnings.get(key);
    if (!prev || (b.runs ?? 0) > (prev.runs ?? 0)) bestInnings.set(key, b);
  }
  for (const b of bestInnings.values()) {
    const runs = b.runs ?? 0;
    if (runs < 100) continue;
    out.push({
      ...base(b.participantId as string, b.matchId as number),
      kind: "century",
      runs,
      balls: b.balls,
      notOut: classifyInnings(b.dismissalType, b.dismissal) === "notout",
    });
  }

  // Five-wicket hauls: best spell per (player, target match).
  const bestSpell = new Map<string, AchievementBowlingLine>();
  for (const b of input.bowling) {
    if (!isPublic(b.participantId) || !senior(b.matchId) || !targets.has(b.matchId)) continue;
    const key = `${b.participantId}|${b.matchId}`;
    const prev = bestSpell.get(key);
    const better =
      !prev ||
      (b.wickets ?? 0) > (prev.wickets ?? 0) ||
      ((b.wickets ?? 0) === (prev.wickets ?? 0) && (b.runs ?? 0) < (prev.runs ?? 0));
    if (better) bestSpell.set(key, b);
  }
  for (const b of bestSpell.values()) {
    const wickets = b.wickets ?? 0;
    if (wickets < 5) continue;
    out.push({
      ...base(b.participantId as string, b.matchId as number),
      kind: "fiveFor",
      wickets,
      runsConceded: b.runs,
      overs: b.overs == null ? null : String(b.overs),
    });
  }

  // Career walk inputs, senior matches only.
  interface Acc {
    played: Set<number>;
    runs: Map<number, number>;
    wickets: Map<number, number>;
    dismissals: Map<number, number>;
  }
  const accs = new Map<string, Acc>();
  const acc = (pid: string): Acc => {
    let a = accs.get(pid);
    if (!a) {
      a = { played: new Set(), runs: new Map(), wickets: new Map(), dismissals: new Map() };
      accs.set(pid, a);
    }
    return a;
  };
  const add = (map: Map<number, number>, matchId: number, n: number) =>
    map.set(matchId, (map.get(matchId) ?? 0) + n);
  for (const b of input.batting) {
    if (!isPublic(b.participantId) || !senior(b.matchId)) continue;
    const a = acc(b.participantId);
    a.played.add(b.matchId);
    add(a.runs, b.matchId, b.runs ?? 0);
  }
  for (const b of input.bowling) {
    if (!isPublic(b.participantId) || !senior(b.matchId)) continue;
    const a = acc(b.participantId);
    a.played.add(b.matchId);
    add(a.wickets, b.matchId, b.wickets ?? 0);
  }
  for (const r of input.rosters) {
    if (!isPublic(r.participantId) || !senior(r.matchId)) continue;
    acc(r.participantId).played.add(r.matchId);
  }
  for (const f of input.fielding) {
    if (!isPublic(f.participantId) || !senior(f.matchId)) continue;
    // Catches + stumpings, like the native honour-board dismissals column.
    const kind = classifyFieldingKind(f.kind);
    if (kind !== "catch" && kind !== "stumping") continue;
    add(acc(f.participantId).dismissals, f.matchId, 1);
  }

  const chrono = (x: number, y: number): number => {
    const mx = metaOf.get(x)!;
    const my = metaOf.get(y)!;
    return mx.season - my.season || (mx.matchDate ?? "").localeCompare(my.matchDate ?? "") || x - y;
  };

  for (const [pid, a] of accs) {
    // Only players who took part in a target match can have an achievement there.
    const ordered = [...new Set([...a.played, ...a.dismissals.keys()])].sort(chrono);
    if (!ordered.some((id) => targets.has(id))) continue;

    const firstAppearance = [...a.played].sort(chrono)[0];
    if (firstAppearance != null && targets.has(firstAppearance)) {
      out.push({ ...base(pid, firstAppearance), kind: "debut" });
    }

    const totals = { games: 0, runs: 0, wickets: 0, dismissals: 0 };
    for (const matchId of ordered) {
      const contrib = {
        games: a.played.has(matchId) ? 1 : 0,
        runs: a.runs.get(matchId) ?? 0,
        wickets: a.wickets.get(matchId) ?? 0,
        dismissals: a.dismissals.get(matchId) ?? 0,
      };
      for (const key of BOARD_KEYS) {
        const before = totals[key];
        const after = before + contrib[key];
        totals[key] = after;
        if (!targets.has(matchId)) continue;
        for (const [tierIndex, threshold] of input.tiers[key].entries()) {
          if (before < threshold && after >= threshold) {
            out.push({
              ...base(pid, matchId),
              kind: "career",
              boardKey: key,
              tierIndex,
              threshold,
              value: after,
            });
          }
        }
      }
    }
  }

  const kindOrder = { debut: 0, century: 1, fiveFor: 2, career: 3 } as const;
  out.sort(
    (x, y) =>
      chrono(x.matchId, y.matchId) ||
      kindOrder[x.kind] - kindOrder[y.kind] ||
      x.participantId.localeCompare(y.participantId),
  );
  return out;
}

/**
 * Centuries, five-wicket hauls, senior debuts and career milestones (senior
 * totals only) that the club's players achieved in `matchIds`. Ids that aren't
 * the club's senior matches are ignored. Private players are omitted.
 */
export async function centralMatchAchievements(
  clubId: number,
  matchIds: readonly number[],
  tiers: AchievementTiers,
): Promise<CentralAchievement[]> {
  if (matchIds.length === 0) return [];
  const matchRows = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      season: centralMatchesTable.season,
      matchDate: centralMatchesTable.matchDate,
      round: centralMatchesTable.round,
      homeClubId: centralMatchesTable.homeClubId,
      homeTeam: centralMatchesTable.homeTeam,
      awayTeam: centralMatchesTable.awayTeam,
    })
    .from(centralMatchesTable)
    .where(clubInvolvedWhere(clubId));
  const matches: AchievementMatchMeta[] = matchRows.map((m) => ({
    matchId: m.matchId,
    grade: appGradeFromCentral(m.grade),
    season: parseSeasonStartYear(m.season),
    matchDate: m.matchDate,
    round: parseRound(m.round),
    opponent: m.homeClubId === clubId ? m.awayTeam : m.homeTeam,
  }));
  const seniorIds = matches
    .filter((m) => m.grade != null && m.season != null)
    .map((m) => m.matchId);
  const seniorSet = new Set(seniorIds);
  const targetIds = [...new Set(matchIds)].filter((id) => seniorSet.has(id));
  if (targetIds.length === 0) return [];

  // Who played in the target matches (the club's side only).
  const inTargets = <T extends { participantId: string | null }>(rows: T[]) =>
    rows.map((r) => r.participantId).filter((p): p is string => !!p);
  const [tb, tw, tr, tf] = await Promise.all([
    centralDb
      .select({ participantId: centralMatchBattingTable.participantId })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, targetIds),
        ),
      ),
    centralDb
      .select({ participantId: centralMatchBowlingTable.participantId })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, targetIds),
        ),
      ),
    centralDb
      .select({ participantId: centralMatchRostersTable.participantId })
      .from(centralMatchRostersTable)
      .where(
        and(
          eq(centralMatchRostersTable.clubId, clubId),
          inList(centralMatchRostersTable.matchId, targetIds),
        ),
      ),
    centralDb
      .select({ participantId: centralFieldingTable.participantId })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inList(centralFieldingTable.matchId, targetIds),
        ),
      ),
  ]);
  const players = [
    ...new Set([...inTargets(tb), ...inTargets(tw), ...inTargets(tr), ...inTargets(tf)]),
  ];
  if (players.length === 0) return [];

  // Those players' senior history for the club (targets included).
  const [batting, bowling, rosters, fielding, names] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        balls: centralMatchBattingTable.balls,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, seniorIds),
          inList(centralMatchBattingTable.participantId, players),
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
        overs: centralMatchBowlingTable.overs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, seniorIds),
          inList(centralMatchBowlingTable.participantId, players),
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
          inList(centralMatchRostersTable.matchId, seniorIds),
          inList(centralMatchRostersTable.participantId, players),
        ),
      ),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inList(centralFieldingTable.matchId, seniorIds),
          inList(centralFieldingTable.participantId, players),
        ),
      ),
    centralPlayerNames(players),
  ]);

  return foldMatchAchievements({
    targetIds,
    matches,
    batting,
    bowling,
    rosters,
    fielding,
    names,
    tiers,
  });
}
