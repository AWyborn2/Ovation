import { and, eq, inArray, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPremiersTable,
  type CentralPremierRow,
} from "../central";
import { appGradeFromCentral, parseSeasonStartYear, parseStage } from "./grades";
import { centralPlayerNames } from "./privacy";
import { clubInvolvedWhere, inList } from "./where";

/** One player on a central premiership team list (club side of the decider). */
export interface CentralPremiershipPlayer {
  participantId: string | null;
  /** Display name, or the scorecard's own player name when central has none. */
  name: string;
  /** FLAG treatment (see ./privacy): the caller masks the name. */
  isPrivate: boolean;
  /** 1-based position on the team list (batting order first, then the rest). */
  order: number;
}

/**
 * Everything the tenant-side premiership seed needs for one `central.premiers`
 * row, assembled from the premier, its decider match and that match's club-side
 * scorecard / roster.
 */
export interface CentralPremiershipSeed {
  premierId: number;
  /** Raw central grade label (e.g. "A Grade: Wyllie Cup"). */
  grade: string | null;
  /** App grade the label rolls up to (e.g. "A Grade"), or null if unmapped. */
  appGrade: string | null;
  format: string | null;
  seasonStartYear: number | null;
  /** "YYYY-MM-DD" when known. */
  matchDate: string | null;
  venue: string | null;
  opponent: string | null;
  confidence: string | null;
  note: string | null;
  /** Resolved decider `central.matches.match_id`, or null when unknown. */
  matchId: number | null;
  clubScore: string | null;
  opponentScore: string | null;
  /** Decider outcome from the club's side; null when there is no decider. */
  outcome: "won" | "lost" | "undecided" | null;
  /** Central `result_text` of the decider (used for washouts/shared titles). */
  matchResultText: string | null;
  players: CentralPremiershipPlayer[];
}

type CentralMatch = typeof centralMatchesTable.$inferSelect;

/** "Pinjarra Cricket Club" → "Pinjarra" for a compact plaque result line. */
export function shortTeamName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const short = trimmed.replace(/\s+(?:cricket\s+club|cricket|c\.?c\.?)$/i, "").trim();
  return short || trimmed;
}

/**
 * Pick the decider for a premier that has no `match_id`: the club's single
 * Grand Final (or generic "Final") in the same season + raw grade, against the
 * recorded opponent when known, on the recorded date when known. Returns null
 * unless exactly one match fits — a wrong scorecard is worse than none.
 */
export function pickDeciderMatch(
  premier: Pick<CentralPremierRow, "season" | "grade" | "matchDate" | "opponentClubId">,
  clubId: number,
  finals: CentralMatch[],
): number | null {
  const candidates = finals.filter((m) => {
    if (m.homeClubId !== clubId && m.awayClubId !== clubId) return false;
    if (parseStage(m.round) !== "Grand Final") return false;
    if ((m.season ?? "") !== (premier.season ?? "")) return false;
    if ((m.grade ?? "") !== (premier.grade ?? "")) return false;
    if (premier.opponentClubId != null) {
      const opp = m.homeClubId === clubId ? m.awayClubId : m.homeClubId;
      if (opp !== premier.opponentClubId) return false;
    }
    if (premier.matchDate && m.matchDate && premier.matchDate !== m.matchDate) return false;
    return true;
  });
  return candidates.length === 1 ? candidates[0]!.matchId : null;
}

/**
 * Premierships a central club won, each with its decider's scores and the
 * club's team list, for seeding the tenant-side honour board
 * (`@workspace/db/premierships-seed`).
 *
 * Team list = the club side of the decider: batting lines in batting order
 * (these include "did not bat"), then any bowling-only or roster-only players.
 * `match_rosters` alone is used when the match has no scorecard. Privacy is the
 * FLAG treatment: `isPrivate` is set and the caller masks the name.
 *
 * Not cached: this is an onboarding / re-seed read, never a request-path read,
 * and it should always see the latest central data.
 */
