import { and, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./index";
import { isWomensGrade } from "./central/grades";
import {
  juniorShirtNumbersTable,
  shirtNumberSettingsTable,
  shirtNumbersTable,
  type ShirtNumberCategory,
  type ShirtNumberDuplicatePolicy,
  type ShirtNumberRolloverPolicy,
  type ShirtNumberSettingsRow,
} from "./schema/shirt_numbers";

/**
 * Season shirt number register rules shared by the PlayHQ ingest and the API
 * (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, KTD9), so both
 * apply one implementation. Like ./player-id-mint, this module only imports
 * ./index for types, so it never opens a connection by being imported, and it
 * never touches the central database.
 *
 * Every read takes an explicit tenant id.
 */

/** Anything that can run tenant-DB reads (the shared `db` or a transaction). */
type Reader = Pick<Db, "select">;

export type ShirtNumberSide = "senior" | "junior";

/** The default senior category: every entry from before migration 0047 is "men". */
export const DEFAULT_SHIRT_NUMBER_CATEGORY: ShirtNumberCategory = "men";

/** True for a stored or requested senior category. */
export function isShirtNumberCategory(value: unknown): value is ShirtNumberCategory {
  return value === "men" || value === "female";
}

/**
 * The senior register a fixture's team list feeds: `female` for a women's grade
 * (isWomensGrade), otherwise `men`. Used for lineup-created entries and for the number a
 * team list or team sheet shows for its fixture.
 */
export function shirtNumberCategoryForGrade(grade: string | null | undefined): ShirtNumberCategory {
  return isWomensGrade(grade) ? "female" : "men";
}

export type ShirtNumberSettings = {
  enabled: boolean;
  duplicatePolicy: ShirtNumberDuplicatePolicy;
  rolloverPolicy: ShirtNumberRolloverPolicy;
};

/** What a tenant without a settings row gets: the feature off (KTD5). */
export const DEFAULT_SHIRT_NUMBER_SETTINGS: Readonly<ShirtNumberSettings> = Object.freeze({
  enabled: false,
  duplicatePolicy: "warn",
  rolloverPolicy: "carry",
});

const SHIRT_NUMBER_PATTERN = /^[0-9]{1,3}$/;

/** True for a valid shirt number: 1-3 ASCII digits, leading zeros kept (KTD3). */
export function isValidShirtNumber(value: string): boolean {
  return SHIRT_NUMBER_PATTERN.test(value);
}

/**
 * The stored form of a PlayHQ participant GUID: trimmed and lowercased, so
 * comparisons never depend on the casing a source happened to use. Blank or
 * missing ids normalise to null.
 */
export function normaliseParticipantId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return v === "" ? null : v;
}

/**
 * A tenant's shirt-number settings, read-only. Returns the defaults when the
 * tenant has no row yet (the API's settings route creates one with
 * getOrCreateSettings; the ingest never does). An unrecognised stored policy
 * falls back to its default.
 */
export async function getShirtNumberSettings(
  executor: Reader,
  tenantId: number,
): Promise<ShirtNumberSettings> {
  const [row] = await executor
    .select()
    .from(shirtNumberSettingsTable)
    .where(eq(shirtNumberSettingsTable.tenantId, tenantId))
    .limit(1);
  return shirtNumberSettingsFromRow(row);
}

/**
 * The settings a stored row (or its absence) means: the defaults without a
 * row, and each unrecognised policy falling back to its default.
 */
export function shirtNumberSettingsFromRow(
  row: ShirtNumberSettingsRow | undefined,
): ShirtNumberSettings {
  if (!row) return { ...DEFAULT_SHIRT_NUMBER_SETTINGS };
  return {
    enabled: row.enabled === true,
    duplicatePolicy: row.duplicatePolicy === "block" ? "block" : "warn",
    rolloverPolicy: row.rolloverPolicy === "blank" ? "blank" : "carry",
  };
}

