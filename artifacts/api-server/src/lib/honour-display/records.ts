/**
 * Performance and record boards: centuries, five-fors, partnerships, club records, most games, records by grade, recent milestones, and the notable-tenure / award-win leaderboards.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { awardCreditRows } from "../award-recipients";
import {
  db,
  centuriesTable,
  fiveWicketHaulsTable,
  clubRecordsTable,
  awardsTable,
  awardWinnersTable,
  clubRolesTable,
  partnershipRecordsTable,
  playerGradeStatsTable,
  playersTable,
} from "@workspace/db";

import { buildMilestonesForSource } from "../../routes/milestones";
import type { DataSource } from "../tenant";
import { buildClubStats, clubRecordLeaders, clubRecords, loadClubOverlay } from "../club-overlay";
import { nativeRecordLeaders, nativeSeasonSpans } from "../records-native";
import { rankLeaders } from "../records-analytics";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { seasonLabel } from "./premierships";
import { gradeRank } from "./shared";
import { type BoardEntry, type HonourBoardOut } from "./types";

export async function buildCenturies(tenantId: number): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(centuriesTable)
    .where(eq(centuriesTable.tenantId, tenantId))
    .orderBy(desc(centuriesTable.season), asc(centuriesTable.batsman));
  if (rows.length === 0) return null;
  return {
    id: "centuries",
    category: "centuries",
    layout: "list",
    title: "Centuries",
    subtitle: "Hundreds for the club",
    entries: rows.map((r) => ({
      season: r.season ?? "",
      primaryText: r.batsman,
      detail: r.score ?? null,
      playerId: r.playerId ?? null,
      meta: { grade: r.grade },
    })),
  };
}

export async function buildFiveWicketHauls(tenantId: number): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(fiveWicketHaulsTable)
    .where(eq(fiveWicketHaulsTable.tenantId, tenantId))
    .orderBy(desc(fiveWicketHaulsTable.season), asc(fiveWicketHaulsTable.bowler));
  if (rows.length === 0) return null;
  return {
    id: "five_wicket_hauls",
    category: "five_wicket_hauls",
    layout: "list",
    title: "Five-Wicket Hauls",
    subtitle: "Five or more in an innings",
    entries: rows.map((r) => ({
      season: r.season ?? "",
      primaryText: r.bowler,
      detail: r.figures ?? null,
      playerId: r.playerId ?? null,
      meta: { grade: r.grade },
    })),
  };
}

export async function buildClubRecords(tenantId: number): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(clubRecordsTable)
    .where(eq(clubRecordsTable.tenantId, tenantId))
    .orderBy(asc(clubRecordsTable.id));
  if (rows.length === 0) return null;
  return {
    id: "club_records",
    category: "club_records",
    layout: "list",
    title: "Club Records",
    subtitle: "All-time record holders",
    entries: rows.map((r) => ({
      season: "",
      primaryText: r.recordType,
      detail: r.detail ?? null,
      meta: { grade: r.grade },
    })),
  };
}

/** Partnership records — highest stand per wicket per grade. */
export async function buildPartnerships(tenantId: number): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(partnershipRecordsTable)
    .where(eq(partnershipRecordsTable.tenantId, tenantId))
    .orderBy(
      asc(partnershipRecordsTable.grade),
      desc(partnershipRecordsTable.runs),
      asc(partnershipRecordsTable.id),
    );
  if (rows.length === 0) return null;
  return {
    id: "partnerships",
    category: "partnerships",
    layout: "list",
    title: "Partnership Records",
    subtitle: "Record stands per wicket",
    entries: rows.map((r) => {
      const bits = [`${r.runs} runs`, `${r.wicket} wkt`];
      if (r.opposition) bits.push(`v ${r.opposition}`);
      return {
        season: r.season ?? "",
        primaryText: r.batsmen,
        detail: bits.join(" · "),
        meta: { grade: r.grade },
      };
    }),
  };
}

