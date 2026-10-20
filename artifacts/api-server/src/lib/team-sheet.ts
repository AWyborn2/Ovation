import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  availabilitySettingsTable,
  juniorShirtNumbersTable,
  selectionsTable,
  shirtNumbersTable,
  squadMembersTable,
  type FixtureRow,
  type SelectionRow,
  type SquadMemberRow,
  type SquadSection,
} from "@workspace/db";
import {
  normaliseParticipantId,
  shirtNumberCategoryForGrade,
  shirtNumberNameKey,
} from "@workspace/db/shirt-numbers";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { memberDisplayName } from "./availability-grades";
import { loadSideFixture, sideSection, type SideFixture } from "./selection-fixtures";
import { loadSelectionParticipantIds } from "./selection-published-players";
import { DEFAULT_SIDE_SIZE, normaliseSlots, sideShape } from "@workspace/scorecard/selection-shape";
import { buildTeamListShirtNumbers, shirtNumberOf } from "./engines/team-list";
import { loadJuniorIdentity } from "./junior-shirt-numbers";
import { juniorMemberResolver } from "./shirt-number-squad";
import { getTenantBrand } from "./tenant-brand";
import {
  bowlingRulesFor,
  juniorBowlingLimit,
  oversFromFormat,
  type JuniorBowlingLimit,
} from "./team-sheet-rules";

/**
 * The printable A4 team sheet for a finalised Selection Hub side: match
 * details, the 12 in batting-list order with shirt numbers and (C)/(WK) tags,
 * and — on a senior sheet only — each Junior Aged Player's bowling limits under
 * the competition's own rules. Built from the side itself, not the fixture's
 * team list (a PlayHQ-supplied list is never replaced by a finalise). Names
 * print in full, private members included: the sheet goes to the umpire and
 * the opposition captain, and only admins and captains can make it.
 */

export class TeamSheetError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type TeamSheetRole = "C" | "WK" | "C/WK";

export type TeamSheetPlayer = {
  /** 1–N in slot order; in a side of 12, 12 is the 12th player. */
  order: number;
  name: string;
  role: TeamSheetRole | null;
  shirtNumber: string | null;
  /** Senior sheet only: the player's limits when they are a Junior Aged Player. */
  junior: JuniorBowlingLimit | null;
  /** An overseas player, from the side's finalise snapshot (ADR-009): "OS" after the name. */
  overseas?: boolean;
};

export type TeamSheet = {
  section: SquadSection;
  clubName: string;
  logoUrl: string | null;
  homeTeam: string;
  awayTeam: string;
  /** App grade (senior) or the junior side's grade text (its age group). */
  grade: string;
  round: string | null;
  /** Perth date and time, e.g. "Saturday 17 October 2026", "12:00 pm". */
  date: string;
  startTime: string;
  format: string | null;
  overs: string | null;
  venue: string | null;
  competition: string | null;
  /** Where the junior bowling limits come from; null when the rules aren't known. */
  bowlingRulesSource: string | null;
  /** The competition's other team-sheet lines (senior, known rules only). */
  ruleNotes: string[];
  /** Rows the sheet prints: the side's size (12–14; absent reads as 12). */
  sideSize?: number;
  /** A side of 12 where all 12 play: rows numbered 1–12, no "12th" row. */
  allPlay?: boolean;
  players: TeamSheetPlayer[];
  generatedAt: string;
};

/** What the print dialog needs before the PDF is made. */
export type TeamSheetPreview = {
  selectionId: number;
  section: SquadSection;
  grade: string;
  format: string | null;
  competition: string | null;
  /** The overs to offer: the grade's remembered value, else one read from the format. */
  overs: string | null;
  bowlingRulesSource: string | null;
  /** Senior sheet: how many listed players have no birth date (limits can't be shown). */
  missingBirthDates: number;
};

const PERTH = "Australia/Perth";

export function formatSheetDate(at: Date): { date: string; startTime: string } {
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
  const startTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: PERTH,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(at)
    .replace(/\s+/g, " ")
    .toLowerCase();
  return { date, startTime };
}

type SheetMember = Pick<
  SquadMemberRow,
  | "id"
  | "firstName"
  | "lastName"
  | "preferredName"
  | "dateOfBirth"
  | "linkedPlayerId"
  | "playhqProfileId"
>;

