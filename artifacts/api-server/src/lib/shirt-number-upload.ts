import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { and, asc, eq, lt } from "drizzle-orm";
import {
  db,
  playersTable,
  shirtNumbersTable,
  shirtNumberUploadsTable,
  type ShirtNumberRow,
  type ShirtNumberUploadKind,
  type ShirtNumberUploadRow,
} from "@workspace/db";
import {
  isValidShirtNumber,
  normaliseParticipantId,
  type ShirtNumberSettings,
  type ShirtNumberSide,
} from "@workspace/db/shirt-numbers";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { buildNameMatcher, nameKey, norm } from "./name-match";
import { loadClubIdentity } from "./club-overlay";
import { curatedIdsAreNative, playersOutsideTenantSpace } from "./curated-player-space";
import {
  applyCarriedNumber,
  blockedCarryWarning,
  cleanName,
  duplicateWarning,
  duplicatesOf,
  loadSeasonEntries,
  seasonLabel,
  type RegisterEntryLike,
  type ShirtNumberConflict,
  type ShirtNumberWarning,
} from "./shirt-numbers";

/**
 * Season shirt numbers — spreadsheet and PlayHQ registration-export uploads
 * (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, U4; R4, R5,
 * R7, R8, R11; KTD8).
 *
 * Three layers:
 *
 *   1. Parsing (pure): a `.csv` or `.xlsx` becomes rows of name / participant
 *      id / number, with headers matched case- and space-insensitively against
 *      alias lists. A `registration` upload ignores any number column.
 *   2. Matching (pure): each row is classified `matched` | `suggested` | `new`
 *      | `invalid` against an injected {@link UploadRoster} and the season's
 *      register. Side-agnostic: a senior roster's people carry a `playerId`, a
 *      junior roster's (built by the juniors register, U10) carry only a
 *      `participantId`. Suggestions are never applied automatically — central
 *      display names are "Initial Surname" and collide.
 *   3. Storage and commit (DB): previews live in the tenant-scoped
 *      `shirt_number_uploads` table, every lookup filtered on the tenant and
 *      side; the senior commit applies per-row resolutions and the club's
 *      duplicate policy in one transaction, and clears the payload.
 *
 * Only the tenant database is ever written; central is read (player names) for
 * central-read clubs' rosters.
 */

// ── Limits ──────────────────────────────────────────────────────────────────

/** Parsed data rows allowed in one upload (KTD8). */
export const SHIRT_NUMBER_UPLOAD_MAX_ROWS = 1000;

/** How far down the sheet the header row may sit (below title rows). */
const HEADER_SCAN_ROWS = 20;

/** A file that cannot be read at all, or is over the row cap; surfaced as 400. */
export class UploadParseError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "UploadParseError";
  }
}

export type UploadFileType = "csv" | "xlsx";

/** The upload's type from its file name; null for anything else. */
export function uploadFileType(fileName: string): UploadFileType | null {
  const m = /\.(csv|xlsx)$/i.exec(fileName.trim());
  return m ? (m[1]!.toLowerCase() as UploadFileType) : null;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

type Field = "name" | "firstName" | "lastName" | "participantId" | "number";

/** Header aliases, in normalised form (lower case, letters and digits only). */
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  name: [
    "name",
    "fullname",
    "playername",
    "player",
    "displayname",
    "participantname",
    "participant",
    "membername",
  ],
  firstName: ["firstname", "givenname", "givennames", "first", "forename", "preferredname"],
  lastName: ["lastname", "surname", "familyname", "last"],
  participantId: [
    "participantid",
    "participantguid",
    "playhqid",
    "playhqparticipantid",
    "playhqprofileid",
    "profileid",
    "guid",
  ],
  number: [
    "number",
    "no",
    "num",
    "shirtnumber",
    "shirtno",
    "shirtnum",
    "shirt",
    "jerseynumber",
    "jerseyno",
    "jersey",
    "playingnumber",
    "guernsey",
    "guernseynumber",
    "uniformnumber",
  ],
};

const FIELD_BY_ALIAS: ReadonlyMap<string, Field> = new Map(
  (Object.entries(HEADER_ALIASES) as [Field, readonly string[]][]).flatMap(([field, aliases]) =>
    aliases.map((a) => [a, field] as const),
  ),
);

