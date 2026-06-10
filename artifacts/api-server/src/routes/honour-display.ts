import { Router, type IRouter } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import {
  db,
  honourDisplaySettingsTable,
  premiershipsTable,
  premiershipPlayersTable,
  matchesTable,
  centuriesTable,
  fiveWicketHaulsTable,
  clubRecordsTable,
  lifeMembersTable,
  awardsTable,
  awardWinnersTable,
  awardPointsConfigTable,
  clubRolesTable,
  partnershipRecordsTable,
  teamOfDecadeBoardsTable,
  teamOfDecadeMembersTable,
  playerGradeStatsTable,
  playersTable,
  type HonourDisplaySettingsRow,
  type BoardDisplayConfigJson,
  type CompositeDefJson,
} from "@workspace/db";
import { UpdateHonourDisplaySettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getHallsHeadBrand } from "../lib/halls-head-brand";
import { linkPremiershipMatch, premiershipSeasons } from "./premierships";
import { computeLeaderboard } from "../lib/points";
import { buildMilestones } from "./milestones";

const router: IRouter = Router();

const DISPLAY_SETTINGS_ID = 1;

// Seniority order for grade-grouped boards (captains, records-by-grade) so they
// roll A Grade → Colts.
const GRADE_ORDER = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];
function gradeRank(g: string): number {
  const i = GRADE_ORDER.indexOf(g);
  return i === -1 ? GRADE_ORDER.length : i;
}

// ---------------------------------------------------------------------------
// Settings singleton
// ---------------------------------------------------------------------------

