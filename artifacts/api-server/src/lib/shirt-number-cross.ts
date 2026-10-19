import { and, eq } from "drizzle-orm";
import {
  db,
  juniorShirtNumbersTable,
  shirtNumbersTable,
  type ShirtNumberCategory,
} from "@workspace/db";
import {
  normaliseParticipantId,
  shirtNumberNameKey,
  shirtNumberNamesAgree,
} from "@workspace/db/shirt-numbers";
import { loadClubIdentity } from "./club-overlay";
import type { CrossRegisterNote, PreviewRow } from "./shirt-number-upload";

/**
 * The senior / juniors shirt-number cross-check (admin only).
 *
 * A junior who also plays seniors usually has the same PlayHQ Profile ID in both
 * registers. The two registers stay independent (separate tables, numbers may
 * legitimately differ, stats never blended); this module only READS the other
 * register so an admin can see, on an upload preview or the register table, what the
 * same person wears there. A Profile ID alone is never trusted: a family's PlayHQ
 * account can put a parent's or a brother's id on a child's row, so a note says
 * `same` only when the id AND the name agree (shirtNumberNamesAgree). Same id with
 * another name is `sharedId` (a family account?); the same exact name under another
 * id is `nameOnly`, information only.
 *
 * Callers are the admin register and upload routes only. Every read is scoped to the
 * request's tenant and season; nothing here is ever written or shown publicly.
 */

/** One entry of the other register: its Profile IDs (any casing), name and number. */
export type CrossEntry = {
  ids: readonly (string | null | undefined)[];
  name: string;
  number: string | null;
};

const idSet = (ids: readonly (string | null | undefined)[]) =>
  new Set(ids.flatMap((id) => normaliseParticipantId(id) ?? []));

/** Notes relating one person (their ids and name) to the other register's entries. Pure. */
export function crossRegisterNotes(
  person: { ids: readonly (string | null | undefined)[]; name: string },
  others: readonly CrossEntry[],
): CrossRegisterNote[] {
  const mine = idSet(person.ids);
  const byId: CrossRegisterNote[] = [];
  const unshared: CrossEntry[] = [];
  for (const o of others) {
    const shares = [...idSet(o.ids)].some((id) => mine.has(id));
    if (!shares) {
      unshared.push(o);
      continue;
    }
    byId.push({
      relation: shirtNumberNamesAgree(person.name, o.name) ? "same" : "sharedId",
      name: o.name,
      number: o.number,
    });
  }
  byId.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === "same" ? -1 : 1));
  // The same exact name under another id: offered only when it is one person.
  const key = shirtNumberNameKey(person.name);
  const sameName =
    key === "" || byId.some((n) => n.relation === "same")
      ? []
      : unshared.filter((o) => shirtNumberNameKey(o.name) === key);
  const nameOnly: CrossRegisterNote[] =
    sameName.length === 1
      ? [{ relation: "nameOnly", name: sameName[0]!.name, number: sameName[0]!.number }]
      : [];
  return [...byId, ...nameOnly];
}

/**
 * Upload preview rows with their cross-register notes. `idsOf` gives the Profile IDs a
 * row stands for (the sheet's, the matched person's). Invalid rows get none. Pure.
 */
export function annotateCrossRegister(
  rows: readonly PreviewRow[],
  others: readonly CrossEntry[],
  idsOf: (row: PreviewRow) => readonly (string | null | undefined)[],
): PreviewRow[] {
  return rows.map((row) => ({
    ...row,
    crossRegister:
      row.status === "invalid"
        ? []
        : crossRegisterNotes({ ids: idsOf(row), name: row.name }, others),
  }));
}

/**
 * The senior numbers that prefill a junior's number in the add form: a junior whose
 * Profile ID and PlayHQ name agree with a numbered senior entry. Pure.
 */
