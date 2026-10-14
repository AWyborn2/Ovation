import { and, eq, inArray } from "drizzle-orm";
import { centralDb, centralMatchBattingTable, centralMatchBowlingTable } from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { centralClubMatches, type CentralMatchSummary } from "./club-matches";
import { canonicalizeLines, mergesCacheArg, type CentralMerges } from "./merges";
import { centralPlayerNames } from "./privacy";
import { classifyInnings } from "./scoring";

/**
 * A round's results for the results-summary and team-of-the-week cards
 * (plan 2026-10-14-001, Phase B): every grade the club played in the round
 * with both scores and its best two batters and bowlers, plus the round's
 * standout performers across grades. Central data only, so seniors only
 * (junior grades never reach central). Private players are left out.
 */

/** One innings or spell by a club player in the round. */
export type RoundPerformance = {
  participantId: string;
  matchId: number;
  grade: string;
  runs: number | null;
  balls: number | null;
  notOut: boolean;
  batted: boolean;
  wickets: number | null;
  runsConceded: number | null;
  overs: number | null;
};

export type RoundFigure = { name: string; figure: string };

export type CentralRoundResult = {
  matchId: number;
  grade: string;
  clubScore: string;
  oppName: string;
  oppScore: string;
  outcome: "WON" | "LOST" | "";
  /** Set when the match had no result (abandoned / washed out). */
  note: string;
  batters: RoundFigure[];
  bowlers: RoundFigure[];
};

export type CentralTeamOfWeekPlayer = {
  participantId: string;
  name: string;
  grade: string;
  figure: string;
};

export type CentralRoundResults = {
  roundLabel: string;
  /** "SATURDAY 10TH OCTOBER 2026" — the round's first match date. */
  dateLabel: string;
  results: CentralRoundResult[];
  teamOfWeek: CentralTeamOfWeekPlayer[];
};

/** "32* (34)" / "26". */
export function battingFigure(p: Pick<RoundPerformance, "runs" | "balls" | "notOut">): string {
  const runs = `${p.runs ?? 0}${p.notOut ? "*" : ""}`;
  return p.balls != null && p.balls > 0 ? `${runs} (${p.balls})` : runs;
}

/** "3/28 (10)" / "3/28". */
export function bowlingFigure(
  p: Pick<RoundPerformance, "wickets" | "runsConceded" | "overs">,
): string {
  const figure = `${p.wickets ?? 0}/${p.runsConceded ?? 0}`;
  return p.overs != null && p.overs > 0 ? `${figure} (${p.overs})` : figure;
}

/** The best two batters (most runs, then fewest balls) with a score above zero. */
export function bestBatters(lines: RoundPerformance[]): RoundPerformance[] {
  return lines
    .filter((l) => l.batted && (l.runs ?? 0) > 0)
    .sort((a, b) => (b.runs ?? 0) - (a.runs ?? 0) || (a.balls ?? 0) - (b.balls ?? 0))
    .slice(0, 2);
}

/** The best two bowlers (most wickets, then fewest runs) who took a wicket. */
export function bestBowlers(lines: RoundPerformance[]): RoundPerformance[] {
  return lines
    .filter((l) => (l.wickets ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.wickets ?? 0) - (a.wickets ?? 0) || (a.runsConceded ?? 0) - (b.runsConceded ?? 0),
    )
    .slice(0, 2);
}

/** How much a player's round counts for the team of the week: a wicket ≈ 25 runs. */
export function performanceScore(p: RoundPerformance): number {
  return (p.runs ?? 0) + (p.notOut && (p.runs ?? 0) >= 20 ? 5 : 0) + 25 * (p.wickets ?? 0);
}

/** "4/21 & 16", "110*", "5/28". */
export function teamOfWeekFigure(p: RoundPerformance): string {
  const wickets = p.wickets ?? 0;
  const runs = p.runs ?? 0;
  const bowl = wickets > 0 ? `${wickets}/${p.runsConceded ?? 0}` : "";
  const bat = p.batted && (runs >= 10 || wickets === 0) ? `${runs}${p.notOut ? "*" : ""}` : "";
  if (bowl && bat) return wickets >= 3 || runs < 20 ? `${bowl} & ${bat}` : `${bat} & ${bowl}`;
  return bowl || bat;
}

/**
 * The team of the week: each player's best match of the round, ranked by
 * {@link performanceScore}, up to `size` players. Ties keep the higher grade
 * (earlier in `gradeOrder`).
 */
export function pickTeamOfWeek(
  performances: RoundPerformance[],
  gradeOrder: string[],
  size = 12,
): RoundPerformance[] {
  const best = new Map<string, RoundPerformance>();
  for (const p of performances) {
    const prev = best.get(p.participantId);
    if (!prev || performanceScore(p) > performanceScore(prev)) best.set(p.participantId, p);
  }
  const rank = (g: string) => {
    const i = gradeOrder.indexOf(g);
    return i < 0 ? gradeOrder.length : i;
  };
  return [...best.values()]
    .filter((p) => performanceScore(p) > 0)
    .sort((a, b) => performanceScore(b) - performanceScore(a) || rank(a.grade) - rank(b.grade))
    .slice(0, size);
}

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/** "2026-10-10" → "SATURDAY 10TH OCTOBER 2026"; "" when unparseable. */
export function roundDateLabel(ymd: string | null): string {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) : null;
  if (!m) return "";
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const day = Number(d);
  const suffix =
    day % 10 === 1 && day !== 11
      ? "ST"
      : day % 10 === 2 && day !== 12
        ? "ND"
        : day % 10 === 3 && day !== 13
          ? "RD"
          : "TH";
  return `${DAYS[date.getUTCDay()]} ${day}${suffix} ${MONTHS[Number(mo) - 1]} ${y}`;
}

