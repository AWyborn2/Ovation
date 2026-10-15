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
import {
  carriedNumberFor,
  getShirtNumberSettings,
  normaliseParticipantId,
  shirtNumberNameKey,
  shirtNumberNamesAgree,
} from "@workspace/db/shirt-numbers";
import type { ShirtNumberSettings } from "@workspace/db/shirt-numbers";
import {
  applyCarriedNumber,
  blockedCarryWarning,
  cleanName,
  conflict,
  duplicateEntryIds,
  duplicateWarning,
  duplicatesOf,
  isUniqueViolation,
  joinNames,
  loadSeasonEntries,
  planSeasonStart,
  seasonLabel,
  type Executor,
  type RegisterEntryLike,
  type SeasonStartResult,
  type ShirtNumberConflict,
  type ShirtNumberWarning,
} from "./shirt-numbers";
import {
  buildPreviewRows,
  buildUploadRoster,
  crossRegisterNumberOf,
  fail,
  payloadRows,
  splitFullName,
  type CommitOutcome,
  type ParsedUploadRow,
  type PreviewRow,
  type RosterPerson,
  type UploadRoster,
} from "./shirt-number-upload";
import type { TeamListShirtNumbers } from "./engines/team-list";
import type { CrossRegisterNote } from "./shirt-number-upload";
import {
  crossRegisterNotes,
  juniorSeniorNumbers,
  loadSeniorCrossEntries,
} from "./shirt-number-cross";

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
 * ids resolved to the keeper) when its owner's name agrees with the sheet's,
 * then a unique exact name, then suggestions. A Profile ID whose owner has
 * another name is a `mismatch` (a family PlayHQ account), never linked
 * automatically. A valid PlayHQ id that is none of the club's juniors (and
 * whose name matches nobody uniquely) is `held` by that id: the player has not
 * arrived from PlayHQ yet.
 */
export function buildJuniorPreviewRows(
  parsed: readonly ParsedUploadRow[],
  participants: readonly JuniorParticipantLike[],
  merges: readonly JuniorMergeLike[],
  season: readonly RegisterEntryLike[],
): PreviewRow[] {
  const canonical = juniorCanonicalizer(participants, merges);
  const rows = parsed.map((p) => ({
    ...p,
    participantId: canonical(p.participantId) ?? normaliseParticipantId(p.participantId),
  }));
  return buildPreviewRows(rows, buildJuniorUploadRoster(participants), season, {
    holdUnknownIds: true,
  });
}

/** The contract's `JuniorShirtNumberRowResolution`. */
export type JuniorResolution = {
  rowIndex: number;
  action: "link" | "hold" | "discard";
  participantId?: string | null;
  /** Take the person's senior-register number (the row's `same` cross-register note). */
  useCrossRegisterNumber?: boolean;
};

/** One row's planned junior write: `held` rows wait for their player (by Profile ID). */
export type JuniorPlannedRow = {
  row: PreviewRow;
  participantId: string;
  held: boolean;
  /** The number the row sets explicitly, or null (keep / carry). */
  explicit: string | null;
};

export type JuniorCommitPlan =
  { ok: true; planned: JuniorPlannedRow[]; discarded: number } | { ok: false; error: string };

