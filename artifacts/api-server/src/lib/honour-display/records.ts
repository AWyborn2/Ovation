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
  hatTricksTable,
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
import { centralHonourList, centralOpponentsByMatch } from "../honours-lists";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { seasonLabel } from "./premierships";
import { gradeRank } from "./shared";
import { type BoardEntry, type HonourBoardOut } from "./types";

/** One row of an achievement list (centuries, five-fors, hat-tricks). */
export interface AchievementRow {
  name: string;
  playerId: number | null;
  grade: string;
  /** "134*", "6/23". */
  figure: string;
  /** "YYYY/YY" (may be empty). */
  season: string;
  opponent: string | null;
}

const ACHIEVEMENT_BOARDS = {
  centuries: {
    id: "centuries",
    title: "Centuries",
    subtitle: "Hundreds for the club",
    figureLabel: "Score",
    tally: ["century", "centuries"],
  },
  five_wicket_hauls: {
    id: "five_wicket_hauls",
    title: "Five-Wicket Hauls",
    subtitle: "Five or more in an innings",
    figureLabel: "Figures",
    tally: ["five-wicket haul", "five-wicket hauls"],
  },
  hat_tricks: {
    id: "hat_tricks",
    title: "Hat-tricks",
    subtitle: "Three wickets in three balls",
    figureLabel: "Figures",
    tally: ["hat-trick", "hat-tricks"],
  },
} as const;
export type AchievementBoardId = keyof typeof ACHIEVEMENT_BOARDS;

/** "Mandurah" from "v Mandurah" or "Mandurah"; null when blank. */
function opponentName(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().replace(/^v\.?\s+/i, "");
  return t || null;
}

/**
 * An achievement list board (kiosk redesign C2): season, player, figure, grade,
 * opponent, newest season first. Entries keep a "134* · A Grade" style detail
 * for list renderers and composite columns.
 */
export function achievementBoard(
  id: AchievementBoardId,
  rows: AchievementRow[],
): HonourBoardOut | null {
  const def = ACHIEVEMENT_BOARDS[id];
  const named = rows.filter((r) => r.name.trim() !== "");
  if (named.length === 0) return null;
  const sorted = [...named].sort(
    (a, b) =>
      b.season.localeCompare(a.season) ||
      gradeRank(a.grade) - gradeRank(b.grade) ||
      a.name.localeCompare(b.name),
  );
  return {
    id: def.id,
    category: def.id,
    layout: "achievements",
    title: def.title,
    subtitle: def.subtitle,
    figureLabel: def.figureLabel,
    tallyLabel: `${sorted.length} ${def.tally[sorted.length === 1 ? 0 : 1]}`,
    entries: sorted.map((r) => ({
      season: r.season,
      primaryText: r.name.trim(),
      detail: r.figure || null,
      playerId: r.playerId,
      meta: { grade: r.grade, figure: r.figure || null, opponent: opponentName(r.opponent) },
    })),
  };
}

/**
 * Centuries or five-wicket hauls. A central tenant shows the list its public
 * Centuries / Five-Wicket Hauls page shows (derived from scorecards, with the
 * club overlay), each with the opponent from its match; the native tenant
 * shows its curated list.
 */
export async function buildHonourList(
  kind: "century" | "fiveFor",
  source: DataSource,
): Promise<HonourBoardOut | null> {
  const id: AchievementBoardId = kind === "century" ? "centuries" : "five_wicket_hauls";
  if (source.kind === "central") {
    const [rows, opponents] = await Promise.all([
      centralHonourList(kind, source.tenantId, source.clubId),
      centralOpponentsByMatch(source.clubId),
    ]);
    return achievementBoard(
      id,
      rows.map((r) => ({
        name: r.name,
        playerId: r.playerId,
        grade: r.grade,
        figure: r.detail,
        season: r.season,
        opponent: r.matchId != null ? (opponents.get(r.matchId) ?? null) : null,
      })),
    );
  }
  const rows =
    kind === "century"
      ? await db
          .select({
            name: centuriesTable.batsman,
            playerId: centuriesTable.playerId,
            grade: centuriesTable.grade,
            figure: centuriesTable.score,
            season: centuriesTable.season,
          })
          .from(centuriesTable)
          .where(eq(centuriesTable.tenantId, source.tenantId))
      : await db
          .select({
            name: fiveWicketHaulsTable.bowler,
            playerId: fiveWicketHaulsTable.playerId,
            grade: fiveWicketHaulsTable.grade,
            figure: fiveWicketHaulsTable.figures,
            season: fiveWicketHaulsTable.season,
          })
          .from(fiveWicketHaulsTable)
          .where(eq(fiveWicketHaulsTable.tenantId, source.tenantId));
  return achievementBoard(
    id,
    rows.map((r) => ({
      ...r,
      figure: r.figure ?? "",
      season: r.season ?? "",
      opponent: null,
    })),
  );
}

