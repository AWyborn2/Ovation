import { Router, type IRouter, type Request } from "express";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
import {
  NATIVE_STATS_TENANT_ID,
  NativeStatsUnavailableError,
  dataSource,
  type DataSource,
} from "../lib/tenant";

import { resolveCuration } from "../lib/central-curation";
import { getOrCreateSettings } from "../lib/settings";
import { logger } from "../lib/logger";
import { withMilestonesCache } from "../lib/milestones-cache";
import { parseMatchDate, partitionMatchDates } from "../lib/match-date";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";

const router: IRouter = Router();

/** Tracks whether any optional section fell back, so we never cache a partial board. */
type BuildHealth = { degraded: boolean };

/**
 * An *optional* board section failing should cost that section, not the whole
 * homepage. Only sections whose absence leaves the rest of the board correct go
 * through here — `hat_tricks` and `debuts`.
 *
 * The load-bearing reads (matches, players, match_player_lines) are deliberately
 * NOT wrapped: swallowing those produces a board that is structurally valid and
 * semantically false rather than empty. A failed `players` read, for instance,
 * would still emit every century and five-for but name each achiever "Unknown"
 * and silently drop all career crossings — worse than a 500, because nothing
 * downstream can tell it apart from real data.
 */
async function optionalSection<T>(
  name: string,
  health: BuildHealth,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    health.degraded = true;
    logger.error({ err, section: name }, "milestones: optional section failed; omitting it");
    return fallback;
  }
}

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

// Date parsing lives in ../lib/match-date so it can be unit-tested without a
// database. See that module for the formats understood and why.

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