/**
 * The sheet's rows, pure: the side's members in slot order (in a side of 12
 * the 12th last, never holding a role; above 12 numbered 1–N, any of them
 * captain or keeper), and limits only when `rules` apply to a senior sheet.
 * The overseas mark is the one finalise stored on the slot, never a live flag.
 */
export function teamSheetPlayers(input: {
  side: Pick<SelectionRow, "slots" | "captainMemberId" | "keeperMemberId"> &
    Partial<Pick<SelectionRow, "sideSize" | "allPlay">>;
  members: readonly SheetMember[];
  shirtNumberOf: (m: SheetMember) => string | null;
  juniorLimitOf: ((m: SheetMember) => JuniorBowlingLimit | null) | null;
}): TeamSheetPlayer[] {
  const byId = new Map(input.members.map((m) => [m.id, m]));
  const players: TeamSheetPlayer[] = [];
  let order = 0;
  const shape = sideShape(input.side);
  normaliseSlots(input.side.slots, shape.size).forEach((slot, index) => {
    const m = slot.memberId == null ? undefined : byId.get(slot.memberId);
    if (!m) return;
    const twelfth = index === shape.twelfthIndex;
    const c = !twelfth && input.side.captainMemberId === m.id;
    const wk = !twelfth && input.side.keeperMemberId === m.id;
    players.push({
      order: twelfth ? shape.size : ++order,
      name: memberDisplayName(m),
      role: c && wk ? "C/WK" : c ? "C" : wk ? "WK" : null,
      shirtNumber: input.shirtNumberOf(m),
      junior: input.juniorLimitOf ? input.juniorLimitOf(m) : null,
      overseas: slot.overseas === true,
    });
  });
  return players;
}

/** "50" from "50", "50 overs" or " 50 "; null when blank. Up to 3 digits, or free text up to 20 chars. */
export function normaliseOvers(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replace(/\s+/g, " ");
  if (!text) return null;
  const plain = /^(\d{1,3})(?:\s*overs?)?$/i.exec(text);
  if (plain) return String(Number(plain[1]));
  return text.slice(0, 20);
}

/** The fixture fields a sheet prints, from a senior fixture or a junior one. */
type SheetFixture = Pick<
  FixtureRow,
  | "grade"
  | "roundLabel"
  | "opponentName"
  | "venue"
  | "startAt"
  | "isHome"
  | "matchFormat"
  | "competitionName"
  | "associationOrgId"
  | "homeTeamName"
  | "awayTeamName"
>;

/** A junior fixture as a sheet prints it: its age group, its team v the opposition. */
function juniorSheetFixture(f: SideFixture): SheetFixture {
  const team = f.junior?.teamName ?? null;
  return {
    grade: f.ageGroup ?? f.grade,
    roundLabel: null,
    opponentName: f.opponentName,
    venue: f.venue,
    startAt: f.startAt,
    isHome: f.isHome,
    matchFormat: null,
    competitionName: f.competition,
    associationOrgId: null,
    homeTeamName: f.isHome ? team : f.opponentName,
    awayTeamName: f.isHome ? f.opponentName : team,
  };
}

type Loaded = {
  selection: SelectionRow;
  fixture: SheetFixture;
  section: SquadSection;
  members: SheetMember[];
  remembered: Record<string, string>;
};

async function loadSide(tenantId: number, selectionId: number): Promise<Loaded> {
  const [selection] = await db
    .select()
    .from(selectionsTable)
    .where(and(eq(selectionsTable.id, selectionId), eq(selectionsTable.tenantId, tenantId)));
  const side = selection ? await loadSideFixture(db, tenantId, selection) : null;
  if (!selection || !side) throw new TeamSheetError(404, "Side not found.");
  const row = {
    selection,
    fixture: side.senior ?? juniorSheetFixture(side),
    section: sideSection(side),
  };
  if (row.selection.state !== "final") {
    throw new TeamSheetError(409, "Finalise the side to print its team sheet.");
  }
  const ids = normaliseSlots(row.selection.slots, row.selection.sideSize).flatMap((s) =>
    s.memberId == null ? [] : [s.memberId],
  );
  const members =
    ids.length > 0
      ? await db
          .select({
            id: squadMembersTable.id,
            firstName: squadMembersTable.firstName,
            lastName: squadMembersTable.lastName,
            preferredName: squadMembersTable.preferredName,
            dateOfBirth: squadMembersTable.dateOfBirth,
            linkedPlayerId: squadMembersTable.linkedPlayerId,
            playhqProfileId: squadMembersTable.playhqProfileId,
          })
          .from(squadMembersTable)
          .where(and(eq(squadMembersTable.tenantId, tenantId), inArray(squadMembersTable.id, ids)))
      : [];
  const [settings] = await db
    .select({ overs: availabilitySettingsTable.teamSheetOvers })
    .from(availabilitySettingsTable)
    .where(eq(availabilitySettingsTable.tenantId, tenantId));
  return {
    selection: row.selection,
    fixture: row.fixture,
    section: row.section,
    members,
    remembered: settings?.overs ?? {},
  };
}