export type CarriedNumberArgs = {
  tenantId: number;
  side: ShirtNumberSide;
  /** The season the new entry is for; the carried number comes from season - 1. */
  season: number;
  /** Senior only: the player in the tenant's id space. Ignored for juniors. */
  playerId?: number | null;
  /** PlayHQ participant GUID (any casing). Required for juniors. */
  participantId?: string | null;
  /** Senior only: the register the entry is for (default `men`); last season's entry in the same category carries. */
  category?: ShirtNumberCategory;
  /** Skip the settings read when the caller already has the policy. */
  rolloverPolicy?: ShirtNumberRolloverPolicy;
};

/**
 * The number a person wore last season, to carry into a new entry (KTD6).
 * Null under the `blank` rollover policy, when the person was not on last
 * season's register, or when they were on it unnumbered.
 *
 * Seniors match on the player id or the participant id (an entry held last
 * season may only carry the participant) within the same category (a female entry
 * carries a female number); juniors match on the participant id in the junior
 * register only.
 */
export async function carriedNumberFor(
  executor: Reader,
  args: CarriedNumberArgs,
): Promise<string | null> {
  const participantId = normaliseParticipantId(args.participantId);
  const playerId = args.side === "senior" ? (args.playerId ?? null) : null;
  if (participantId === null && playerId === null) return null;

  const policy =
    args.rolloverPolicy ?? (await getShirtNumberSettings(executor, args.tenantId)).rolloverPolicy;
  if (policy !== "carry") return null;

  const previous = args.season - 1;

  if (args.side === "junior") {
    const [row] = await executor
      .select({ number: juniorShirtNumbersTable.number })
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, args.tenantId),
          eq(juniorShirtNumbersTable.season, previous),
          eq(juniorShirtNumbersTable.participantId, participantId!),
        ),
      )
      .limit(1);
    return row?.number ?? null;
  }

  const identity: SQL[] = [];
  if (playerId !== null) identity.push(eq(shirtNumbersTable.playerId, playerId));
  if (participantId !== null) identity.push(eq(shirtNumbersTable.participantId, participantId));
  const rows = await executor
    .select({ number: shirtNumbersTable.number, playerId: shirtNumbersTable.playerId })
    .from(shirtNumbersTable)
    .where(
      and(
        eq(shirtNumbersTable.tenantId, args.tenantId),
        eq(shirtNumbersTable.season, previous),
        eq(shirtNumbersTable.category, args.category ?? DEFAULT_SHIRT_NUMBER_CATEGORY),
        or(...identity),
      ),
    )
    .limit(2);
  // Two rows can match (a held participant entry and a separate linked player
  // entry); prefer the one linked to the player.
  const linked = playerId !== null ? rows.find((r) => r.playerId === playerId) : undefined;
  return (linked ?? rows[0])?.number ?? null;
}

/** Longest display name a register writer stores (KTD9: names are trimmed and capped). */
export const SHIRT_NUMBER_NAME_MAX = 120;

/** A register display name: trimmed, inner whitespace collapsed, capped at {@link SHIRT_NUMBER_NAME_MAX}. */
export function cleanShirtNumberName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, SHIRT_NUMBER_NAME_MAX);
}

/**
 * The key two register names are "the same name" under: accents stripped, lower case,
 * letters only ("José O'Neil" and "jose oneil" agree). The identity rule for an id-less
 * (name-only) held entry, shared by the upload commit and the PlayHQ lineup sync.
 */
export function shirtNumberNameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * The number an automatically created entry keeps under the club's duplicate
 * policy (KTD9): under `block`, a number another entry in the season already
 * wears is left off (the entry is created unnumbered); under `warn` it is kept.
 * `taken` holds the season's numbers in use, compared as exact strings (KTD3).
 */
export function numberAfterDuplicatePolicy(
  number: string | null,
  taken: ReadonlySet<string>,
  policy: ShirtNumberDuplicatePolicy,
): string | null {
  if (number === null) return null;
  return policy === "block" && taken.has(number) ? null : number;
}