async function ensureHonourDisplaySettings() {
  const [existing] = await db
    .select()
    .from(honourDisplaySettingsTable)
    .where(eq(honourDisplaySettingsTable.id, DISPLAY_SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(honourDisplaySettingsTable)
    .values({ id: DISPLAY_SETTINGS_ID })
    .returning();
  return created;
}

function serializeSettings(
  row: typeof honourDisplaySettingsTable.$inferSelect,
  opts: { includeToken?: boolean } = {},
) {
  return {
    defaultTemplate: row.defaultTemplate,
    kioskSequence: row.kioskSequence ?? [],
    kioskDwellMs: row.kioskDwellMs,
    kioskScrollSpeed: row.kioskScrollSpeed,
    kioskEndHoldMs: row.kioskEndHoldMs,
    boardConfigs: row.boardConfigs ?? {},
    composites: row.composites ?? [],
    // Only surface the kiosk token to authenticated admins. The public
    // kiosk feed omits it so it never leaks to the rotation client.
    ...(opts.includeToken ? { kioskToken: row.kioskToken ?? null } : {}),
  };
}

/** Constant-time match of a presented kiosk token against the stored one. */
function kioskTokenMatches(stored: string | null, presented: unknown): boolean {
  if (!stored || typeof presented !== "string" || presented.length === 0) {
    return false;
  }
  const a = Buffer.from(stored);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Board assembly
// ---------------------------------------------------------------------------

interface BoardSquadMember {
  name: string;
  playerId: number | null;
  isCaptain: boolean;
}

interface BoardEntryMeta {
  venue?: string | null;
  date?: string | null;
  motm?: string | null;
  captain?: string | null;
  grade?: string | null;
  parentGrade?: string | null;
  competition?: string | null;
  rank?: number | null;
}

interface BoardEntry {
  season: string;
  primaryText: string;
  detail?: string | null;
  playerId?: number | null;
  matchId?: number | null;
  meta?: BoardEntryMeta;
  squad?: BoardSquadMember[] | null;
}

// Each board keeps its NATURAL layout; the chosen skin only changes the look.
// "columns" is a composite layout: several list boards rendered side-by-side.
type BoardLayout = "premiership" | "teamOfDecade" | "list" | "columns";

type BoardTransition = "scroll" | "slide";

// Resolved (always-present) per-board display config sent to the client.
interface BoardDisplayOut {
  columns: number; // multi-column list flow count (1..3); 1 for non-list layouts
  transition: BoardTransition;
  fit: boolean; // drop the height cap and fill the viewport
}

// One column of a composite "columns" board.
interface BoardColumnOut {
  heading: string;
  entries: BoardEntry[];
}

interface HonourBoardOut {
  id: string;
  category: string;
  layout: BoardLayout;
  title: string;
  subtitle?: string | null;
  entries: BoardEntry[];
  // Only set for the "columns" layout (composite boards).
  columns?: BoardColumnOut[] | null;
  // Stamped onto every board by assembleBoards before serialization.
  display?: BoardDisplayOut;
}

const DEFAULT_DISPLAY: BoardDisplayOut = {
  columns: 1,
  transition: "scroll",
  fit: false,
};

/** Resolve a board's display config: defaults merged with the admin override. */
function resolveDisplay(
  layout: BoardLayout,
  override: BoardDisplayConfigJson | undefined,
): BoardDisplayOut {
  // Multi-column flow only makes sense for plain lists; other layouts stay 1.
  const cols =
    layout === "list"
      ? Math.min(3, Math.max(1, Math.round(override?.columns ?? 1)))
      : 1;
  return {
    columns: cols,
    transition: override?.transition ?? DEFAULT_DISPLAY.transition,
    fit: override?.fit ?? DEFAULT_DISPLAY.fit,
  };
}

/** Map a flat premiership grade to the grade-filter parent key. */
function premParentGrade(grade: string): string {
  switch (grade) {
    case "A Grade":
      return "A";
    case "B Grade":
      return "B";
    case "C Grade":
      return "C";
    case "D Grade":
      return "D";
    case "E Grade":
      return "E";
    case "F Grade":
      return "F";
    case "PPL":
      return "PPL";
    case "Colts":
      return "U21 Colts";
    case "Female A Grade":
      return "Female A";
    case "Female B Grade":
      return "Female B";
    default:
      return grade;
  }
}

/** Display grade label for the premiership card. */
function premDisplayGrade(grade: string, competition: string): string {
  const parent = premParentGrade(grade);
  const isMidYearT20 = /MID-?YEAR/i.test(competition) && /T20/i.test(competition);
  if (grade.startsWith("Female")) return parent; // "Female A" / "Female B"
  if (grade === "Colts") return "U21 Colts";
  if (grade === "PPL") return "PPL";
  if (isMidYearT20) return `Mid-Year T20 ${parent}`;
  return parent; // "A".."F"
}

/** Title-case a SHOUTED competition string for the card sub-line. */
function tidyCompetition(competition: string): string {
  return competition
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bT20\b/i, "T20")
    .replace(/Ppl/g, "PPL");
}

/** Cricket season label, e.g. 1992 (1991/92 win) -> "1991/92". */
function seasonLabel(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

async function buildPremierships(): Promise<HonourBoardOut | null> {
  const prems = await db
    .select()
    .from(premiershipsTable)
    .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade));
  if (prems.length === 0) return null;

  const ids = prems.map((p) => p.id);
  const players = await db
    .select()
    .from(premiershipPlayersTable)
    .where(inArray(premiershipPlayersTable.premiershipId, ids))
    .orderBy(
      asc(premiershipPlayersTable.premiershipId),
      asc(premiershipPlayersTable.battingOrder),
      asc(premiershipPlayersTable.id),
    );
  const byPrem = new Map<number, typeof players>();
  for (const p of players) {
    if (!byPrem.has(p.premiershipId)) byPrem.set(p.premiershipId, []);
    byPrem.get(p.premiershipId)!.push(p);
  }

  // Grand-final match linking (mirrors /premierships).
  const finalMatches = await db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      opponent: matchesTable.opponent,
      matchDate: matchesTable.matchDate,
      result: matchesTable.result,
      stage: matchesTable.stage,
    })
    .from(matchesTable)
    .where(inArray(matchesTable.stage, ["Grand Final", "Finals"]));
  type GfMatch = Omit<(typeof finalMatches)[number], "stage">;
  const gfByKey = new Map<string, GfMatch[]>();
  const finalsByKey = new Map<string, GfMatch[]>();
  for (const m of finalMatches) {
    const { stage, ...rest } = m;
    const key = `${m.grade}|${m.season}`;
    const target = stage === "Grand Final" ? gfByKey : finalsByKey;
    if (!target.has(key)) target.set(key, []);
    target.get(key)!.push(rest);
  }

  const entries: BoardEntry[] = prems.map((p) => {
    const squad = byPrem.get(p.id) ?? [];
    const captainRow = squad.find((s) => s.isCaptain) ?? null;
    const motmRow = squad.find((s) => s.isMotm) ?? null;
    const startYear = premiershipSeasons(p.year, p.matchDate)[0];
    const captainName = captainRow?.name ?? null;
    const motmName = motmRow?.name ?? p.mom ?? null;
    return {
      season: seasonLabel(startYear),
      primaryText: tidyCompetition(p.competition),
      detail: p.result ?? null,
      playerId: captainRow?.playerId ?? null,
      matchId: linkPremiershipMatch(p, gfByKey, finalsByKey),
      meta: {
        venue: p.venue,
        date: p.matchDate,
        motm: motmName,
        captain: captainName,
        grade: premDisplayGrade(p.grade, p.competition),
        parentGrade: premParentGrade(p.grade),
        competition: tidyCompetition(p.competition),
      },
      squad: squad.map((s) => ({
        name: s.name,
        playerId: s.playerId,
        isCaptain: s.isCaptain,
      })),
    };
  });

  return {
    id: "premierships",
    category: "premierships",
    layout: "premiership",
    title: "Premierships",
    subtitle: "Grand Final winners",
    entries,
  };
}

