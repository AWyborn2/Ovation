/**
 * cap-import-core.ts — pure rules for seeding a club's A Grade / Female A
 * Grade cap register from the club's own list. Shared by the platform-admin
 * console import (cap-import.ts) and scripts/seed-cap-register.ts.
 *
 * Input is a CSV with the columns `category,cap_number,name,games_a_grade`
 * (category `male` = A Grade, `female` = Female A Grade). The plan links each cap
 * to a player of the tenant by EXACT name only: a cap linked to the wrong person
 * is worse than an unlinked one, which the club can link by hand in Admin → Caps.
 *
 * Rules:
 *   - a category that already has caps in the tenant's register is refused whole
 *     (the numbering would collide or mix two schemes);
 *   - cap numbers in the file must be unique per category;
 *   - names must be unique per category (the same person is never capped twice);
 *   - an exact name matching one non-private tenant player links; several
 *     players with the name is ambiguous (cap kept, unlinked, reported); none
 *     leaves the cap unlinked; a compatible-but-not-exact name is only a hint.
 */

export type CapCategory = "male" | "female";

export interface CapSeedRow {
  /** 1-based spreadsheet row (header is row 1). */
  row: number;
  category: CapCategory;
  capNumber: number;
  name: string;
  games: number;
}

export interface CapCandidate {
  playerId: number;
  displayName: string | null;
  isPrivate: boolean;
}

export type CapLinkStatus = "linked" | "ambiguous" | "private" | "unmatched";

export interface PlannedCapSeed extends CapSeedRow {
  playerId: number | null;
  status: CapLinkStatus;
  /** Candidate ids behind an "ambiguous" status, or a name hint behind "unmatched". */
  note: string;
}

export interface CapSeedPlan {
  errors: string[];
  /** Categories refused because the tenant already has caps in them. */
  refusedCategories: Array<{ category: CapCategory; existing: number }>;
  caps: PlannedCapSeed[];
}

/** A comma-form name ("McIntosh, Leigh") read given name first. */
function givenFirst(name: string): string {
  const i = name.indexOf(",");
  if (i > 0) {
    const surname = name.slice(0, i).trim();
    const given = name.slice(i + 1).trim();
    if (surname && given) return `${given} ${surname}`;
  }
  return name;
}

/** Lowercase, accent-free, letters and single spaces only: the exact-match key. */
export function capNameKey(name: string): string {
  return givenFirst(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Same surname and given names equal or one a 3+ letter prefix of the other (a hint only). */
function looksLikeSamePerson(a: string, b: string): boolean {
  const ta = capNameKey(a).split(" ");
  const tb = capNameKey(b).split(" ");
  if (ta.length < 2 || tb.length < 2) return false;
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
  const ga = ta[0]!;
  const gb = tb[0]!;
  if (ga === gb) return true;
  if (ga.length === 1) return gb.startsWith(ga);
  if (gb.length === 1) return ga.startsWith(gb);
  return Math.min(ga.length, gb.length) >= 3 && (ga.startsWith(gb) || gb.startsWith(ga));
}

/** Minimal RFC 4180 reader for a file this script's tooling wrote (quotes, commas, CRLF). */
export function readCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function parseCapCsv(text: string): { rows: CapSeedRow[]; errors: string[] } {
  const errors: string[] = [];
  const records = readCsvRecords(text);
  const header = (records[0] ?? []).map((h) => h.trim().toLowerCase());
  const want = ["category", "cap_number", "name", "games_a_grade"];
  for (const c of want) if (!header.includes(c)) errors.push(`Missing column "${c}".`);
  if (errors.length > 0) return { rows: [], errors };
  const at = (cells: string[], c: string) => (cells[header.indexOf(c)] ?? "").trim();
  const rows: CapSeedRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i]!;
    const row = i + 1;
    const category = at(cells, "category");
    const capNumber = at(cells, "cap_number");
    const name = at(cells, "name").replace(/\s+/g, " ");
    const games = at(cells, "games_a_grade");
    if (category !== "male" && category !== "female") {
      errors.push(`Row ${row}: category must be male or female (got "${category}").`);
      continue;
    }
    if (!/^[1-9]\d{0,4}$/.test(capNumber)) {
      errors.push(`Row ${row}: cap_number must be a positive whole number (got "${capNumber}").`);
      continue;
    }
    if (name.length < 3 || name.length > 120) {
      errors.push(`Row ${row}: name "${name}" isn't a plausible name.`);
      continue;
    }
    if (games !== "" && !/^\d{1,4}$/.test(games)) {
      errors.push(`Row ${row}: games_a_grade must be a whole number (got "${games}").`);
      continue;
    }
    rows.push({
      row,
      category,
      capNumber: Number(capNumber),
      name,
      games: games === "" ? 0 : Number(games),
    });
  }
  if (rows.length === 0 && errors.length === 0) errors.push("The file has no data rows.");
  return { rows, errors };
}

