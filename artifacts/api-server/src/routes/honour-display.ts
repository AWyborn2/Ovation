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
  type CustomGridDefJson,
} from "@workspace/db";
import { UpdateHonourDisplaySettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantBrand } from "../lib/tenant-brand";
import { DEFAULT_TENANT_ID } from "../middlewares/tenant-context";
import { loadActiveSponsors } from "../lib/active-sponsors";
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
    kioskSponsorStrip: row.kioskSponsorStrip,
    kioskSponsorSlides: row.kioskSponsorSlides,
    kioskSponsorSlideEvery: row.kioskSponsorSlideEvery,
    kioskSponsorSlideStyle: (row.kioskSponsorSlideStyle as "grid" | "single") ?? "grid",
    kioskSponsorIds: row.kioskSponsorIds ?? [],
    kioskAds: row.kioskAds ?? [],
    boardConfigs: row.boardConfigs ?? {},
    composites: row.composites ?? [],
    customGrids: row.customGrids ?? [],
    skins: row.skins ?? [],
    colourOverrides: row.colourOverrides ?? {},
    defaultFont: row.defaultFont ?? null,
    // Only surface the kiosk token to authenticated admins. The public
    // kiosk feed omits it so it never leaks to the rotation client.
    ...(opts.includeToken ? { kioskToken: row.kioskToken ?? null } : {}),
  };
}

// Kiosk codes are short and unambiguous so they're easy to type straight into a
// TV / Raspberry Pi browser: 8 chars from a Crockford-style alphabet (no
// 0/O/1/I/L). The data is read-only honour boards and the code is revocable on
// demand, so ~8.5e11 combinations is ample.
const KIOSK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Random auto-generated codes; legacy long base64url tokens stay exact-match.
const KIOSK_CODE_RE = /^[A-Z2-9]{8}$/;
// Admin-chosen custom codes: 3–40 chars, letters/numbers/hyphens (no leading
// hyphen). Matched case-insensitively so they're forgiving to hand-type.
const KIOSK_CUSTOM_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;

function generateKioskToken(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += KIOSK_CODE_ALPHABET.charAt(byte % KIOSK_CODE_ALPHABET.length);
  }
  return code;
}

/** Normalise + validate an admin-supplied custom kiosk code, or null if invalid. */
export function normalizeCustomKioskToken(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return KIOSK_CUSTOM_RE.test(trimmed) ? trimmed : null;
}

/**
 * Constant-time match of a presented kiosk token against the stored one. Codes
 * made only of letters/numbers/hyphens (auto codes + custom codes) are matched
 * case-insensitively so they're forgiving to hand-type; legacy long base64url
 * tokens stay exact-match.
 */
