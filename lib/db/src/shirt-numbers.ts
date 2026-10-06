import { and, eq, or, type SQL } from "drizzle-orm";
import type { Db } from "./index";
import {
  juniorShirtNumbersTable,
  shirtNumberSettingsTable,
  shirtNumbersTable,
  type ShirtNumberDuplicatePolicy,
  type ShirtNumberRolloverPolicy,
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