/** Recently-achieved milestones (reuses the /milestones feed, tenant-scoped). */
export async function buildMilestoneBoard(source: DataSource): Promise<HonourBoardOut | null> {
  const { items } = await buildMilestonesForSource(source);
  if (items.length === 0) return null;
  return {
    id: "milestones",
    category: "milestones",
    layout: "list",
    title: "Recent Milestones",
    subtitle: "Latest achievements across the club",
    entries: items.map((m) => ({
      season: m.matchDate ?? (m.season != null ? seasonLabel(m.season) : ""),
      primaryText: m.playerName,
      detail: m.detail ?? m.label,
      playerId: m.playerId,
      matchId: m.matchId ?? null,
      meta: { grade: m.grade },
    })),
  };
}

// --- Notable honour-board records (role tenures + award win counts) ---

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type Tally = {
  name: string;
  playerId: number | null;
  playerIdConflict: boolean;
  seasons: Set<number>;
};

export function tallyEntries(
  records: { name: string; playerId: number | null; season: number }[],
  unit: string,
  limit = 10,
  byIdentity = false,
): BoardEntry[] {
  const byPerson = new Map<string, Tally>();
  for (const r of records) {
    const name = r.name.trim();
    if (!name) continue;
    const key = byIdentity && r.playerId != null ? `player:${r.playerId}` : normalizeName(name);
    let t = byPerson.get(key);
    if (!t) {
      t = { name, playerId: null, playerIdConflict: false, seasons: new Set() };
      byPerson.set(key, t);
    }
    t.seasons.add(r.season);
    if (r.playerId != null) {
      if (t.playerId == null) t.playerId = r.playerId;
      else if (t.playerId !== r.playerId) t.playerIdConflict = true;
    }
  }
  return [...byPerson.values()]
    .map((t) => ({
      name: t.name,
      playerId: t.playerIdConflict ? null : t.playerId,
      count: t.seasons.size,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((e, i) => ({
      season: "",
      primaryText: e.name,
      detail: `${e.count} ${unit}`,
      playerId: e.playerId,
      meta: { rank: i + 1 },
    }));
}

export const ROLE_ORDER = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Director of Cricket",
  "Club Captain",
  "Coach",
];
export function roleRank(role: string): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

export async function buildRecordsLeaderboards(tenantId: number): Promise<HonourBoardOut[]> {
  const roleRows = await db
    .select({
      role: clubRolesTable.role,
      season: clubRolesTable.season,
      name: clubRolesTable.name,
      playerId: clubRolesTable.playerId,
      grade: clubRolesTable.grade,
    })
    .from(clubRolesTable)
    .where(and(eq(clubRolesTable.tenantId, tenantId), eq(clubRolesTable.published, true)));

  const byRole = new Map<string, { name: string; playerId: number | null; season: number }[]>();
  for (const r of roleRows) {
    if (r.grade != null) continue; // grade captains surfaced per grade
    if (!byRole.has(r.role)) byRole.set(r.role, []);
    byRole.get(r.role)!.push({ name: r.name, playerId: r.playerId, season: r.season });
  }

  const out: HonourBoardOut[] = [];
  for (const [role, recs] of [...byRole.entries()].sort(
    (a, b) => roleRank(a[0]) - roleRank(b[0]) || a[0].localeCompare(b[0]),
  )) {
    const entries = tallyEntries(recs, "seasons");
    if ((entries[0]?.detail ? parseInt(entries[0].detail, 10) : 0) < 2) continue;
    out.push({
      id: `record_lb:role:${role}`,
      category: "records_leaderboard",
      layout: "list",
      title: `Most Seasons as ${role}`,
      subtitle: "Notable honour-board records",
      entries,
    });
  }

  const awards = await db
    .select()
    .from(awardsTable)
    .where(and(eq(awardsTable.tenantId, tenantId), eq(awardsTable.published, true)))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  const awardIds = awards.map((a) => a.id);
  const winners = awardIds.length
    ? await db
        .select({
          awardId: awardWinnersTable.awardId,
          season: awardWinnersTable.season,
          name: awardWinnersTable.name,
          playerId: awardWinnersTable.playerId,
          playerIds: awardWinnersTable.playerIds,
        })
        .from(awardWinnersTable)
        .where(
          and(inArray(awardWinnersTable.awardId, awardIds), eq(awardWinnersTable.published, true)),
        )
    : [];
  const byAward = new Map<number, { name: string; playerId: number | null; season: number }[]>();
  for (const w of await awardCreditRows(tenantId, winners)) {
    if (!byAward.has(w.awardId)) byAward.set(w.awardId, []);
    byAward.get(w.awardId)!.push({ name: w.name, playerId: w.playerId, season: w.season });
  }
  for (const a of awards) {
    const entries = tallyEntries(byAward.get(a.id) ?? [], "wins", 10, true);
    if ((entries[0]?.detail ? parseInt(entries[0].detail, 10) : 0) < 2) continue;
    out.push({
      id: `record_lb:award:${a.key}`,
      category: "records_leaderboard",
      layout: "list",
      title: `Most ${a.title} Wins`,
      subtitle: "Notable honour-board records",
      entries,
    });
  }

  return out;
}

function recordsByGradeBoard(grade: string, entries: BoardEntry[]): HonourBoardOut {
  return {
    id: `records_grade:${grade}`,
    category: "records_by_grade",
    layout: "list",
    title: `${grade} Records`,
    subtitle: "Leading performances in this grade",
    entries,
  };
}

/**
 * Per-grade statistical record holders (mirrors the Records "By Grade" tab).
 *
 * The native stats tables hold only tenant #1's history, so a central tenant
 * builds the same boards from its own central club (senior grades only,
 * private players never shown), with holders linked through its crosswalk.
 */
export async function buildRecordsByGrade(source: DataSource): Promise<HonourBoardOut[]> {
  if (source.kind === "central") return buildCentralRecordsByGrade(source);
  return buildNativeRecordsByGrade();
}

async function buildCentralRecordsByGrade(
  source: Extract<DataSource, { kind: "central" }>,
): Promise<HonourBoardOut[]> {
  const { centralClubRecords, centralGradesForSeason } =
    await import("@workspace/db/central-queries");
  // The club overlay's identity: crosswalk ids with confirmed merges folded,
  // so a merged pair holds a record as one player (KTD2).
  const [centralGrades, overlay] = await Promise.all([
    centralGradesForSeason(source.clubId, null),
    loadClubOverlay(source.tenantId),
  ]);
  const identity = overlay.identity;
  // The club overlay (U10): with a boundary, club history or corrections the
  // holders come from the overlaid stats (a history-only grade gets a board too).
  const stats = overlay.active
    ? await buildClubStats(overlay, source.tenantId, source.clubId)
    : null;
  const intByGuid = stats ? stats.intByGuid : identity.intByGuid;
  const grades = stats
    ? [...new Set([...centralGrades, ...stats.buckets.map((b) => b.grade)])]
    : centralGrades;
  const perGrade = await Promise.all(
    grades.map(async (grade) => ({
      grade,
      records: stats
        ? clubRecords(stats, { grade })
        : await centralClubRecords(source.clubId, { grade }, identity.merges),
    })),
  );

  const out: HonourBoardOut[] = [];
  for (const { grade, records } of perGrade.sort(
    (a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.grade.localeCompare(b.grade),
  )) {
    const entries: BoardEntry[] = [];
    const push = (
      label: string,
      h: { participantId: string; displayName: string | null; value: number | string } | null,
    ) => {
      if (!h || h.value === 0 || h.value === "") return;
      const name = (h.displayName ?? "").trim();
      if (!name) return;
      entries.push({
        season: "",
        primaryText: label,
        detail: `${h.value} — ${name}`,
        playerId: intByGuid.get(h.participantId) ?? null,
      });
    };
    push("Most Games", records.mostGames);
    push("Most Runs", records.mostRuns);
    push("Highest Score", records.highestScore);
    push("Most Wickets", records.mostWickets);
    push("Best Bowling", records.bestBowling);
    push("Most Catches", records.mostCatches);
    if (entries.length > 0) out.push(recordsByGradeBoard(grade, entries));
  }
  return out;
}

async function buildNativeRecordsByGrade(): Promise<HonourBoardOut[]> {
  const rows = await db
    .select({
      playerId: playerGradeStatsTable.playerId,
      givenName: playerGradeStatsTable.givenName,
      surname: playerGradeStatsTable.surname,
      grade: playerGradeStatsTable.grade,
      games: playerGradeStatsTable.games,
      runs: playerGradeStatsTable.runs,
      wickets: playerGradeStatsTable.wickets,
      catches: playerGradeStatsTable.catches,
      highScore: playerGradeStatsTable.highScore,
      bestBowling: playerGradeStatsTable.bestBowling,
    })
    .from(playerGradeStatsTable);
  if (rows.length === 0) return [];

  const byGrade = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byGrade.has(r.grade)) byGrade.set(r.grade, []);
    byGrade.get(r.grade)!.push(r);
  }

  const parseHs = (hs: string | null) => (hs ? parseInt(hs.replace("*", ""), 10) || 0 : 0);
  const parseBb = (bb: string | null) =>
    bb && bb !== "" ? parseInt(bb.split("/")[0]!, 10) || 0 : 0;

  type Row = (typeof rows)[number];
  const name = (r: Row) => `${r.givenName} ${r.surname}`.trim();

  const out: HonourBoardOut[] = [];
  for (const [grade, recs] of [...byGrade.entries()].sort(
    (a, b) => gradeRank(a[0]) - gradeRank(b[0]) || a[0].localeCompare(b[0]),
  )) {
    const entries: BoardEntry[] = [];
    const pushTop = (label: string, pick: Row | undefined, value: string | number | null) => {
      if (!pick || value == null || value === "" || value === 0) return;
      entries.push({
        season: "",
        primaryText: label,
        detail: `${value} — ${name(pick)}`,
        playerId: pick.playerId,
      });
    };
    const topBy = (sel: (r: Row) => number) => recs.slice().sort((a, b) => sel(b) - sel(a))[0];

    const mostGames = topBy((r) => r.games ?? 0);
    const mostRuns = topBy((r) => r.runs ?? 0);
    const mostWickets = topBy((r) => r.wickets ?? 0);
    const mostCatches = topBy((r) => r.catches ?? 0);
    const highScore = recs.slice().sort((a, b) => parseHs(b.highScore) - parseHs(a.highScore))[0];
    const bestBowling = recs
      .slice()
      .sort((a, b) => parseBb(b.bestBowling) - parseBb(a.bestBowling))[0];

    pushTop("Most Games", mostGames, mostGames?.games ?? 0);
    pushTop("Most Runs", mostRuns, mostRuns?.runs ?? 0);
    pushTop("Highest Score", highScore, highScore?.highScore ?? null);
    pushTop("Most Wickets", mostWickets, mostWickets?.wickets ?? 0);
    pushTop("Best Bowling", bestBowling, bestBowling?.bestBowling ?? null);
    pushTop("Most Catches", mostCatches, mostCatches?.catches ?? 0);

    if (entries.length === 0) continue;
    out.push(recordsByGradeBoard(grade, entries));
  }
  return out;
}

const LEADERBOARD_LIMIT = 50;

/** The four career leaderboards (honours kiosk redesign C1), in display order. */
export const LEADERBOARDS = [
  {
    metric: "games",
    id: "most_games",
    title: "Most Games Played",
    subtitle: "Senior games for the club, all grades",
    figureLabel: "Games",
    unit: "games",
  },
  {
    metric: "runs",
    id: "most_runs",
    title: "Most Runs",
    subtitle: "Senior career runs for the club, all grades",
    figureLabel: "Runs",
    unit: "runs",
  },
  {
    metric: "wickets",
    id: "most_wickets",
    title: "Most Wickets",
    subtitle: "Senior career wickets for the club, all grades",
    figureLabel: "Wickets",
    unit: "wickets",
  },
  {
    metric: "catches",
    id: "most_catches",
    title: "Most Catches",
    subtitle: "Senior career catches for the club, all grades",
    figureLabel: "Catches",
    unit: "catches",
  },
] as const;
export type LeaderboardDef = (typeof LEADERBOARDS)[number];

export interface LeaderboardRow {
  name: string;
  value: number;
  playerId: number | null;
  /** First and last season (start years) for the club, when known. */
  firstSeason?: number | null;
  lastSeason?: number | null;
}

/** "2009–25" for 2009/10 to 2024/25; "2024/25" for one season; "" when unknown. */
export function seasonSpan(first: number | null | undefined, last: number | null | undefined) {
  if (first == null || last == null) return "";
  if (first === last) return seasonLabel(first);
  return `${first}–${String((last + 1) % 100).padStart(2, "0")}`;
}

/**
 * One leaderboard board from rows sorted highest first: top 50, tied values
 * share a rank. Entries keep a "312 games" detail so list renderers (composite
 * columns, the public display) still read sensibly.
 */
export function leaderboardBoard(
  def: LeaderboardDef,
  rows: LeaderboardRow[],
): HonourBoardOut | null {
  const ranked = rankLeaders(rows, LEADERBOARD_LIMIT);
  if (ranked.length === 0) return null;
  return {
    id: def.id,
    category: def.id,
    layout: "leaderboard",
    title: def.title,
    subtitle: def.subtitle,
    figureLabel: def.figureLabel,
    entries: ranked.map((r) => ({
      season: "",
      primaryText: r.name,
      detail: `${r.value} ${def.unit}`,
      playerId: r.playerId,
      meta: {
        rank: r.rank,
        figure: r.value.toLocaleString("en-AU"),
        seasonSpan: seasonSpan(r.firstSeason, r.lastSeason) || null,
      },
    })),
  };
}

/**
 * Career leaderboards: most games, runs, wickets and catches (senior only,
 * fill-ins excluded, private players never shown). Central tenants read the
 * same overlay-aware leaders as the Records page; the native tenant reads its
 * own stats tables.
 */
export async function buildLeaderboards(source: DataSource): Promise<HonourBoardOut[]> {
  const boards =
    source.kind === "central"
      ? await buildCentralLeaderboards(source)
      : await buildNativeLeaderboards();
  return boards.filter((b): b is HonourBoardOut => b !== null);
}

async function buildCentralLeaderboards(
  source: Extract<DataSource, { kind: "central" }>,
): Promise<(HonourBoardOut | null)[]> {
  const { centralRecordLeaders } = await import("@workspace/db/central-queries");
  // Confirmed merges fold into the keeper: a merged pair ranks as one player.
  const overlay = await loadClubOverlay(source.tenantId);
  const stats = overlay.active
    ? await buildClubStats(overlay, source.tenantId, source.clubId)
    : null;
  const intByGuid = stats ? stats.intByGuid : overlay.identity.intByGuid;
  return Promise.all(
    LEADERBOARDS.map(async (def) => {
      const leaders = stats
        ? clubRecordLeaders(stats, def.metric)
        : await centralRecordLeaders(source.clubId, def.metric, {}, overlay.identity.merges);
      const rows = leaders
        .filter((l) => (l.displayName ?? "").trim() !== "")
        .map((l) => ({
          name: l.displayName!.trim(),
          value: l.value,
          playerId: intByGuid.get(l.participantId) ?? null,
          firstSeason: l.firstSeason ?? null,
          lastSeason: l.lastSeason,
        }));
      return leaderboardBoard(def, rows);
    }),
  );
}

async function buildNativeLeaderboards(): Promise<(HonourBoardOut | null)[]> {
  return Promise.all(
    LEADERBOARDS.map(async (def) => {
      const rows =
        def.metric === "games"
          ? await nativeMostGames()
          : (await nativeRecordLeaders(def.metric, {}))
              .slice(0, LEADERBOARD_LIMIT * 2)
              .map((r) => ({
                name: `${r.givenName ?? ""} ${r.surname}`.trim(),
                value: r.value,
                playerId: r.playerId,
              }));
      const spans = await nativeSeasonSpans(
        rows
          .slice(0, LEADERBOARD_LIMIT * 2)
          .flatMap((r) => (r.playerId != null ? [r.playerId] : [])),
      );
      return leaderboardBoard(
        def,
        rows.map((r) => {
          const span = r.playerId != null ? spans.get(r.playerId) : undefined;
          return { ...r, firstSeason: span?.first ?? null, lastSeason: span?.last ?? null };
        }),
      );
    }),
  );
}

/** Native career games: real players only (id < FILL_IN_THRESHOLD), games > 0. */
async function nativeMostGames(): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      id: playersTable.id,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
      totalGames: playersTable.totalGames,
    })
    .from(playersTable)
    .where(and(lt(playersTable.id, FILL_IN_THRESHOLD), gt(playersTable.totalGames, 0)))
    .orderBy(desc(playersTable.totalGames), asc(playersTable.surname))
    .limit(LEADERBOARD_LIMIT * 2);
  return rows.map((r) => ({
    name: `${r.givenName ?? ""} ${r.surname}`.trim(),
    value: r.totalGames ?? 0,
    playerId: r.id,
  }));
}
