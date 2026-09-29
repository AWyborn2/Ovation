import { sql, type AnyColumn, type SQL } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Confirmed player merges, applied to central reads (hybrid stats plan U6,
// KTD1/KTD2).
//
// A club can confirm that two (or more) PlayHQ participant GUIDs are one
// person. The tenant resolves its confirmed merges in the route
// (api-server/src/lib/club-overlay.ts) into a `CentralMerges` map — merged-away
// GUID -> canonical keeper GUID, chains already collapsed — and passes it to
// every central read that aggregates by participant. The read folds each line's
// GUID to its keeper BEFORE grouping, so a merged pair aggregates as one career
// (and is ranked, recorded and milestone-walked as one).
//
// Rules:
//   - An absent or empty map changes nothing: the SQL and the results are
//     exactly what they were before merges existed.
//   - The map is a per-tenant input, so every cached read that takes one puts
//     it in its cache key (`mergesCacheArg`) — two tenants on the same central
//     club with different merges never share an entry.
//   - Privacy follows the group: a keeper is private when ANY GUID folded into
//     it is private (see `centralPlayerNames` / `mergedPrivateKeepers` in
//     privacy.ts).
//   - Nothing here ever writes to central.
// ---------------------------------------------------------------------------

/** Merged-away participant GUID -> canonical keeper GUID (confirmed merges only). */
export type CentralMerges = ReadonlyMap<string, string>;

export function hasMerges(merges: CentralMerges | undefined | null): merges is CentralMerges {
  return !!merges && merges.size > 0;
}

/** The keeper a GUID folds into (itself when it isn't merged away). */
export function canonicalGuid(participantId: string, merges?: CentralMerges | null): string {
  return merges?.get(participantId) ?? participantId;
}

/**
 * Rewrite each line's `participantId` to its keeper. Blank participants are
 * left as they are (callers drop them). Returns the input untouched when there
 * are no merges.
 */
export function canonicalizeLines<T extends { participantId: string | null }>(
  rows: readonly T[],
  merges?: CentralMerges | null,
): T[] {
  if (!hasMerges(merges)) return rows as T[];
  return rows.map((r) =>
    r.participantId && merges.has(r.participantId)
      ? { ...r, participantId: merges.get(r.participantId)! }
      : r,
  );
}

/**
 * SQL for a participant column folded to its keeper — for reads that GROUP BY
 * participant in SQL. One bound jsonb parameter however many merges; the plain
 * column when there are none (so the statement is unchanged).
 */
export function canonicalPidSql(column: AnyColumn | SQL, merges?: CentralMerges | null): SQL {
  if (!hasMerges(merges)) return sql`${column}`;
  const json = JSON.stringify(Object.fromEntries(merges));
  return sql`coalesce(${json}::jsonb ->> ${column}, ${column})`;
}

/**
 * GROUP BY term for a query-builder select whose FIRST column is
 * `canonicalPidSql(column, merges)`. With merges it groups by ordinal (`1`):
 * Postgres can't match the select expression to a second copy in GROUP BY,
 * because each copy binds its own parameter. Without merges it is the plain
 * column, so the statement is unchanged.
 */
export function groupByCanonicalPid<C extends AnyColumn>(
  column: C,
  merges?: CentralMerges | null,
): C | SQL {
  return hasMerges(merges) ? sql`1` : column;
}

/**
 * `ids` plus every GUID merged into one of them — the full membership of the
 * groups those keepers head. Use it to fetch per-member rows (privacy, a
 * keeper's history) that a keeper-only lookup would miss.
 */
export function mergeGroupMembers(ids: Iterable<string>, merges?: CentralMerges | null): string[] {
  const out = new Set(ids);
  if (!hasMerges(merges)) return [...out];
  const keepers = new Set(out);
  for (const [from, to] of merges) if (keepers.has(to)) out.add(from);
  return [...out];
}

/**
 * Fold a per-GUID name/privacy map (covering every group member) onto the
 * keepers: a keeper keeps its own display name and is private when ANY GUID in
 * its group is. Merged-away entries are dropped (their lines now carry the
 * keeper's id). Returns the input untouched when there are no merges.
 */
export function foldPlayerNames(
  names: ReadonlyMap<string, { displayName: string | null; isPrivate: boolean }>,
  merges?: CentralMerges | null,
): ReadonlyMap<string, { displayName: string | null; isPrivate: boolean }> {
  if (!hasMerges(merges)) return names;
  const out = new Map<string, { displayName: string | null; isPrivate: boolean }>();
  for (const [pid, n] of names) {
    if (merges.has(pid)) continue;
    out.set(pid, { ...n });
  }
  for (const [pid, n] of names) {
    const keeper = merges.get(pid);
    if (!keeper || !n.isPrivate) continue;
    const k = out.get(keeper);
    if (k) k.isPrivate = true;
    else out.set(keeper, { displayName: null, isPrivate: true });
  }
  return out;
}

/** The cache-key argument for a merges map: null when empty, so no-merge keys stay stable. */
export function mergesCacheArg(merges?: CentralMerges | null): CentralMerges | null {
  return hasMerges(merges) ? merges : null;
}