export function juniorSeniorNumbers(
  participants: readonly { participantId: string; displayName: string | null }[],
  senior: readonly CrossEntry[],
): { participantId: string; number: string }[] {
  const out: { participantId: string; number: string }[] = [];
  for (const p of participants) {
    const id = normaliseParticipantId(p.participantId);
    if (id === null || !p.displayName) continue;
    const same = crossRegisterNotes({ ids: [id], name: p.displayName }, senior).find(
      (n) => n.relation === "same" && n.number !== null,
    );
    if (same) out.push({ participantId: id, number: same.number! });
  }
  return out;
}

// ── Reads (tenant-scoped, read-only) ────────────────────────────────────────

/**
 * The tenant's senior Profile IDs by player id (the crosswalk, merges folded), so a
 * senior entry linked by player id is still found by the GUID a junior carries.
 */
export async function seniorGuidsByPlayer(tenantId: number): Promise<Map<number, string[]>> {
  const identity = await loadClubIdentity(tenantId);
  const out = new Map<number, string[]>();
  for (const [guid, id] of identity.intByGuid) {
    const key = normaliseParticipantId(guid);
    if (key === null) continue;
    const list = out.get(id) ?? [];
    list.push(key);
    out.set(id, list);
  }
  return out;
}

/** The senior register for a season as cross entries (ids: its participant + the player's GUIDs). */
export async function loadSeniorCrossEntries(
  tenantId: number,
  season: number,
  guidsByPlayer?: ReadonlyMap<number, readonly string[]>,
): Promise<CrossEntry[]> {
  const rows = await db
    .select({
      name: shirtNumbersTable.name,
      number: shirtNumbersTable.number,
      participantId: shirtNumbersTable.participantId,
      playerId: shirtNumbersTable.playerId,
    })
    .from(shirtNumbersTable)
    .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season)));
  if (rows.length === 0) return [];
  const guids = guidsByPlayer ?? (await seniorGuidsByPlayer(tenantId));
  return rows.map((r) => ({
    ids: [r.participantId, ...(r.playerId !== null ? (guids.get(r.playerId) ?? []) : [])],
    name: r.name,
    number: r.number,
  }));
}

