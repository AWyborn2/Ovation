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

type MilestoneItem = {
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

// ISO YYYY-MM-DD dates sort lexicographically; treat anything else as undated.
const isIsoDate = (d: string | null): d is string =>
  !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

router.get("/milestones", async (_req, res): Promise<void> => {
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
    if (isIsoDate(m.matchDate) && (!latestDate || m.matchDate > latestDate)) {
      latestDate = m.matchDate;
    }
  }
  const windowStart = latestDate ? addWeeks(latestDate, recencyWeeks) : null;
  const inWindow = (d: string | null): boolean =>
    isIsoDate(d) && windowStart != null && d >= windowStart;

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

  // --- Career-tier crossings detectable within the recency window.
  if (windowStart != null) {
    appendCareerCrossings(items, {
      lines,
      matchById,
      careerById,
      nameFor,
      windowStart,
      gamesTiers,
      runsTiers,
      wicketsTiers,
    });
  }

  // --- Ordering. When >=5 distinct players achieved within the window, feature
  // recent achievers first (most recent date first), then the rest by
  // significance. Otherwise rank everything by significance.
  const recentPlayers = new Set(
    items.filter((i) => i.recent).map((i) => i.playerId),
  );
  const featured = recentPlayers.size >= 5;

  const byDateDesc = (a: MilestoneItem, b: MilestoneItem): number => {
    const ad = a.matchDate ?? "";
    const bd = b.matchDate ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    if (a.significance !== b.significance) return b.significance - a.significance;
    return a.playerName.localeCompare(b.playerName);
  };
  const bySignificance = (a: MilestoneItem, b: MilestoneItem): number => {
    if (a.significance !== b.significance) return b.significance - a.significance;
    const ad = a.matchDate ?? "";
    const bd = b.matchDate ?? "";
    if (ad !== bd) return ad < bd ? 1 : -1;
    return a.playerName.localeCompare(b.playerName);
  };

  let ordered: MilestoneItem[];
  if (featured) {
    const recent = items.filter((i) => i.recent).sort(byDateDesc);
    const rest = items.filter((i) => !i.recent).sort(bySignificance);
    ordered = [...recent, ...rest];
  } else {
    ordered = items.slice().sort(bySignificance);
  }

  res.json({
    recencyWeeks,
    windowStart,
    featured,
    items: ordered.slice(0, MAX_ITEMS),
  });
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
 * Detect career-tier crossings (games / runs / wickets) that happened during the
 * recency window. The player's current career total minus their in-window match
 * contributions gives the pre-window total; we then walk the window's matches in
 * date order and emit an item when a cumulative total first reaches a tier.
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
    windowStart: string;
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
    windowStart,
    gamesTiers,
    runsTiers,
    wicketsTiers,
  } = ctx;

  // Per-player, in-window match lines (with dated matches), oldest first.
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
    if (!m || !isIsoDate(m.matchDate) || m.matchDate < windowStart) continue;
    const arr = byPlayer.get(l.playerId) ?? [];
    arr.push({
      matchId: l.matchId,
      matchDate: m.matchDate,
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
              recent: true,
            });
          }
        }
      }
    }
  }
}

export default router;