/**
 * The numbers worn in one category of a tenant's senior register for one season (for the
 * block-policy skip). Clashes are per category: a men's #7 never blocks a female #7.
 */
export async function seasonNumbersInUse(
  executor: Reader,
  tenantId: number,
  season: number,
  category: ShirtNumberCategory,
): Promise<Set<string>> {
  const rows = await executor
    .select({ number: shirtNumbersTable.number })
    .from(shirtNumbersTable)
    .where(
      and(
        eq(shirtNumbersTable.tenantId, tenantId),
        eq(shirtNumbersTable.season, season),
        eq(shirtNumbersTable.category, category),
        isNotNull(shirtNumbersTable.number),
      ),
    );
  return new Set(rows.flatMap((r) => (r.number === null ? [] : [r.number])));
}

/**
 * Link a held senior entry to a player in the tenant's id space (KTD2, KTD9):
 * sets `playerId` only while the entry is still held, and only when no other
 * entry of the same tenant, season and category is already linked to that player
 * (the per-person unique index), so re-runs and races are no-ops. The number is
 * untouched. Returns whether the entry was linked.
 *
 * The caller vouches that `playerId` is in the tenant's space (a row of the
 * tenant's `player_id_map`, below the fill-in range).
 */
export async function linkHeldShirtNumberEntry(
  executor: Pick<Db, "update">,
  args: { tenantId: number; entryId: number; playerId: number },
): Promise<boolean> {
  const rows = await executor
    .update(shirtNumbersTable)
    .set({ playerId: args.playerId, updatedAt: new Date() })
    .where(
      and(
        eq(shirtNumbersTable.tenantId, args.tenantId),
        eq(shirtNumbersTable.id, args.entryId),
        isNull(shirtNumbersTable.playerId),
        sql`not exists (
          select 1 from shirt_numbers s2
           where s2.tenant_id = ${args.tenantId}
             and s2.season = ${shirtNumbersTable.season}
             and s2.category = ${shirtNumbersTable.category}
             and s2.player_id = ${args.playerId})`,
      ),
    )
    .returning({ id: shirtNumbersTable.id });
  return rows.length > 0;
}

// ── Junior held entries and the name rule ───────────────────────────────────

const PLAYHQ_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a PlayHQ participant (Profile) id: a GUID, any casing. */
export function isPlayhqParticipantGuid(value: string | null | undefined): boolean {
  return PLAYHQ_GUID.test((value ?? "").trim());
}

/** Letters only, accents stripped, lower case. */
const letters = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

type NameParts = { givens: string[]; lastKey: string; tailKey: string };

/**
 * A name's comparable parts: first-name keys (the first given name plus any
 * preferred name in brackets or quotes) and the surname as its last word and as
 * every word after the first name, both letters only. Reads "Surname, First".
 */
function nameParts(raw: string | null | undefined): NameParts | null {
  let name = (raw ?? "").normalize("NFKC");
  const preferred: string[] = [];
  name = name.replace(/\(([^)]*)\)|"([^"]*)"|\u201c([^\u201d]*)\u201d/g, (_m, a, b, c) => {
    const p = letters(String(a ?? b ?? c ?? ""));
    if (p) preferred.push(p);
    return " ";
  });
  let givenPart: string;
  let surnamePart: string;
  const comma = name.indexOf(",");
  if (comma >= 0) {
    surnamePart = name.slice(0, comma);
    givenPart = name.slice(comma + 1);
  } else {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    givenPart = words[0]!;
    surnamePart = words.slice(1).join(" ");
  }
  const givenWords = givenPart.trim().split(/\s+/).filter(Boolean);
  const surnameWords = surnamePart
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  const first = letters(givenWords[0] ?? "");
  // With "Surname, First Middle", middle names sit after the first name.
  const tailKey = letters(comma >= 0 ? surnameWords.join("") : surnamePart.replace(/[\s-]+/g, ""));
  const lastKey = letters(surnameWords[surnameWords.length - 1] ?? "");
  if (!first || !lastKey) return null;
  return { givens: [first, ...preferred], lastKey, tailKey };
}

