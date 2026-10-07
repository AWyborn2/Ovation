import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  juniorShirtNumbersTable,
  playerIdMapTable,
  shirtNumbersTable,
  squadMembersTable,
  type ShirtNumberDuplicatePolicy,
  type ShirtNumberRolloverPolicy,
  type SquadSection,
} from "@workspace/db";
import {
  normaliseParticipantId,
  shirtNumberNameKey,
  type ShirtNumberSettings,
} from "@workspace/db/shirt-numbers";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { playersOutsideTenantSpace } from "./curated-player-space";
import {
  blockedCarryWarning,
  cleanName,
  duplicateWarning,
  duplicatesOf,
  joinNames,
  loadSeasonEntries,
  samePerson,
  seasonLabel,
  type RegisterEntryLike,
  type RegisterIdentity,
  type ShirtNumberWarning,
} from "./shirt-numbers";
import {
  juniorCanonicalizer,
  loadJuniorIdentity,
  type JuniorMergeLike,
  type JuniorParticipantLike,
} from "./junior-shirt-numbers";

/**
 * "Add squad to register" (docs/plans/2026-10-06-001-feat-season-shirt-numbers-
 * plan.md, R5, U4, U10). The club has ONE PlayHQ import — the squad import into
 * `squad_members` (availability plan). This adds that squad's active members to
 * a season's shirt-number register without numbers of their own: a returning
 * player carries last season's number under the `carry` rollover policy, and
 * under `block` a carried number someone already wears is left off.
 *
 * Identity. The squad's PlayHQ `Profile ID` is assumed, but NOT verified, to be
 * the participant GUID used by lineups, `player_id_map` and
 * `junior_participants` (availability plan, Assumptions). So a profile id is
 * never stored as a participant id:
 *
 * - Seniors take `playerId` from the member's `linked_player_id` (checked
 *   against the tenant's player space, fill-ins never linked) and the
 *   participant id only from that player's own `player_id_map` row. An unlinked
 *   member becomes a held, name-only entry.
 * - Juniors need one of the club's junior participants: the profile id is
 *   looked up as a participant id (a hit is the participant itself; a miss
 *   stores nothing), else a unique exact normalised name. Anyone else is
 *   reported as unmatched and not created.
 *
 * Idempotent: a person already on the season's register (same player id,
 * participant id, or — for seniors — a unique name-only held entry) is left as
 * it is, number unchanged. Senior members only ever reach `shirt_numbers` and
 * junior members only `junior_shirt_numbers` (juniors isolation); everything is
 * scoped to one tenant and nothing touches the central database.
 */

// ── Pure planning ───────────────────────────────────────────────────────────

/** The `squad_members` fields the planning needs. */
export type SquadMemberLike = {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  playhqProfileId: string | null;
  linkedPlayerId: number | null;
  isPrivate: boolean;
};

export type SquadPlannedEntry = {
  name: string;
  /** Senior only; always null for juniors. */
  playerId: number | null;
  participantId: string | null;
  number: string | null;
};

export type SquadAddPlan = {
  create: SquadPlannedEntry[];
  /** Members already on the season's register (or repeated in this run). */
  skipped: number;
  /** Juniors only: members matching none of the club's junior participants. */
  unmatched: string[];
  /** Carried numbers left off under the `block` policy. */
  blocked: { name: string; number: string }[];
};

/** A member's register name: first and last name, trimmed and capped. */
export function squadMemberName(m: Pick<SquadMemberLike, "firstName" | "lastName">): string {
  return cleanName(`${m.firstName} ${m.lastName}`);
}

/** The name keys a member is recognised by: first or preferred name plus last name. */
function memberKeys(m: SquadMemberLike): string[] {
  const keys = new Set([shirtNumberNameKey(`${m.firstName} ${m.lastName}`)]);
  if (m.preferredName) keys.add(shirtNumberNameKey(`${m.preferredName} ${m.lastName}`));
  return [...keys].filter(Boolean);
}

type Present = RegisterIdentity & { name: string; number: string | null };

