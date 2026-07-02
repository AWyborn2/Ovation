import { eq } from "drizzle-orm";
import { db, playerCurationTable } from "@workspace/db";

/**
 * Per-tenant central-player curation overlay, resolved for a request.
 *
 * `nameByGuid` — rename overrides (central GUID -> the club's chosen display
 * name), applied wherever a central player's name is shown.
 *
 * `canonicalByGuid` — merge targets (a duplicate GUID -> its keeper GUID), with
 * chains collapsed to a single canonical GUID. Consumers that aggregate by GUID
 * remap to the canonical id so merged duplicates present as one player.
 */
export interface CurationOverlay {
  nameByGuid: Map<string, string>;
  canonicalByGuid: Map<string, string>;
}

const EMPTY: CurationOverlay = {
  nameByGuid: new Map(),
  canonicalByGuid: new Map(),
};

/** Load and resolve the curation overlay for a tenant (empty when none set). */
export async function resolveCuration(tenantId: number): Promise<CurationOverlay> {
  const rows = await db
    .select({
      participantId: playerCurationTable.participantId,
      overrideDisplayName: playerCurationTable.overrideDisplayName,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
    })
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId));

  if (rows.length === 0) return EMPTY;

  const nameByGuid = new Map<string, string>();
  const mergeInto = new Map<string, string>();
  for (const r of rows) {
    if (r.overrideDisplayName) nameByGuid.set(r.participantId, r.overrideDisplayName);
    if (r.mergedIntoParticipantId) mergeInto.set(r.participantId, r.mergedIntoParticipantId);
  }

  // Collapse merge chains (A->B->C becomes A->C), capped to avoid cycles.
  const canonicalByGuid = new Map<string, string>();
  for (const guid of mergeInto.keys()) {
    let cur = guid;
    for (let i = 0; i < 16 && mergeInto.has(cur); i++) cur = mergeInto.get(cur)!;
    canonicalByGuid.set(guid, cur);
  }

  return { nameByGuid, canonicalByGuid };
}
