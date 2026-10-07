import { and, asc, desc, eq, ne, or, type SQL } from "drizzle-orm";
import {
  db,
  juniorShirtNumbersTable,
  shirtNumbersTable,
  type ShirtNumberDuplicatePolicy,
  type ShirtNumberRolloverPolicy,
  type ShirtNumberRow,
  type ShirtNumberSource,
} from "@workspace/db";
import {
  carriedNumberFor,
  cleanShirtNumberName,
  normaliseParticipantId,
  type ShirtNumberSettings,
  type ShirtNumberSide,
} from "@workspace/db/shirt-numbers";
import { FILL_IN_THRESHOLD, seasonLabel } from "@workspace/scorecard";

/**
 * Season shirt-number register service (docs/plans/2026-10-06-001-feat-season-
 * shirt-numbers-plan.md, U3). Built on the shared rules in
 * `@workspace/db/shirt-numbers` (settings read, carry-forward lookup).
 *
 * The pure rules (duplicate detection, the carried-number policy and
 * season-start planning) work on plain entry lists so the senior routes here,
 * the upload commit (U4) and the juniors register (U10) all apply the same
 * decisions. Every database helper takes an explicit tenant id and only ever
 * touches the tenant database — never central.
 */

// ── Pure rules ──────────────────────────────────────────────────────────────

/** The fields of a register entry (either side) the rules need. */
export type RegisterEntryLike = {
  id: number;
  name: string;
  number: string | null;
  /** Senior only; always null for juniors. */
  playerId: number | null;
  participantId: string | null;
};

/** A person's identity on the register. */
export type RegisterIdentity = Pick<RegisterEntryLike, "playerId" | "participantId">;

/** The `ShirtNumberWarning` shape from the API contract. */
export type ShirtNumberWarning = {
  kind: "duplicate";
  season: number;
  number: string;
  message: string;
  entryIds: number[];
  names: string[];
};

/** "2026/27" for 2026. */
export { seasonLabel };

/**
 * Why a player id cannot be linked to a senior register entry, or null when it can.
 * Fill-in (90001+) and cap-only (95001+) ids are excluded from every derivation, so
 * the register never links one (the ingest and the upload roster skip them too).
 */
export function fillInLinkError(playerId: number | null | undefined): string | null {
  return playerId != null && playerId >= FILL_IN_THRESHOLD
    ? `Player ${playerId} is a fill-in and cannot have a shirt number.`
    : null;
}

/**
 * The entries in `entries` wearing exactly `number` (string match: "7" and
 * "07" differ, KTD3), excluding the entry being saved. An unnumbered entry
 * never duplicates.
 */
export function duplicatesOf<E extends RegisterEntryLike>(
  entries: readonly E[],
  number: string | null,
  excludeId?: number,
): E[] {
  if (number === null) return [];
  return entries.filter((e) => e.number === number && e.id !== excludeId);
}

