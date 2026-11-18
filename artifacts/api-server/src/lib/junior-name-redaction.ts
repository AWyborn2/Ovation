import { and, eq } from "drizzle-orm";
import { db, juniorParticipantsTable } from "@workspace/db";
import { JUNIOR_WITHHELD_NAME, formatJuniorName, isJuniorWithheld } from "./junior-names";

/**
 * Junior names withheld when a design is drawn, not only when it is built
 * (round 3 retest, P0 2).
 *
 * A junior card or set stores the names its builder printed. When a child is
 * made private afterwards, an older draft would still print "C. BULLER" with
 * their shirt number. Stored junior rows carry no participant id, so every
 * junior part of a stored design is checked against the club's withheld
 * players as they stand now, by every printed form their name can take
 * ("C. BULLER", "COHEN BULLER", "COHEN B", and "COHEN" as a whole field). A
 * match is withheld whole: "Private Player", no initial, no role mark, no shirt
 * number, no overseas mark and no photo. It fails closed: a public junior who
 * shares a private junior's printed name is withheld too.
 *
 * Applied on every read the editors, thumbnails and queue preview draw from,
 * on Share → Download (the still render), and on the post render.
 */

export type WithheldNames = {
  /** "C|BULLER": an initial and surname row. */
  rows: Set<string>;
  /** Upper-case multi-word printed forms, matched anywhere in a junior text field. */
  phrases: string[];
  /** Upper-case one-word forms ("COHEN"), matched only as a whole field. */
  words: Set<string>;
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every printed form of each withheld player's name. Pure. */
export function withheldNames(
  players: Iterable<{ displayName: string | null; isPrivate: boolean; privacyOverride: boolean }>,
): WithheldNames {
  const out: WithheldNames = { rows: new Set(), phrases: [], words: new Set() };
  const phrases = new Set<string>();
  for (const p of players) {
    if (!isJuniorWithheld(p)) continue;
    const parts = (p.displayName ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    const initial = first.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "";
    if (parts.length >= 2) {
      out.rows.add(`${initial}|${norm(last)}`);
      phrases.add(norm(`${initial}. ${last}`));
      for (const style of ["full", "first_initial"] as const)
        phrases.add(norm(formatJuniorName(p.displayName, style)));
    }
    out.words.add(norm(first));
  }
  out.phrases = [...phrases].sort((a, b) => b.length - a.length);
  return out;
}

const isEmpty = (w: WithheldNames) => !w.rows.size && !w.phrases.length && !w.words.size;

const ROW_DROPS = [
  "firstInitial",
  "role",
  "shirtNumber",
  "overseas",
  "debut",
  "photoUrl",
  "photoTransform",
  "photoId",
  "featuredParticipantId",
];

function rowWithheld(row: Record<string, unknown>, w: WithheldNames): boolean {
  const surname = typeof row.surname === "string" ? norm(row.surname) : "";
  if (!surname || surname === norm(JUNIOR_WITHHELD_NAME)) return false;
  const initial = typeof row.firstInitial === "string" ? norm(row.firstInitial) : "";
  if (initial && w.rows.has(`${initial}|${surname}`)) return true;
  // A shorter style prints the public name whole in `surname` ("COHEN B", "COHEN").
  return w.words.has(surname) || w.phrases.includes(surname);
}

function redactText(value: string, w: WithheldNames): string {
  if (w.words.has(norm(value))) return JUNIOR_WITHHELD_NAME;
  let out = value;
  for (const phrase of w.phrases) {
    const re = new RegExp(
      `(^|[^\\p{L}])${escape(phrase).replace(/ /g, "\\s+")}(?=$|[^\\p{L}])`,
      "giu",
    );
    out = out.replace(re, (_m, lead: string) => `${lead}${JUNIOR_WITHHELD_NAME}`);
  }
  return out;
}

/** Keys that never hold a person's name (identifiers, styling, URLs). */
const SKIP_KEYS = new Set(["kind", "id", "key", "grade", "ageGroup", "teamName", "opponent"]);

function walk(node: unknown, w: WithheldNames, junior: boolean, hits: { n: number }): unknown {
  if (Array.isArray(node)) return node.map((x) => walk(x, w, junior, hits));
  if (!node || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;
  const here = junior || obj.junior === true;
  if (here && rowWithheld(obj, w)) {
    hits.n++;
    const row: Record<string, unknown> = { ...obj, surname: JUNIOR_WITHHELD_NAME.toUpperCase() };
    for (const k of ROW_DROPS) delete row[k];
    return row;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (here && typeof v === "string" && !SKIP_KEYS.has(k) && !/url$/i.test(k)) {
      const next = redactText(v, w);
      if (next !== v) hits.n++;
      out[k] = next;
    } else {
      out[k] = walk(v, w, here, hits);
    }
  }
  return out;
}

/**
 * A stored card input (or any part of one) with withheld junior names taken
 * out. `junior` says the whole value is junior content (a junior draft); else
 * only parts marked `junior: true` (a junior slide of a set) are checked.
 * Pure; returns the value unchanged (same reference) when nothing matched.
 */
export function redactWithheldJuniorNames<T>(value: T, w: WithheldNames, junior: boolean): T {
  if (isEmpty(w) || value == null) return value;
  const hits = { n: 0 };
  const out = walk(value, w, junior, hits);
  return hits.n ? (out as T) : value;
}

/** A junior caption or other free text with withheld names taken out. Pure. */
export function redactJuniorText(value: string, w: WithheldNames): string {
  return isEmpty(w) ? value : redactText(value, w);
}

/** The club's withheld junior players' printed names, read now. */
export async function loadWithheldJuniorNames(tenantId: number): Promise<WithheldNames> {
  const rows = await db
    .select({
      displayName: juniorParticipantsTable.displayName,
      isPrivate: juniorParticipantsTable.isPrivate,
      privacyOverride: juniorParticipantsTable.privacyOverride,
    })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.tenantId, tenantId),
        eq(juniorParticipantsTable.isPrivate, true),
      ),
    );
  return withheldNames(rows);
}