function givenNamesAgree(a: readonly string[], b: readonly string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      // A lone initial ("B Dreckow") agrees with a first name starting with it.
      if ((x.length === 1 || y.length === 1) && x[0] === y[0]) return true;
    }
  }
  return false;
}

/**
 * Whether two names are the same person's name, for deciding when a PlayHQ
 * Profile ID can be trusted (a family's PlayHQ account can put a parent's or a
 * sibling's id on a child's row). Same first name (or preferred name, or a lone
 * initial) and the same surname, ignoring case, spacing, hyphens, apostrophes,
 * accents and middle names. A blank or one-word name never agrees.
 */
export function shirtNumberNamesAgree(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = nameParts(a);
  const y = nameParts(b);
  if (!x || !y) return false;
  const surnames =
    x.lastKey === y.lastKey ||
    x.tailKey === y.tailKey ||
    x.tailKey.endsWith(y.tailKey) ||
    y.tailKey.endsWith(x.tailKey);
  return surnames && givenNamesAgree(x.givens, y.givens);
}

/**
 * The held junior entries that can go live (pure): those whose participant is now
 * one of the club's juniors under a name agreeing with the sheet's. A participant
 * with a different (or no) name leaves the entry held for an admin to check.
 */
export function heldJuniorEntriesToActivate(
  held: readonly { id: number; participantId: string; name: string }[],
  participants: readonly { participantId: string; displayName: string | null }[],
): number[] {
  const nameOf = new Map<string, string | null>();
  for (const p of participants) {
    const id = normaliseParticipantId(p.participantId);
    if (id) nameOf.set(id, p.displayName);
  }
  return held
    .filter((h) => {
      const id = normaliseParticipantId(h.participantId);
      return id !== null && nameOf.has(id) && shirtNumberNamesAgree(h.name, nameOf.get(id));
    })
    .map((h) => h.id);
}

/**
 * Make the tenant's held junior shirt numbers live for participants that now exist
 * under a matching name (any season). Run by the junior sync after it writes
 * participants, so a number uploaded before the player was in the app shows on their
 * team-list card with no admin step. Tenant-scoped; `participantIds` (lowercased)
 * limits the check to the participants just written. Returns the entries activated.
 */
export async function activateHeldJuniorShirtNumbers(
  executor: Pick<Db, "execute">,
  tenantId: number,
  participantIds?: readonly string[],
): Promise<number> {
  if (participantIds !== undefined && participantIds.length === 0) return 0;
  const only =
    participantIds === undefined
      ? sql``
      : sql`and lower(s.participant_id) = any(${sql.param([...participantIds])}::text[])`;
  const res = await executor.execute(
    sql`select s.id, s.participant_id, s.name, p.display_name
          from junior_shirt_numbers s
          join junior_participants p
            on p.tenant_id = s.tenant_id and lower(p.participant_id) = lower(s.participant_id)
         where s.tenant_id = ${tenantId} and s.held ${only}`,
  );
  const rows = (
    res as unknown as {
      rows: { id: number; participant_id: string; name: string; display_name: string | null }[];
    }
  ).rows;
  const ids = heldJuniorEntriesToActivate(
    rows.map((r) => ({ id: r.id, participantId: r.participant_id, name: r.name })),
    rows.map((r) => ({ participantId: r.participant_id, displayName: r.display_name })),
  );
  if (ids.length === 0) return 0;
  await executor.execute(
    sql`update junior_shirt_numbers set held = false, updated_at = now()
         where tenant_id = ${tenantId} and held and id = any(${sql.param(ids)}::int[])`,
  );
  return ids.length;
}