/** The club's curated hat-tricks. */
export async function buildHatTricks(tenantId: number): Promise<HonourBoardOut | null> {
  const rows = await db.select().from(hatTricksTable).where(eq(hatTricksTable.tenantId, tenantId));
  return achievementBoard(
    "hat_tricks",
    rows.map((r) => ({
      name: r.bowler,
      playerId: r.playerId,
      grade: r.grade,
      figure: r.figures ?? "",
      season: r.season ?? "",
      opponent: r.opponent,
    })),
  );
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

/** A partnership for a records table: a curated row or a derived stand. */
export interface PartnershipRow {
  grade: string;
  wicket: number;
  runs: number;
  /** "Ann Allrounder & Bea Batter". */
  batters: string;
  season: string;
  opponent: string | null;
  source: "curated" | "derived";
}

/** 3 from "3rd", "3", "3rd Wkt"; null when there's no wicket number 1–10. */
export function wicketNumber(raw: string): number | null {
  const n = parseInt(raw.match(/\d+/)?.[0] ?? "", 10);
  return n >= 1 && n <= 10 ? n : null;
}

/**
 * The Partnership Records boards (kiosk redesign C4): one "records table" per
 * grade with the highest partnership for each wicket. Derived stands (from
 * fall-of-wicket data) and the club's curated records (its older seasons)
 * compete per wicket; the higher wins, and on a tie the club's own record.
 */
export function partnershipBoards(rows: PartnershipRow[]): HonourBoardOut[] {
  const best = new Map<string, PartnershipRow>();
  for (const r of rows) {
    const key = `${r.grade}\u0000${r.wicket}`;
    const cur = best.get(key);
    if (
      !cur ||
      r.runs > cur.runs ||
      (r.runs === cur.runs && r.source === "curated" && cur.source !== "curated")
    ) {
      best.set(key, r);
    }
  }
  const byGrade = new Map<string, PartnershipRow[]>();
  for (const r of best.values()) {
    if (!byGrade.has(r.grade)) byGrade.set(r.grade, []);
    byGrade.get(r.grade)!.push(r);
  }
  return [...byGrade.entries()]
    .sort((a, b) => gradeRank(a[0]) - gradeRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([grade, list]) => ({
      id: `partnerships_grade:${grade}`,
      category: "partnership_records",
      layout: "recordsTable" as const,
      title: `${grade} Partnerships`,
      subtitle: "Highest partnership for each wicket",
      figureLabel: "Runs",
      entries: list
        .sort((a, b) => a.wicket - b.wicket)
        .map((r) => ({
          season: r.season,
          primaryText: r.batters,
          detail: `${r.runs} runs · ${r.wicket} wkt${r.opponent ? ` · v ${r.opponent}` : ""}`,
          meta: { grade, wicket: r.wicket, figure: String(r.runs), opponent: r.opponent },
        })),
    }));
}

/**
 * Partnership records per grade: a central tenant's derived stands with its
 * curated records; the native tenant's curated records alone.
 */
export async function buildPartnershipBoards(source: DataSource): Promise<HonourBoardOut[]> {
  const curated = await db
    .select()
    .from(partnershipRecordsTable)
    .where(eq(partnershipRecordsTable.tenantId, source.tenantId));
  const rows: PartnershipRow[] = [];
  for (const c of curated) {
    const wicket = wicketNumber(c.wicket);
    if (wicket === null || !c.batsmen.trim()) continue;
    rows.push({
      grade: c.grade,
      wicket,
      runs: c.runs,
      batters: c.batsmen.trim(),
      season: c.season ?? "",
      opponent: opponentName(c.opposition),
      source: "curated",
    });
  }
  if (source.kind === "central") {
    const { centralPartnershipRecords } = await import("@workspace/db/central-queries");
    const overlay = await loadClubOverlay(source.tenantId);
    const [derived, opponents] = await Promise.all([
      centralPartnershipRecords(source.clubId, overlay.identity.merges),
      centralOpponentsByMatch(source.clubId),
    ]);
    for (const d of derived) {
      const names = d.batters.map((b) => (b.displayName ?? "").trim());
      if (names.some((n) => !n)) continue;
      rows.push({
        grade: d.grade,
        wicket: d.wicket,
        runs: d.runs,
        batters: names.join(" & "),
        season: d.season,
        opponent: opponents.get(d.matchId) ?? null,
        source: "derived",
      });
    }
  }
  return partnershipBoards(rows);
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

/** One record in a grade: "Most Runs", "4321", "Jane Smith". */
export interface GradeRecordLine {
  label: string;
  value: string;
  holder: string | null;
  playerId: number | null;
}

/** A grade's record holders, in the order the boards list them. */
export interface GradeRecords {
  grade: string;
  lines: GradeRecordLine[];
}

function recordsByGradeBoard({ grade, lines }: GradeRecords): HonourBoardOut {
  return {
    id: `records_grade:${grade}`,
    category: "records_by_grade",
    layout: "list",
    title: `${grade} Records`,
    subtitle: "Leading performances in this grade",
    entries: lines.map((l) => ({
      season: "",
      primaryText: l.label,
      detail: l.holder ? `${l.value} — ${l.holder}` : l.value,
      playerId: l.playerId,
    })),
  };
}

/** "games record holders" → "games record holders" without punctuation, for matching. */
const labelKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The Grade Records board (kiosk redesign C3): one panel per grade, the
 * derived record holders with the club's curated records for that grade on
 * top. A curated record whose type names a derived one ("Most Runs") replaces
 * it; any other curated record for the grade is added to the panel.
 */
export function gradeRecordPanels(
  derived: GradeRecords[],
  curated: { recordType: string; grade: string | null; detail: string | null }[],
): HonourBoardOut | null {
  const byGrade = new Map(derived.map((g) => [g.grade, { grade: g.grade, lines: [...g.lines] }]));
  for (const c of curated) {
    const grade = c.grade?.trim();
    const label = c.recordType.trim();
    const value = (c.detail ?? "").trim();
    if (!grade || !label || !value) continue;
    let panel = byGrade.get(grade);
    if (!panel) {
      panel = { grade, lines: [] };
      byGrade.set(grade, panel);
    }
    const line = { label, value, holder: null, playerId: null };
    const i = panel.lines.findIndex((l) => labelKey(l.label) === labelKey(label));
    if (i >= 0) panel.lines[i] = line;
    else panel.lines.push(line);
  }
  const panels = [...byGrade.values()]
    .filter((p) => p.lines.length > 0)
    .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.grade.localeCompare(b.grade));
  if (panels.length === 0) return null;
  return {
    id: "grade_records",
    category: "grade_records",
    layout: "recordPanels",
    title: "Grade Records",
    subtitle: "Leading performances in each grade",
    entries: panels.map((p) => ({
      season: "",
      primaryText: p.grade,
      lines: p.lines,
    })),
  };
}

/**
 * The per-grade record boards (one list board per grade, as before) and the
 * Grade Records panels board (C3), from one read of the grade records. The
 * curated records are the tenant's own `club_records` rows.
 */
export async function buildGradeRecordBoards(
  source: DataSource,
): Promise<{ byGrade: HonourBoardOut[]; panels: HonourBoardOut | null }> {
  const [derived, curated] = await Promise.all([
    gradeRecords(source),
    db
      .select({
        recordType: clubRecordsTable.recordType,
        grade: clubRecordsTable.grade,
        detail: clubRecordsTable.detail,
      })
      .from(clubRecordsTable)
      .where(eq(clubRecordsTable.tenantId, source.tenantId))
      .orderBy(asc(clubRecordsTable.id)),
  ]);
  return {
    byGrade: derived.map(recordsByGradeBoard),
    panels: gradeRecordPanels(derived, curated),
  };
}

/**
 * Per-grade statistical record holders (mirrors the Records "By Grade" tab).
 *
 * The native stats tables hold only tenant #1's history, so a central tenant
 * builds the same records from its own central club (senior grades only,
 * private players never shown), with holders linked through its crosswalk.
 */
async function gradeRecords(source: DataSource): Promise<GradeRecords[]> {
  const out =
    source.kind === "central" ? await centralGradeRecords(source) : await nativeGradeRecords();
  return out
    .filter((g) => g.lines.length > 0)
    .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || a.grade.localeCompare(b.grade));
}

