import { eq } from "drizzle-orm";
import { db, playerCurationTable, type MergeStatus } from "@workspace/db";

/**
 * Per-tenant central-player curation overlay, resolved for a request.
 *
 * `nameByGuid` — rename overrides (central GUID -> the club's chosen display
 * name), applied wherever a central player's name is shown.
 *
 * `canonicalByGuid` — CONFIRMED merge targets (a duplicate GUID -> its keeper
 * GUID), with chains collapsed to a single canonical GUID. Suggested and
 * rejected merges are review states only and never fold (KTD2). Consumers get
 * it through the club overlay (`club-overlay.ts`), which folds it into every
 * central read.
 */
export interface CurationOverlay {
  nameByGuid: Map<string, string>;
  canonicalByGuid: Map<string, string>;
}

/** The curation columns the overlay needs. */
export interface CurationRowInput {
  participantId: string;
  overrideDisplayName: string | null;
  mergedIntoParticipantId: string | null;
  mergeStatus: MergeStatus | null;
}

/** Longest merge chain followed (A -> B -> ... ). Deeper chains are refused on write. */
export const MAX_MERGE_CHAIN = 16;

const EMPTY: CurationOverlay = {
  nameByGuid: new Map(),
  canonicalByGuid: new Map(),
};

/**
 * Follow `edges` from `start` to the end of its chain. Null when the chain
 * loops back on itself or runs past `MAX_MERGE_CHAIN` links — the caller then
 * folds nothing rather than guessing.
 */
function chainEnd(edges: ReadonlyMap<string, string>, start: string): string | null {
  const seen = new Set([start]);
  let cur = start;
  for (let i = 0; i < MAX_MERGE_CHAIN; i++) {
    const next = edges.get(cur);
    if (next === undefined) return cur;
    if (seen.has(next)) return null;
    seen.add(next);
    cur = next;
  }
  return edges.has(cur) ? null : cur;
}

/** Build the overlay from a tenant's curation rows. Pure. */
export function buildCurationOverlay(rows: readonly CurationRowInput[]): CurationOverlay {
  if (rows.length === 0) return EMPTY;
  const nameByGuid = new Map<string, string>();
  const confirmed = new Map<string, string>();
  for (const r of rows) {
    if (r.overrideDisplayName) nameByGuid.set(r.participantId, r.overrideDisplayName);
    if (
      r.mergedIntoParticipantId &&
      r.mergeStatus === "confirmed" &&
      r.mergedIntoParticipantId !== r.participantId
    ) {
      confirmed.set(r.participantId, r.mergedIntoParticipantId);
    }
  }

  // Collapse chains (A -> B -> C becomes A -> C). A cycle or an over-long chain
  // (only possible from legacy rows — the write route refuses both) folds
  // nobody on it.
  const canonicalByGuid = new Map<string, string>();
  for (const guid of confirmed.keys()) {
    const end = chainEnd(confirmed, guid);
    if (end !== null && end !== guid) canonicalByGuid.set(guid, end);
  }
  return { nameByGuid, canonicalByGuid };
}

/**
 * Why pointing `from` at `to` would break the merge graph, or null when it is
 * safe. `edges` are the tenant's existing merge links (any status but rejected,
 * `from`'s own link excluded). Refuses a self-merge or a cycle (`to` already
 * leads back to `from`), and a chain deeper than `MAX_MERGE_CHAIN`.
 */
export function findMergeProblem(
  edges: ReadonlyMap<string, string>,
  from: string,
  to: string,
): "cycle" | "too-deep" | null {
  if (from === to) return "cycle";
  const seen = new Set([from, to]);
  let cur = to;
  for (let depth = 1; depth <= MAX_MERGE_CHAIN; depth++) {
    const next = edges.get(cur);
    if (next === undefined) return null;
    if (next === from || seen.has(next)) return "cycle";
    seen.add(next);
    cur = next;
  }
  return "too-deep";
}

/** Load and resolve the curation overlay for a tenant (empty when none set). */
export async function resolveCuration(tenantId: number): Promise<CurationOverlay> {
  const rows = await db
    .select({
      participantId: playerCurationTable.participantId,
      overrideDisplayName: playerCurationTable.overrideDisplayName,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
      mergeStatus: playerCurationTable.mergeStatus,
    })
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId));
  return buildCurationOverlay(rows);
}