/** Ids of every entry that shares its number with another entry. */
export function duplicateEntryIds(entries: readonly RegisterEntryLike[]): Set<number> {
  const byNumber = new Map<string, number[]>();
  for (const e of entries) {
    if (e.number === null) continue;
    const ids = byNumber.get(e.number) ?? [];
    ids.push(e.id);
    byNumber.set(e.number, ids);
  }
  const out = new Set<number>();
  for (const ids of byNumber.values()) if (ids.length > 1) for (const id of ids) out.add(id);
  return out;
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The warning for a number already worn by `others` in `season`. */
export function duplicateWarning(
  season: number,
  number: string,
  others: readonly RegisterEntryLike[],
  message?: string,
): ShirtNumberWarning {
  const names = others.map((o) => o.name);
  return {
    kind: "duplicate",
    season,
    number,
    message: message ?? `#${number} is also worn by ${joinNames(names)} in ${seasonLabel(season)}.`,
    entryIds: others.map((o) => o.id),
    names,
  };
}

/** The warning for a carried number left off under the `block` policy. */
export function blockedCarryWarning(
  season: number,
  number: string,
  name: string,
  holders: readonly RegisterEntryLike[],
): ShirtNumberWarning {
  return duplicateWarning(
    season,
    number,
    holders,
    `#${number} was not carried forward for ${name}: already worn by ` +
      `${joinNames(holders.map((h) => h.name))} in ${seasonLabel(season)}.`,
  );
}

/** Same person: equal player id or equal participant id (never two nulls). */
export function samePerson(a: RegisterIdentity, b: RegisterIdentity): boolean {
  if (a.playerId !== null && a.playerId === b.playerId) return true;
  if (a.participantId !== null && a.participantId === b.participantId) return true;
  return false;
}

const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Whether `person` is already on a season's register. An entry with neither a
 * player nor a participant id (an upload row nobody could match) can only be
 * recognised by its name.
 */
function onRegister(
  person: RegisterIdentity & { name: string },
  season: readonly (RegisterIdentity & { name: string })[],
): boolean {
  if (person.playerId === null && person.participantId === null) {
    const key = nameKey(person.name);
    return season.some((e) => nameKey(e.name) === key);
  }
  return season.some((e) => samePerson(person, e));
}

/**
 * Apply the duplicate policy to a number carried from last season (KTD6,
 * KTD9): under `block` a carried number someone already wears this season is
 * left off and the entry is created unnumbered; under `warn` it is kept.
 */
export function applyCarriedNumber<E extends RegisterEntryLike>(
  carried: string | null,
  season: readonly E[],
  duplicatePolicy: ShirtNumberDuplicatePolicy,
): { number: string | null; blockedBy: E[] } {
  if (carried === null) return { number: null, blockedBy: [] };
  const holders = duplicatesOf(season, carried);
  if (duplicatePolicy === "block" && holders.length > 0) {
    return { number: null, blockedBy: holders };
  }
  return { number: carried, blockedBy: [] };
}

export type PlannedEntry = {
  name: string;
  playerId: number | null;
  participantId: string | null;
  number: string | null;
  source: "rollover";
};

export type SeasonStartPlan = {
  create: PlannedEntry[];
  /** People already on the new season's register. */
  skipped: number;
  /** Carried numbers left off under the `block` policy. */
  blocked: { name: string; number: string }[];
};

/**
 * Plan "Start season" (KTD6): copy the previous season's register into the
 * new one. Idempotent — anyone already present is skipped. Under `blank`
 * nothing is created. Under `block`, a carried number already worn in the new
 * season (including by an entry earlier in this same plan) is left off.
 */
export function planSeasonStart(args: {
  previous: readonly RegisterEntryLike[];
  current: readonly (RegisterIdentity & { name: string; number: string | null })[];
  rolloverPolicy: ShirtNumberRolloverPolicy;
  duplicatePolicy: ShirtNumberDuplicatePolicy;
}): SeasonStartPlan {
  const plan: SeasonStartPlan = { create: [], skipped: 0, blocked: [] };
  if (args.rolloverPolicy !== "carry") return plan;

  const present: (RegisterIdentity & { name: string })[] = [...args.current];
  const taken = new Set<string>();
  for (const e of args.current) if (e.number !== null) taken.add(e.number);

  for (const prev of args.previous) {
    if (onRegister(prev, present)) {
      plan.skipped += 1;
      continue;
    }
    let number = prev.number;
    if (number !== null && args.duplicatePolicy === "block" && taken.has(number)) {
      plan.blocked.push({ name: prev.name, number });
      number = null;
    }
    if (number !== null) taken.add(number);
    const created: PlannedEntry = {
      name: prev.name,
      playerId: prev.playerId,
      participantId: prev.participantId,
      number,
      source: "rollover",
    };
    plan.create.push(created);
    present.push(created);
  }
  return plan;
}

// ── Database helpers ────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The shared pool or a transaction. */
export type Executor = typeof db | Tx;

/** Display names are trimmed and length-capped (the contract's maxLength). */
export const cleanName = (name: string): string => cleanShirtNumberName(name);

/** One season's register for a side, as rule-ready entries. */
export async function loadSeasonEntries(
  executor: Executor,
  side: ShirtNumberSide,
  tenantId: number,
  season: number,
): Promise<RegisterEntryLike[]> {
  if (side === "junior") {
    const rows = await executor
      .select({
        id: juniorShirtNumbersTable.id,
        name: juniorShirtNumbersTable.name,
        number: juniorShirtNumbersTable.number,
        participantId: juniorShirtNumbersTable.participantId,
      })
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, tenantId),
          eq(juniorShirtNumbersTable.season, season),
        ),
      )
      .orderBy(asc(juniorShirtNumbersTable.id));
    return rows.map((r) => ({ ...r, playerId: null }));
  }
  return executor
    .select({
      id: shirtNumbersTable.id,
      name: shirtNumbersTable.name,
      number: shirtNumbersTable.number,
      playerId: shirtNumbersTable.playerId,
      participantId: shirtNumbersTable.participantId,
    })
    .from(shirtNumbersTable)
    .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)))
    .orderBy(asc(shirtNumbersTable.id));
}