async function centralGradeRecords(
  source: Extract<DataSource, { kind: "central" }>,
): Promise<GradeRecords[]> {
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

  return perGrade.map(({ grade, records }) => {
    const lines: GradeRecordLine[] = [];
    const push = (
      label: string,
      h: { participantId: string; displayName: string | null; value: number | string } | null,
    ) => {
      if (!h || h.value === 0 || h.value === "") return;
      const name = (h.displayName ?? "").trim();
      if (!name) return;
      lines.push({
        label,
        value: String(h.value),
        holder: name,
        playerId: intByGuid.get(h.participantId) ?? null,
      });
    };
    push("Most Games", records.mostGames);
    push("Most Runs", records.mostRuns);
    push("Highest Score", records.highestScore);
    push("Most Wickets", records.mostWickets);
    push("Best Bowling", records.bestBowling);
    push("Most Catches", records.mostCatches);
    return { grade, lines };
  });
}

async function nativeGradeRecords(): Promise<GradeRecords[]> {
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

  return [...byGrade.entries()].map(([grade, recs]) => {
    const lines: GradeRecordLine[] = [];
    const pushTop = (label: string, pick: Row | undefined, value: string | number | null) => {
      if (!pick || value == null || value === "" || value === 0) return;
      lines.push({ label, value: String(value), holder: name(pick), playerId: pick.playerId });
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
    return { grade, lines };
  });
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