/** Whether a stored draft is junior content as a whole. */
export function isJuniorDraftRow(draft: {
  sourceMatchIsJunior?: boolean | null;
  cardInput: unknown;
}): boolean {
  const input = draft.cardInput as Record<string, unknown> | null;
  return draft.sourceMatchIsJunior === true || input?.junior === true;
}

/** A stored draft row with withheld junior names taken out of its input and design. */
export function redactDraftRow<
  R extends { sourceMatchIsJunior?: boolean | null; cardInput: unknown; adjustments?: unknown },
>(row: R, w: WithheldNames): R {
  const junior = isJuniorDraftRow(row);
  const cardInput = redactWithheldJuniorNames(row.cardInput, w, junior);
  // A junior design's own text layers (a name typed into the editor) too.
  const adjustments =
    junior && "adjustments" in row
      ? redactWithheldJuniorNames(row.adjustments, w, true)
      : row.adjustments;
  if (cardInput === row.cardInput && adjustments === row.adjustments) return row;
  return { ...row, cardInput, ...("adjustments" in row ? { adjustments } : {}) };
}

/**
 * A render request from the browser (Share → Download, the editor's Download,
 * clips) with today's privacy applied: the open tab may hold names from before
 * a junior was made private.
 */
export async function redactRenderRequest<I, O>(
  tenantId: number,
  input: I,
  options: O,
): Promise<{ input: I; options: O }> {
  const opts = (options ?? {}) as Record<string, unknown>;
  const junior = opts.junior === true || (input as Record<string, unknown> | null)?.junior === true;
  const withheld = await loadWithheldJuniorNames(tenantId);
  const safeInput = redactWithheldJuniorNames(input, withheld, junior);
  const adjustments = junior
    ? redactWithheldJuniorNames(opts.adjustments, withheld, true)
    : opts.adjustments;
  return {
    input: safeInput,
    options: adjustments === opts.adjustments ? options : ({ ...opts, adjustments } as O),
  };
}