/** Normalise a header for alias lookup: "Shirt No." → "shirtno", "#" → "number". */
function normaliseHeader(header: string): string {
  const h = header.trim();
  if (h === "#") return "number";
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A PlayHQ participant id as found in a file: a GUID-ish token. */
const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** One parsed data row, before matching. */
export type ParsedUploadRow = {
  /** 1-based data row below the header (blank rows keep their place). */
  rowIndex: number;
  /** Display name, "Given Surname", trimmed and length-capped. */
  name: string;
  givenName: string;
  surname: string;
  /** Lowercased PlayHQ participant id, when the file has one. */
  participantId: string | null;
  /** A valid 1-3 digit number, or null (unnumbered, ignored or invalid). */
  number: string | null;
  /** Why the row cannot be applied; empty for a good row. */
  errors: string[];
};

export type ParsedUpload = {
  rows: ParsedUploadRow[];
  /** Header cells that matched no alias (reported, not fatal). */
  unrecognisedHeaders: string[];
  /** File-level problems (no name column, …); no rows when present. */
  errors: string[];
};

type Grid = string[][];

/** Flatten an ExcelJS cell value to text (formula results, rich text, links). */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("formula" in value || "sharedFormula" in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      return result == null ? "" : cellText(result as ExcelJS.CellValue);
    }
    if ("hyperlink" in value) {
      const t = (value as ExcelJS.CellHyperlinkValue).text;
      return typeof t === "string" ? t : cellText(t as ExcelJS.CellValue);
    }
    if ("error" in value) return "";
  }
  return String(value);
}

async function readXlsxGrid(buffer: Buffer): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new UploadParseError("The spreadsheet could not be read. Save it as .xlsx or .csv.");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const grid: Grid = [];
  const width = sheet.columnCount;
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c);
      // A merged range's value lives in its top-left cell only.
      const follower = cell.isMerged && cell.master.address !== cell.address;
      cells.push(follower ? "" : cellText(cell.value).trim());
    }
    grid.push(cells);
  }
  return grid;
}

function readCsvGrid(buffer: Buffer): Grid {
  try {
    const records = parse(buffer.toString("utf8"), {
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
      trim: true,
    }) as string[][];
    return records;
  } catch (e) {
    throw new UploadParseError(`The CSV could not be read: ${(e as Error).message}`);
  }
}

const isBlankRow = (row: readonly string[]) => row.every((c) => c.trim() === "");

/** Collapse inner whitespace. */
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