export function planCapSeed(input: {
  rows: readonly CapSeedRow[];
  candidates: readonly CapCandidate[];
  /** How many caps the tenant's register already holds, per category. */
  existing: Readonly<Record<CapCategory, number>>;
}): CapSeedPlan {
  const errors: string[] = [];
  const refusedCategories: CapSeedPlan["refusedCategories"] = [];
  for (const category of ["male", "female"] as const) {
    if (input.existing[category] > 0) {
      refusedCategories.push({ category, existing: input.existing[category] });
    }
  }
  const refused = new Set(refusedCategories.map((r) => r.category));

  const seenNumber = new Map<string, number>();
  const seenName = new Map<string, number>();
  const usable: CapSeedRow[] = [];
  for (const r of input.rows) {
    if (refused.has(r.category)) continue;
    const nKey = `${r.category}|${r.capNumber}`;
    const pKey = `${r.category}|${capNameKey(r.name)}`;
    if (seenNumber.has(nKey)) {
      errors.push(
        `Row ${r.row}: ${r.category} cap #${r.capNumber} repeats row ${seenNumber.get(nKey)}.`,
      );
      continue;
    }
    if (seenName.has(pKey)) {
      errors.push(
        `Row ${r.row}: "${r.name}" is already capped in ${r.category} (row ${seenName.get(pKey)}).`,
      );
      continue;
    }
    seenNumber.set(nKey, r.row);
    seenName.set(pKey, r.row);
    usable.push(r);
  }

  const byKey = new Map<string, CapCandidate[]>();
  for (const c of input.candidates) {
    if (!c.displayName) continue;
    const k = capNameKey(c.displayName);
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }

  const claimed = new Map<number, number>();
  const caps: PlannedCapSeed[] = usable.map((r) => {
    const hits = byKey.get(capNameKey(r.name)) ?? [];
    const open = hits.filter((h) => !h.isPrivate);
    if (open.length === 1) {
      const id = open[0]!.playerId;
      const prior = claimed.get(id);
      if (prior !== undefined) {
        errors.push(
          `Row ${r.row}: "${r.name}" resolves to player #${id}, already linked by row ${prior}.`,
        );
        return {
          ...r,
          playerId: null,
          status: "ambiguous",
          note: `player #${id} also used by row ${prior}`,
        };
      }
      claimed.set(id, r.row);
      return { ...r, playerId: id, status: "linked", note: "" };
    }
    if (open.length > 1) {
      return {
        ...r,
        playerId: null,
        status: "ambiguous",
        note: `players ${open.map((h) => `#${h.playerId}`).join(", ")}`,
      };
    }
    if (hits.length > 0)
      return {
        ...r,
        playerId: null,
        status: "private",
        note: "only a private player has this name",
      };
    const hint = input.candidates.find(
      (c) => !c.isPrivate && c.displayName && looksLikeSamePerson(r.name, c.displayName),
    );
    return {
      ...r,
      playerId: null,
      status: "unmatched",
      note: hint ? `close name: "${hint.displayName}" (player #${hint.playerId})` : "",
    };
  });
  caps.sort((a, b) => a.category.localeCompare(b.category) || a.capNumber - b.capNumber);
  return { errors, refusedCategories, caps };
}

export interface SeedArgs {
  tenant: number;
  file: string;
  commit: boolean;
  out: string | null;
  label: string | null;
  help: boolean;
}