function rulesOf(loaded: Loaded) {
  return loaded.section === "senior" ? bowlingRulesFor(loaded.fixture.associationOrgId) : null;
}

export async function loadTeamSheetPreview(
  tenantId: number,
  selectionId: number,
): Promise<TeamSheetPreview> {
  const loaded = await loadSide(tenantId, selectionId);
  const { fixture, section } = loaded;
  const rules = rulesOf(loaded);
  return {
    selectionId,
    section,
    grade: fixture.grade,
    format: fixture.matchFormat,
    competition: fixture.competitionName,
    overs: loaded.remembered[fixture.grade] ?? oversFromFormat(fixture.matchFormat),
    bowlingRulesSource: rules?.source ?? null,
    missingBirthDates:
      section === "senior" ? loaded.members.filter((m) => !m.dateOfBirth).length : 0,
  };
}

/** A member's name keys for matching register names ("Tom Brooks" and preferred). */
function memberNameKeys(m: Pick<SheetMember, "firstName" | "lastName" | "preferredName">) {
  const keys = new Set([shirtNumberNameKey(`${m.firstName} ${m.lastName}`)]);
  if (m.preferredName) keys.add(shirtNumberNameKey(`${m.preferredName} ${m.lastName}`));
  return [...keys].filter(Boolean);
}

/** Numbers by name key, keeping only names that appear once on the register. */
function uniqueNameNumbers(rows: readonly { name: string; number: string | null }[]) {
  const seen = new Map<string, string | null>();
  for (const r of rows) {
    const key = shirtNumberNameKey(r.name);
    if (!key || !r.number) continue;
    seen.set(key, seen.has(key) ? null : r.number);
  }
  return seen;
}

/**
 * Each player's shirt number for the fixture's season. The printed sheet goes
 * to the umpire for the players actually picked, so it prints the register's
 * number even where the cards would wait: whatever the club's shirt-number
 * setting, and for a number not yet confirmed (a held junior number, a senior
 * entry not linked to a player).
 * - Senior: the season register for the fixture grade's category (men / female) by
 *   the member's linked player, else their register participant, else a name that
 *   appears once on the register.
 * - Junior: the juniors register by the member's PlayHQ participant
 *   (`juniorMemberResolver`, merged-away ids counting for the keeper), else
 *   their squad profile id as uploaded, else a name that appears once. A
 *   confirmed number wins over a held one for the same player.
 */