/**
 * Last season's number for a person (the {@link carriedNumberFor} rule over an
 * injected register): by player id or participant id, preferring the entry
 * linked to the player. Name-only people never carry.
 */
function carriedFrom(previous: readonly RegisterEntryLike[], who: RegisterIdentity) {
  if (who.playerId === null && who.participantId === null) return null;
  const hits = previous.filter((e) => samePerson(who, e));
  const linked = who.playerId !== null ? hits.find((e) => e.playerId === who.playerId) : undefined;
  return (linked ?? hits[0])?.number ?? null;
}

type CommonArgs = {
  current: readonly RegisterEntryLike[];
  /** Last season's register (`season - 1`) for carry-forward. */
  previous: readonly RegisterEntryLike[];
  rolloverPolicy: ShirtNumberRolloverPolicy;
  duplicatePolicy: ShirtNumberDuplicatePolicy;
};

/** Build the plan once each member's identity and "already present" verdict are known. */
function plan(
  args: CommonArgs,
  people: Iterable<
    | { kind: "unmatched"; name: string }
    | { kind: "person"; name: string; who: RegisterIdentity; present: (p: Present[]) => boolean }
  >,
): SquadAddPlan {
  const out: SquadAddPlan = { create: [], skipped: 0, unmatched: [], blocked: [] };
  const present: Present[] = [...args.current];
  const taken = new Set<string>();
  for (const e of args.current) if (e.number !== null) taken.add(e.number);

  for (const p of people) {
    if (p.kind === "unmatched") {
      out.unmatched.push(p.name);
      continue;
    }
    if (p.present(present)) {
      out.skipped += 1;
      continue;
    }
    let number = args.rolloverPolicy === "carry" ? carriedFrom(args.previous, p.who) : null;
    if (number !== null && args.duplicatePolicy === "block" && taken.has(number)) {
      out.blocked.push({ name: p.name, number });
      number = null;
    }
    if (number !== null) taken.add(number);
    const created: SquadPlannedEntry = { name: p.name, ...p.who, number };
    out.create.push(created);
    present.push(created);
  }
  return out;
}

/**
 * Plan adding the senior squad to a season's senior register.
 *
 * `linkable` holds the member player ids that are in the tenant's player space,
 * each with its crosswalk participant GUID (or null); a linked id missing from
 * it — or a fill-in id — is dropped and the member held by name.
 */
export function planSeniorSquadAdd(
  args: CommonArgs & {
    members: readonly SquadMemberLike[];
    linkable: ReadonlyMap<number, string | null>;
  },
): SquadAddPlan {
  const people = args.members.map((m) => {
    const name = squadMemberName(m);
    const id = m.linkedPlayerId;
    const playerId = id !== null && id < FILL_IN_THRESHOLD && args.linkable.has(id) ? id : null;
    const who: RegisterIdentity = {
      playerId,
      participantId:
        playerId === null ? null : normaliseParticipantId(args.linkable.get(playerId) ?? null),
    };
    const keys = memberKeys(m);
    const present = (season: Present[]) => {
      if (who.playerId === null && who.participantId === null) {
        // An unlinked member: any entry under the same name is taken to be them.
        return season.some((e) => keys.includes(shirtNumberNameKey(e.name)));
      }
      if (season.some((e) => samePerson(who, e))) return true;
      // A linked member held earlier by name only: exactly one such entry.
      const held = season.filter(
        (e) =>
          e.playerId === null &&
          e.participantId === null &&
          keys.includes(shirtNumberNameKey(e.name)),
      );
      return held.length === 1;
    };
    return { kind: "person" as const, name, who, present };
  });
  return plan(args, people);
}

/**
 * Plan adding the junior squad to a season's juniors register. Each member
 * must resolve to one of the club's junior participants (merged-away ids
 * followed to the keeper): by profile id when it is one, else by a unique
 * exact normalised name among non-private participants. The rest are
 * reported in `unmatched`.
 */