/**
 * The duplicate check for one write, on either side: the other entries in
 * (tenant, season) wearing exactly `number`, and the warning naming them.
 * Callers return the warning under `warn` and 409 under `block`.
 */
export async function checkDuplicateNumber(
  executor: Executor,
  args: {
    side: ShirtNumberSide;
    tenantId: number;
    season: number;
    number: string | null;
    excludeId?: number;
  },
): Promise<{ others: RegisterEntryLike[]; warning: ShirtNumberWarning | null }> {
  if (args.number === null) return { others: [], warning: null };
  const entries = await loadSeasonEntries(executor, args.side, args.tenantId, args.season);
  const others = duplicatesOf(entries, args.number, args.excludeId);
  return {
    others,
    warning: others.length > 0 ? duplicateWarning(args.season, args.number, others) : null,
  };
}

/** Distinct seasons with a senior register, newest first. */
export async function seniorRegisterSeasons(tenantId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ season: shirtNumbersTable.season })
    .from(shirtNumbersTable)
    .where(eq(shirtNumbersTable.tenantId, tenantId))
    .orderBy(desc(shirtNumbersTable.season));
  return rows.map((r) => r.season);
}

/** A senior entry in the contract's `ShirtNumberEntry` shape. */
export function serializeSeniorEntry(row: ShirtNumberRow, duplicate: boolean) {
  return {
    id: row.id,
    season: row.season,
    name: row.name,
    participantId: row.participantId,
    playerId: row.playerId,
    number: row.number,
    source: row.source,
    held: row.playerId === null,
    duplicate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type SeniorEntry = ReturnType<typeof serializeSeniorEntry>;

/** The 409 body: a person conflict (no warnings) or a blocked duplicate. */
export type ShirtNumberConflict = { error: string; warnings: ShirtNumberWarning[] };

export type WriteOutcome =
  | { ok: true; entry: SeniorEntry; warnings: ShirtNumberWarning[] }
  | { ok: false; status: 404 | 409; body: ShirtNumberConflict | { error: string } };

const ALREADY_ON_REGISTER = (season: number) =>
  `This person is already on the ${seasonLabel(season)} register.`;

/** A senior entry for the same person in the season, other than `excludeId`. */
async function findSamePerson(
  executor: Executor,
  tenantId: number,
  season: number,
  who: RegisterIdentity,
  excludeId?: number,
): Promise<ShirtNumberRow | undefined> {
  const identity: SQL[] = [];
  if (who.playerId !== null) identity.push(eq(shirtNumbersTable.playerId, who.playerId));
  if (who.participantId !== null) {
    identity.push(eq(shirtNumbersTable.participantId, who.participantId));
  }
  if (identity.length === 0) return undefined;
  const [row] = await executor
    .select()
    .from(shirtNumbersTable)
    .where(
      and(
        eq(shirtNumbersTable.tenantId, tenantId),
        eq(shirtNumbersTable.season, season),
        or(...identity),
        excludeId !== undefined ? ne(shirtNumbersTable.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  return row;
}

/** A Postgres unique-constraint violation (SQLSTATE 23505). */
export const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

export type CreateSeniorInput = {
  season: number;
  name: string;
  participantId?: string | null;
  playerId?: number | null;
  /** Omitted or null: apply carry-forward (KTD6). */
  number?: string | null;
  source?: ShirtNumberSource;
};

/**
 * Add a person to a season's senior register. The caller has validated the
 * player id against the tenant's player space and the number's format.
 *
 * - Already on the season's register (player or participant id): 409.
 * - An explicit duplicate number: warning under `warn`, 409 under `block`.
 * - No number: carried from last season under `carry`; under `block` a carried
 *   number that would duplicate is left off and reported as a warning.
 */
export async function createSeniorEntry(
  tenantId: number,
  input: CreateSeniorInput,
  settings: ShirtNumberSettings,
): Promise<WriteOutcome> {
  const who: RegisterIdentity = {
    playerId: input.playerId ?? null,
    participantId: normaliseParticipantId(input.participantId),
  };
  try {
    return await db.transaction(async (tx) => {
      if (await findSamePerson(tx, tenantId, input.season, who)) {
        return conflict(ALREADY_ON_REGISTER(input.season));
      }
      const season = await loadSeasonEntries(tx, "senior", tenantId, input.season);
      const warnings: ShirtNumberWarning[] = [];
      let number: string | null;

      if (input.number != null) {
        number = input.number;
        const others = duplicatesOf(season, number);
        if (others.length > 0) {
          const warning = duplicateWarning(input.season, number, others);
          if (settings.duplicatePolicy === "block") {
            return conflict(warning.message, [warning]);
          }
          warnings.push(warning);
        }
      } else {
        const carried = await carriedNumberFor(tx, {
          tenantId,
          side: "senior",
          season: input.season,
          playerId: who.playerId,
          participantId: who.participantId,
          rolloverPolicy: settings.rolloverPolicy,
        });
        const applied = applyCarriedNumber(carried, season, settings.duplicatePolicy);
        number = applied.number;
        const name = cleanName(input.name);
        if (applied.blockedBy.length > 0 && carried !== null) {
          warnings.push(blockedCarryWarning(input.season, carried, name, applied.blockedBy));
        } else if (number !== null) {
          const others = duplicatesOf(season, number);
          if (others.length > 0) warnings.push(duplicateWarning(input.season, number, others));
        }
      }

      const [row] = await tx
        .insert(shirtNumbersTable)
        .values({
          tenantId,
          season: input.season,
          name: cleanName(input.name),
          participantId: who.participantId,
          playerId: who.playerId,
          number,
          source: input.source ?? "admin",
        })
        .returning();
      return {
        ok: true as const,
        entry: serializeSeniorEntry(row, warnings.length > 0 && number !== null),
        warnings,
      };
    });
  } catch (e) {
    // Two concurrent creates for the same person: the partial unique index wins.
    if (isUniqueViolation(e)) return conflict(ALREADY_ON_REGISTER(input.season));
    throw e;
  }
}

/** A 409 refusal carrying the duplicate warnings behind it; shared by every register write. */
export function conflict(
  error: string,
  warnings: ShirtNumberWarning[] = [],
): { ok: false; status: 409; body: ShirtNumberConflict } {
  return { ok: false, status: 409, body: { error, warnings } };
}

export type UpdateSeniorInput = {
  name?: string;
  participantId?: string | null;
  playerId?: number | null;
  number?: string | null;
};

/**
 * Edit a senior entry: rename, (re)link, assign, change or clear the number.
 * A NEW number that duplicates another entry is refused under `block` (409)
 * and warned under `warn`; re-saving an unchanged number never blocks, but a
 * duplicate it already had is still reported as a warning.
 */
export async function updateSeniorEntry(
  tenantId: number,
  id: number,
  input: UpdateSeniorInput,
  settings: ShirtNumberSettings,
): Promise<WriteOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(shirtNumbersTable)
        .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.id, id)))
        .limit(1);
      if (!existing) {
        return { ok: false as const, status: 404 as const, body: { error: "Entry not found" } };
      }

      const patch: Partial<typeof shirtNumbersTable.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = cleanName(input.name);
      if (input.participantId !== undefined) {
        patch.participantId = normaliseParticipantId(input.participantId);
      }
      if (input.playerId !== undefined) patch.playerId = input.playerId;
      if (input.number !== undefined) patch.number = input.number;

      const who: RegisterIdentity = {
        playerId: patch.playerId !== undefined ? (patch.playerId ?? null) : existing.playerId,
        participantId:
          patch.participantId !== undefined
            ? (patch.participantId ?? null)
            : existing.participantId,
      };
      const identityChanged =
        who.playerId !== existing.playerId || who.participantId !== existing.participantId;
      if (identityChanged && (await findSamePerson(tx, tenantId, existing.season, who, id))) {
        return conflict(ALREADY_ON_REGISTER(existing.season));
      }

      const number = input.number !== undefined ? input.number : existing.number;
      const warnings: ShirtNumberWarning[] = [];
      if (number !== null) {
        const season = await loadSeasonEntries(tx, "senior", tenantId, existing.season);
        const others = duplicatesOf(season, number, id);
        if (others.length > 0) {
          const warning = duplicateWarning(existing.season, number, others);
          if (settings.duplicatePolicy === "block" && number !== existing.number) {
            return conflict(warning.message, [warning]);
          }
          warnings.push(warning);
        }
      }

      const [row] = await tx
        .update(shirtNumbersTable)
        .set(patch)
        .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.id, id)))
        .returning();
      return {
        ok: true as const,
        entry: serializeSeniorEntry(row, warnings.length > 0),
        warnings,
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return conflict("This person is already on that season's register.");
    }
    throw e;
  }
}

