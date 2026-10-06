import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  juniorParticipantMergesTable,
  juniorParticipantsTable,
  juniorShirtNumbersTable,
  shirtNumberUploadsTable,
  type JuniorShirtNumberRow,
  type ShirtNumberSource,
} from "@workspace/db";
import { carriedNumberFor, normaliseParticipantId } from "@workspace/db/shirt-numbers";
import type { ShirtNumberSettings } from "@workspace/db/shirt-numbers";
import {
  applyCarriedNumber,
  blockedCarryWarning,
  cleanName,
  duplicateEntryIds,
  duplicateWarning,
  duplicatesOf,
  joinNames,
  loadSeasonEntries,
  planSeasonStart,
  seasonLabel,
  type RegisterEntryLike,
  type SeasonStartResult,
  type ShirtNumberConflict,
  type ShirtNumberWarning,
} from "./shirt-numbers";
import {
  buildPreviewRows,
  buildUploadRoster,
  splitFullName,
  type CommitOutcome,
  type ParsedUploadRow,
  type PreviewRow,
  type RosterPerson,
  type UploadRoster,
} from "./shirt-number-upload";

/**
 * Season shirt numbers — the juniors register (docs/plans/2026-10-06-001-feat-
 * season-shirt-numbers-plan.md, U10; R17 applying R4, R5, R7-R9, R11, R14-R16;
 * KTD1, KTD8, KTD14).
 *
 * Reuses the side-agnostic rules of ./shirt-numbers (duplicates, carry-forward,
 * season start) and ./shirt-number-upload (parsing, matching), with the junior
 * identity: every entry is keyed on a junior participant of the tenant
 * (`junior_participants`, merged-away duplicates resolved to their keeper),
 * never a senior player id. Every helper here reads and writes
 * `junior_shirt_numbers` only — never the senior `shirt_numbers` (juniors
 * isolation) and never the central database.
 */

// ── Pure rules ──────────────────────────────────────────────────────────────

export type JuniorParticipantLike = {
  participantId: string;
  displayName: string | null;
  isPrivate: boolean;
};

export type JuniorMergeLike = {
  duplicateParticipantId: string;
  keeperParticipantId: string;
};

/** Merge hops followed before a chain is treated as broken (matches the profile route). */
const MAX_MERGE_HOPS = 16;

/**
 * A resolver from any participant id (any casing) to the stored, lowercased
 * id of one of the club's junior participants. A merged-away duplicate
 * resolves to its keeper; anything else unknown (or a broken merge chain)
 * resolves to null.
 */
export function juniorCanonicalizer(
  participants: readonly Pick<JuniorParticipantLike, "participantId">[],
  merges: readonly JuniorMergeLike[],
): (id: string | null | undefined) => string | null {
  const known = new Set<string>();
  for (const p of participants) {
    const key = normaliseParticipantId(p.participantId);
    if (key) known.add(key);
  }
  const keeperOf = new Map<string, string>();
  for (const m of merges) {
    const dup = normaliseParticipantId(m.duplicateParticipantId);
    const keeper = normaliseParticipantId(m.keeperParticipantId);
    if (dup && keeper) keeperOf.set(dup, keeper);
  }
  return (id) => {
    let cur = normaliseParticipantId(id);
    for (let hop = 0; cur !== null && hop <= MAX_MERGE_HOPS; hop++) {
      if (known.has(cur)) return cur;
      cur = keeperOf.get(cur) ?? null;
    }
    return null;
  };
}

/**
 * The upload roster for juniors: people carry only a (lowercased)
 * `participantId`. Private participants are reachable by id but are never
 * offered by name.
 */
export function buildJuniorUploadRoster(
  participants: readonly JuniorParticipantLike[],
): UploadRoster {
  const all: RosterPerson[] = [];
  const nameable: RosterPerson[] = [];
  for (const p of participants) {
    const participantId = normaliseParticipantId(p.participantId);
    if (!participantId) continue;
    const display = cleanName(p.displayName ?? "");
    const { givenName, surname } = splitFullName(display);
    const person: RosterPerson = {
      playerId: null,
      participantId,
      name: display,
      givenName,
      surname,
    };
    all.push(person);
    if (display !== "" && !p.isPrivate) nameable.push(person);
  }
  return buildUploadRoster(
    nameable,
    all.map((p) => [p.participantId!, p] as const),
  );
}