async function shirtNumbersFor(
  tenantId: number,
  loaded: Loaded,
): Promise<(m: SheetMember) => string | null> {
  const season = seasonStartYearFor(loaded.fixture.startAt);
  // A name only counts when one player on the sheet has it, so two near-identical
  // names can never borrow each other's number.
  const keyUse = new Map<string, number>();
  for (const m of loaded.members)
    for (const k of memberNameKeys(m)) keyUse.set(k, (keyUse.get(k) ?? 0) + 1);
  const ownKeys = (m: SheetMember) => memberNameKeys(m).filter((k) => keyUse.get(k) === 1);
  if (loaded.section === "senior") {
    const [rows, participants] = await Promise.all([
      db
        .select({
          playerId: shirtNumbersTable.playerId,
          participantId: shirtNumbersTable.participantId,
          name: shirtNumbersTable.name,
          number: shirtNumbersTable.number,
        })
        .from(shirtNumbersTable)
        .where(
          and(
            eq(shirtNumbersTable.tenantId, tenantId),
            eq(shirtNumbersTable.season, season),
            eq(shirtNumbersTable.category, shirtNumberCategoryForGrade(loaded.fixture.grade)),
            isNotNull(shirtNumbersTable.number),
          ),
        ),
      loadSelectionParticipantIds(db, tenantId, loaded.fixture.startAt),
    ]);
    const numbers = buildTeamListShirtNumbers(rows);
    const byName = uniqueNameNumbers(rows);
    return (m) => {
      const linked =
        m.linkedPlayerId != null && m.linkedPlayerId < FILL_IN_THRESHOLD
          ? m.linkedPlayerId
          : undefined;
      const byId = shirtNumberOf(
        { order: 0, displayName: "", playerId: linked, participantId: participants.get(m.id) },
        numbers,
      );
      if (byId) return byId;
      for (const key of ownKeys(m)) {
        const n = byName.get(key);
        if (n) return n;
      }
      return null;
    };
  }

  const { participants, merges } = await loadJuniorIdentity(db, tenantId);
  const resolve = juniorMemberResolver(participants, merges);
  const rows = await db
    .select({
      participantId: juniorShirtNumbersTable.participantId,
      name: juniorShirtNumbersTable.name,
      number: juniorShirtNumbersTable.number,
      held: juniorShirtNumbersTable.held,
    })
    .from(juniorShirtNumbersTable)
    .where(
      and(
        eq(juniorShirtNumbersTable.tenantId, tenantId),
        eq(juniorShirtNumbersTable.season, season),
        isNotNull(juniorShirtNumbersTable.number),
      ),
    );
  // Confirmed rows first, so one wins over a held row for the same player.
  rows.sort((a, b) => Number(a.held) - Number(b.held));
  // A number kept on a merged-away duplicate counts for the keeper.
  const keeperOf = new Map<string, string>();
  for (const mg of merges) {
    const dup = normaliseParticipantId(mg.duplicateParticipantId);
    const keeper = normaliseParticipantId(mg.keeperParticipantId);
    if (dup && keeper) keeperOf.set(dup, keeper);
  }
  const byParticipant = new Map<string, string>();
  for (const r of rows) {
    const raw = normaliseParticipantId(r.participantId);
    if (!raw || !r.number) continue;
    for (const id of [raw, keeperOf.get(raw)]) {
      if (id && !byParticipant.has(id)) byParticipant.set(id, r.number);
    }
  }
  const byName = uniqueNameNumbers(rows);
  return (m) => {
    for (const id of [resolve(m), normaliseParticipantId(m.playhqProfileId)]) {
      const n = id ? byParticipant.get(id) : undefined;
      if (n) return n;
    }
    for (const key of ownKeys(m)) {
      const n = byName.get(key);
      if (n) return n;
    }
    return null;
  };
}

/**
 * The sheet for a finalised side. `overs` (when given) is printed and
 * remembered for the side's grade; otherwise the remembered or format value is used.
 */
export async function buildTeamSheet(
  tenantId: number,
  selectionId: number,
  opts: { overs?: string | null; now?: Date } = {},
): Promise<TeamSheet> {
  const loaded = await loadSide(tenantId, selectionId);
  const { fixture, section, selection } = loaded;
  const rules = rulesOf(loaded);
  const season = seasonStartYearFor(fixture.startAt);

  const overs =
    opts.overs ?? loaded.remembered[fixture.grade] ?? oversFromFormat(fixture.matchFormat);
  if (opts.overs && loaded.remembered[fixture.grade] !== opts.overs) {
    // Upsert the one key; a club with no settings row gets one with the defaults.
    await db
      .insert(availabilitySettingsTable)
      .values({ tenantId, teamSheetOvers: { [fixture.grade]: opts.overs } })
      .onConflictDoUpdate({
        target: availabilitySettingsTable.tenantId,
        set: {
          teamSheetOvers: sql`${availabilitySettingsTable.teamSheetOvers} || ${JSON.stringify({ [fixture.grade]: opts.overs })}::jsonb`,
        },
      });
  }

  const [brand, shirtOf] = await Promise.all([
    getTenantBrand(tenantId),
    shirtNumbersFor(tenantId, loaded),
  ]);
  const clubName = brand.name;
  const ourTeam = fixture.isHome ? fixture.homeTeamName : fixture.awayTeamName;
  const theirTeam = fixture.isHome ? fixture.awayTeamName : fixture.homeTeamName;
  const us = ourTeam ?? `${clubName} ${fixture.grade}`;
  const them = theirTeam ?? fixture.opponentName;
  const { date, startTime } = formatSheetDate(fixture.startAt);

  return {
    section,
    clubName,
    logoUrl: brand.logoUrl ?? null,
    homeTeam: fixture.isHome ? us : them,
    awayTeam: fixture.isHome ? them : us,
    grade: fixture.grade,
    round: fixture.roundLabel,
    date,
    startTime,
    format: fixture.matchFormat,
    overs,
    venue: fixture.venue,
    competition: fixture.competitionName,
    bowlingRulesSource: rules?.source ?? null,
    ruleNotes: [...(rules?.sheetNotes ?? [])],
    sideSize: sideShape(selection).size,
    ...(selection.allPlay ? { allPlay: true } : {}),
    players: teamSheetPlayers({
      side: selection,
      members: loaded.members,
      shirtNumberOf: shirtOf,
      juniorLimitOf: rules ? (m) => juniorBowlingLimit(rules, m.dateOfBirth, season) : null,
    }),
    generatedAt: formatSheetDate(opts.now ?? new Date()).date,
  };
}