export async function centralClubPremierships(clubId: number): Promise<CentralPremiershipSeed[]> {
  const premiers = await centralDb
    .select()
    .from(centralPremiersTable)
    .where(eq(centralPremiersTable.clubId, clubId));
  if (premiers.length === 0) return [];

  // Deciders: the premiers' explicit match ids, plus the club's finals for
  // premiers that have none (resolved by pickDeciderMatch).
  const explicitIds = [
    ...new Set(premiers.map((p) => p.matchId).filter((id): id is number => id != null)),
  ];
  const needsFallback = premiers.some((p) => p.matchId == null);
  const [explicitMatches, finals] = await Promise.all([
    explicitIds.length > 0
      ? centralDb
          .select()
          .from(centralMatchesTable)
          .where(inList(centralMatchesTable.matchId, explicitIds))
      : Promise.resolve([] as CentralMatch[]),
    needsFallback
      ? centralDb
          .select()
          .from(centralMatchesTable)
          .where(and(clubInvolvedWhere(clubId), sql`${centralMatchesTable.round} ~* 'final'`))
      : Promise.resolve([] as CentralMatch[]),
  ]);
  const matchById = new Map<number, CentralMatch>();
  for (const m of [...explicitMatches, ...finals]) matchById.set(m.matchId, m);

  const deciderOf = new Map<number, CentralMatch>();
  for (const p of premiers) {
    let m: CentralMatch | undefined;
    if (p.matchId != null) {
      m = matchById.get(p.matchId);
      // A match id that doesn't involve the club would link another club's
      // scorecard (and 404 on the tenant's /matches/:id) — drop it.
      if (m && m.homeClubId !== clubId && m.awayClubId !== clubId) m = undefined;
    } else {
      const id = pickDeciderMatch(p, clubId, finals);
      m = id != null ? matchById.get(id) : undefined;
    }
    if (m) deciderOf.set(p.id, m);
  }

  const deciderIds = [...new Set([...deciderOf.values()].map((m) => m.matchId))];
  const [batting, bowling, rosters] =
    deciderIds.length > 0
      ? await Promise.all([
          centralDb
            .select()
            .from(centralMatchBattingTable)
            .where(
              and(
                eq(centralMatchBattingTable.clubId, clubId),
                inArray(centralMatchBattingTable.matchId, deciderIds),
              ),
            ),
          centralDb
            .select()
            .from(centralMatchBowlingTable)
            .where(
              and(
                eq(centralMatchBowlingTable.clubId, clubId),
                inArray(centralMatchBowlingTable.matchId, deciderIds),
              ),
            ),
          centralDb
            .select()
            .from(centralMatchRostersTable)
            .where(
              and(
                eq(centralMatchRostersTable.clubId, clubId),
                inArray(centralMatchRostersTable.matchId, deciderIds),
              ),
            ),
        ])
      : [[], [], []];

  const guids = [
    ...new Set(
      [...batting, ...bowling, ...rosters]
        .map((l) => l.participantId)
        .filter((id): id is string => !!id),
    ),
  ];
  const names = await centralPlayerNames(guids);

  const teamFor = (matchId: number): CentralPremiershipPlayer[] => {
    const seen = new Set<string>();
    const team: CentralPremiershipPlayer[] = [];
    const add = (participantId: string | null, playerName: string | null) => {
      const key = participantId ?? `name:${(playerName ?? "").trim().toLowerCase()}`;
      if (seen.has(key)) return;
      const known = participantId ? names.get(participantId) : undefined;
      const name = known?.displayName?.trim() || playerName?.trim();
      if (!name) return;
      seen.add(key);
      team.push({
        participantId,
        name,
        isPrivate: known?.isPrivate ?? false,
        order: team.length + 1,
      });
    };
    batting
      .filter((b) => b.matchId === matchId)
      .sort(
        (a, b) =>
          (a.innings ?? 0) - (b.innings ?? 0) ||
          (a.batOrder ?? 99) - (b.batOrder ?? 99) ||
          a.id - b.id,
      )
      .forEach((b) => add(b.participantId, b.playerName));
    bowling
      .filter((b) => b.matchId === matchId)
      .sort((a, b) => a.id - b.id)
      .forEach((b) => add(b.participantId, b.playerName));
    rosters
      .filter((r) => r.matchId === matchId)
      .sort((a, b) => a.id - b.id)
      .forEach((r) => add(r.participantId, r.playerName));
    return team;
  };

  return premiers
    .sort((a, b) => a.id - b.id)
    .map((p): CentralPremiershipSeed => {
      const m = deciderOf.get(p.id);
      const isHome = m ? m.homeClubId === clubId : false;
      const outcome: CentralPremiershipSeed["outcome"] = !m
        ? null
        : m.winnerClubId == null
          ? "undecided"
          : m.winnerClubId === clubId
            ? "won"
            : "lost";
      return {
        premierId: p.id,
        grade: p.grade,
        appGrade: appGradeFromCentral(p.grade),
        format: p.format,
        seasonStartYear: parseSeasonStartYear(p.season),
        matchDate: p.matchDate ?? m?.matchDate ?? null,
        venue: p.venue ?? m?.venue ?? null,
        opponent: p.opponent ?? (m ? (isHome ? m.awayTeam : m.homeTeam) : null),
        confidence: p.confidence,
        note: p.note,
        matchId: m?.matchId ?? null,
        clubScore: m ? (isHome ? m.homeScore : m.awayScore) : null,
        opponentScore: m ? (isHome ? m.awayScore : m.homeScore) : null,
        outcome,
        matchResultText: m?.resultText ?? null,
        players: m ? teamFor(m.matchId) : [],
      };
    });
}