/**
 * Classify a junior upload's rows (R7, R8): participant id first (merged-away
 * ids resolved to the keeper), then a unique exact name, then suggestions.
 * A participant id that is not one of the club's juniors is ignored for
 * matching, so a matched row always carries a real participant.
 */
export function buildJuniorPreviewRows(
  parsed: readonly ParsedUploadRow[],
  participants: readonly JuniorParticipantLike[],
  merges: readonly JuniorMergeLike[],
  season: readonly RegisterEntryLike[],
): PreviewRow[] {
  const canonical = juniorCanonicalizer(participants, merges);
  const rows = parsed.map((p) => ({ ...p, participantId: canonical(p.participantId) }));
  return buildPreviewRows(rows, buildJuniorUploadRoster(participants), season);
}

/** The contract's `JuniorShirtNumberRowResolution`. */
export type JuniorResolution = {
  rowIndex: number;
  action: "link" | "discard";
  participantId?: string | null;
};

export type JuniorCommitPlan =
  | { ok: true; planned: { row: PreviewRow; participantId: string }[]; discarded: number }
  | { ok: false; error: string };

/**
 * Decide each previewed row's fate for a junior commit. Junior entries always
 * carry a participant, so there is no "held": a row links to a junior
 * participant or is discarded. Rows without a resolution take their default:
 * `matched` links to its participant, every other row is discarded.
 */
export function resolveJuniorCommitRows(
  rows: readonly PreviewRow[],
  resolutions: readonly JuniorResolution[],
  canonical: (id: string | null | undefined) => string | null,
): JuniorCommitPlan {
  const byRow = new Map<number, JuniorResolution>();
  for (const r of resolutions) {
    if (byRow.has(r.rowIndex)) {
      return { ok: false, error: `Row ${r.rowIndex} has more than one resolution.` };
    }
    byRow.set(r.rowIndex, r);
  }
  const indexes = new Set(rows.map((r) => r.rowIndex));
  for (const idx of byRow.keys()) {
    if (!indexes.has(idx)) return { ok: false, error: `Row ${idx} is not in this upload.` };
  }

  const planned: { row: PreviewRow; participantId: string }[] = [];
  const claimed = new Map<string, number>();
  let discarded = 0;
  for (const row of rows) {
    const res = byRow.get(row.rowIndex);
    const action =
      res?.action ?? (row.status === "matched" && row.participantId !== null ? "link" : "discard");
    if (action === "discard") {
      discarded += 1;
      continue;
    }
    if (row.status === "invalid") {
      return { ok: false, error: `Row ${row.rowIndex} is invalid and can only be discarded.` };
    }
    const chosen = res ? (res.participantId ?? null) : row.participantId;
    if (chosen === null || chosen.trim() === "") {
      return { ok: false, error: `Row ${row.rowIndex}: choose a junior participant to link.` };
    }
    const participantId = canonical(chosen);
    if (participantId === null) {
      return {
        ok: false,
        error: `Row ${row.rowIndex}: that is not one of this club's junior participants.`,
      };
    }
    const earlier = claimed.get(participantId);
    if (earlier !== undefined) {
      return { ok: false, error: `Rows ${earlier} and ${row.rowIndex} are the same person.` };
    }
    claimed.set(participantId, row.rowIndex);
    planned.push({ row, participantId });
  }
  return { ok: true, planned, discarded };
}

export type JuniorProfileShirtNumbers = {
  shirtNumber: string | null;
  shirtNumbers: { season: number; number: string }[];
};

/**
 * A junior profile's `shirtNumber` (current season) and `shirtNumbers`
 * (numbered seasons, newest first) from register rows of the participant and
 * any duplicates merged into it; the participant's own entry wins a season.
 * Unnumbered seasons are dropped (R15).
 */
export function shapeJuniorShirtNumbers(
  rows: readonly { season: number; number: string | null; participantId: string }[],
  opts: { currentSeason: number; participantId: string },
): JuniorProfileShirtNumbers {
  const own = normaliseParticipantId(opts.participantId);
  const bySeason = new Map<number, { number: string; own: boolean }>();
  for (const r of rows) {
    if (r.number === null || r.number === "") continue;
    const isOwn = normaliseParticipantId(r.participantId) === own;
    const existing = bySeason.get(r.season);
    if (!existing || (!existing.own && isOwn)) {
      bySeason.set(r.season, { number: r.number, own: isOwn });
    }
  }
  const shirtNumbers = [...bySeason.entries()]
    .sort(([a], [b]) => b - a)
    .map(([season, v]) => ({ season, number: v.number }));
  return { shirtNumber: bySeason.get(opts.currentSeason)?.number ?? null, shirtNumbers };
}