// --- HTML (printed to PDF by the shared Chromium) ---

const esc = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Only http(s) and same-origin paths reach the page; anything else is dropped. */
export function absoluteLogoUrl(url: string | null, origin: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//") && origin) return `${origin}${url}`;
  return null;
}

/** The sheet as a self-contained A4 HTML page (no script, one optional logo image). */
export function renderTeamSheetHtml(sheet: TeamSheet, logoSrc: string | null): string {
  const senior = sheet.section === "senior";
  // One row per place in the side: 12 with a shaded "12th" row, or up to 14
  // numbered 1–N. Rows shrink above 12 so the table keeps its height and the
  // sheet stays on one A4 page.
  const shape = sideShape(sheet);
  const rowHeight =
    shape.size > DEFAULT_SIDE_SIZE ? ((9.2 * DEFAULT_SIDE_SIZE) / shape.size).toFixed(1) : "9.2";
  const rows = Array.from({ length: shape.size }, (_, i) => {
    const order = i + 1;
    const p = sheet.players.find((x) => x.order === order);
    const twelfth = shape.twelfthLabel && order === shape.size;
    const label = twelfth ? "12th" : String(order);
    const role = p?.role ? ` <b class="role">(${esc(p.role)})</b>` : "";
    const overseas = p?.overseas ? ` <b class="os" title="Overseas player">OS</b>` : "";
    const jap = senior
      ? `<td class="c small">${p?.junior ? `${esc(p.junior.band)}<br><span class="age">age ${esc(p.junior.age)}</span>` : ""}</td>
         <td class="c small">${p?.junior ? esc(p.junior.maxOversPerDay) : ""}</td>
         <td class="c small">${p?.junior ? esc(p.junior.maxSpell) : ""}</td>
         <td></td>`
      : "";
    return `<tr class="${twelfth ? "twelfth" : ""}">
      <td class="c no">${label}</td>
      <td class="c shirt">${esc(p?.shirtNumber)}</td>
      <td class="name">${esc(p?.name)}${role}${overseas}</td>${jap}
    </tr>`;
  }).join("");

  const pair = (label: string, value: string | null) =>
    `<th>${esc(label)}</th><td>${esc(value) || "&nbsp;"}</td>`;
  const rulesNote = senior
    ? `<p class="note">Junior Aged Players: their age group and limits are worked out from their date of birth${
        sheet.bowlingRulesSource ? ` under ${esc(sheet.bowlingRulesSource)}` : ""
      }. Write in the overs each has already bowled in a junior match today.${
        sheet.bowlingRulesSource ? "" : " Check your competition's rules for the limits."
      }</p>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Team sheet</title>
<style>
  @page { size: A4; margin: 12mm 15mm 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1F2933; font-size: 10pt; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .head td { vertical-align: middle; border: 0; }
  .logo { width: 34mm; height: 23mm; text-align: center; }
  .logo img { max-width: 34mm; max-height: 23mm; object-fit: contain; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 24pt; color: #1F3A5F; letter-spacing: .5px; }
  .title .club { font-size: 13pt; font-weight: bold; margin-top: 2mm; }
  .teams { margin-top: 4mm; }
  .teams td { background: #EEF1F3; border: 1px solid #9AA5AD; padding: 2mm 3mm; }
  .teams td.v { background: none; border: 0; text-align: center; font-size: 14pt; font-weight: bold; color: #1F3A5F; width: 12mm; }
  .teams .lbl { font-size: 7pt; font-weight: bold; color: #5B6770; }
  .teams .team { font-size: 13pt; font-weight: bold; margin-top: 1mm; }
  .details { margin-top: 4mm; }
  .details th, .details td { border: 1px solid #9AA5AD; padding: 1.2mm 2mm; text-align: left; }
  .details th { background: #EEF1F3; font-size: 8pt; color: #5B6770; width: 17%; }
  .details td { width: 33%; }
  .players { margin-top: 4mm; }
  .players th { background: #1F3A5F; color: #fff; font-size: 8pt; padding: 1.5mm 1mm; border: 1px solid #9AA5AD; }
  .players th.group { font-size: 7.5pt; }
  .players td { border: 1px solid #9AA5AD; height: ${rowHeight}mm; padding: 0 2mm; font-size: 11pt; }
  .players td.c { text-align: center; padding: 0 1mm; }
  .players td.no { font-weight: bold; color: #5B6770; }
  .players td.small { font-size: 9pt; color: #1F2933; }
  .players .age { font-size: 7pt; color: #5B6770; }
  .players tr.twelfth td { background: #EEF1F3; }
  .role { color: #1F3A5F; }
  .os { font-size: 8pt; letter-spacing: 0.5px; border: 1px solid #1F3A5F; border-radius: 2px; padding: 0 1mm; color: #1F3A5F; }
  .key { margin: 2mm 0 0; font-size: 8pt; color: #5B6770; }
  .note { margin: 1mm 0 0; font-size: 8pt; color: #5B6770; }
  .notes { margin-top: 3mm; font-size: 8pt; color: #5B6770; font-style: italic; }
  .sign { margin-top: 9mm; }
  .sign td { border: 0; padding: 0 4mm 0 0; }
  .sign div { border-top: 1px solid #1F2933; padding-top: 1mm; font-size: 8pt; color: #5B6770; }
  .foot { margin-top: 3mm; text-align: right; font-size: 7pt; color: #5B6770; }
</style></head><body>
<table class="head"><tr>
  <td class="logo">${logoSrc ? `<img src="${esc(logoSrc)}" alt="">` : ""}</td>
  <td class="title"><h1>TEAM SHEET</h1><div class="club">${esc(sheet.clubName)}</div></td>
</tr></table>
<table class="teams"><tr>
  <td><div class="lbl">HOME</div><div class="team">${esc(sheet.homeTeam)}</div></td>
  <td class="v">v</td>
  <td><div class="lbl">AWAY</div><div class="team">${esc(sheet.awayTeam)}</div></td>
</tr></table>
<table class="details">
  <tr>${pair(senior ? "Grade" : "Age group", sheet.grade)}${pair("Round", sheet.round)}</tr>
  <tr>${pair("Date", sheet.date)}${pair("Start time", sheet.startTime)}</tr>
  <tr>${pair("Format", sheet.format)}${pair("Overs", sheet.overs)}</tr>
  <tr>${pair("Venue", sheet.venue)}${pair("Competition", sheet.competition)}</tr>
</table>
<table class="players">
  <colgroup><col style="width:7%"><col style="width:11%"><col>${
    senior
      ? `<col style="width:11%"><col style="width:9%"><col style="width:9%"><col style="width:12%">`
      : ""
  }</colgroup>
  <thead>${
    senior
      ? `<tr><th colspan="3" style="background:#1F3A5F"></th><th class="group" colspan="4">Junior Aged Players only – bowling restrictions</th></tr>`
      : ""
  }<tr><th>#</th><th>Shirt No.</th><th style="text-align:left">Player</th>${
    senior
      ? `<th>Age group</th><th>Max overs / day</th><th>Max spell</th><th>Overs bowled in juniors today</th>`
      : ""
  }</tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="key">(C) captain &nbsp; (WK) wicketkeeper${sheet.players.some((p) => p.overseas) ? " &nbsp; OS overseas player" : ""}${sheet.ruleNotes.map((n) => ` &nbsp; ${esc(n)}`).join("")}</p>
${rulesNote}
<div class="notes">Notes:</div>
<table class="sign"><tr><td><div>Captain's signature</div></td><td><div>Opposition captain / umpire</div></td></tr></table>
<div class="foot">Generated by Ovation · ${esc(sheet.generatedAt)}</div>
</body></html>`;
}