/** The round's results and team of the week for a club (see the module comment). */
export async function centralRoundResults(
  clubId: number,
  season: number,
  round: number,
  merges?: CentralMerges,
): Promise<CentralRoundResults> {
  return withCentralCache(
    cacheKey("centralRoundResults", [clubId, season, round, mergesCacheArg(merges)]),
    () => centralRoundResultsImpl(clubId, season, round, merges),
  );
}

async function centralRoundResultsImpl(
  clubId: number,
  season: number,
  round: number,
  merges?: CentralMerges,
): Promise<CentralRoundResults> {
  const roundLabel = `Round ${round}`;
  // One match per grade for the round (newest first, as the weekend wrap does);
  // abandoned matches stay, as a "no result".
  const byGrade = new Map<string, CentralMatchSummary>();
  for (const m of await centralClubMatches(clubId, { season })) {
    if (m.round === round && !byGrade.has(m.grade)) byGrade.set(m.grade, m);
  }
  const picked = [...byGrade.values()];
  if (picked.length === 0) return { roundLabel, dateLabel: "", results: [], teamOfWeek: [] };
  const matchIds = picked.map((m) => m.id);
  const gradeOf = new Map(picked.map((m) => [m.id, m.grade]));

  const [batting, bowling] = await Promise.all([
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
          inArray(centralMatchBattingTable.matchId, matchIds),
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
          inArray(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
  ]);

  // One performance per player per match: their innings and their spell.
  const perf = new Map<string, RoundPerformance>();
  const at = (participantId: string, matchId: number): RoundPerformance => {
    const key = `${participantId}:${matchId}`;
    const existing = perf.get(key);
    if (existing) return existing;
    const created: RoundPerformance = {
      participantId,
      matchId,
      grade: gradeOf.get(matchId) ?? "",
      runs: null,
      balls: null,
      notOut: false,
      batted: false,
      wickets: null,
      runsConceded: null,
      overs: null,
    };
    perf.set(key, created);
    return created;
  };
  for (const b of canonicalizeLines(batting, merges)) {
    if (!b.participantId || b.matchId == null) continue;
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    const p = at(b.participantId, b.matchId);
    p.batted = kind !== "dnb";
    p.notOut = kind === "notout";
    p.runs = b.runs;
    p.balls = b.balls;
  }
  for (const b of canonicalizeLines(bowling, merges)) {
    if (!b.participantId || b.matchId == null) continue;
    const p = at(b.participantId, b.matchId);
    p.wickets = b.wickets;
    p.runsConceded = b.runs;
    p.overs = b.overs;
  }

  // Names and privacy in one round trip; a private player is never named.
  const names = await centralPlayerNames(
    [...new Set([...perf.values()].map((p) => p.participantId))],
    merges,
  );
  const named = [...perf.values()].filter((p) => {
    const n = names.get(p.participantId);
    return n && !n.isPrivate && !!n.displayName?.trim();
  });
  const nameOf = (p: RoundPerformance) => names.get(p.participantId)?.displayName?.trim() ?? "";

  const results: CentralRoundResult[] = picked.map((m) => {
    const lines = named.filter((p) => p.matchId === m.id);
    const outcome: "WON" | "LOST" | "" =
      m.clubWon === true ? "WON" : m.clubWon === false ? "LOST" : "";
    return {
      matchId: m.id,
      grade: m.grade,
      clubScore: m.abandoned ? "" : (m.clubScore ?? ""),
      oppName: m.opponent ?? m.opponentClub?.name ?? "Opposition",
      oppScore: m.abandoned ? "" : (m.opponentScore ?? ""),
      outcome,
      note: m.abandoned ? (m.result?.trim() || "NO RESULT").toUpperCase() : "",
      batters: bestBatters(lines).map((p) => ({ name: nameOf(p), figure: battingFigure(p) })),
      bowlers: bestBowlers(lines).map((p) => ({ name: nameOf(p), figure: bowlingFigure(p) })),
    };
  });

  const teamOfWeek = pickTeamOfWeek(
    named,
    picked.map((m) => m.grade),
  ).map((p) => ({
    participantId: p.participantId,
    name: nameOf(p),
    grade: p.grade,
    figure: teamOfWeekFigure(p),
  }));

  const firstDate = picked
    .map((m) => m.matchDate)
    .filter((d): d is string => !!d)
    .sort()[0];
  return { roundLabel, dateLabel: roundDateLabel(firstDate ?? null), results, teamOfWeek };
}