/** Remove a senior entry; false when the tenant has no such entry. */
export async function deleteSeniorEntry(tenantId: number, id: number): Promise<boolean> {
  const [row] = await db
    .delete(shirtNumbersTable)
    .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.id, id)))
    .returning({ id: shirtNumbersTable.id });
  return row !== undefined;
}

/** The senior register for a season, in the contract's entry shape. */
export async function listSeniorEntries(tenantId: number, season: number): Promise<SeniorEntry[]> {
  const rows = await db
    .select()
    .from(shirtNumbersTable)
    .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)))
    .orderBy(asc(shirtNumbersTable.name), asc(shirtNumbersTable.id));
  const dupes = duplicateEntryIds(rows);
  return rows.map((r) => serializeSeniorEntry(r, dupes.has(r.id)));
}

export type SeasonStartResult = {
  season: number;
  fromSeason: number;
  created: number;
  numbered: number;
  skipped: number;
  warnings: ShirtNumberWarning[];
};

/**
 * "Start season" for the senior register (KTD6): copy `season - 1` into
 * `season` under `carry` (idempotent; people already present are skipped),
 * nothing under `blank`. Under `block`, a carried number that would duplicate
 * is left off and the entry created unnumbered, reported in `warnings`; under
 * `warn`, carried duplicates are kept and reported.
 */