/**
 * Decide each previewed row's fate for a junior commit. A row links to a junior
 * participant, is held by its Profile ID (only a `held` row: that player is not
 * in the app yet), or is discarded. Rows without a resolution take their
 * default: `matched` links, `held` holds, a `mismatch` (its Profile ID belongs
 * to someone else) must be decided, every other row is discarded.
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

  const planned: JuniorPlannedRow[] = [];
  const claimed = new Map<string, number>();
  let discarded = 0;
  for (const row of rows) {
    const res = byRow.get(row.rowIndex);
    if (!res && row.status === "mismatch") {
      return {
        ok: false,
        error:
          `Row ${row.rowIndex}: its Profile ID belongs to ${row.idOwnerName ?? "someone else"}. ` +
          `Choose a junior or discard it.`,
      };
    }
    const action =
      res?.action ??
      (row.status === "matched" && row.participantId !== null
        ? "link"
        : row.status === "held" && row.participantId !== null
          ? "hold"
          : "discard");
    if (action === "discard") {
      discarded += 1;
      continue;
    }
    if (row.status === "invalid") {
      return { ok: false, error: `Row ${row.rowIndex} is invalid and can only be discarded.` };
    }

    let participantId: string | null;
    if (action === "hold") {
      // Only a row whose Profile ID is no junior of the club can wait for that player.
      if (row.status !== "held" || row.participantId === null) {
        return {
          ok: false,
          error: `Row ${row.rowIndex} can't be held: link it to a junior or discard it.`,
        };
      }
      participantId = normaliseParticipantId(row.participantId);
    } else {
      const chosen = res ? (res.participantId ?? null) : row.participantId;
      if (chosen === null || chosen.trim() === "") {
        return { ok: false, error: `Row ${row.rowIndex}: choose a junior participant to link.` };
      }
      participantId = canonical(chosen);
      if (participantId === null) {
        return {
          ok: false,
          error: `Row ${row.rowIndex}: that is not one of this club's junior participants.`,
        };
      }
    }

    let explicit = row.number;
    if (res?.useCrossRegisterNumber) {
      const cross = crossRegisterNumberOf(row);
      if (cross === null) {
        return { ok: false, error: `Row ${row.rowIndex} has no senior-register number to use.` };
      }
      explicit = cross;
    }

    const earlier = claimed.get(participantId!);
    if (earlier !== undefined) {
      return { ok: false, error: `Rows ${earlier} and ${row.rowIndex} are the same person.` };
    }
    claimed.set(participantId!, row.rowIndex);
    planned.push({ row, participantId: participantId!, held: action === "hold", explicit });
  }
  return { ok: true, planned, discarded };
}

/**
 * A junior season's numbers in the shape a team-list card reads (junior PlayHQ sync
 * plan U8, KTD13): by lowercased participant id only (`byPlayerId` stays empty —
 * juniors have no senior player ids). A merged-away duplicate selected on a team list
 * shows its keeper's number unless it carries its own. Only numbered entries count.
 */
export function buildJuniorTeamListShirtNumbers(
  entries: readonly { participantId: string | null; number: string | null }[],
  merges: readonly JuniorMergeLike[],
): TeamListShirtNumbers {
  const byParticipantId = new Map<string, string>();
  for (const e of entries) {
    const id = normaliseParticipantId(e.participantId);
    if (id !== null && e.number) byParticipantId.set(id, e.number);
  }
  for (const m of merges) {
    const dup = normaliseParticipantId(m.duplicateParticipantId);
    if (dup === null || byParticipantId.has(dup)) continue;
    // Follow the chain to the first numbered keeper.
    let cur = normaliseParticipantId(m.keeperParticipantId);
    for (let hop = 0; cur !== null && hop <= MAX_MERGE_HOPS; hop++) {
      const n = byParticipantId.get(cur);
      if (n) {
        byParticipantId.set(dup, n);
        break;
      }
      const next = merges.find((x) => normaliseParticipantId(x.duplicateParticipantId) === cur);
      cur = next ? normaliseParticipantId(next.keeperParticipantId) : null;
    }
  }
  return { byPlayerId: new Map(), byParticipantId };
}

export type JuniorProfileShirtNumbers = {
  shirtNumber: string | null;
  shirtNumbers: { season: number; number: string }[];
};

/**
 * A junior profile's `shirtNumber` (current season) and `shirtNumbers`
 * (numbered seasons, newest first) from register rows of the participant and
 * any duplicates merged into it; the participant's own entry wins a season.
 * Unnumbered seasons are dropped (R15), and so are seasons after the current
 * one: a number planned ahead is not worn yet (R14).
 */