export function kioskTokenMatches(stored: string | null, presented: unknown): boolean {
  if (!stored || typeof presented !== "string" || presented.length === 0) {
    return false;
  }
  const caseInsensitive = KIOSK_CODE_RE.test(stored) || KIOSK_CUSTOM_RE.test(stored);
  const a = Buffer.from(caseInsensitive ? stored.toUpperCase() : stored);
  const b = Buffer.from(
    caseInsensitive ? presented.trim().toUpperCase() : presented,
  );
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
// "grid" is the opt-in season-grid matrix (rows × admin-chosen columns).
type BoardLayout =
  | "premiership"
  | "teamOfDecade"
  | "list"
  | "columns"
  | "grid";

type BoardTransition = "scroll" | "slide" | "wrap";

// --- Season-grid matrix (opt-in layout) ---
interface GridCellEntryOut {
  text: string;
  playerId?: number | null;
  note?: string | null;
}
interface GridCellOut {
  entries: GridCellEntryOut[];
}
interface GridRowOut {
  heading: string;
  cells: GridCellOut[];
}
interface BoardGridOut {
  rowHeading: string;
  columnHeadings: string[];
  rows: GridRowOut[];
}

interface GridColumnOptionOut {
  key: string;
  label: string;
}
interface GridCatalogEntryOut {
  id: string;
  title: string;
  options: GridColumnOptionOut[];
}

// Resolved (always-present) per-board display config sent to the client.
interface BoardDisplayOut {
  columns: number; // multi-column list flow count (1..3); 1 for non-list layouts
  transition: BoardTransition;
  fit: boolean; // drop the height cap and fill the viewport
  wrapBlocks: number; // side-by-side block count for the "wrap" fill mode (2..4)
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
  // Only set for the "grid" layout (season-grid matrix).
  grid?: BoardGridOut | null;
  // Effective per-board skin (null = club-wide) + footnote, resolved from the
  // board config / composite / custom-grid definition by assembleBoards.
  skin?: string | null;
  footnote?: string | null;
  // Stamped onto every board by assembleBoards before serialization.
  display?: BoardDisplayOut;
}

// Generic season-grid composer. Rows are seasons (newest first); columns are
// the supplied {key,label} list in order; each record drops its text (and
// optional playerId) into the (season, colKey) cell, stacking joint holders.
function composeSeasonGrid(
  rowHeading: string,
  columns: GridColumnOptionOut[],
  records: {
    seasonLabel: string;
    startYear: number;
    colKey: string;
    text: string;
    playerId?: number | null;
  }[],
): BoardGridOut {
  const seasonYear = new Map<string, number>();
  const bySeasonCol = new Map<string, Map<string, GridCellEntryOut[]>>();
  for (const r of records) {
    if (!r.text) continue;
    seasonYear.set(r.seasonLabel, r.startYear);
    let m = bySeasonCol.get(r.seasonLabel);
    if (!m) {
      m = new Map();
      bySeasonCol.set(r.seasonLabel, m);
    }
    let arr = m.get(r.colKey);
    if (!arr) {
      arr = [];
      m.set(r.colKey, arr);
    }
    arr.push({ text: r.text, playerId: r.playerId ?? null });
  }
  const seasons = [...seasonYear.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
    .map(([label]) => label);
  const rows: GridRowOut[] = seasons.map((s) => {
    const m = bySeasonCol.get(s) ?? new Map<string, GridCellEntryOut[]>();
    return {
      heading: s,
      cells: columns.map((c) => ({ entries: m.get(c.key) ?? [] })),
    };
  });
  return { rowHeading, columnHeadings: columns.map((c) => c.label), rows };
}

const DEFAULT_DISPLAY: BoardDisplayOut = {
  columns: 1,
  transition: "scroll",
  fit: false,
  wrapBlocks: 2,
};

function clampWrapBlocks(n: number | null | undefined): number {
  return Math.min(4, Math.max(2, Math.round(n ?? 2)));
}

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
  // "wrap" only applies to grid boards; other layouts fall back to a slideshow.
  let transition = override?.transition ?? DEFAULT_DISPLAY.transition;
  if (transition === "wrap" && layout !== "grid") transition = "slide";
  return {
    columns: cols,
    transition,
    fit: override?.fit ?? DEFAULT_DISPLAY.fit,
    wrapBlocks: clampWrapBlocks(override?.wrapBlocks),
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

/**
 * Committee / office bearers — published club roles with NO grade (grade null).
 * Renders as a list by default; switches to a season × office grid when the
 * admin has chosen grid columns (each column is an office/role).
 */
async function buildCommittee(
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(eq(clubRolesTable.published, true))
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder), asc(clubRolesTable.id));
  const officeBearers = rows.filter((r) => r.grade == null);
  if (officeBearers.length === 0) return null;

  if (gridColumns && gridColumns.length > 0) {
    const columns: GridColumnOptionOut[] = gridColumns.map((k) => ({
      key: k,
      label: k,
    }));
    const grid = composeSeasonGrid(
      "Season",
      columns,
      officeBearers.map((r) => ({
        seasonLabel: seasonLabel(r.season),
        startYear: r.season,
        colKey: r.role,
        text: r.name,
        playerId: r.playerId ?? null,
      })),
    );
    return {
      id: "committee",
      category: "committee",
      layout: "grid",
      title: "Committee & Office Bearers",
      subtitle: "Those who served off the field",
      entries: [],
      grid,
    };
  }

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

/**
 * NEW merged "Award Winners" grid — season × award matrix across all published
 * awards (the admin can narrow the columns). Distinct from the per-award list
 * boards, which remain. Always emitted when there are published award winners.
 */
async function buildAwardWinnersGrid(
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  const awards = await db
    .select()
    .from(awardsTable)
    .where(eq(awardsTable.published, true))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  if (awards.length === 0) return null;

  const awardIds = awards.map((a) => a.id);
  const winners = await db
    .select()
    .from(awardWinnersTable)
    .where(
      and(
        inArray(awardWinnersTable.awardId, awardIds),
        eq(awardWinnersTable.published, true),
      ),
    );
  if (winners.length === 0) return null;

  const awardById = new Map(awards.map((a) => [a.id, a]));
  // Default to every published award; narrow to the admin's chosen keys (in
  // their order) when set.
  const selectedKeys =
    gridColumns && gridColumns.length > 0
      ? gridColumns.filter((k) => awards.some((a) => a.key === k))
      : awards.map((a) => a.key);
  if (selectedKeys.length === 0) return null;
  const columns: GridColumnOptionOut[] = selectedKeys.map((k) => ({
    key: k,
    label: awards.find((a) => a.key === k)!.title,
  }));

  const grid = composeSeasonGrid(
    "Season",
    columns,
    winners.map((w) => ({
      seasonLabel: seasonLabel(w.season),
      startYear: w.season,
      colKey: awardById.get(w.awardId)?.key ?? "",
      text: w.name,
      playerId: w.playerId ?? null,
    })),
  );
  return {
    id: "award_winners",
    category: "award_winners",
    layout: "grid",
    title: "Award Winners",
    subtitle: "Season-by-season honour roll",
    entries: [],
    grid,
  };
}

/**
 * Opt-in grade-captains grid — season × grade matrix. Emitted ONLY when the
 * admin configures columns; the per-grade list boards (buildCaptains) remain.
 */
async function buildCaptainsGrid(
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  if (!gridColumns || gridColumns.length === 0) return null;
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(
      and(eq(clubRolesTable.role, "Grade Captain"), eq(clubRolesTable.published, true)),
    )
    .orderBy(desc(clubRolesTable.season), asc(clubRolesTable.displayOrder));
  if (rows.length === 0) return null;

  const columns: GridColumnOptionOut[] = gridColumns.map((k) => ({
    key: k,
    label: k,
  }));
  const grid = composeSeasonGrid(
    "Season",
    columns,
    rows
      .filter((r) => r.grade != null)
      .map((r) => ({
        seasonLabel: seasonLabel(r.season),
        startYear: r.season,
        colKey: r.grade!,
        text: r.name,
        playerId: r.playerId ?? null,
      })),
  );
  return {
    id: "captains_grid",
    category: "captains",
    layout: "grid",
    title: "Grade Captains",
    subtitle: "Season-by-season leaders by grade",
    entries: [],
    grid,
  };
}

/**
 * Opt-in premierships grid — season × grade matrix of grand-final wins. Emitted
 * ONLY when the admin configures columns; the premiership-layout board remains.
 */
async function buildPremiershipsGrid(
  gridColumns?: string[],
): Promise<HonourBoardOut | null> {
  if (!gridColumns || gridColumns.length === 0) return null;
  const prems = await db
    .select()
    .from(premiershipsTable)
    .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade));
  if (prems.length === 0) return null;

  const columns: GridColumnOptionOut[] = gridColumns.map((k) => ({
    key: k,
    label: premParentGrade(k),
  }));
  const grid = composeSeasonGrid(
    "Season",
    columns,
    prems.map((p) => {
      const startYear = premiershipSeasons(p.year, p.matchDate)[0]!;
      return {
        seasonLabel: seasonLabel(startYear),
        startYear,
        colKey: p.grade,
        text: p.result || tidyCompetition(p.competition) || "Premiers",
        playerId: null,
      };
    }),
  );
  return {
    id: "premierships_grid",
    category: "premierships",
    layout: "grid",
    title: "Premierships",
    subtitle: "Grand Final wins by grade & season",
    entries: [],
    grid,
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

/**
 * Season-grid composer for admin-built custom grids. Like composeSeasonGrid but
 * (a) carries per-cell notes and (b) can span an explicit season range so the
 * board pre-lists blank future seasons (rows always run newest → oldest).
 */
export function composeCustomGrid(
  columns: GridColumnOptionOut[],
  records: {
    seasonLabel: string;
    startYear: number;
    colKey: string;
    text: string;
    note?: string | null;
    playerId?: number | null;
  }[],
  range: { from?: number | null; to?: number | null },
): BoardGridOut {
  const bySeasonCol = new Map<string, Map<string, GridCellEntryOut[]>>();
  const yearByLabel = new Map<string, number>();
  for (const r of records) {
    if (!r.text) continue;
    yearByLabel.set(r.seasonLabel, r.startYear);
    let m = bySeasonCol.get(r.seasonLabel);
    if (!m) {
      m = new Map();
      bySeasonCol.set(r.seasonLabel, m);
    }
    let arr = m.get(r.colKey);
    if (!arr) {
      arr = [];
      m.set(r.colKey, arr);
    }
    arr.push({ text: r.text, playerId: r.playerId ?? null, note: r.note ?? null });
  }

  const dataYears = [...yearByLabel.values()];
  const from = range.from ?? (dataYears.length ? Math.min(...dataYears) : null);
  const to = range.to ?? (dataYears.length ? Math.max(...dataYears) : null);
  let startYears: number[];
  if (from != null && to != null && to >= from && to - from < 300) {
    startYears = [];
    for (let y = to; y >= from; y--) startYears.push(y);
  } else {
    startYears = [...new Set(dataYears)].sort((a, b) => b - a);
  }

  const rows: GridRowOut[] = startYears.map((y) => {
    const label = seasonLabel(y);
    const m = bySeasonCol.get(label) ?? new Map<string, GridCellEntryOut[]>();
    return { heading: label, cells: columns.map((c) => ({ entries: m.get(c.key) ?? [] })) };
  });
  return { rowHeading: "Season", columnHeadings: columns.map((c) => c.label), rows };
}

/**
 * Build admin-defined custom grid boards from settings.customGrids. Each column
 * draws from any data source (office / award / grade captains / premierships /
 * manual entry) and the board spans an optional season range (pre-listing blank
 * future seasons). Carries its own skin / fill mode / footnote.
 */
async function buildCustomGrids(
  defs: CustomGridDefJson[],
): Promise<HonourBoardOut[]> {
  const valid = (defs ?? []).filter(
    (d) =>
      typeof d?.id === "string" &&
      d.id.startsWith("grid:") &&
      Array.isArray(d.columns) &&
      d.columns.length > 0,
  );
  if (valid.length === 0) return [];

  // Preload every potential source once (custom grids share these tables).
  const [roleRows, awards, premiers] = await Promise.all([
    db
      .select({
        role: clubRolesTable.role,
        grade: clubRolesTable.grade,
        season: clubRolesTable.season,
        name: clubRolesTable.name,
        playerId: clubRolesTable.playerId,
      })
      .from(clubRolesTable)
      .where(eq(clubRolesTable.published, true)),
    db
      .select()
      .from(awardsTable)
      .where(eq(awardsTable.published, true)),
    db.select().from(premiershipsTable),
  ]);
  const awardByKey = new Map(awards.map((a) => [a.key, a]));
  const awardIds = awards.map((a) => a.id);
  const winners = awardIds.length
    ? await db
        .select()
        .from(awardWinnersTable)
        .where(
          and(
            inArray(awardWinnersTable.awardId, awardIds),
            eq(awardWinnersTable.published, true),
          ),
        )
    : [];
  const winnersByAward = new Map<number, typeof winners>();
  for (const w of winners) {
    if (!winnersByAward.has(w.awardId)) winnersByAward.set(w.awardId, []);
    winnersByAward.get(w.awardId)!.push(w);
  }

  type Rec = {
    seasonLabel: string;
    startYear: number;
    colKey: string;
    text: string;
    note?: string | null;
    playerId?: number | null;
  };

  const out: HonourBoardOut[] = [];
  for (const def of valid) {
    const columns: GridColumnOptionOut[] = def.columns.map((c) => ({
      key: c.key,
      label: c.label || c.sourceKey || c.key,
    }));
    const records: Rec[] = [];
    for (const col of def.columns) {
      const key = col.key;
      if (col.source === "office") {
        for (const r of roleRows)
          if (r.grade == null && r.role === col.sourceKey)
            records.push({
              seasonLabel: seasonLabel(r.season),
              startYear: r.season,
              colKey: key,
              text: r.name,
              playerId: r.playerId ?? null,
            });
      } else if (col.source === "grade") {
        for (const r of roleRows)
          if (r.role === "Grade Captain" && r.grade === col.sourceKey)
            records.push({
              seasonLabel: seasonLabel(r.season),
              startYear: r.season,
              colKey: key,
              text: r.name,
              playerId: r.playerId ?? null,
            });
      } else if (col.source === "award") {
        const a = col.sourceKey ? awardByKey.get(col.sourceKey) : undefined;
        if (a)
          for (const w of winnersByAward.get(a.id) ?? [])
            records.push({
              seasonLabel: seasonLabel(w.season),
              startYear: w.season,
              colKey: key,
              text: w.name,
              playerId: w.playerId ?? null,
            });
      } else if (col.source === "premiership") {
        for (const p of premiers)
          if (p.grade === col.sourceKey) {
            const sy = premiershipSeasons(p.year, p.matchDate)[0]!;
            records.push({
              seasonLabel: seasonLabel(sy),
              startYear: sy,
              colKey: key,
              text: p.result || tidyCompetition(p.competition) || "Premiers",
              note: "Premiers",
            });
          }
      } else if (col.source === "manual") {
        for (const [label, text] of Object.entries(col.manualValues ?? {})) {
          const sy = seasonStartYearFromLabel(label);
          if (sy < 0 || !text) continue;
          records.push({ seasonLabel: label, startYear: sy, colKey: key, text });
        }
      }
    }
    const grid = composeCustomGrid(columns, records, {
      from: def.seasonFrom ?? null,
      to: def.seasonTo ?? null,
    });
    out.push({
      id: def.id,
      category: "custom_grid",
      layout: "grid",
      title: def.title || "Honour Board",
      subtitle: def.subtitle ?? null,
      entries: [],
      grid,
      skin: def.skin ?? null,
      footnote: def.footnote ?? null,
    });
  }
  return out;
}

async function assembleBoards(
  settings: HonourDisplaySettingsRow,
): Promise<HonourBoardOut[]> {
  const boardConfigsAll = settings.boardConfigs ?? {};
  const gridCols = (id: string): string[] | undefined =>
    boardConfigsAll[id]?.gridColumns;
  const [
    premierships,
    premiershipsGrid,
    awards,
    awardWinnersGrid,
    centuries,
    fiveFor,
    lifeMembers,
    captains,
    captainsGrid,
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
    buildPremiershipsGrid(gridCols("premierships_grid")),
    buildAwardBoards(),
    buildAwardWinnersGrid(gridCols("award_winners")),
    buildCenturies(),
    buildFiveWicketHauls(),
    buildLifeMembers(),
    buildCaptains(),
    buildCaptainsGrid(gridCols("captains_grid")),
    buildCommittee(gridCols("committee")),
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
  if (premiershipsGrid) boards.push(premiershipsGrid);
  boards.push(...awards);
  if (awardWinnersGrid) boards.push(awardWinnersGrid);
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
  if (captainsGrid) boards.push(captainsGrid);
  if (committee) boards.push(committee);
  if (lifeMembers) boards.push(lifeMembers);

  // Composite "columns" boards reference the base boards above, so build them
  // last (after Most Games) and append.
  boards.push(...buildComposites(settings.composites ?? [], boards));

  // Admin-built custom grid boards (independent of the base boards).
  boards.push(...(await buildCustomGrids(settings.customGrids ?? [])));

  // Stamp the resolved display config + per-board skin/footnote onto every board.
  const boardConfigs = settings.boardConfigs ?? {};
  const customDefById = new Map(
    (settings.customGrids ?? []).map((d) => [d.id, d]),
  );
  for (const b of boards) {
    const cfg = boardConfigs[b.id];
    if (b.layout === "columns") {
      const def = (settings.composites ?? []).find((d) => d.id === b.id);
      b.display = {
        columns: 1,
        transition: def?.transition ?? "scroll",
        fit: def?.fit ?? true,
        wrapBlocks: 2,
      };
    } else if (customDefById.has(b.id)) {
      const def = customDefById.get(b.id)!;
      const transition = def.fillMode ?? "scroll";
      b.display = {
        columns: 1,
        transition,
        fit: true,
        wrapBlocks: clampWrapBlocks(def.wrapBlocks),
      };
    } else {
      b.display = resolveDisplay(b.layout, cfg);
    }
    // Per-board skin/footnote fall back to the board config when not already
    // set by a custom-grid definition.
    if (b.skin == null) b.skin = cfg?.skin ?? null;
    if (b.footnote == null) b.footnote = cfg?.footnote ?? null;
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

/**
 * Grid-capable boards + their selectable columns, driving the admin column
 * pickers. Covers committee (offices), award_winners (awards), captains_grid
 * and premierships_grid (grades).
 */
async function buildGridCatalog(): Promise<GridCatalogEntryOut[]> {
  const [roleRows, awards, prems] = await Promise.all([
    db
      .select({
        role: clubRolesTable.role,
        grade: clubRolesTable.grade,
        displayOrder: clubRolesTable.displayOrder,
      })
      .from(clubRolesTable)
      .where(eq(clubRolesTable.published, true)),
    db
      .select()
      .from(awardsTable)
      .where(eq(awardsTable.published, true))
      .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id)),
    db
      .select({ grade: premiershipsTable.grade })
      .from(premiershipsTable),
  ]);

  // Distinct offices (grade-null roles), ranked by the office order.
  const officeSet = new Map<string, number>();
  for (const r of roleRows) {
    if (r.grade != null) continue;
    if (!officeSet.has(r.role)) officeSet.set(r.role, r.displayOrder ?? 0);
  }
  const offices = [...officeSet.keys()].sort(
    (a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b),
  );

  // Distinct grades with published grade captains, in seniority order.
  const capGradeSet = new Set<string>();
  for (const r of roleRows) {
    if (r.role === "Grade Captain" && r.grade) capGradeSet.add(r.grade);
  }
  const capGrades = [...capGradeSet].sort(
    (a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b),
  );

  // Distinct premiership grades, in seniority order.
  const premGradeSet = new Set<string>();
  for (const p of prems) if (p.grade) premGradeSet.add(p.grade);
  const premGrades = [...premGradeSet].sort(
    (a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b),
  );

  return [
    {
      id: "committee",
      title: "Committee & Office Bearers",
      options: offices.map((o) => ({ key: o, label: o })),
    },
    {
      id: "award_winners",
      title: "Award Winners",
      options: awards.map((a) => ({ key: a.key, label: a.title })),
    },
    {
      id: "captains_grid",
      title: "Grade Captains (grid)",
      options: capGrades.map((g) => ({ key: g, label: g })),
    },
    {
      id: "premierships_grid",
      title: "Premierships (grid)",
      options: premGrades.map((g) => ({ key: g, label: premParentGrade(g) })),
    },
  ];
}

async function buildBrand() {
  // req-less builder → default tenant brand.
  const b = await getTenantBrand(DEFAULT_TENANT_ID);
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

router.get("/honour-display", requireAdmin, async (req, res): Promise<void> => {
  const settingsRow = await ensureHonourDisplaySettings();
  const [boards, brand, gridCatalog, activeSponsors] = await Promise.all([
    assembleBoards(settingsRow),
    buildBrand(),
    buildGridCatalog(),
    loadActiveSponsors(req.log),
  ]);
  res.json({
    boards,
    brand,
    settings: serializeSettings(settingsRow, { includeToken: true }),
    activeSponsors,
    gridCatalog,
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
  const [boards, brand, activeSponsors] = await Promise.all([
    assembleBoards(settingsRow),
    buildBrand(),
    loadActiveSponsors(req.log),
  ]);
  res.json({ boards, brand, settings: serializeSettings(settingsRow), activeSponsors });
});

// Generate (or rotate) the kiosk token. Replaces any existing one, so the
// previous link immediately stops working.
router.post(
  "/honour-display/kiosk-token",
  requireAdmin,
  async (req, res): Promise<void> => {
    await ensureHonourDisplaySettings();
    // A non-empty `token` in the body sets a custom code; otherwise generate a
    // random one. An invalid custom code is rejected rather than silently
    // falling back, so the admin knows their chosen code wasn't accepted.
    const raw = (req.body ?? {}).token;
    let token: string;
    if (typeof raw === "string" && raw.trim() !== "") {
      const custom = normalizeCustomKioskToken(raw);
      if (!custom) {
        res.status(400).json({
          error:
            "Custom kiosk code must be 3–40 characters: letters, numbers and hyphens only.",
        });
        return;
      }
      token = custom;
    } else {
      token = generateKioskToken();
    }
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