export function planJuniorSquadAdd(
  args: CommonArgs & {
    members: readonly SquadMemberLike[];
    participants: readonly JuniorParticipantLike[];
    merges: readonly JuniorMergeLike[];
  },
): SquadAddPlan {
  const canonical = juniorCanonicalizer(args.participants, args.merges);
  const byName = new Map<string, Set<string>>();
  for (const p of args.participants) {
    if (p.isPrivate || !p.displayName) continue;
    const id = canonical(p.participantId);
    const key = shirtNumberNameKey(p.displayName);
    if (!id || !key) continue;
    if (!byName.has(key)) byName.set(key, new Set());
    byName.get(key)!.add(id);
  }

  const people = args.members.map((m) => {
    const name = squadMemberName(m);
    let participantId = canonical(m.playhqProfileId);
    if (participantId === null) {
      const hits = new Set<string>();
      for (const k of memberKeys(m)) for (const id of byName.get(k) ?? []) hits.add(id);
      if (hits.size === 1) participantId = [...hits][0]!;
    }
    if (participantId === null) return { kind: "unmatched" as const, name };
    const who: RegisterIdentity = { playerId: null, participantId };
    const present = (season: Present[]) => season.some((e) => e.participantId === participantId);
    return { kind: "person" as const, name, who, present };
  });
  return plan(args, people);
}

// ── Database ────────────────────────────────────────────────────────────────

export type SquadAddResult = {
  season: number;
  created: number;
  skipped: number;
  unmatched: string[];
  warnings: ShirtNumberWarning[];
};

/** The tenant's active squad members of one section. */
async function loadSquad(tenantId: number, section: SquadSection): Promise<SquadMemberLike[]> {
  return db
    .select({
      firstName: squadMembersTable.firstName,
      lastName: squadMembersTable.lastName,
      preferredName: squadMembersTable.preferredName,
      playhqProfileId: squadMembersTable.playhqProfileId,
      linkedPlayerId: squadMembersTable.linkedPlayerId,
      isPrivate: squadMembersTable.isPrivate,
    })
    .from(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.tenantId, tenantId),
        eq(squadMembersTable.section, section),
        eq(squadMembersTable.active, true),
      ),
    )
    .orderBy(squadMembersTable.lastName, squadMembersTable.firstName, squadMembersTable.id);
}

/**
 * The squad's linked player ids that are in the tenant's player space (below
 * the fill-in range), each with its crosswalk participant GUID. Synthetic
 * club-local keys (`club:<uuid>`) are not PlayHQ GUIDs and are left off.
 */
async function loadLinkable(
  tenantId: number,
  members: readonly SquadMemberLike[],
): Promise<Map<number, string | null>> {
  const ids = [
    ...new Set(
      members.flatMap((m) =>
        m.linkedPlayerId !== null && m.linkedPlayerId > 0 && m.linkedPlayerId < FILL_IN_THRESHOLD
          ? [m.linkedPlayerId]
          : [],
      ),
    ),
  ];
  const linkable = new Map<number, string | null>();
  if (ids.length === 0) return linkable;
  const outside = new Set(await playersOutsideTenantSpace(tenantId, ids));
  const inside = ids.filter((id) => !outside.has(id));
  for (const id of inside) linkable.set(id, null);
  if (inside.length === 0) return linkable;
  const rows = await db
    .select({ playerId: playerIdMapTable.playerId, participantId: playerIdMapTable.participantId })
    .from(playerIdMapTable)
    .where(
      and(eq(playerIdMapTable.tenantId, tenantId), inArray(playerIdMapTable.playerId, inside)),
    );
  for (const r of rows) {
    if (!r.participantId.startsWith("club:")) linkable.set(r.playerId, r.participantId);
  }
  return linkable;
}

/**
 * The warnings for an add: each carried number left off under `block`, and —
 * under `warn` — one notice per number a new entry now shares.
 */