async function buildCenturies(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(centuriesTable)
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

async function buildFiveWicketHauls(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(fiveWicketHaulsTable)
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

async function buildLifeMembers(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(lifeMembersTable)
    .orderBy(asc(lifeMembersTable.inductionYear), asc(lifeMembersTable.name));
  if (rows.length === 0) return null;
  return {
    id: "life_members",
    category: "life_members",
    layout: "list",
    title: "Life Members",
    subtitle: "Honoured for outstanding service",
    entries: rows.map((r) => ({
      season: String(r.inductionYear),
      primaryText: r.name,
      detail: r.roleLabel || r.blurb || (r.isPlayingMember ? "Playing member" : null),
      playerId: r.playerId ?? null,
    })),
  };
}

async function buildClubRecords(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(clubRecordsTable)
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

/** Grade captains — ONE board per grade that has any published captain. */
async function buildCaptains(): Promise<HonourBoardOut[]> {
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(
      and(eq(clubRolesTable.role, "Grade Captain"), eq(clubRolesTable.published, true)),
    )
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder));
  if (rows.length === 0) return [];

  const byGrade = new Map<string, typeof rows>();
  for (const r of rows) {
    const grade = r.grade ?? "";
    if (!grade) continue;
    if (!byGrade.has(grade)) byGrade.set(grade, []);
    byGrade.get(grade)!.push(r);
  }

  return [...byGrade.entries()]
    .sort((a, b) => gradeRank(a[0]) - gradeRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([grade, recs]) => ({
      id: `captains:${grade}`,
      category: "captains",
      layout: "list" as const,
      title: `${grade} Captains`,
      subtitle: "Season-by-season leaders",
      entries: recs.map((r) => ({
        season: seasonLabel(r.season),
        primaryText: r.name,
        detail: null,
        playerId: r.playerId ?? null,
      })),
    }));
}

/** Committee / office bearers — published club roles with NO grade (grade null). */
async function buildCommittee(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(eq(clubRolesTable.published, true))
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder), asc(clubRolesTable.id));
  const officeBearers = rows.filter((r) => r.grade == null);
  if (officeBearers.length === 0) return null;
  return {
    id: "committee",
    category: "committee",
    layout: "list",
    title: "Committee & Office Bearers",
    subtitle: "Those who served off the field",
    entries: officeBearers.map((r) => ({
      season: seasonLabel(r.season),
      primaryText: r.name,
      detail: r.role,
      playerId: r.playerId ?? null,
    })),
  };
}

