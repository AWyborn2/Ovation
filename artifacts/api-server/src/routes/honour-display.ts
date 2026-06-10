import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  clubRolesTable,
} from "@workspace/db";
import { UpdateHonourDisplaySettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getHallsHeadBrand } from "../lib/halls-head-brand";
import { linkPremiershipMatch, premiershipSeasons } from "./premierships";

const router: IRouter = Router();

const DISPLAY_SETTINGS_ID = 1;

// The award that represents the club's overall champion (best & fairest). Its
// winners render as the dedicated "Club Champions" board, so it is excluded from
// the generic per-award boards to avoid duplication.
const CLUB_CHAMPION_AWARD_KEY = "peter-wyllie-medal";

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
) {
  return {
    defaultTemplate: row.defaultTemplate,
    boardOverrides: row.boardOverrides ?? {},
    showTabs: row.showTabs,
    allowViewerTemplateSwitch: row.allowViewerTemplateSwitch,
    kioskSequence: row.kioskSequence ?? [],
    kioskDwellMs: row.kioskDwellMs,
    kioskScrollSpeed: row.kioskScrollSpeed,
    kioskEndHoldMs: row.kioskEndHoldMs,
  };
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

interface HonourBoardOut {
  id: string;
  category:
    | "premierships"
    | "centuries"
    | "five_wicket_hauls"
    | "life_members"
    | "club_champions"
    | "captains"
    | "club_records"
    | "awards";
  title: string;
  subtitle?: string | null;
  entries: BoardEntry[];
}

/** Map a flat premiership grade to the P7 grade-filter parent key. */
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

/** Display grade label fed to the P7 `badge()` helper (mirrors the demo). */
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
      primaryText: captainName ? `${captainName} (c)` : tidyCompetition(p.competition),
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

async function buildCaptains(): Promise<HonourBoardOut | null> {
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(
      and(
        eq(clubRolesTable.role, "Grade Captain"),
        eq(clubRolesTable.grade, "A Grade"),
        eq(clubRolesTable.published, true),
      ),
    )
    .orderBy(desc(clubRolesTable.season));
  if (rows.length === 0) return null;
  return {
    id: "captains",
    category: "captains",
    title: "A Grade Captains",
    subtitle: "First XI leaders",
    entries: rows.map((r) => ({
      season: seasonLabel(r.season),
      primaryText: r.name,
      detail: null,
      playerId: r.playerId ?? null,
    })),
  };
}

async function buildAwardBoards(): Promise<{
  clubChampions: HonourBoardOut | null;
  awards: HonourBoardOut[];
}> {
  const awards = await db
    .select()
    .from(awardsTable)
    .where(eq(awardsTable.published, true))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));
  if (awards.length === 0) return { clubChampions: null, awards: [] };

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

  const toEntries = (awardId: number): BoardEntry[] =>
    (byAward.get(awardId) ?? []).map((w) => ({
      season: seasonLabel(w.season),
      primaryText: w.name,
      detail: null,
      playerId: w.playerId ?? null,
    }));

  let clubChampions: HonourBoardOut | null = null;
  const awardBoards: HonourBoardOut[] = [];
  for (const a of awards) {
    const entries = toEntries(a.id);
    if (entries.length === 0) continue;
    if (a.key === CLUB_CHAMPION_AWARD_KEY) {
      clubChampions = {
        id: "club_champions",
        category: "club_champions",
        title: "Club Champions",
        subtitle: a.title,
        entries,
      };
      continue;
    }
    awardBoards.push({
      id: `award:${a.key}`,
      category: "awards",
      title: a.title,
      subtitle: a.description || null,
      entries,
    });
  }
  return { clubChampions, awards: awardBoards };
}

async function assembleBoards(): Promise<HonourBoardOut[]> {
  const [
    premierships,
    centuries,
    fiveFor,
    lifeMembers,
    captains,
    clubRecords,
    awardResult,
  ] = await Promise.all([
    buildPremierships(),
    buildCenturies(),
    buildFiveWicketHauls(),
    buildLifeMembers(),
    buildCaptains(),
    buildClubRecords(),
    buildAwardBoards(),
  ]);

  const boards: HonourBoardOut[] = [];
  if (premierships) boards.push(premierships);
  if (awardResult.clubChampions) boards.push(awardResult.clubChampions);
  if (centuries) boards.push(centuries);
  if (fiveFor) boards.push(fiveFor);
  if (lifeMembers) boards.push(lifeMembers);
  if (captains) boards.push(captains);
  if (clubRecords) boards.push(clubRecords);
  boards.push(...awardResult.awards);
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
// Routes
// ---------------------------------------------------------------------------

router.get("/honour-display", async (_req, res): Promise<void> => {
  const [boards, brand, settingsRow] = await Promise.all([
    assembleBoards(),
    buildBrand(),
    ensureHonourDisplaySettings(),
  ]);
  res.json({ boards, brand, settings: serializeSettings(settingsRow) });
});

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