/** "Smith, Jane" → Jane / Smith; "Jane Mary Smith" → "Jane Mary" / Smith. */
function splitFullName(full: string): { givenName: string; surname: string } {
  const comma = full.indexOf(",");
  if (comma >= 0) {
    return { surname: tidy(full.slice(0, comma)), givenName: tidy(full.slice(comma + 1)) };
  }
  const parts = tidy(full).split(" ").filter(Boolean);
  if (parts.length <= 1) return { givenName: "", surname: parts[0] ?? "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1]! };
}

function parseNumberCell(raw: string): { number: string | null; error: string | null } {
  const v = raw.trim().replace(/^#\s*/, "");
  if (v === "") return { number: null, error: null };
  if (isValidShirtNumber(v)) return { number: v, error: null };
  return { number: null, error: `"${raw.trim()}" is not a shirt number: use 1 to 3 digits.` };
}

/** Parse a grid (header row somewhere near the top, data below). Pure. */
export function parseUploadGrid(grid: Grid, kind: ShirtNumberUploadKind): ParsedUpload {
  const firstNonBlank = grid.findIndex((r) => !isBlankRow(r));
  if (firstNonBlank < 0) {
    return { rows: [], unrecognisedHeaders: [], errors: ["The file has no rows."] };
  }

  // The header is the first row (within the scan window) with a name column.
  let headerAt = -1;
  let columns = new Map<Field, number>();
  for (let r = firstNonBlank; r < grid.length && r < firstNonBlank + HEADER_SCAN_ROWS; r++) {
    const found = new Map<Field, number>();
    grid[r]!.forEach((cell, c) => {
      const field = FIELD_BY_ALIAS.get(normaliseHeader(cell));
      if (field && !found.has(field)) found.set(field, c);
    });
    if (found.has("name") || found.has("firstName") || found.has("lastName")) {
      headerAt = r;
      columns = found;
      break;
    }
  }

  if (headerAt < 0) {
    const headers = grid[firstNonBlank]!.map((h) => h.trim()).filter(Boolean);
    return {
      rows: [],
      unrecognisedHeaders: headers,
      errors: [
        `No name column found. Use a "Name" column, or "First Name" and "Last Name". ` +
          `Headers found: ${headers.join(", ") || "(none)"}.`,
      ],
    };
  }

  const unrecognisedHeaders = grid[headerAt]!.map((h) => h.trim()).filter(
    (h) => h !== "" && !FIELD_BY_ALIAS.has(normaliseHeader(h)),
  );

  const readsNumbers = kind === "numbers";
  if (readsNumbers && !columns.has("number")) {
    return {
      rows: [],
      unrecognisedHeaders,
      errors: [
        `No shirt number column found. Add a "Number" column, or upload this file as a ` +
          `registration export.`,
      ],
    };
  }

  const data = grid.slice(headerAt + 1);
  const nonBlank = data.filter((r) => !isBlankRow(r)).length;
  if (nonBlank > SHIRT_NUMBER_UPLOAD_MAX_ROWS) {
    throw new UploadParseError(
      `The file has ${nonBlank.toLocaleString("en-AU")} rows; the limit is ` +
        `${SHIRT_NUMBER_UPLOAD_MAX_ROWS.toLocaleString("en-AU")}. Split it into smaller files.`,
    );
  }

  const cell = (row: readonly string[], field: Field) => {
    const c = columns.get(field);
    return c === undefined ? "" : tidy(row[c] ?? "");
  };

  const rows: ParsedUploadRow[] = [];
  data.forEach((row, i) => {
    if (isBlankRow(row)) return;
    const errors: string[] = [];

    let givenName = cell(row, "firstName");
    let surname = cell(row, "lastName");
    if (givenName === "" && surname === "") {
      ({ givenName, surname } = splitFullName(cell(row, "name")));
    }
    const name = cleanName(`${givenName} ${surname}`);
    if (name === "") errors.push("No name on this row.");

    let participantId: string | null = null;
    const rawParticipant = cell(row, "participantId");
    if (rawParticipant !== "") {
      if (PARTICIPANT_ID_PATTERN.test(rawParticipant)) {
        participantId = normaliseParticipantId(rawParticipant);
      } else {
        errors.push(`"${rawParticipant}" is not a PlayHQ participant id.`);
      }
    }

    let number: string | null = null;
    if (readsNumbers) {
      const parsed = parseNumberCell(cell(row, "number"));
      number = parsed.number;
      if (parsed.error) errors.push(parsed.error);
    }

    rows.push({ rowIndex: i + 1, name, givenName, surname, participantId, number, errors });
  });

  return { rows, unrecognisedHeaders, errors: [] };
}

/**
 * Parse an uploaded `.csv` / `.xlsx`. Throws {@link UploadParseError} for an
 * unsupported or unreadable file or one over the row cap; header problems come
 * back as `errors` so the preview can show them.
 */
export async function parseShirtNumberUpload(
  buffer: Buffer,
  fileName: string,
  kind: ShirtNumberUploadKind,
): Promise<ParsedUpload> {
  const type = uploadFileType(fileName);
  if (type === null) throw new UploadParseError("Upload a .csv or .xlsx file.");
  const grid = type === "xlsx" ? await readXlsxGrid(buffer) : readCsvGrid(buffer);
  return parseUploadGrid(grid, kind);
}

// ── Matching ────────────────────────────────────────────────────────────────

/**
 * Someone an upload row can match. Senior people carry a `playerId` in the
 * tenant's player space (and their participant id when known); junior people
 * carry only a `participantId`.
 */
export type RosterPerson = {
  playerId: number | null;
  participantId: string | null;
  name: string;
  givenName: string;
  surname: string;
};

export type UploadRoster = {
  /** People whose names rows are matched against. */
  people: readonly RosterPerson[];
  /** Lowercased participant id → person (may include people with no usable name). */
  byParticipant: ReadonlyMap<string, RosterPerson>;
  /** Exact normalised name key → every person with that name. */
  byName: ReadonlyMap<string, RosterPerson[]>;
  matcher: ReturnType<typeof buildNameMatcher>;
};

/**
 * Index a roster for matching. Each person with a participant id is reachable
 * by it; `participantLinks` adds ids that resolve to someone outside the
 * name-matchable `people` (a private player, a merged-away GUID).
 */
export function buildUploadRoster(
  people: readonly RosterPerson[],
  participantLinks: Iterable<readonly [string, RosterPerson]> = [],
): UploadRoster {
  const byParticipant = new Map<string, RosterPerson>();
  for (const [guid, p] of participantLinks) {
    const key = normaliseParticipantId(guid);
    if (key) byParticipant.set(key, p);
  }
  for (const p of people) {
    const key = normaliseParticipantId(p.participantId);
    if (key && !byParticipant.has(key)) byParticipant.set(key, p);
  }
  const byName = new Map<string, RosterPerson[]>();
  for (const p of people) {
    const key = nameKey(p.surname, p.givenName);
    if (key === "|") continue;
    const list = byName.get(key) ?? [];
    list.push(p);
    byName.set(key, list);
  }
  const matcher = buildNameMatcher(
    people.map((p, i) => ({ id: i, surname: p.surname, givenName: p.givenName })),
  );
  return { people, byParticipant, byName, matcher };
}

export type PreviewStatus = "matched" | "suggested" | "new" | "invalid";

export type PreviewCandidate = {
  playerId: number | null;
  participantId: string | null;
  name: string;
  score: number | null;
};

/** The contract's `ShirtNumberPreviewRow`. */
export type PreviewRow = {
  rowIndex: number;
  name: string;
  participantId: string | null;
  number: string | null;
  status: PreviewStatus;
  playerId: number | null;
  candidates: PreviewCandidate[];
  existingEntryId: number | null;
  existingNumber: string | null;
  numberChange: boolean;
  duplicate: boolean;
  duplicateWith: string[];
  errors: string[];
};

const candidateOf = (p: RosterPerson, score: number | null): PreviewCandidate => ({
  playerId: p.playerId,
  participantId: p.playerId === null ? p.participantId : null,
  name: p.name,
  score,
});

/** Name-only identity for entries and rows that carry no ids. */
const fullNameKey = (name: string) => norm(name);

/** The register entry a row would update: by player, participant, then (id-less) name. */
function existingEntryFor<E extends RegisterEntryLike>(
  entries: readonly E[],
  who: { playerId: number | null; participantId: string | null; name: string },
): E | undefined {
  if (who.playerId !== null) {
    const e = entries.find((x) => x.playerId === who.playerId);
    if (e) return e;
  }
  if (who.participantId !== null) {
    const e = entries.find((x) => x.participantId === who.participantId);
    if (e) return e;
  }
  if (who.playerId === null && who.participantId === null) {
    const key = fullNameKey(who.name);
    return entries.find(
      (x) => x.playerId === null && x.participantId === null && fullNameKey(x.name) === key,
    );
  }
  return undefined;
}

/** The identity a row stands for, to spot the same person twice in a file. */
function identityKey(r: { playerId: number | null; participantId: string | null; name: string }) {
  if (r.playerId !== null) return `p:${r.playerId}`;
  if (r.participantId !== null) return `g:${r.participantId}`;
  return `n:${fullNameKey(r.name)}`;
}

/**
 * Classify parsed rows against a roster and the season's register (R7, R8).
 * Pure. Order: participant id, then a unique exact normalised name, then
 * name-matcher suggestions (never applied). Also reports, for each row, the
 * entry it would update, a number change, and duplicate numbers against the
 * season as it would stand after the upload.
 */
export function buildPreviewRows(
  parsed: readonly ParsedUploadRow[],
  roster: UploadRoster,
  season: readonly RegisterEntryLike[],
): PreviewRow[] {
  const seen = new Map<string, number>();
  const rows: PreviewRow[] = parsed.map((p) => {
    const base: PreviewRow = {
      rowIndex: p.rowIndex,
      name: p.name,
      participantId: p.participantId,
      number: p.number,
      status: "invalid",
      playerId: null,
      candidates: [],
      existingEntryId: null,
      existingNumber: null,
      numberChange: false,
      duplicate: false,
      duplicateWith: [],
      errors: [...p.errors],
    };
    if (base.errors.length > 0) return { ...base, number: null };

    const byId = p.participantId !== null ? roster.byParticipant.get(p.participantId) : undefined;
    let row: PreviewRow;
    if (byId) {
      row = {
        ...base,
        status: "matched",
        playerId: byId.playerId,
        participantId: p.participantId,
      };
    } else {
      const exact = roster.byName.get(nameKey(p.surname, p.givenName)) ?? [];
      if (exact.length === 1) {
        const person = exact[0]!;
        row = {
          ...base,
          status: "matched",
          playerId: person.playerId,
          participantId:
            p.participantId ?? (person.playerId === null ? person.participantId : null),
        };
      } else if (exact.length > 1) {
        row = { ...base, status: "suggested", candidates: exact.map((x) => candidateOf(x, null)) };
      } else {
        const m = roster.matcher.resolve(p.surname, p.givenName);
        row =
          m.status === "suggested"
            ? {
                ...base,
                status: "suggested",
                candidates: m.candidates.map((c) =>
                  candidateOf(roster.people[c.playerId]!, c.score),
                ),
              }
            : { ...base, status: "new" };
      }
    }

    const key = identityKey(row);
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      return {
        ...base,
        number: null,
        errors: [`Same person as row ${earlier}; only the first row is used.`],
      };
    }
    seen.set(key, p.rowIndex);
    return row;
  });

  // The season as it would stand after the upload: existing entries take
  // their row's number; rows with no entry join as new ones (negative ids).
  const after: RegisterEntryLike[] = season.map((e) => ({ ...e }));
  const selfId = new Map<number, number>();
  rows.forEach((row, i) => {
    if (row.status === "invalid") return;
    const existing = existingEntryFor(season, row);
    if (existing) {
      row.existingEntryId = existing.id;
      row.existingNumber = existing.number;
      row.numberChange = row.number !== null && row.number !== existing.number;
      if (row.number !== null) after.find((e) => e.id === existing.id)!.number = row.number;
      selfId.set(i, existing.id);
    } else {
      const id = -(i + 1);
      after.push({ id, name: row.name, number: row.number, playerId: null, participantId: null });
      selfId.set(i, id);
    }
  });
  rows.forEach((row, i) => {
    if (row.status === "invalid" || row.number === null) return;
    const others = duplicatesOf(after, row.number, selfId.get(i));
    row.duplicate = others.length > 0;
    row.duplicateWith = others.map((o) => o.name);
  });
  return rows;
}

export type PreviewCounts = {
  total: number;
  matched: number;
  suggested: number;
  new: number;
  invalid: number;
  numberChanges: number;
  duplicates: number;
};

export function previewCounts(rows: readonly PreviewRow[]): PreviewCounts {
  const counts: PreviewCounts = {
    total: rows.length,
    matched: 0,
    suggested: 0,
    new: 0,
    invalid: 0,
    numberChanges: 0,
    duplicates: 0,
  };
  for (const r of rows) {
    counts[r.status] += 1;
    if (r.numberChange) counts.numberChanges += 1;
    if (r.duplicate) counts.duplicates += 1;
  }
  return counts;
}

// ── Senior roster ───────────────────────────────────────────────────────────

const personFromName = (
  playerId: number | null,
  participantId: string | null,
  displayName: string,
): RosterPerson => {
  const { givenName, surname } = splitFullName(displayName);
  return { playerId, participantId, name: tidy(displayName), givenName, surname };
};

/**
 * The senior roster for a tenant's uploads: its player space (see
 * ./curated-player-space). A native-reading Halls Head matches its native
 * players (fill-ins excluded); every other club matches its crosswalk, named
 * from central (curated names first) with private players left out of name
 * matching. Participant ids resolve through the crosswalk for both, with
 * confirmed merges folded to the presented player id.
 */
export async function loadSeniorUploadRoster(tenantId: number): Promise<UploadRoster> {
  const identity = await loadClubIdentity(tenantId);

  if (await curatedIdsAreNative(tenantId)) {
    const players = await db
      .select({
        id: playersTable.id,
        surname: playersTable.surname,
        givenName: playersTable.givenName,
      })
      .from(playersTable)
      .where(and(lt(playersTable.id, FILL_IN_THRESHOLD), eq(playersTable.isFillIn, false)))
      .orderBy(asc(playersTable.id));
    const people: RosterPerson[] = players.map((p) => ({
      playerId: p.id,
      participantId: null,
      name: tidy(`${p.givenName} ${p.surname}`),
      givenName: p.givenName,
      surname: p.surname,
    }));
    const byId = new Map(people.map((p) => [p.playerId, p]));
    const links = [...identity.intByGuid].map(
      ([guid, id]) => [guid, byId.get(id) ?? personFromName(id, guid, "")] as const,
    );
    return buildUploadRoster(people, links);
  }

  // Central-read: one person per merge group (its keeper), at the presented id.
  const keepers = new Map<string, number>();
  for (const [guid, id] of identity.intByGuid) keepers.set(identity.canonicalOf(guid), id);
  const central = await import("@workspace/db/central-queries");
  const names =
    keepers.size > 0
      ? await central.centralPlayerNames([...keepers.keys()], identity.merges)
      : new Map<string, { displayName: string | null; isPrivate: boolean }>();

  const people: RosterPerson[] = [];
  const byKeeper = new Map<string, RosterPerson>();
  for (const [keeper, id] of keepers) {
    const c = names.get(keeper);
    const display = identity.nameFor(keeper, c?.displayName ?? null) ?? "";
    const p = personFromName(id, keeper, display);
    byKeeper.set(keeper, p);
    if (display !== "" && !c?.isPrivate) people.push(p);
  }
  const links = [...identity.intByGuid].map(
    ([guid]) => [guid, byKeeper.get(identity.canonicalOf(guid))!] as const,
  );
  return buildUploadRoster(people, links);
}

// ── Preview store ───────────────────────────────────────────────────────────

/** What a pending upload stores (the contract preview, minus id and counts). */
export type UploadPayload = {
  fileName: string;
  rows: PreviewRow[];
  unrecognisedHeaders: string[];
  errors: string[];
};

/** The contract's `ShirtNumberUploadPreview`. */
export type UploadPreview = UploadPayload & {
  id: number;
  side: ShirtNumberSide;
  kind: ShirtNumberUploadKind;
  season: number;
  counts: PreviewCounts;
  truncated: boolean;
};

export function serializePreview(
  upload: Pick<ShirtNumberUploadRow, "id" | "side" | "kind" | "season">,
  payload: UploadPayload,
): UploadPreview {
  return {
    id: upload.id,
    side: upload.side,
    kind: upload.kind,
    season: upload.season,
    fileName: payload.fileName,
    rows: payload.rows,
    counts: previewCounts(payload.rows),
    unrecognisedHeaders: payload.unrecognisedHeaders,
    errors: payload.errors,
    // Over-cap files are refused outright, so nothing is ever dropped.
    truncated: false,
  };
}

/** Store a pending preview for a tenant and side. */
export async function createUpload(args: {
  tenantId: number;
  side: ShirtNumberSide;
  kind: ShirtNumberUploadKind;
  season: number;
  payload: UploadPayload;
}): Promise<UploadPreview> {
  const [row] = await db
    .insert(shirtNumberUploadsTable)
    .values({
      tenantId: args.tenantId,
      side: args.side,
      kind: args.kind,
      season: args.season,
      status: "pending",
      payload: args.payload,
    })
    .returning();
  return serializePreview(row, args.payload);
}

/**
 * Discard a pending preview and clear its payload. False when the tenant has
 * no pending upload with that id on that side (another tenant's included).
 */
export async function discardUpload(
  tenantId: number,
  side: ShirtNumberSide,
  id: number,
): Promise<boolean> {
  const [row] = await db
    .update(shirtNumberUploadsTable)
    .set({ status: "discarded", payload: null })
    .where(
      and(
        eq(shirtNumberUploadsTable.id, id),
        eq(shirtNumberUploadsTable.tenantId, tenantId),
        eq(shirtNumberUploadsTable.side, side),
        eq(shirtNumberUploadsTable.status, "pending"),
      ),
    )
    .returning({ id: shirtNumberUploadsTable.id });
  return row !== undefined;
}

function payloadRows(payload: unknown): PreviewRow[] | null {
  const rows = (payload as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as PreviewRow[]) : null;
}

// ── Senior commit ───────────────────────────────────────────────────────────

export type SeniorResolution = {
  rowIndex: number;
  action: "link" | "hold" | "discard";
  playerId?: number | null;
};

export type CommitResult = {
  uploadId: number;
  created: number;
  updated: number;
  linked: number;
  held: number;
  discarded: number;
  warnings: ShirtNumberWarning[];
};

export type CommitOutcome =
  | { ok: true; result: CommitResult }
  | { ok: false; status: 400 | 404 | 409; body: ShirtNumberConflict | { error: string } };

const fail = (status: 400 | 404, error: string): CommitOutcome => ({
  ok: false,
  status,
  body: { error },
});
const conflict = (error: string, warnings: ShirtNumberWarning[] = []): CommitOutcome => ({
  ok: false,
  status: 409,
  body: { error, warnings },
});

/** One row's planned write. */
type Planned = {
  row: PreviewRow;
  playerId: number | null;
  participantId: string | null;
  existing: ShirtNumberRow | undefined;
  /** The number the row sets explicitly, or null (keep / carry). */
  explicit: string | null;
  /** Temp id for a new entry in the after-state (negative). */
  selfId: number;
};

/** Last season's number for a person, preferring an entry linked to the player (KTD6). */
function carriedFrom(
  previous: readonly RegisterEntryLike[],
  who: { playerId: number | null; participantId: string | null },
): string | null {
  const linked =
    who.playerId !== null ? previous.find((e) => e.playerId === who.playerId) : undefined;
  const byParticipant =
    who.participantId !== null
      ? previous.find((e) => e.participantId === who.participantId)
      : undefined;
  return (linked ?? byParticipant)?.number ?? null;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

/**
 * Apply a pending senior upload (R4, R5, R8, R11). Rows without a resolution
 * take their default: `matched` links to its player, `new` and `suggested`
 * are held, `invalid` is discarded. A row for someone already on the season's
 * register updates that entry's number (and links a held entry) instead of
 * adding a second one. New entries without a number carry last season's under
 * the `carry` policy.
 *
 * Duplicate policy: under `block`, any row giving someone a number another
 * entry wears refuses the whole commit (409, the rows listed); under `warn`
 * everything applies and the duplicates come back as warnings.
 *
 * Idempotent per upload: the row is locked and must be `pending`; success
 * marks it `committed` and clears the payload, so a second commit is a 409.
 */
export async function commitSeniorUpload(
  tenantId: number,
  uploadId: number,
  resolutions: readonly SeniorResolution[],
  settings: ShirtNumberSettings,
): Promise<CommitOutcome> {
  const byRow = new Map<number, SeniorResolution>();
  for (const r of resolutions) {
    if (byRow.has(r.rowIndex)) return fail(400, `Row ${r.rowIndex} has more than one resolution.`);
    if (r.action === "link" && r.playerId == null) {
      return fail(400, `Row ${r.rowIndex}: choose a player to link.`);
    }
    byRow.set(r.rowIndex, r);
  }
  const outside = await playersOutsideTenantSpace(
    tenantId,
    resolutions.map((r) => (r.action === "link" ? r.playerId : null)),
  );
  if (outside.length > 0) {
    return fail(400, `Player ${outside.join(", ")} is not one of this club's players.`);
  }

  try {
    return await db.transaction(async (tx) => {
      const [upload] = await tx
        .select()
        .from(shirtNumberUploadsTable)
        .where(
          and(
            eq(shirtNumberUploadsTable.id, uploadId),
            eq(shirtNumberUploadsTable.tenantId, tenantId),
            eq(shirtNumberUploadsTable.side, "senior"),
          ),
        )
        .for("update");
      if (!upload) return fail(404, "Upload not found");
      if (upload.status !== "pending") {
        return conflict(`This upload has already been ${upload.status}.`);
      }
      const rows = payloadRows(upload.payload);
      if (!rows) return conflict("This upload has no preview to apply.");

      const rowByIndex = new Map(rows.map((r) => [r.rowIndex, r]));
      for (const idx of byRow.keys()) {
        if (!rowByIndex.has(idx)) return fail(400, `Row ${idx} is not in this upload.`);
      }

      const season = upload.season;
      const entries = await tx
        .select()
        .from(shirtNumbersTable)
        .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)))
        .orderBy(asc(shirtNumbersTable.id));

      // ── Plan every row ──
      const planned: Planned[] = [];
      let discarded = 0;
      const claimed = new Map<string, number>();
      const claim = (key: string, rowIndex: number): string | null => {
        const earlier = claimed.get(key);
        if (earlier !== undefined) return `Rows ${earlier} and ${rowIndex} are the same person.`;
        claimed.set(key, rowIndex);
        return null;
      };

      for (const row of rows) {
        const res = byRow.get(row.rowIndex);
        const action =
          res?.action ??
          (row.status === "matched" && row.playerId !== null
            ? "link"
            : row.status === "invalid"
              ? "discard"
              : "hold");
        if (action === "discard") {
          discarded += 1;
          continue;
        }
        if (row.status === "invalid") {
          return fail(400, `Row ${row.rowIndex} is invalid and can only be discarded.`);
        }

        const playerId = action === "link" ? (res?.playerId ?? row.playerId) : null;
        if (action === "link" && playerId === null) {
          return fail(400, `Row ${row.rowIndex}: choose a player to link.`);
        }
        // A participant id that matched a player belongs to that player: it
        // does not follow the row when the admin links someone else. Held, it
        // stays, so the entry links once that participant plays (KTD9).
        const participantId =
          action === "link" && row.status === "matched" && playerId !== row.playerId
            ? null
            : row.participantId;

        let existing: ShirtNumberRow | undefined;
        if (playerId !== null) existing = entries.find((e) => e.playerId === playerId);
        if (!existing && participantId !== null) {
          existing = entries.find((e) => e.participantId === participantId);
          if (existing && playerId !== null && existing.playerId !== null) {
            return fail(
              400,
              `Row ${row.rowIndex}: that participant is already on the register as another player.`,
            );
          }
        }
        if (!existing && playerId === null && participantId === null) {
          const key = fullNameKey(row.name);
          existing = entries.find(
            (e) => e.playerId === null && e.participantId === null && fullNameKey(e.name) === key,
          );
        }

        for (const key of [
          playerId !== null ? `p:${playerId}` : null,
          participantId !== null ? `g:${participantId}` : null,
          existing ? `e:${existing.id}` : null,
        ]) {
          if (key === null) continue;
          const clash = claim(key, row.rowIndex);
          if (clash) return fail(400, clash);
        }

        planned.push({
          row,
          playerId,
          participantId,
          existing,
          explicit: row.number,
          selfId: -(planned.length + 1),
        });
      }

      // ── The season after explicit numbers ──
      const after: RegisterEntryLike[] = entries.map((e) => ({
        id: e.id,
        name: e.name,
        number: e.number,
        playerId: e.playerId,
        participantId: e.participantId,
      }));
      const afterOf = (p: Planned) => after.find((e) => e.id === (p.existing?.id ?? p.selfId))!;
      for (const p of planned) {
        if (!p.existing) {
          after.push({
            id: p.selfId,
            name: cleanName(p.row.name),
            number: p.explicit,
            playerId: p.playerId,
            participantId: p.participantId,
          });
        } else if (p.explicit !== null) {
          afterOf(p).number = p.explicit;
        }
      }

      // Explicit numbers someone else wears: refused under `block`.
      const sets = (p: Planned) =>
        p.explicit !== null && (!p.existing || p.existing.number !== p.explicit);
      const blocked: ShirtNumberWarning[] = [];
      for (const p of planned) {
        if (!sets(p)) continue;
        const others = duplicatesOf(after, p.explicit, afterOf(p).id);
        if (others.length === 0) continue;
        const w = duplicateWarning(season, p.explicit!, others);
        blocked.push({
          ...w,
          message: `Row ${p.row.rowIndex} (${p.row.name}): ${w.message}`,
          entryIds: w.entryIds.filter((id) => id > 0),
        });
      }
      if (settings.duplicatePolicy === "block" && blocked.length > 0) {
        return conflict(
          `${blocked.length} ${blocked.length === 1 ? "row gives" : "rows give"} a number ` +
            `someone else wears this season. Nothing was applied.`,
          blocked,
        );
      }

      // Carry last season's number into new entries without one (KTD6).
      const warnings: ShirtNumberWarning[] = [];
      if (settings.rolloverPolicy === "carry") {
        const previous = await loadSeasonEntries(tx, "senior", tenantId, season - 1);
        for (const p of planned) {
          if (p.existing || p.explicit !== null) continue;
          const carried = carriedFrom(previous, p);
          const applied = applyCarriedNumber(carried, after, settings.duplicatePolicy);
          if (applied.blockedBy.length > 0 && carried !== null) {
            warnings.push(
              blockedCarryWarning(season, carried, cleanName(p.row.name), applied.blockedBy),
            );
          }
          afterOf(p).number = applied.number;
        }
      }

      // ── Write ──
      const source = upload.kind === "registration" ? "registration" : "upload";
      let created = 0;
      let updated = 0;
      let linked = 0;
      let held = 0;
      const touchedNumbers = new Set<string>();
      const inserts: (typeof shirtNumbersTable.$inferInsert)[] = [];
      const now = new Date();

      for (const p of planned) {
        const number = afterOf(p).number;
        if (p.playerId !== null || p.existing?.playerId != null) linked += 1;
        else held += 1;

        if (!p.existing) {
          inserts.push({
            tenantId,
            season,
            name: cleanName(p.row.name),
            participantId: p.participantId,
            playerId: p.playerId,
            number,
            source,
          });
          if (number !== null) touchedNumbers.add(number);
          continue;
        }

        const patch: Partial<typeof shirtNumbersTable.$inferInsert> = {};
        if (number !== p.existing.number) {
          patch.number = number;
          if (number !== null) touchedNumbers.add(number);
        }
        if (p.playerId !== null && p.existing.playerId === null) patch.playerId = p.playerId;
        if (
          p.participantId !== null &&
          p.existing.participantId === null &&
          !entries.some((e) => e.participantId === p.participantId)
        ) {
          patch.participantId = p.participantId;
        }
        if (Object.keys(patch).length === 0) continue;
        await tx
          .update(shirtNumbersTable)
          .set({ ...patch, updatedAt: now })
          .where(
            and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.id, p.existing.id)),
          );
        updated += 1;
      }
      if (inserts.length > 0) {
        await tx.insert(shirtNumbersTable).values(inserts);
        created = inserts.length;
      }

      // Under `warn`, one notice per number this upload gave out that is now shared.
      if (touchedNumbers.size > 0) {
        const final = await loadSeasonEntries(tx, "senior", tenantId, season);
        for (const number of touchedNumbers) {
          const holders = duplicatesOf(final, number);
          if (holders.length < 2) continue;
          const names = holders.map((h) => h.name);
          warnings.push(
            duplicateWarning(
              season,
              number,
              holders,
              `#${number} is worn by ${names.slice(0, -1).join(", ")} and ` +
                `${names[names.length - 1]} in ${seasonLabel(season)}.`,
            ),
          );
        }
      }

      await tx
        .update(shirtNumberUploadsTable)
        .set({ status: "committed", payload: null })
        .where(eq(shirtNumberUploadsTable.id, upload.id));

      return {
        ok: true as const,
        result: { uploadId: upload.id, created, updated, linked, held, discarded, warnings },
      };
    });
  } catch (e) {
    // Someone joined the register for the same person mid-commit.
    if (isUniqueViolation(e)) {
      return conflict("The register changed while this upload was applied. Try again.");
    }
    throw e;
  }
}