/** Partnership records — highest stand per wicket per grade. */
async function buildPartnerships(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(partnershipRecordsTable)
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

/** Recently-achieved milestones (reuses the /milestones feed). */
async function buildMilestoneBoard(): Promise<HonourBoardOut | null> {
  const { items } = await buildMilestones();
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

/** Award points leaderboards (published, visible configs only). */
async function buildAwardPoints(): Promise<HonourBoardOut[]> {
  const configs = await db
    .select()
    .from(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.leaderboardVisible, true))
    .orderBy(desc(awardPointsConfigTable.season));
  if (configs.length === 0) return [];
  const awards = await db.select().from(awardsTable);
  const awardById = new Map(awards.map((a) => [a.id, a]));

  const out: HonourBoardOut[] = [];
  for (const config of configs) {
    const award = awardById.get(config.awardId);
    if (!award || !award.published || !award.pointsGrade) continue;
    const { entries } = await computeLeaderboard(config, award.pointsGrade);
    if (entries.length === 0) continue;
    out.push({
      id: `award_points:${config.id}`,
      category: "award_points",
      layout: "list",
      title: `${award.title} — Points`,
      subtitle: `${award.pointsGrade} · ${seasonLabel(config.season)}`,
      entries: entries.map((e, i) => ({
        season: "",
        primaryText: e.name,
        detail: `${e.points} pts`,
        playerId: e.playerId,
        meta: { rank: i + 1 },
      })),
    });
  }
  return out;
}

// --- Notable honour-board records (role tenures + award win counts) ---

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

type Tally = {
  name: string;
  playerId: number | null;
  playerIdConflict: boolean;
  seasons: Set<number>;
};

function tallyEntries(
  records: { name: string; playerId: number | null; season: number }[],
  unit: string,
  limit = 10,
): BoardEntry[] {
  const byPerson = new Map<string, Tally>();
  for (const r of records) {
    const name = r.name.trim();
    if (!name) continue;
    const key = normalizeName(name);
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

const ROLE_ORDER = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Director of Cricket",
  "Club Captain",
  "Coach",
];
function roleRank(role: string): number {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

async function buildRecordsLeaderboards(): Promise<HonourBoardOut[]> {
  const roleRows = await db
    .select({
      role: clubRolesTable.role,
      season: clubRolesTable.season,
      name: clubRolesTable.name,
      playerId: clubRolesTable.playerId,
      grade: clubRolesTable.grade,
    })
    .from(clubRolesTable)
    .where(eq(clubRolesTable.published, true));

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
    .where(eq(awardsTable.published, true))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  const awardIds = awards.map((a) => a.id);
  const winners = awardIds.length
    ? await db
        .select({
          awardId: awardWinnersTable.awardId,
          season: awardWinnersTable.season,
          name: awardWinnersTable.name,
          playerId: awardWinnersTable.playerId,
        })
        .from(awardWinnersTable)
        .where(
          and(
            inArray(awardWinnersTable.awardId, awardIds),
            eq(awardWinnersTable.published, true),
          ),
        )
    : [];
  const byAward = new Map<number, { name: string; playerId: number | null; season: number }[]>();
  for (const w of winners) {
    if (!byAward.has(w.awardId)) byAward.set(w.awardId, []);
    byAward.get(w.awardId)!.push({ name: w.name, playerId: w.playerId, season: w.season });
  }
  for (const a of awards) {
    const entries = tallyEntries(byAward.get(a.id) ?? [], "wins");
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

/** Per-grade statistical record holders (mirrors the Records "By Grade" tab). */
async function buildRecordsByGrade(): Promise<HonourBoardOut[]> {
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
    const pushTop = (
      label: string,
      pick: Row | undefined,
      value: string | number | null,
    ) => {
      if (!pick || value == null || value === "" || value === 0) return;
      entries.push({
        season: "",
        primaryText: label,
        detail: `${value} — ${name(pick)}`,
        playerId: pick.playerId,
      });
    };
    const topBy = (sel: (r: Row) => number) =>
      recs.slice().sort((a, b) => sel(b) - sel(a))[0];

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
    out.push({
      id: `records_grade:${grade}`,
      category: "records_by_grade",
      layout: "list",
      title: `${grade} Records`,
      subtitle: "Leading performances in this grade",
      entries,
    });
  }
  return out;
}

/** Team of the Decade — published boards only, full XI lineup. */
async function buildTeamOfDecade(): Promise<HonourBoardOut[]> {
  const boards = await db
    .select()
    .from(teamOfDecadeBoardsTable)
    .where(eq(teamOfDecadeBoardsTable.published, true))
    .orderBy(asc(teamOfDecadeBoardsTable.displayOrder), asc(teamOfDecadeBoardsTable.id));
  if (boards.length === 0) return [];
  const boardIds = boards.map((b) => b.id);
  const members = await db
    .select()
    .from(teamOfDecadeMembersTable)
    .where(inArray(teamOfDecadeMembersTable.boardId, boardIds))
    .orderBy(
      asc(teamOfDecadeMembersTable.battingOrder),
      asc(teamOfDecadeMembersTable.displayOrder),
      asc(teamOfDecadeMembersTable.id),
    );
  const byBoard = new Map<number, typeof members>();
  for (const m of members) {
    if (!byBoard.has(m.boardId)) byBoard.set(m.boardId, []);
    byBoard.get(m.boardId)!.push(m);
  }

  return boards
    .filter((b) => (byBoard.get(b.id) ?? []).length > 0)
    .map((b) => ({
      id: `team_of_decade:${b.key}`,
      category: "team_of_decade",
      layout: "teamOfDecade" as const,
      title: b.title,
      subtitle: [b.teamLabel, b.periodLabel, b.subtitle].filter(Boolean).join(" · ") || null,
      entries: (byBoard.get(b.id) ?? []).map((m) => {
        const marks = [
          m.isCaptain ? "(c)" : "",
          m.isViceCaptain ? "(vc)" : "",
          m.isWicketkeeper ? "(wk)" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return {
          season: "",
          primaryText: marks ? `${m.name} ${marks}` : m.name,
          detail: m.role || null,
          playerId: m.playerId ?? null,
        };
      }),
    }));
}

/** Per-published-award honour boards, each under its REAL award title. */
async function buildAwardBoards(): Promise<HonourBoardOut[]> {
  const awards = await db
    .select()
    .from(awardsTable)
    .where(eq(awardsTable.published, true))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  if (awards.length === 0) return [];

  const awardIds = awards.map((a) => a.id);
  const winners = await db
    .select()
    .from(awardWinnersTable)
    .where(
      and(
        inArray(awardWinnersTable.awardId, awardIds),
        eq(awardWinnersTable.published, true),
      ),
    )
    .orderBy(desc(awardWinnersTable.season), asc(awardWinnersTable.displayOrder));
  const byAward = new Map<number, typeof winners>();
  for (const w of winners) {
    if (!byAward.has(w.awardId)) byAward.set(w.awardId, []);
    byAward.get(w.awardId)!.push(w);
  }

  const boards: HonourBoardOut[] = [];
  for (const a of awards) {
    const winRows = byAward.get(a.id) ?? [];
    if (winRows.length === 0) continue;
    boards.push({
      id: `award:${a.key}`,
      category: "awards",
      layout: "list",
      title: a.title,
      subtitle: a.description || null,
      entries: winRows.map((w) => ({
        season: seasonLabel(w.season),
        primaryText: w.name,
        detail: null,
        playerId: w.playerId ?? null,
      })),
    });
  }
  return boards;
}

/** Most career appearances — real players only (id < 90000), games > 0. */
async function buildMostGames(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select({
      id: playersTable.id,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
      totalGames: playersTable.totalGames,
    })
    .from(playersTable)
    .where(and(lt(playersTable.id, 90000), gt(playersTable.totalGames, 0)))
    .orderBy(desc(playersTable.totalGames), asc(playersTable.surname))
    .limit(50);
  if (rows.length === 0) return null;
  return {
    id: "most_games",
    category: "most_games",
    layout: "list",
    title: "Most Games Played",
    subtitle: "Career appearances for the club",
    entries: rows.map((r, i) => ({
      season: "",
      primaryText: `${r.givenName ?? ""} ${r.surname}`.trim(),
      detail: `${r.totalGames} games`,
      playerId: r.id,
      meta: { rank: i + 1 },
    })),
  };
}

/** Parse the leading start-year from a season label ("2024/25" -> 2024). */
function seasonStartYearFromLabel(label: string): number {
  const m = label.match(/(\d{4})/);
  return m ? parseInt(m[1]!, 10) : -1;
}

// Refs that can never be a composite column source.
const NON_COMPOSITE_REFS = new Set(["approaching"]);

/**
 * Build admin-defined composite "columns" boards from settings.composites.
 * Free columns are the core mechanism (each list board becomes a column).
 * seasonAligned is a guarded transform: only applied when EVERY referenced
 * column has a non-empty season on every entry; otherwise we fall back to the
 * free-columns layout so a board without seasons never collapses to empty.
 */
function buildComposites(
  defs: CompositeDefJson[],
  baseBoards: HonourBoardOut[],
): HonourBoardOut[] {
  const byId = new Map(baseBoards.map((b) => [b.id, b]));
  const out: HonourBoardOut[] = [];
  for (const def of defs) {
    if (typeof def?.id !== "string" || !def.id.startsWith("composite:")) continue;
    const cols: BoardColumnOut[] = [];
    for (const ref of def.columns ?? []) {
      if (!ref || NON_COMPOSITE_REFS.has(ref.boardId)) continue;
      if (ref.boardId.startsWith("composite:")) continue; // no nesting
      const src = byId.get(ref.boardId);
      if (!src || src.layout !== "list") continue; // only list boards
      cols.push({
        heading: (ref.heading ?? "").trim() || src.title,
        entries: src.entries,
      });
    }
    if (cols.length === 0) continue;

    const canAlign =
      def.seasonAligned &&
      cols.every(
        (c) =>
          c.entries.length > 0 &&
          c.entries.every((e) => (e.season ?? "") !== ""),
      );

    let columns: BoardColumnOut[];
    if (canAlign) {
      // Union of all seasons across the columns, newest first.
      const yearByLabel = new Map<string, number>();
      for (const c of cols)
        for (const e of c.entries)
          yearByLabel.set(e.season, seasonStartYearFromLabel(e.season));
      const seasons = [...yearByLabel.entries()]
        .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
        .map(([label]) => label);
      const seasonCol: BoardColumnOut = {
        heading: "Season",
        entries: seasons.map((s) => ({ season: s, primaryText: s })),
      };
      const aligned = cols.map((c) => {
        const bySeason = new Map<string, BoardEntry[]>();
        for (const e of c.entries) {
          if (!bySeason.has(e.season)) bySeason.set(e.season, []);
          bySeason.get(e.season)!.push(e);
        }
        return {
          heading: c.heading,
          entries: seasons.map((s): BoardEntry => {
            const hits = bySeason.get(s) ?? [];
            if (hits.length === 0) return { season: s, primaryText: "" };
            if (hits.length === 1) {
              const h = hits[0]!;
              return {
                season: s,
                primaryText: h.primaryText,
                detail: h.detail ?? null,
                playerId: h.playerId ?? null,
                matchId: h.matchId ?? null,
              };
            }
            return {
              season: s,
              primaryText: hits.map((h) => h.primaryText).join(", "),
              detail:
                hits
                  .map((h) => h.detail)
                  .filter((d): d is string => !!d)
                  .join(" · ") || null,
            };
          }),
        };
      });
      columns = [seasonCol, ...aligned];
    } else {
      columns = cols;
    }

    out.push({
      id: def.id,
      category: "composite",
      layout: "columns",
      title: def.title,
      subtitle: def.subtitle ?? null,
      entries: [],
      columns,
    });
  }
  return out;
}

async function assembleBoards(
  settings: HonourDisplaySettingsRow,
): Promise<HonourBoardOut[]> {
  const [
    premierships,
    awards,
    centuries,
    fiveFor,
    lifeMembers,
    captains,
    committee,
    partnerships,
    milestones,
    awardPoints,
    recordsLeaderboards,
    recordsByGrade,
    teamOfDecade,
    clubRecords,
    mostGames,
  ] = await Promise.all([
    buildPremierships(),
    buildAwardBoards(),
    buildCenturies(),
    buildFiveWicketHauls(),
    buildLifeMembers(),
    buildCaptains(),
    buildCommittee(),
    buildPartnerships(),
    buildMilestoneBoard(),
    buildAwardPoints(),
    buildRecordsLeaderboards(),
    buildRecordsByGrade(),
    buildTeamOfDecade(),
    buildClubRecords(),
    buildMostGames(),
  ]);

  const boards: HonourBoardOut[] = [];
  if (premierships) boards.push(premierships);
  boards.push(...awards);
  boards.push(...teamOfDecade);
  if (clubRecords) boards.push(clubRecords);
  boards.push(...recordsByGrade);
  if (partnerships) boards.push(partnerships);
  if (centuries) boards.push(centuries);
  if (fiveFor) boards.push(fiveFor);
  if (mostGames) boards.push(mostGames);
  if (milestones) boards.push(milestones);
  boards.push(...awardPoints);
  boards.push(...recordsLeaderboards);
  boards.push(...captains);
  if (committee) boards.push(committee);
  if (lifeMembers) boards.push(lifeMembers);

  // Composite "columns" boards reference the base boards above, so build them
  // last (after Most Games) and append.
  boards.push(...buildComposites(settings.composites ?? [], boards));

  // Stamp the resolved display config onto every board.
  const boardConfigs = settings.boardConfigs ?? {};
  for (const b of boards) {
    if (b.layout === "columns") {
      const def = (settings.composites ?? []).find((d) => d.id === b.id);
      b.display = {
        columns: 1,
        transition: def?.transition ?? "scroll",
        fit: def?.fit ?? true,
      };
    } else {
      b.display = resolveDisplay(b.layout, boardConfigs[b.id]);
    }
  }
  return boards;
}

function deriveMonogram(name: string, shortName: string | null): string {
  const source = (name || shortName || "").trim();
  const initials = source
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (initials.length >= 2) return initials;
  return (shortName || source || "HH").slice(0, 2).toUpperCase();
}

async function buildBrand() {
  const b = await getHallsHeadBrand();
  return {
    name: b.name,
    shortName: b.shortName ?? b.name,
    monogram: deriveMonogram(b.name, b.shortName ?? null),
    logoUrl: b.logoUrl128 ?? b.logoUrl ?? null,
    primaryColour: b.primaryColour ?? "#333F48",
    secondaryColour: b.secondaryColour ?? "#FBAC27",
    tertiaryColour: b.tertiaryColour ?? b.primaryColour ?? "#4A5A66",
  };
}

// ---------------------------------------------------------------------------
// Routes (admin-only: the display + kiosk are clubroom/admin tools)
// ---------------------------------------------------------------------------

router.get("/honour-display", requireAdmin, async (_req, res): Promise<void> => {
  const settingsRow = await ensureHonourDisplaySettings();
  const [boards, brand] = await Promise.all([
    assembleBoards(settingsRow),
    buildBrand(),
  ]);
  res.json({
    boards,
    brand,
    settings: serializeSettings(settingsRow, { includeToken: true }),
  });
});

// Public, token-gated kiosk feed. A fixed clubroom TV / Raspberry Pi can run
// the rotation with a long-lived token instead of an admin session, without
// exposing the rest of the admin surface.
router.get("/honour-display/kiosk", async (req, res): Promise<void> => {
  const settingsRow = await ensureHonourDisplaySettings();
  if (!kioskTokenMatches(settingsRow.kioskToken, req.query.token)) {
    res.status(403).json({ error: "Invalid or revoked kiosk token" });
    return;
  }
  const [boards, brand] = await Promise.all([
    assembleBoards(settingsRow),
    buildBrand(),
  ]);
  res.json({ boards, brand, settings: serializeSettings(settingsRow) });
});

// Generate (or rotate) the kiosk token. Replaces any existing one, so the
// previous link immediately stops working.
router.post(
  "/honour-display/kiosk-token",
  requireAdmin,
  async (_req, res): Promise<void> => {
    await ensureHonourDisplaySettings();
    const token = randomBytes(24).toString("base64url");
    await db
      .update(honourDisplaySettingsTable)
      .set({ kioskToken: token, updatedAt: new Date() })
      .where(eq(honourDisplaySettingsTable.id, DISPLAY_SETTINGS_ID));
    res.json({ token });
  },
);

// Revoke the kiosk token so any existing link stops working.
router.delete(
  "/honour-display/kiosk-token",
  requireAdmin,
  async (_req, res): Promise<void> => {
    await ensureHonourDisplaySettings();
    await db
      .update(honourDisplaySettingsTable)
      .set({ kioskToken: null, updatedAt: new Date() })
      .where(eq(honourDisplaySettingsTable.id, DISPLAY_SETTINGS_ID));
    res.json({ token: null });
  },
);

router.patch(
  "/honour-display-settings",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = UpdateHonourDisplaySettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await ensureHonourDisplaySettings();
    const updateFields: Partial<typeof honourDisplaySettingsTable.$inferInsert> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) (updateFields as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db
        .update(honourDisplaySettingsTable)
        .set(updateFields)
        .where(eq(honourDisplaySettingsTable.id, DISPLAY_SETTINGS_ID));
    }
    const [row] = await db
      .select()
      .from(honourDisplaySettingsTable)
      .where(eq(honourDisplaySettingsTable.id, DISPLAY_SETTINGS_ID));
    res.json(serializeSettings(row));
  },
);

export default router;