export async function buildMilestones(
  tenantId: number,
  health: BuildHealth = { degraded: false },
): Promise<MilestonesResult> {
  // The tables below (matches, players, match_player_lines, cap_register's
  // match joins) carry no tenant_id — deliberately, since they are slated for
  // replacement by central reads filtered on club_id. Serving them to any other
  // tenant would hand over tenant #1's entire stats history, so refuse rather
  // than silently mislabel one club's data as another's.
  if (tenantId !== NATIVE_STATS_TENANT_ID) {
    throw new NativeStatsUnavailableError(tenantId);
  }

  const settings = await getOrCreateSettings(milestoneBoardSettingsTable, tenantId);
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

  // Load-bearing: every item on the board resolves through matchById.
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

  // The recency window is derived from the latest parseable date, so a format
  // the parser cannot read doesn't just drop one row — it can shift what
  // "recent" means for the whole board. Surface those instead of swallowing
  // them; a blank date is ordinary missing data and is not reported.
  const { parsed: parsedDates, unparsed } = partitionMatchDates(
    matches.map((m) => m.matchDate),
  );
  if (unparsed.length > 0) {
    logger.warn(
      {
        tenantId,
        unparseable: unparsed.length,
        ofMatches: matches.length,
        samples: [...new Set(unparsed)].slice(0, 5),
      },
      "milestones: match dates could not be parsed; recency window derived without them",
    );
  }
  let latestDate: string | null = null;
  for (const iso of parsedDates) {
    if (!latestDate || iso > latestDate) latestDate = iso;
  }
  const windowStart = latestDate ? addWeeks(latestDate, recencyWeeks) : null;
  const inWindow = (d: string | null): boolean => {
    const iso = parseMatchDate(d);
    return iso != null && windowStart != null && iso >= windowStart;
  };

  // Load-bearing: these two carry the achievements and the names/careers they
  // are attributed to. Degrading either yields a plausible-but-wrong board.
  const lines = await db
    .select({
      matchId: matchPlayerLinesTable.matchId,
      playerId: matchPlayerLinesTable.playerId,
      runs: matchPlayerLinesTable.runs,
      wickets: matchPlayerLinesTable.wickets,
    })
    .from(matchPlayerLinesTable)
    .where(sql`${matchPlayerLinesTable.playerId} < ${FILL_IN_THRESHOLD}`);

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

  const hatTricks = await optionalSection(
    "hat_tricks",
    health,
    () =>
      db
        .select({
          matchId: matchHatTricksTable.matchId,
          playerId: matchHatTricksTable.playerId,
        })
        .from(matchHatTricksTable)
        .where(sql`${matchHatTricksTable.playerId} < ${FILL_IN_THRESHOLD}`),
    [] as { matchId: number; playerId: number }[],
  );
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

  await optionalSection(
    "debuts",
    health,
    () => appendDebuts(items, { tenantId, matchById, nameFor, inWindow }),
    undefined,
  );

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

async function buildCentralMilestones(
  source: { tenantId: number; clubId: number },
  health: BuildHealth = { degraded: false },
): Promise<MilestonesResult> {
  const { centralMilestones } = await import("@workspace/db/central-queries");
  const { tenantId, clubId } = source;
  const settings = await getOrCreateSettings(milestoneBoardSettingsTable, tenantId);
  const tiers = {
    games: settings?.gamesTiers ?? DEFAULT_GAMES_TIERS,
    runs: settings?.runsTiers ?? DEFAULT_RUNS_TIERS,
    wickets: settings?.wicketsTiers ?? DEFAULT_WICKETS_TIERS,
  };
  const [raw, mapRows, curation] = await Promise.all([
    // The one remote dependency on this path. A central outage should cost the
    // milestone items, not the whole homepage board — and because a degraded
    // build is never cached, it recovers on the next request.
    optionalSection(
      "central_milestones",
      health,
      async () => centralMilestones(clubId, tiers),
      [] as Awaited<ReturnType<typeof centralMilestones>>,
    ),
    db
      .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId)),
    resolveCuration(tenantId),
  ]);
  const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
  const nameFor = (participantId: string, displayName: string | null): string =>
    curation.nameByGuid.get(participantId) ?? displayName ?? "Unknown";

  const items: MilestoneItem[] = raw.map((m) => {
    if (m.kind === "career") {
      const boardKey = m.boardKey ?? "games";
      const threshold = m.threshold ?? m.value;
      return {
        id: `career|${boardKey}|${threshold}|${m.participantId}`,
        kind: "career",
        playerId: intByGuid.get(m.participantId) ?? 0,
        playerName: nameFor(m.participantId, m.displayName),
        grade: m.grade,
        matchId: m.matchId,
        matchDate: m.matchDate,
        season: m.season,
        round: null,
        opponent: m.opponent,
        boardKey,
        tierIndex: m.tierIndex ?? null,
        label: `${threshold} career ${boardKey}`,
        detail: `Reached ${threshold} ${boardKey} (now ${m.value})`,
        value: m.value,
        threshold,
        significance: SIG_CAREER_BASE + (m.tierIndex ?? 0) * SIG_CAREER_STEP,
        recent: false,
      };
    }
    const isCentury = m.kind === "century";
    return {
      id: `${m.kind}|${m.participantId}|${m.matchId}`,
      kind: m.kind,
      playerId: intByGuid.get(m.participantId) ?? 0,
      playerName: nameFor(m.participantId, m.displayName),
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
    recencyWeeks: settings?.recencyWeeks ?? 4,
    windowStart: null,
    featured: false,
    items: items.slice(0, MAX_ITEMS),
  };
}

/**
 * Milestone feed for the current request's tenant: central-scoped when the
 * tenant reads from the central PCA DB, otherwise the native (tenant-DB) build.
 * Shared by the `/milestones` route and the honour-display board so both honour
 * the tenant boundary instead of leaking tenant #1's players.
 */
export async function buildMilestonesForSource(
  source: DataSource,
): Promise<MilestonesResult> {
  const tenantId = source.tenantId;
  const central = source.kind === "central";
  // Key on every input that varies the board: the tenant (its settings row
  // drives the recency window and tiers), the read path, and — on the central
  // path — the club id, so remapping a tenant to a different central club can
  // never keep serving the previous club's players under the new brand.
  const clubId = source.kind === "central" ? source.clubId : null;
  const key = `${tenantId}:${central ? `central:${clubId}` : "native"}`;

  return withMilestonesCache(key, async () => {
    const health: BuildHealth = { degraded: false };
    const value = central
      ? await buildCentralMilestones(source, health)
      : await buildMilestones(tenantId, health);
    return { value, degraded: health.degraded };
  });
}

/** Request-flavoured wrapper: resolves the tenant's data source first. */
export async function buildMilestonesForRequest(
  req: Request,
): Promise<MilestonesResult> {
  return buildMilestonesForSource(await dataSource(req));
}

router.get("/milestones", async (req, res): Promise<void> => {
  res.json(await buildMilestonesForRequest(req));
});

async function appendDebuts(
  items: MilestoneItem[],
  ctx: {
    tenantId: number;
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
  const { tenantId, matchById, nameFor, inWindow } = ctx;
  const grades = Object.values(CAP_CATEGORY_TO_GRADE);

  // cap_register is tenant-scoped curated content. Reading it unfiltered here
  // rendered one club's cap numbers as another club's debut milestones on a
  // public board.
  const caps = await db
    .select({
      category: capRegisterTable.category,
      capNumber: capRegisterTable.capNumber,
      playerId: capRegisterTable.playerId,
    })
    .from(capRegisterTable)
    .where(
      and(eq(capRegisterTable.tenantId, tenantId), isNotNull(capRegisterTable.playerId)),
    );

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
