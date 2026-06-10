import { Router, type IRouter } from "express";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  matchesTable,
  matchPlayerLinesTable,
  matchHatTricksTable,
  milestoneBoardSettingsTable,
  playersTable,
  playerGradeSeasonStatsTable,
  capRegisterTable,
} from "@workspace/db";
import { CAP_CATEGORY_TO_GRADE } from "../lib/cap-sync";

const router: IRouter = Router();

const SETTINGS_ID = 1;

const DEFAULT_GAMES_TIERS = [100, 150, 200, 250, 300];
const DEFAULT_RUNS_TIERS = [1000, 2000, 3000, 5000, 7500, 10000];
const DEFAULT_WICKETS_TIERS = [100, 150, 200, 300];

// Significance bands. Bigger ranks higher. Career crossings start at the
// baseline tier (lowest of all) and climb with the tier index; per-match
// achievements sit in the middle so a big career milestone outranks them while
// the baseline career tier stays the lowest.
const SIG_HAT_TRICK = 900;
const SIG_CENTURY = 400;
const SIG_FIVE_FOR = 400;
const SIG_DEBUT = 300;
const SIG_CAREER_BASE = 100;
const SIG_CAREER_STEP = 100;

const MAX_ITEMS = 100;

export type MilestoneItem = {
  id: string;
  kind: "debut" | "century" | "fiveFor" | "hatTrick" | "career";
  playerId: number;
  playerName: string;
  grade: string | null;
  matchId: number | null;
  matchDate: string | null;
  season: number | null;
  round: number | null;
  opponent: string | null;
  boardKey: string | null;
  tierIndex: number | null;
  label: string;
  detail: string | null;
  value: number;
  threshold: number | null;
  significance: number;
  recent: boolean;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// match_date is stored as free text (e.g. "12:30 PM, Saturday, 07 Feb 2026")
// for bulk-loaded / scorecard-imported matches, and occasionally as ISO. Parse
// both into a comparable ISO YYYY-MM-DD string; anything unparseable is undated.
function parseMatchDate(d: string | null): string | null {
  if (!d) return null;
  const s = d.replace(/"/g, "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

export type MilestonesResult = {
  recencyWeeks: number;
  windowStart: string | null;
  featured: boolean;
  items: MilestoneItem[];
};

/**
 * Build the ordered milestones feed (recently-achieved + significant). Shared by
 * the public GET /milestones route and the honour-display board assembler so both
 * surfaces use one source of truth.
 */
export async function buildMilestones(): Promise<MilestonesResult> {
  // --- Settings (recency window + significance tiers).
  const [settings] = await db
    .select()
    .from(milestoneBoardSettingsTable)
    .where(eq(milestoneBoardSettingsTable.id, SETTINGS_ID));
  const recencyWeeks = settings?.recencyWeeks ?? 4;
  const gamesTiers = (settings?.gamesTiers?.length ? settings.gamesTiers : DEFAULT_GAMES_TIERS)
    .slice()
    .sort((a, b) => a - b);
  const runsTiers = (settings?.runsTiers?.length ? settings.runsTiers : DEFAULT_RUNS_TIERS)
    .slice()
    .sort((a, b) => a - b);
  const wicketsTiers = (settings?.wicketsTiers?.length ? settings.wicketsTiers : DEFAULT_WICKETS_TIERS)
    .slice()
    .sort((a, b) => a - b);

  // --- Matches (the dated backbone).
  const matches = await db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
      matchDate: matchesTable.matchDate,
      opponent: matchesTable.opponent,
    })
    .from(matchesTable);
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Window anchor = latest parseable match date. windowStart = anchor - weeks.
  let latestDate: string | null = null;
  for (const m of matches) {
    const iso = parseMatchDate(m.matchDate);
    if (iso && (!latestDate || iso > latestDate)) latestDate = iso;
  }
  const windowStart = latestDate ? addWeeks(latestDate, recencyWeeks) : null;
  const inWindow = (d: string | null): boolean => {
    const iso = parseMatchDate(d);
    return iso != null && windowStart != null && iso >= windowStart;
  };

  // --- Per-player match lines (drive centuries, five-fors, career crossings).
  //     Exclude fill-ins (playerId >= 90000): they have no real player record
  //     and must never surface as a club milestone.
  const lines = await db
    .select({
      matchId: matchPlayerLinesTable.matchId,
      playerId: matchPlayerLinesTable.playerId,
      runs: matchPlayerLinesTable.runs,
      wickets: matchPlayerLinesTable.wickets,
    })
    .from(matchPlayerLinesTable)
    .where(sql`${matchPlayerLinesTable.playerId} < 90000`);

  // --- Player names + current career totals.
  const players = await db
    .select({
      id: playersTable.id,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      totalGames: playersTable.totalGames,
      totalRuns: playersTable.totalRuns,
      totalWickets: playersTable.totalWickets,
    })
    .from(playersTable);
  const nameById = new Map<number, string>();
  const careerById = new Map<
    number,
    { games: number; runs: number; wickets: number }
  >();
  for (const p of players) {
    nameById.set(p.id, `${p.givenName} ${p.surname}`.trim());
    careerById.set(p.id, {
      games: p.totalGames ?? 0,
      runs: p.totalRuns ?? 0,
      wickets: p.totalWickets ?? 0,
    });
  }
  const nameFor = (id: number) => nameById.get(id) ?? "Unknown";

  const items: MilestoneItem[] = [];

  // --- Centuries (>=100) and five-wicket hauls (>=5), per innings/spell.
  for (const l of lines) {
    const m = matchById.get(l.matchId);
    if (!m) continue;
    const runs = l.runs ?? 0;
    const wkts = l.wickets ?? 0;
    if (runs >= 100) {
      items.push({
        id: `century|${l.playerId}|${l.matchId}`,
        kind: "century",
        playerId: l.playerId,
        playerName: nameFor(l.playerId),
        grade: m.grade,
        matchId: m.id,
        matchDate: m.matchDate,
        season: m.season,
        round: m.round,
        opponent: m.opponent,
        boardKey: null,
        tierIndex: null,
        label: `${runs} runs`,
        detail: `Century in ${m.grade}${m.opponent ? ` vs ${m.opponent}` : ""}`,
        value: runs,
        threshold: 100,
        significance: SIG_CENTURY,
        recent: inWindow(m.matchDate),
      });
    }
    if (wkts >= 5) {
      items.push({
        id: `fiveFor|${l.playerId}|${l.matchId}`,
        kind: "fiveFor",
        playerId: l.playerId,
        playerName: nameFor(l.playerId),
        grade: m.grade,
        matchId: m.id,
        matchDate: m.matchDate,
        season: m.season,
        round: m.round,
        opponent: m.opponent,
        boardKey: null,
        tierIndex: null,
        label: `${wkts} wickets`,
        detail: `Five-wicket haul in ${m.grade}${m.opponent ? ` vs ${m.opponent}` : ""}`,
        value: wkts,
        threshold: 5,
        significance: SIG_FIVE_FOR,
        recent: inWindow(m.matchDate),
      });
    }
  }

  // --- Admin-recorded hat-tricks.
  const hatTricks = await db
    .select({
      matchId: matchHatTricksTable.matchId,
      playerId: matchHatTricksTable.playerId,
    })
    .from(matchHatTricksTable)
    .where(sql`${matchHatTricksTable.playerId} < 90000`);
  for (const h of hatTricks) {
    const m = matchById.get(h.matchId);
    if (!m) continue;
    items.push({
      id: `hatTrick|${h.playerId}|${h.matchId}`,
      kind: "hatTrick",
      playerId: h.playerId,
      playerName: nameFor(h.playerId),
      grade: m.grade,
      matchId: m.id,
      matchDate: m.matchDate,
      season: m.season,
      round: m.round,
      opponent: m.opponent,
      boardKey: null,
      tierIndex: null,
      label: "Hat-trick",
      detail: `Hat-trick in ${m.grade}${m.opponent ? ` vs ${m.opponent}` : ""}`,
      value: 3,
      threshold: 3,
      significance: SIG_HAT_TRICK,
      recent: inWindow(m.matchDate),
    });
  }

  // --- A Grade / Female A Grade debuts (dated from the first capped match).
  await appendDebuts(items, { matchById, nameFor, inWindow });

  // --- Career-tier crossings across the whole dated match era. We compute over
  // all match history (not just the recency window) so the board can always
  // surface the most recently achieved crossings; the recency window only marks
  // an item as `recent` for the highlight badge.
  if (latestDate != null) {
    appendCareerCrossings(items, {
      lines,
      matchById,
      careerById,
      nameFor,
      inWindow,
      gamesTiers,
      runsTiers,
      wicketsTiers,
    });
  }

  // --- Ordering. When matches are dated, always surface the most recently
  // achieved milestones (across all types), newest first, so the board never goes
  // blank just because nothing falls inside the recency window. Fall back to the
  // all-time significance ranking only when no match is dated at all (windowStart
  // null), so an undated database still shows something rather than nothing.
  const byDateDesc = (a: MilestoneItem, b: MilestoneItem): number => {
    const ad = parseMatchDate(a.matchDate) ?? "";
    const bd = parseMatchDate(b.matchDate) ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    if (a.significance !== b.significance) return b.significance - a.significance;
    return a.playerName.localeCompare(b.playerName);
  };
  const bySignificance = (a: MilestoneItem, b: MilestoneItem): number => {
    if (a.significance !== b.significance) return b.significance - a.significance;
    const ad = parseMatchDate(a.matchDate) ?? "";
    const bd = parseMatchDate(b.matchDate) ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.playerName.localeCompare(b.playerName);
  };

  let ordered: MilestoneItem[];
  let featured: boolean;
  if (windowStart != null) {
    ordered = items.slice().sort(byDateDesc);
    featured = ordered.length > 0;
  } else {
    ordered = items.slice().sort(bySignificance);
    featured = false;
  }

  return {
    recencyWeeks,
    windowStart,
    featured,
    items: ordered.slice(0, MAX_ITEMS),
  };
}

router.get("/milestones", async (_req, res): Promise<void> => {
  res.json(await buildMilestones());
});

/**
 * Append dated A Grade / Female A Grade debuts. A capped player's debut is dated
 * only when their earliest match in the cap grade is a TRUE debut — i.e. they
 * had zero prior games in that grade (NULL-season baseline rows count as prior).
 * Mirrors the logic in routes/caps.ts (/caps/debutants).
 */
async function appendDebuts(
  items: MilestoneItem[],
  ctx: {
    matchById: Map<
      number,
      {
        id: number;
        grade: string;
        season: number;
        round: number | null;
        matchDate: string | null;
        opponent: string | null;
      }
    >;
    nameFor: (id: number) => string;
    inWindow: (d: string | null) => boolean;
  },
): Promise<void> {
  const { matchById, nameFor, inWindow } = ctx;
  const grades = Object.values(CAP_CATEGORY_TO_GRADE);

  const caps = await db
    .select({
      category: capRegisterTable.category,
      capNumber: capRegisterTable.capNumber,
      playerId: capRegisterTable.playerId,
    })
    .from(capRegisterTable)
    .where(isNotNull(capRegisterTable.playerId));

  const capLines = await db
    .select({
      matchId: matchPlayerLinesTable.matchId,
      playerId: matchPlayerLinesTable.playerId,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
    .where(inArray(matchesTable.grade, grades));

  // Earliest (season, round) per (player, grade) + the match it came from.
  const earliest = new Map<
    string,
    { season: number; round: number; matchId: number }
  >();
  for (const l of capLines) {
    if (l.season == null || l.round == null) continue;
    const key = `${l.playerId}|${l.grade}`;
    const cur = earliest.get(key);
    if (
      !cur ||
      l.season < cur.season ||
      (l.season === cur.season && l.round < cur.round)
    ) {
      earliest.set(key, { season: l.season, round: l.round, matchId: l.matchId });
    }
  }

  const snapshots = await db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      grade: playerGradeSeasonStatsTable.grade,
      season: playerGradeSeasonStatsTable.season,
      games: playerGradeSeasonStatsTable.games,
    })
    .from(playerGradeSeasonStatsTable)
    .where(inArray(playerGradeSeasonStatsTable.grade, grades));
  const snapsByKey = new Map<string, { season: number | null; games: number }[]>();
  for (const s of snapshots) {
    const key = `${s.playerId}|${s.grade}`;
    const arr = snapsByKey.get(key) ?? [];
    arr.push({ season: s.season, games: s.games ?? 0 });
    snapsByKey.set(key, arr);
  }
  const priorGames = (key: string, season: number): number => {
    let total = 0;
    for (const s of snapsByKey.get(key) ?? []) {
      if (s.season == null || s.season < season) total += s.games;
    }
    return total;
  };

  for (const c of caps) {
    if (c.playerId == null) continue;
    const category = c.category === "female" ? "female" : "male";
    const grade = CAP_CATEGORY_TO_GRADE[category];
    const key = `${c.playerId}|${grade}`;
    const debut = earliest.get(key);
    if (!debut) continue;
    if (priorGames(key, debut.season) !== 0) continue;
    const m = matchById.get(debut.matchId);
    if (!m) continue;
    items.push({
      id: `debut|${c.playerId}|${grade}`,
      kind: "debut",
      playerId: c.playerId,
      playerName: nameFor(c.playerId),
      grade,
      matchId: m.id,
      matchDate: m.matchDate,
      season: m.season,
      round: m.round,
      opponent: m.opponent,
      boardKey: null,
      tierIndex: null,
      label: `${grade} debut`,
      detail: `Cap #${c.capNumber}${m.opponent ? ` vs ${m.opponent}` : ""}`,
      value: c.capNumber,
      threshold: null,
      significance: SIG_DEBUT,
      recent: inWindow(m.matchDate),
    });
  }
}

/**
 * Detect dated career-tier crossings (games / runs / wickets) across the whole
 * match era. The player's current career total minus their match-era
 * contributions gives the pre-match-era total; we then walk their dated matches
 * in date order and emit an item when a cumulative total first reaches a tier.
 * Each item is flagged `recent` when its match falls inside the recency window.
 */
function appendCareerCrossings(
  items: MilestoneItem[],
  ctx: {
    lines: {
      matchId: number;
      playerId: number;
      runs: number | null;
      wickets: number | null;
    }[];
    matchById: Map<
      number,
      {
        id: number;
        grade: string;
        season: number;
        round: number | null;
        matchDate: string | null;
        opponent: string | null;
      }
    >;
    careerById: Map<number, { games: number; runs: number; wickets: number }>;
    nameFor: (id: number) => string;
    inWindow: (d: string | null) => boolean;
    gamesTiers: number[];
    runsTiers: number[];
    wicketsTiers: number[];
  },
): void {
  const {
    lines,
    matchById,
    careerById,
    nameFor,
    inWindow,
    gamesTiers,
    runsTiers,
    wicketsTiers,
  } = ctx;

  // Per-player, dated match lines across the whole match era, oldest first.
  type WindowLine = {
    matchId: number;
    matchDate: string;
    games: number;
    runs: number;
    wickets: number;
  };
  const byPlayer = new Map<number, WindowLine[]>();
  for (const l of lines) {
    const m = matchById.get(l.matchId);
    const iso = m ? parseMatchDate(m.matchDate) : null;
    if (!m || !iso) continue;
    const arr = byPlayer.get(l.playerId) ?? [];
    arr.push({
      matchId: l.matchId,
      matchDate: iso,
      games: 1,
      runs: l.runs ?? 0,
      wickets: l.wickets ?? 0,
    });
    byPlayer.set(l.playerId, arr);
  }

  const stats = [
    { key: "games" as const, tiers: gamesTiers, label: "games" },
    { key: "runs" as const, tiers: runsTiers, label: "runs" },
    { key: "wickets" as const, tiers: wicketsTiers, label: "wickets" },
  ];

  for (const [playerId, windowLines] of byPlayer) {
    const career = careerById.get(playerId);
    if (!career) continue;
    windowLines.sort((a, b) =>
      a.matchDate === b.matchDate
        ? a.matchId - b.matchId
        : a.matchDate < b.matchDate
          ? -1
          : 1,
    );

    for (const stat of stats) {
      const windowTotal = windowLines.reduce((sum, w) => sum + w[stat.key], 0);
      const before = career[stat.key] - windowTotal;
      let running = before;
      for (const w of windowLines) {
        const prev = running;
        running += w[stat.key];
        for (let i = 0; i < stat.tiers.length; i++) {
          const tier = stat.tiers[i];
          if (prev < tier && running >= tier) {
            const m = matchById.get(w.matchId)!;
            items.push({
              id: `career|${stat.key}|${tier}|${playerId}`,
              kind: "career",
              playerId,
              playerName: nameFor(playerId),
              grade: m.grade,
              matchId: m.id,
              matchDate: m.matchDate,
              season: m.season,
              round: m.round,
              opponent: m.opponent,
              boardKey: stat.key,
              tierIndex: i,
              label: `${tier} career ${stat.label}`,
              detail: `Reached ${tier} ${stat.label} (now ${running})`,
              value: running,
              threshold: tier,
              significance: SIG_CAREER_BASE + i * SIG_CAREER_STEP,
              recent: inWindow(m.matchDate),
            });
          }
        }
      }
    }
  }
}

export default router;