export function parseSeedArgs(argv: readonly string[]): SeedArgs {
  const out: SeedArgs = { tenant: 0, file: "", commit: false, out: null, label: null, help: false };
  for (const a of argv) {
    const [flag, value] = a.split("=", 2) as [string, string | undefined];
    if (flag === "--help") out.help = true;
    else if (flag === "--commit") out.commit = true;
    else if (flag === "--tenant" && value && /^[1-9]\d*$/.test(value)) out.tenant = Number(value);
    else if (flag === "--file" && value) out.file = value;
    else if (flag === "--out" && value) out.out = value;
    else if (flag === "--label" && value) out.label = value;
    else throw new Error(`Unknown or malformed argument: ${a}`);
  }
  if (!out.help && (out.tenant === 0 || out.file === "")) {
    throw new Error("--tenant=<id> and --file=<csv> are required.");
  }
  return out;
}

// ── Console import: template, batch marker, batch list, undo guard ──────────

export const CAP_CATEGORY_LABEL: Record<CapCategory, string> = {
  male: "A Grade",
  female: "Female A Grade",
};

/** The CSV template: every column, two example rows. */
export function capImportTemplateCsv(): string {
  return (
    [
      "category,cap_number,name,games_a_grade",
      "male,1,John Smith,120",
      "female,1,Jane Citizen,41",
    ].join("\r\n") + "\r\n"
  );
}

/** A batch token is the commit time, "20261014T023215Z" (UTC, second resolution). */
export const CAP_BATCH_TOKEN_RE = /^\d{8}T\d{6}Z$/;

const CAP_BATCH_NOTE_RE = /^CSV import \[(\d{8}T\d{6}Z)\] (.+)$/;

export function capBatchToken(at: Date): string {
  return at
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/** The note every cap of a batch carries. The label is single-spaced and capped at 100 characters. */
export function capBatchNote(token: string, label: string): string {
  return `CSV import [${token}] ${label.replace(/\s+/g, " ").trim().slice(0, 100)}`;
}

export function parseCapBatchNote(
  note: string | null | undefined,
): { token: string; label: string; createdAt: string } | null {
  const m = CAP_BATCH_NOTE_RE.exec(note ?? "");
  if (!m) return null;
  const t = m[1]!;
  const createdAt = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`;
  return { token: t, label: m[2]!, createdAt };
}

export interface CapBatchSummary {
  id: string;
  label: string;
  createdAt: string;
  /** Caps still carrying the batch marker, per list. */
  male: number;
  female: number;
  linked: number;
  unlinked: number;
}

/** Group caps by their batch marker, newest batch first. Caps with any other note are not batches. */
export function groupCapBatches(
  rows: ReadonlyArray<{
    category: string;
    playerId: number | null;
    capNote: string | null;
  }>,
): CapBatchSummary[] {
  const byToken = new Map<string, CapBatchSummary>();
  for (const r of rows) {
    const parsed = parseCapBatchNote(r.capNote);
    if (!parsed) continue;
    let b = byToken.get(parsed.token);
    if (!b) {
      b = {
        id: parsed.token,
        label: parsed.label,
        createdAt: parsed.createdAt,
        male: 0,
        female: 0,
        linked: 0,
        unlinked: 0,
      };
      byToken.set(parsed.token, b);
    }
    if (r.category === "male") b.male++;
    else if (r.category === "female") b.female++;
    if (r.playerId === null) b.unlinked++;
    else b.linked++;
  }
  return [...byToken.values()].sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Why a batch can't be undone: a cap outside the batch, in a list the batch
 * touched, numbered after the batch's highest cap there. Deleting the batch
 * would leave the later caps stranded after a gap. Empty = safe.
 */
export function capUndoBlockers(
  batch: ReadonlyArray<{ category: string; capNumber: number }>,
  others: ReadonlyArray<{ category: string; capNumber: number }>,
): string[] {
  const out: string[] = [];
  for (const category of ["male", "female"] as const) {
    const mine = batch.filter((c) => c.category === category);
    if (mine.length === 0) continue;
    const top = Math.max(...mine.map((c) => c.capNumber));
    const later = others
      .filter((c) => c.category === category && c.capNumber > top)
      .map((c) => c.capNumber)
      .sort((a, b) => a - b);
    if (later.length > 0) {
      out.push(
        `${later.length} later cap(s) exist in the ${CAP_CATEGORY_LABEL[category]} list ` +
          `(from #${later[0]}, after this batch's #${top}).`,
      );
    }
  }
  return out;
}