/** The juniors register for a season as cross entries. */
export async function loadJuniorCrossEntries(
  tenantId: number,
  season: number,
): Promise<CrossEntry[]> {
  const rows = await db
    .select({
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
    );
  return rows.map((r) => ({ ids: [r.participantId], name: r.name, number: r.number }));
}

// ── Register overlap (People → Shirt numbers "Also in" badges) ──────────────

/** A register a person can be on in a season. */
export type RegisterName = ShirtNumberCategory | "juniors";

const REGISTER_ORDER: readonly RegisterName[] = ["men", "female", "juniors"];

/** A senior entry as the overlap sees it: its ids (participant + the player's GUIDs). */
export type OverlapSeniorEntry = {
  id: number;
  category: ShirtNumberCategory;
  name: string;
  playerId: number | null;
  participantId: string | null;
  ids: readonly (string | null | undefined)[];
};

export type OverlapJuniorEntry = { id: number; name: string; participantId: string };

export type RegisterOverlapPerson = {
  registers: RegisterName[];
  seniorEntryIds: number[];
  juniorEntryIds: number[];
};

const nameOnlyKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The people on two or more registers in a season (pure). Two senior entries in
 * different categories are one person by player id or participant id (by the same name
 * when neither has an id), the rule the register's `alsoIn` uses. A senior and a junior
 * entry are one person only when a Profile ID is shared AND the names agree
 * (shirtNumberNamesAgree), as in the cross-register notes. Flags only: no numbers.
 */
export function registerOverlap(
  senior: readonly OverlapSeniorEntry[],
  junior: readonly OverlapJuniorEntry[],
): RegisterOverlapPerson[] {
  // Union-find over every entry: senior i is node i, junior j is node senior.length + j.
  const parent = [...Array(senior.length + junior.length).keys()];
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!;
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < senior.length; i++) {
    const a = senior[i]!;
    for (let k = i + 1; k < senior.length; k++) {
      const b = senior[k]!;
      if (a.category === b.category) continue;
      const aIdLess = a.playerId === null && a.participantId === null;
      const bIdLess = b.playerId === null && b.participantId === null;
      const same =
        aIdLess || bIdLess
          ? aIdLess && bIdLess && nameOnlyKey(a.name) === nameOnlyKey(b.name)
          : (a.playerId !== null && a.playerId === b.playerId) ||
            (a.participantId !== null && a.participantId === b.participantId);
      if (same) union(i, k);
    }
  }
  const juniorsById = new Map<string, number[]>();
  junior.forEach((j, idx) => {
    const id = normaliseParticipantId(j.participantId);
    if (id === null) return;
    juniorsById.set(id, [...(juniorsById.get(id) ?? []), idx]);
  });
  senior.forEach((s, i) => {
    for (const id of idSet(s.ids)) {
      for (const idx of juniorsById.get(id) ?? []) {
        if (shirtNumberNamesAgree(s.name, junior[idx]!.name)) union(i, senior.length + idx);
      }
    }
  });

  const groups = new Map<number, RegisterOverlapPerson & { seen: Set<RegisterName> }>();
  const groupOf = (node: number) => {
    const root = find(node);
    let g = groups.get(root);
    if (!g) {
      g = { registers: [], seniorEntryIds: [], juniorEntryIds: [], seen: new Set() };
      groups.set(root, g);
    }
    return g;
  };
  senior.forEach((s, i) => {
    const g = groupOf(i);
    g.seen.add(s.category);
    g.seniorEntryIds.push(s.id);
  });
  junior.forEach((j, idx) => {
    const g = groupOf(senior.length + idx);
    g.seen.add("juniors");
    g.juniorEntryIds.push(j.id);
  });
  return [...groups.values()]
    .filter((g) => g.seen.size > 1)
    .map(({ seen, seniorEntryIds, juniorEntryIds }) => ({
      registers: REGISTER_ORDER.filter((r) => seen.has(r)),
      seniorEntryIds,
      juniorEntryIds,
    }));
}

/**
 * The register overlap for one tenant and season (admin only): reads both registers of
 * this tenant only and returns flags and entry ids, never numbers or stats. Served under
 * /api/juniors/* (the juniors isolation rule).
 */
export async function loadRegisterOverlap(
  tenantId: number,
  season: number,
): Promise<RegisterOverlapPerson[]> {
  const [seniorRows, juniorRows] = await Promise.all([
    db
      .select({
        id: shirtNumbersTable.id,
        category: shirtNumbersTable.category,
        name: shirtNumbersTable.name,
        playerId: shirtNumbersTable.playerId,
        participantId: shirtNumbersTable.participantId,
      })
      .from(shirtNumbersTable)
      .where(and(eq(shirtNumbersTable.tenantId, tenantId), eq(shirtNumbersTable.season, season))),
    db
      .select({
        id: juniorShirtNumbersTable.id,
        name: juniorShirtNumbersTable.name,
        participantId: juniorShirtNumbersTable.participantId,
      })
      .from(juniorShirtNumbersTable)
      .where(
        and(
          eq(juniorShirtNumbersTable.tenantId, tenantId),
          eq(juniorShirtNumbersTable.season, season),
        ),
      ),
  ]);
  if (seniorRows.length === 0) return [];
  const guids =
    juniorRows.length > 0 && seniorRows.some((r) => r.playerId !== null)
      ? await seniorGuidsByPlayer(tenantId)
      : new Map<number, string[]>();
  return registerOverlap(
    seniorRows.map((r) => ({
      ...r,
      ids: [r.participantId, ...(r.playerId !== null ? (guids.get(r.playerId) ?? []) : [])],
    })),
    juniorRows,
  );
}