// ── Database helpers ────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** A junior entry in the contract's `JuniorShirtNumberEntry` shape. */
export function serializeJuniorEntry(row: JuniorShirtNumberRow, duplicate: boolean) {
  return {
    id: row.id,
    season: row.season,
    participantId: row.participantId,
    name: row.name,
    number: row.number,
    source: row.source,
    duplicate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type JuniorEntry = ReturnType<typeof serializeJuniorEntry>;

export type JuniorWriteOutcome =
  | { ok: true; entry: JuniorEntry; warnings: ShirtNumberWarning[] }
  | { ok: false; status: 400 | 404 | 409; body: ShirtNumberConflict | { error: string } };

const conflict = (error: string, warnings: ShirtNumberWarning[] = []) => ({
  ok: false as const,
  status: 409 as const,
  body: { error, warnings },
});

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

const ALREADY_ON_REGISTER = (season: number) =>
  `This junior is already on the ${seasonLabel(season)} juniors register.`;

/** Distinct seasons with a juniors register, newest first. */
export async function juniorRegisterSeasons(tenantId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ season: juniorShirtNumbersTable.season })
    .from(juniorShirtNumbersTable)
    .where(eq(juniorShirtNumbersTable.tenantId, tenantId))
    .orderBy(desc(juniorShirtNumbersTable.season));
  return rows.map((r) => r.season);
}

/** The juniors register for a season, in the contract's entry shape. */
export async function listJuniorEntries(tenantId: number, season: number): Promise<JuniorEntry[]> {
  const rows = await db
    .select()
    .from(juniorShirtNumbersTable)
    .where(
      and(
        eq(juniorShirtNumbersTable.tenantId, tenantId),
        eq(juniorShirtNumbersTable.season, season),
      ),
    )
    .orderBy(asc(juniorShirtNumbersTable.name), asc(juniorShirtNumbersTable.id));
  const dupes = duplicateEntryIds(rows.map((r) => ({ ...r, playerId: null })));
  return rows.map((r) => serializeJuniorEntry(r, dupes.has(r.id)));
}

/** A tenant's junior participants and merge map, for matching and commit. */
export async function loadJuniorIdentity(
  executor: Executor,
  tenantId: number,
): Promise<{ participants: JuniorParticipantLike[]; merges: JuniorMergeLike[] }> {
  const [participants, merges] = await Promise.all([
    executor
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        isPrivate: juniorParticipantsTable.isPrivate,
      })
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.tenantId, tenantId)),
    executor
      .select({
        duplicateParticipantId: juniorParticipantMergesTable.duplicateParticipantId,
        keeperParticipantId: juniorParticipantMergesTable.keeperParticipantId,
      })
      .from(juniorParticipantMergesTable)
      .where(eq(juniorParticipantMergesTable.tenantId, tenantId)),
  ]);
  return { participants, merges };
}

/**
 * One of the tenant's junior participants by id (any casing), following a
 * merged-away duplicate to its keeper. The returned id is lowercased.
 */
export async function resolveJuniorParticipant(
  executor: Executor,
  tenantId: number,
  id: string,
): Promise<{ participantId: string; displayName: string | null } | null> {
  let cur = normaliseParticipantId(id);
  for (let hop = 0; cur !== null && hop <= MAX_MERGE_HOPS; hop++) {
    const [row] = await executor
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
      })
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, tenantId),
          sql`lower(${juniorParticipantsTable.participantId}) = ${cur}`,
        ),
      )
      .limit(1);
    if (row) return { participantId: cur, displayName: row.displayName };
    const [merge] = await executor
      .select({ keeper: juniorParticipantMergesTable.keeperParticipantId })
      .from(juniorParticipantMergesTable)
      .where(
        and(
          eq(juniorParticipantMergesTable.tenantId, tenantId),
          sql`lower(${juniorParticipantMergesTable.duplicateParticipantId}) = ${cur}`,
        ),
      )
      .limit(1);
    cur = normaliseParticipantId(merge?.keeper);
  }
  return null;
}