export async function startSeniorSeason(
  tenantId: number,
  season: number,
  settings: ShirtNumberSettings,
): Promise<SeasonStartResult> {
  const fromSeason = season - 1;
  const result: SeasonStartResult = {
    season,
    fromSeason,
    created: 0,
    numbered: 0,
    skipped: 0,
    warnings: [],
  };
  if (settings.rolloverPolicy !== "carry") return result;

  return db.transaction(async (tx) => {
    const previous = await loadSeasonEntries(tx, "senior", tenantId, fromSeason);
    const current = await loadSeasonEntries(tx, "senior", tenantId, season);
    const plan = planSeasonStart({
      previous,
      current,
      rolloverPolicy: settings.rolloverPolicy,
      duplicatePolicy: settings.duplicatePolicy,
    });
    result.skipped = plan.skipped;
    if (plan.create.length === 0) return result;

    // A person the PlayHQ lineup sync (or an admin) added since the read above
    // keeps that row: skip them rather than fail the whole start (per-person
    // unique indexes), and count only the rows actually created.
    const inserted = await tx
      .insert(shirtNumbersTable)
      .values(plan.create.map((c) => ({ ...c, tenantId, season })))
      .onConflictDoNothing()
      .returning();
    result.created = inserted.length;
    result.skipped += plan.create.length - inserted.length;
    result.numbered = inserted.filter((r) => r.number !== null).length;

    const after = await loadSeasonEntries(tx, "senior", tenantId, season);
    for (const b of plan.blocked) {
      result.warnings.push(
        blockedCarryWarning(season, b.number, b.name, duplicatesOf(after, b.number)),
      );
    }
    // Under `warn`, one notice per carried number that now has duplicates.
    const reported = new Set<string>();
    for (const row of inserted) {
      if (row.number === null || reported.has(row.number)) continue;
      const others = duplicatesOf(after, row.number, row.id);
      if (others.length === 0) continue;
      reported.add(row.number);
      const holders = [row, ...others];
      result.warnings.push(
        duplicateWarning(
          season,
          row.number,
          holders,
          `#${row.number} is worn by ${joinNames(holders.map((h) => h.name))} in ${seasonLabel(season)}.`,
        ),
      );
    }
    return result;
  });
}