export function shapeJuniorShirtNumbers(
  rows: readonly { season: number; number: string | null; participantId: string }[],
  opts: { currentSeason: number; participantId: string },
): JuniorProfileShirtNumbers {
  const own = normaliseParticipantId(opts.participantId);
  const bySeason = new Map<number, { number: string; own: boolean }>();
  for (const r of rows) {
    if (r.number === null || r.number === "") continue;
    if (r.season > opts.currentSeason) continue;
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

export type JuniorLinkStatus = "linked" | "waiting" | "nameMismatch";

export type JuniorRegisterLink = {
  linkStatus: JuniorLinkStatus;
  /** The participant's PlayHQ name, once they are one of the club's juniors. */
  playerName: string | null;
  /** A held entry's likely player: the one junior with the entry's exact name. */
  suggestedLink: { participantId: string; name: string } | null;
};

/**
 * How a register entry stands against the club's juniors (admin register view). Pure.
 * A live entry is `linked`. A held entry is `waiting` until its participant arrives
 * (the junior sync makes it live when the PlayHQ name agrees with the sheet's), and
 * `nameMismatch` when the participant arrived under another name — a family account's
 * id, for an admin to check. A held entry also gets a `suggestedLink` when exactly one
 * other, non-withheld junior has the entry's exact name and no live entry this season
 * (`liveOnRegister`, lowercased ids): offered for one-click confirmation, never applied.
 */
export function juniorRegisterLink(
  entry: { participantId: string; name: string; held: boolean },
  participants: readonly JuniorParticipantLike[],
  merges: readonly JuniorMergeLike[],
  liveOnRegister: ReadonlySet<string>,
): JuniorRegisterLink {
  const canonical = juniorCanonicalizer(participants, merges);
  const own = canonical(entry.participantId);
  const person =
    own === null
      ? undefined
      : participants.find((p) => normaliseParticipantId(p.participantId) === own);
  const playerName = person?.displayName ?? null;
  if (!entry.held) return { linkStatus: "linked", playerName, suggestedLink: null };

  const agrees = person !== undefined && shirtNumberNamesAgree(entry.name, playerName);
  const key = shirtNumberNameKey(entry.name);
  const sameName = participants.filter((p) => {
    const id = normaliseParticipantId(p.participantId);
    return (
      id !== null &&
      id !== own &&
      !p.isPrivate &&
      !liveOnRegister.has(id) &&
      key !== "" &&
      shirtNumberNameKey(p.displayName ?? "") === key
    );
  });
  return {
    linkStatus: person === undefined || agrees ? "waiting" : "nameMismatch",
    playerName,
    suggestedLink:
      sameName.length === 1
        ? {
            participantId: normaliseParticipantId(sameName[0]!.participantId)!,
            name: sameName[0]!.displayName ?? "",
          }
        : null,
  };
}

// ── Database helpers ────────────────────────────────────────────────────────

/** A junior entry in the contract's `JuniorShirtNumberEntry` shape. */
export function serializeJuniorEntry(
  row: JuniorShirtNumberRow,
  duplicate: boolean,
  link?: JuniorRegisterLink,
  crossRegister: CrossRegisterNote[] = [],
) {
  return {
    id: row.id,
    season: row.season,
    participantId: row.participantId,
    name: row.name,
    number: row.number,
    source: row.source,
    duplicate,
    linkStatus: link?.linkStatus ?? (row.held ? ("waiting" as const) : ("linked" as const)),
    playerName: link?.playerName ?? null,
    suggestedLink: link?.suggestedLink ?? null,
    crossRegister,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type JuniorEntry = ReturnType<typeof serializeJuniorEntry>;

export type JuniorWriteOutcome =
  | { ok: true; entry: JuniorEntry; warnings: ShirtNumberWarning[] }
  | { ok: false; status: 400 | 404 | 409; body: ShirtNumberConflict | { error: string } };

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

/**
 * The juniors register for a season, in the contract's entry shape (admin only): each
 * entry's link status against the club's juniors, and the admin-only cross-check
 * against the senior register (read-only, this tenant and season). Also the senior
 * numbers of the club's juniors, to prefill the add form.
 */
export async function listJuniorEntries(
  tenantId: number,
  season: number,
): Promise<{ entries: JuniorEntry[]; seniorNumbers: { participantId: string; number: string }[] }> {
  const [rows, identity, senior] = await Promise.all([
    db
      .select()
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, tenantId),
          eq(juniorShirtNumbersTable.season, season),
        ),
      )
      .orderBy(asc(juniorShirtNumbersTable.name), asc(juniorShirtNumbersTable.id)),
    loadJuniorIdentity(db, tenantId),
    loadSeniorCrossEntries(tenantId, season),
  ]);
  const dupes = duplicateEntryIds(rows.map((r) => ({ ...r, playerId: null })));
  const live = new Set(
    rows.filter((r) => !r.held).flatMap((r) => normaliseParticipantId(r.participantId) ?? []),
  );
  const entries = rows.map((r) =>
    serializeJuniorEntry(
      r,
      dupes.has(r.id),
      juniorRegisterLink(r, identity.participants, identity.merges, live),
      crossRegisterNotes({ ids: [r.participantId], name: r.name }, senior),
    ),
  );
  return { entries, seniorNumbers: juniorSeniorNumbers(identity.participants, senior) };
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
  input: { name?: string; number?: string | null; participantId?: string },
  settings: ShirtNumberSettings,
): Promise<JuniorWriteOutcome> {
  try {
    return await updateJuniorEntryTx(tenantId, id, input, settings);
  } catch (e) {
    if (isUniqueViolation(e)) return conflict("That junior is already on this season's register.");
    throw e;
  }
}

async function updateJuniorEntryTx(
  tenantId: number,
  id: number,
  input: { name?: string; number?: string | null; participantId?: string },
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
    if (input.participantId !== undefined) {
      // Link (or confirm) the entry: the participant must be one of the club's juniors.
      const participant = await resolveJuniorParticipant(tx, tenantId, input.participantId);
      if (!participant) {
        return {
          ok: false as const,
          status: 400 as const,
          body: { error: "That is not one of this club's junior participants." },
        };
      }
      if (participant.participantId !== existing.participantId) {
        const [other] = await tx
          .select({ id: juniorShirtNumbersTable.id })
          .from(juniorShirtNumbersTable)
          .where(
            and(
              eq(juniorShirtNumbersTable.tenantId, tenantId),
              eq(juniorShirtNumbersTable.season, existing.season),
              eq(juniorShirtNumbersTable.participantId, participant.participantId),
            ),
          )
          .limit(1);
        if (other) return conflict(ALREADY_ON_REGISTER(existing.season));
        patch.participantId = participant.participantId;
      }
      patch.held = false;
    }

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
    // An entry still waiting for its player stays held in the new season.
    const heldBefore = new Set(
      (
        await tx
          .select({ participantId: juniorShirtNumbersTable.participantId })
          .from(juniorShirtNumbersTable)
          .where(
            and(
              eq(juniorShirtNumbersTable.tenantId, tenantId),
              eq(juniorShirtNumbersTable.season, fromSeason),
              eq(juniorShirtNumbersTable.held, true),
            ),
          )
      ).map((r) => r.participantId),
    );
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
              held: heldBefore.has(c.participantId),
            },
          ],
    );
    if (values.length === 0) return result;

    // A participant added since the read above keeps that row: skip them rather
    // than fail the whole start, and count only the rows actually created.
    const inserted = await tx
      .insert(juniorShirtNumbersTable)
      .values(values)
      .onConflictDoNothing()
      .returning();
    result.created = inserted.length;
    result.skipped += values.length - inserted.length;
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

      const source: ShirtNumberSource = "upload";
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
            held: p.held,
          });
          if (number !== null) touched.add(number);
          continue;
        }
        // Linking confirms a held entry; holding never un-confirms a live one.
        const confirm = !p.held && p.existing.held;
        if (number === p.existing.number && !confirm) continue;
        if (number !== null && number !== p.existing.number) touched.add(number);
        await tx
          .update(juniorShirtNumbersTable)
          .set({ number, updatedAt: now, ...(confirm ? { held: false } : {}) })
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
          linked: planned.filter((p) => !p.held).length,
          held: planned.filter((p) => p.held).length,
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
  // Held entries (waiting for their player, or a name to check) are never public.
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
        eq(juniorShirtNumbersTable.held, false),
      ),
    );
  return shapeJuniorShirtNumbers(rows, { currentSeason, participantId: own });
}