function addWarnings(
  season: number,
  blocked: SquadAddPlan["blocked"],
  inserted: readonly RegisterEntryLike[],
  after: readonly RegisterEntryLike[],
): ShirtNumberWarning[] {
  const warnings = blocked.map((b) =>
    blockedCarryWarning(season, b.number, b.name, duplicatesOf(after, b.number)),
  );
  const reported = new Set<string>();
  for (const row of inserted) {
    if (row.number === null || reported.has(row.number)) continue;
    const others = duplicatesOf(after, row.number, row.id);
    if (others.length === 0) continue;
    reported.add(row.number);
    const holders = [row, ...others];
    warnings.push(
      duplicateWarning(
        season,
        row.number,
        holders,
        `#${row.number} is worn by ${joinNames(holders.map((h) => h.name))} in ${seasonLabel(season)}.`,
      ),
    );
  }
  return warnings;
}

/** "Add squad to register" for the senior register: active senior squad members only. */
export async function addSquadToSeniorRegister(
  tenantId: number,
  season: number,
  settings: ShirtNumberSettings,
): Promise<SquadAddResult> {
  const members = await loadSquad(tenantId, "senior");
  const linkable = await loadLinkable(tenantId, members);
  return db.transaction(async (tx) => {
    const current = await loadSeasonEntries(tx, "senior", tenantId, season);
    const previous = await loadSeasonEntries(tx, "senior", tenantId, season - 1);
    const p = planSeniorSquadAdd({
      members,
      linkable,
      current,
      previous,
      rolloverPolicy: settings.rolloverPolicy,
      duplicatePolicy: settings.duplicatePolicy,
    });
    const result: SquadAddResult = {
      season,
      created: 0,
      skipped: p.skipped,
      unmatched: p.unmatched,
      warnings: [],
    };
    if (p.create.length === 0) return result;
    // Someone the lineup sync or an admin added since the read above keeps
    // that row (per-person unique indexes): count them as skipped.
    const inserted = await tx
      .insert(shirtNumbersTable)
      .values(p.create.map((c) => ({ ...c, tenantId, season, source: "squad" as const })))
      .onConflictDoNothing()
      .returning();
    result.created = inserted.length;
    result.skipped += p.create.length - inserted.length;
    const after = await loadSeasonEntries(tx, "senior", tenantId, season);
    result.warnings = addWarnings(season, p.blocked, inserted, after);
    return result;
  });
}

/**
 * "Add squad to register" for the juniors register: active junior squad
 * members matched to the club's junior participants only.
 */
export async function addSquadToJuniorRegister(
  tenantId: number,
  season: number,
  settings: ShirtNumberSettings,
): Promise<SquadAddResult> {
  const members = await loadSquad(tenantId, "junior");
  const identity = await loadJuniorIdentity(db, tenantId);
  return db.transaction(async (tx) => {
    const current = await loadSeasonEntries(tx, "junior", tenantId, season);
    const previous = await loadSeasonEntries(tx, "junior", tenantId, season - 1);
    const p = planJuniorSquadAdd({
      members,
      participants: identity.participants,
      merges: identity.merges,
      current,
      previous,
      rolloverPolicy: settings.rolloverPolicy,
      duplicatePolicy: settings.duplicatePolicy,
    });
    const result: SquadAddResult = {
      season,
      created: 0,
      skipped: p.skipped,
      unmatched: p.unmatched,
      warnings: [],
    };
    const values = p.create.flatMap((c) =>
      c.participantId === null
        ? []
        : [
            {
              tenantId,
              season,
              participantId: c.participantId,
              name: c.name,
              number: c.number,
              source: "squad" as const,
            },
          ],
    );
    if (values.length === 0) return result;
    const inserted = await tx
      .insert(juniorShirtNumbersTable)
      .values(values)
      .onConflictDoNothing()
      .returning();
    result.created = inserted.length;
    result.skipped += values.length - inserted.length;
    const after = await loadSeasonEntries(tx, "junior", tenantId, season);
    result.warnings = addWarnings(
      season,
      p.blocked,
      inserted.map((r) => ({ ...r, playerId: null })),
      after,
    );
    return result;
  });
}
