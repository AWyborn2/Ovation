import { and, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./index";
import {
  juniorShirtNumbersTable,
  shirtNumberSettingsTable,
  shirtNumbersTable,
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
  /** Skip the settings read when the caller already has the policy. */
  rolloverPolicy?: ShirtNumberRolloverPolicy;
};

/**
 * The number a person wore last season, to carry into a new entry (KTD6).
 * Null under the `blank` rollover policy, when the person was not on last
 * season's register, or when they were on it unnumbered.
 *
 * Seniors match on the player id or the participant id (an entry held last
 * season may only carry the participant); juniors match on the participant id
 * in the junior register only.
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

/** The numbers worn in a tenant's senior register for one season (for the block-policy skip). */
export async function seasonNumbersInUse(
  executor: Reader,
  tenantId: number,
  season: number,
): Promise<Set<string>> {
  const rows = await executor
    .select({ number: shirtNumbersTable.number })
    .from(shirtNumbersTable)
    .where(
      and(
        eq(shirtNumbersTable.tenantId, tenantId),
        eq(shirtNumbersTable.season, season),
        isNotNull(shirtNumbersTable.number),
      ),
    );
  return new Set(rows.flatMap((r) => (r.number === null ? [] : [r.number])));
}

/**
 * Link a held senior entry to a player in the tenant's id space (KTD2, KTD9):
 * sets `playerId` only while the entry is still held, and only when no other
 * entry of the same tenant and season is already linked to that player (the
 * per-person unique index), so re-runs and races are no-ops. The number is
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
             and s2.player_id = ${args.playerId})`,
      ),
    )
    .returning({ id: shirtNumbersTable.id });
  return rows.length > 0;
}