/**
 * One junior season's register as a team-list card reads it (junior PlayHQ sync plan
 * U8, KTD13): every numbered entry by participant, merged-away duplicates following
 * their keeper. Null when the club has shirt numbers switched off, so the card carries
 * no numbering at all (as on senior cards). Tenant-scoped; reads `junior_shirt_numbers`
 * and the junior merge map only. Throws on a failed read; the caller decides.
 */
export async function loadJuniorSeasonShirtNumbers(
  tenantId: number,
  season: number,
): Promise<TeamListShirtNumbers | null> {
  if (!(await getShirtNumberSettings(db, tenantId)).enabled) return null;
  const [entries, merges] = await Promise.all([
    db
      .select({
        participantId: juniorShirtNumbersTable.participantId,
        number: juniorShirtNumbersTable.number,
      })
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, tenantId),
          eq(juniorShirtNumbersTable.season, season),
          // A held number is not live until its player arrives under the sheet's name.
          eq(juniorShirtNumbersTable.held, false),
        ),
      ),
    db
      .select({
        duplicateParticipantId: juniorParticipantMergesTable.duplicateParticipantId,
        keeperParticipantId: juniorParticipantMergesTable.keeperParticipantId,
      })
      .from(juniorParticipantMergesTable)
      .where(eq(juniorParticipantMergesTable.tenantId, tenantId)),
  ]);
  return buildJuniorTeamListShirtNumbers(entries, merges);
}
