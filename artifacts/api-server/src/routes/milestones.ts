import { Router, type IRouter, type Request } from "express";
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
  playerIdMapTable,
} from "@workspace/db";
import { CAP_CATEGORY_TO_GRADE } from "../lib/cap-sync";
import { getRequestCentralClubId, shouldReadCentral } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

const SETTINGS_ID = 1;

const DEFAULT_GAMES_TIERS = [100, 150, 200, 250, 300];
const DEFAULT_RUNS_TIERS = [1000, 2000, 3000, 5000, 7500, 10000];
const DEFAULT_WICKETS_TIERS = [100, 150, 200, 300];

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

export async function buildMilestones(): Promise<MilestonesResult> {
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

  const lines = await db
    .select({
      matchId: matchPlayerLinesTable.matchId,
      playerId: matchPlayerLinesTable.playerId,
      runs: matchPlayerLinesTable.runs,
      wickets: matchPlayerLinesTable.wickets,
    })
    .from(matchPlayerLinesTable)
    .where(sql`${matchPlayerLinesTable.playerId} < 90000`);

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

  await appendDebuts(items, { matchById, nameFor, inWindow });

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

async function buildCentralMilestones(req: Request): Promise<MilestonesResult> {
  const { centralMilestones } = await import("@workspace/db/central-queries");
  const tenantId = getTenantId(req);
  const [raw, mapRows] = await Promise.all([
    centralMilestones(await getRequestCentralClubId(req)),
    db
      .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId)),
  ]);
  const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));

  const items: MilestoneItem[] = raw.map((m) => {
    const isCentury = m.kind === "century";
    return {
      id: `${m.kind}|${m.participantId}|${m.matchId}`,
      kind: m.kind,
      playerId: intByGuid.get(m.participantId) ?? 0,
      playerName: m.displayName ?? "Unknown",
      grade: m.grade,
      matchId: m.matchId,
      matchDate: m.matchDate,
      season: m.season,
      round: null,
      opponent: m.opponent,
      boardKey: null,
      tierIndex: null,
      label: isCentury ? `${m.value} runs` : `${m.value} wickets`,
      detail: isCentury
        ? `Century in ${m.grade}${m.opponent ? ` vs ${m.opponent}` : ""}`
        : `Five-wicket haul in ${m.grade}${m.opponent ? ` vs ${m.opponent}` : ""}`,
      value: m.value,
      threshold: isCentury ? 100 : 5,
      significance: isCentury ? SIG_CENTURY : SIG_FIVE_FOR,
      recent: false,
    };
  });

  return {
    recencyWeeks: 4,
    windowStart: null,
    featured: false,
    items: items.slice(0, MAX_ITEMS),
  };
}

router.get("/milestones", async (req, res): Promise<void> => {
  if (await shouldReadCentral(req)) {
    res.json(await buildCentralMilestones(req));
    return;
  }
  res.json(await buildMilestones());
});

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