export type CreateJuniorInput = {
  season: number;
  /** A resolved (lowercased, canonical) junior participant id. */
  participantId: string;
  name: string;
  /** Omitted or null: apply carry-forward (KTD6). */
  number?: string | null;
  source?: ShirtNumberSource;
};

/**
 * Add a junior participant to a season's juniors register, with the same
 * duplicate and carry-forward rules as the senior register: an explicit
 * duplicate warns under `warn` and is refused (409) under `block`; no number
 * carries last season's under `carry`, left off under `block` when it clashes.
 */
export async function createJuniorEntry(
  tenantId: number,
  input: CreateJuniorInput,
  settings: ShirtNumberSettings,
): Promise<JuniorWriteOutcome> {
  const participantId = normaliseParticipantId(input.participantId)!;
  const name = cleanName(input.name);
  try {
    return await db.transaction(async (tx) => {
      const season = await loadSeasonEntries(tx, "junior", tenantId, input.season);
      if (season.some((e) => e.participantId === participantId)) {
        return conflict(ALREADY_ON_REGISTER(input.season));
      }
      const warnings: ShirtNumberWarning[] = [];
      let number: string | null;
      if (input.number != null) {
        number = input.number;
        const others = duplicatesOf(season, number);
        if (others.length > 0) {
          const warning = duplicateWarning(input.season, number, others);
          if (settings.duplicatePolicy === "block") return conflict(warning.message, [warning]);
          warnings.push(warning);
        }
      } else {
        const carried = await carriedNumberFor(tx, {
          tenantId,
          side: "junior",
          season: input.season,
          participantId,
          rolloverPolicy: settings.rolloverPolicy,
        });
        const applied = applyCarriedNumber(carried, season, settings.duplicatePolicy);
        number = applied.number;
        if (applied.blockedBy.length > 0 && carried !== null) {
          warnings.push(blockedCarryWarning(input.season, carried, name, applied.blockedBy));
        } else if (number !== null) {
          const others = duplicatesOf(season, number);
          if (others.length > 0) warnings.push(duplicateWarning(input.season, number, others));
        }
      }
      const [row] = await tx
        .insert(juniorShirtNumbersTable)
        .values({
          tenantId,
          season: input.season,
          participantId,
          name,
          number,
          source: input.source ?? "admin",
        })
        .returning();
      return {
        ok: true as const,
        entry: serializeJuniorEntry(row, warnings.length > 0 && number !== null),
        warnings,
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return conflict(ALREADY_ON_REGISTER(input.season));
    throw e;
  }
}

/**
 * Rename a junior entry, or assign, change or clear its number. A NEW number
 * someone else wears is refused under `block` and warned under `warn`;
 * re-saving an unchanged number never blocks.
 */
export async function updateJuniorEntry(
  tenantId: number,
  id: number,
  input: { name?: string; number?: string | null },
  settings: ShirtNumberSettings,
): Promise<JuniorWriteOutcome> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(juniorShirtNumbersTable)
      .where(
        and(eq(juniorShirtNumbersTable.tenantId, tenantId), eq(juniorShirtNumbersTable.id, id)),
      )
      .limit(1);
    if (!existing) {
      return { ok: false as const, status: 404 as const, body: { error: "Entry not found" } };
    }
    const patch: Partial<typeof juniorShirtNumbersTable.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = cleanName(input.name);
    if (input.number !== undefined) patch.number = input.number;

    const number = input.number !== undefined ? input.number : existing.number;
    const warnings: ShirtNumberWarning[] = [];
    if (number !== null) {
      const season = await loadSeasonEntries(tx, "junior", tenantId, existing.season);
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
      .update(juniorShirtNumbersTable)
      .set(patch)
      .where(
        and(eq(juniorShirtNumbersTable.tenantId, tenantId), eq(juniorShirtNumbersTable.id, id)),
      )
      .returning();
    return { ok: true as const, entry: serializeJuniorEntry(row, warnings.length > 0), warnings };
  });
}

/** Remove a junior entry; false when the tenant has no such entry. */
export async function deleteJuniorEntry(tenantId: number, id: number): Promise<boolean> {
  const [row] = await db
    .delete(juniorShirtNumbersTable)
    .where(and(eq(juniorShirtNumbersTable.tenantId, tenantId), eq(juniorShirtNumbersTable.id, id)))
    .returning({ id: juniorShirtNumbersTable.id });
  return row !== undefined;
}

/**
 * "Start season" for the juniors register (KTD6), the same plan as the senior
 * one: copy `season - 1` under `carry` (idempotent), nothing under `blank`;
 * clashing carried numbers are left off under `block` and reported.
 */
export async function startJuniorSeason(
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
    const previous = await loadSeasonEntries(tx, "junior", tenantId, fromSeason);
    const current = await loadSeasonEntries(tx, "junior", tenantId, season);
    const plan = planSeasonStart({
      previous,
      current,
      rolloverPolicy: settings.rolloverPolicy,
      duplicatePolicy: settings.duplicatePolicy,
    });
    result.skipped = plan.skipped;
    const values = plan.create.flatMap((c) =>
      c.participantId === null
        ? []
        : [
            {
              tenantId,
              season,
              participantId: c.participantId,
              name: c.name,
              number: c.number,
              source: c.source,
            },
          ],
    );
    if (values.length === 0) return result;

    const inserted = await tx.insert(juniorShirtNumbersTable).values(values).returning();
    result.created = inserted.length;
    result.numbered = inserted.filter((r) => r.number !== null).length;

    const after = await loadSeasonEntries(tx, "junior", tenantId, season);
    for (const b of plan.blocked) {
      result.warnings.push(
        blockedCarryWarning(season, b.number, b.name, duplicatesOf(after, b.number)),
      );
    }
    const reported = new Set<string>();
    for (const row of inserted) {
      if (row.number === null || reported.has(row.number)) continue;
      const others = duplicatesOf(after, row.number, row.id);
      if (others.length === 0) continue;
      reported.add(row.number);
      const holders = [{ ...row, playerId: null }, ...others];
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

const fail = (status: 400 | 404, error: string): CommitOutcome => ({
  ok: false,
  status,
  body: { error },
});

function payloadRows(payload: unknown): PreviewRow[] | null {
  const rows = (payload as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as PreviewRow[]) : null;
}

/**
 * Apply a pending juniors upload (R4, R5, R8, R11 for juniors). Each row links
 * to a junior participant (a matched row by default) or is discarded; a row
 * for someone already on the season's register updates that entry's number.
 * The duplicate and rollover policies apply exactly as on the senior side:
 * under `block` any row giving out a number someone else wears refuses the
 * whole commit; new entries without a number carry last season's under
 * `carry`. Idempotent per upload (locked, must be pending).
 */
export async function commitJuniorUpload(
  tenantId: number,
  uploadId: number,
  resolutions: readonly JuniorResolution[],
  settings: ShirtNumberSettings,
): Promise<CommitOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const [upload] = await tx
        .select()
        .from(shirtNumberUploadsTable)
        .where(
          and(
            eq(shirtNumberUploadsTable.id, uploadId),
            eq(shirtNumberUploadsTable.tenantId, tenantId),
            eq(shirtNumberUploadsTable.side, "junior"),
          ),
        )
        .for("update");
      if (!upload) return fail(404, "Upload not found");
      if (upload.status !== "pending") {
        return conflict(`This upload has already been ${upload.status}.`);
      }
      const rows = payloadRows(upload.payload);
      if (!rows) return conflict("This upload has no preview to apply.");

      const identity = await loadJuniorIdentity(tx, tenantId);
      const plan = resolveJuniorCommitRows(
        rows,
        resolutions,
        juniorCanonicalizer(identity.participants, identity.merges),
      );
      if (!plan.ok) return fail(400, plan.error);

      const season = upload.season;
      const entries = await tx
        .select()
        .from(juniorShirtNumbersTable)
        .where(
          and(
            eq(juniorShirtNumbersTable.tenantId, tenantId),
            eq(juniorShirtNumbersTable.season, season),
          ),
        )
        .orderBy(asc(juniorShirtNumbersTable.id));

      const planned = plan.planned.map((p, i) => ({
        ...p,
        existing: entries.find((e) => e.participantId === p.participantId),
        explicit: p.row.number,
        selfId: -(i + 1),
      }));
      type Planned = (typeof planned)[number];

      const after: RegisterEntryLike[] = entries.map((e) => ({
        id: e.id,
        name: e.name,
        number: e.number,
        playerId: null,
        participantId: e.participantId,
      }));
      const afterOf = (p: Planned) => after.find((e) => e.id === (p.existing?.id ?? p.selfId))!;
      for (const p of planned) {
        if (!p.existing) {
          after.push({
            id: p.selfId,
            name: cleanName(p.row.name),
            number: p.explicit,
            playerId: null,
            participantId: p.participantId,
          });
        } else if (p.explicit !== null) {
          afterOf(p).number = p.explicit;
        }
      }

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

      const warnings: ShirtNumberWarning[] = [];
      if (settings.rolloverPolicy === "carry") {
        const previous = await loadSeasonEntries(tx, "junior", tenantId, season - 1);
        for (const p of planned) {
          if (p.existing || p.explicit !== null) continue;
          const carried = previous.find((e) => e.participantId === p.participantId)?.number ?? null;
          const applied = applyCarriedNumber(carried, after, settings.duplicatePolicy);
          if (applied.blockedBy.length > 0 && carried !== null) {
            warnings.push(
              blockedCarryWarning(season, carried, cleanName(p.row.name), applied.blockedBy),
            );
          }
          afterOf(p).number = applied.number;
        }
      }

      const source: ShirtNumberSource = upload.kind === "registration" ? "registration" : "upload";
      let updated = 0;
      const touched = new Set<string>();
      const inserts: (typeof juniorShirtNumbersTable.$inferInsert)[] = [];
      const now = new Date();
      for (const p of planned) {
        const number = afterOf(p).number;
        if (!p.existing) {
          inserts.push({
            tenantId,
            season,
            participantId: p.participantId,
            name: cleanName(p.row.name),
            number,
            source,
          });
          if (number !== null) touched.add(number);
          continue;
        }
        if (number === p.existing.number) continue;
        if (number !== null) touched.add(number);
        await tx
          .update(juniorShirtNumbersTable)
          .set({ number, updatedAt: now })
          .where(
            and(
              eq(juniorShirtNumbersTable.tenantId, tenantId),
              eq(juniorShirtNumbersTable.id, p.existing.id),
            ),
          );
        updated += 1;
      }
      if (inserts.length > 0) await tx.insert(juniorShirtNumbersTable).values(inserts);

      if (touched.size > 0) {
        const final = await loadSeasonEntries(tx, "junior", tenantId, season);
        for (const number of touched) {
          const holders = duplicatesOf(final, number);
          if (holders.length < 2) continue;
          warnings.push(
            duplicateWarning(
              season,
              number,
              holders,
              `#${number} is worn by ${joinNames(holders.map((h) => h.name))} in ${seasonLabel(season)}.`,
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
        result: {
          uploadId: upload.id,
          created: inserts.length,
          updated,
          linked: planned.length,
          held: 0,
          discarded: plan.discarded,
          warnings,
        },
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return conflict("The register changed while this upload was applied. Try again.");
    }
    throw e;
  }
}

/**
 * The juniors register rows behind one junior profile: the participant's own
 * entries plus any left on duplicates merged into it. Tenant-scoped; reads
 * `junior_shirt_numbers` only.
 */
export async function loadJuniorProfileShirtNumbers(
  tenantId: number,
  participantId: string,
  currentSeason: number,
): Promise<JuniorProfileShirtNumbers> {
  const own = normaliseParticipantId(participantId);
  if (own === null) return { shirtNumber: null, shirtNumbers: [] };
  const dups = await db
    .select({ id: juniorParticipantMergesTable.duplicateParticipantId })
    .from(juniorParticipantMergesTable)
    .where(
      and(
        eq(juniorParticipantMergesTable.tenantId, tenantId),
        sql`lower(${juniorParticipantMergesTable.keeperParticipantId}) = ${own}`,
      ),
    );
  const ids = [own, ...dups.flatMap((d) => normaliseParticipantId(d.id) ?? [])];
  const rows = await db
    .select({
      season: juniorShirtNumbersTable.season,
      number: juniorShirtNumbersTable.number,
      participantId: juniorShirtNumbersTable.participantId,
    })
    .from(juniorShirtNumbersTable)
    .where(
      and(
        eq(juniorShirtNumbersTable.tenantId, tenantId),
        inArray(juniorShirtNumbersTable.participantId, ids),
      ),
    );
  return shapeJuniorShirtNumbers(rows, { currentSeason, participantId: own });
}
