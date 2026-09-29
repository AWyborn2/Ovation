import { eq } from "drizzle-orm";
import { db, playerIdMapTable } from "@workspace/db";
import { resolveCuration, type CurationOverlay } from "./central-curation";

/**
 * The per-tenant club overlay for central reads — first slice (hybrid stats
 * plan U6; U10 adds corrections, the boundary and club history).
 *
 * Today it carries player IDENTITY: the tenant's crosswalk (GUID -> app int id)
 * with its CONFIRMED merges applied, loaded once per request and handed to the
 * central reads and their route mapping. Every central-read handler used to
 * build its own `intByGuid` from `player_id_map`; they now load this instead,
 * so a confirmed merge folds everywhere at once.
 *
 * Rules (KTD2, docs/solutions/architecture-patterns/
 * central-read-player-identity-crosswalk.md):
 *   - `merges` goes into the central reads, which fold each merged-away GUID
 *     into its keeper BEFORE grouping (lib/db/src/central/merges.ts).
 *   - A merged group presents under ONE id: the keeper's crosswalk id (or, when
 *     the keeper has no row, the lowest id among the group). Merged-away GUIDs
 *     keep their own crosswalk rows (undo is lossless), and those ids resolve to
 *     the keeper — so a `/players/:id` link or a curated row (award, photo)
 *     that points at a merged-away id lands on the keeper.
 *   - Names: the keeper's curated name, else the central name passed in.
 *   - Privacy is a central fact: the central reads mark a keeper private when
 *     any GUID in its group is; identity-only surfaces (the scorecard) ask
 *     `mergedPrivateKeepers(identity.merges)`.
 *   - Always tenant-scoped: built from THIS tenant's crosswalk and curation.
 */
export interface ClubIdentity {
  /** Confirmed merges, merged-away GUID -> canonical keeper (chains collapsed). */
  merges: Map<string, string>;
  /** Curated display names (GUID -> name). */
  nameByGuid: Map<string, string>;
  /** Every mapped GUID (merged-away ones included) -> the app id its group presents as. */
  intByGuid: Map<string, number>;
  /** The keeper a GUID folds into (itself when not merged away). */
  canonicalOf(guid: string): string;
  /** A GUID's whole group, keeper first. */
  membersOf(guid: string): string[];
  /** Every crosswalk id the GUID's group owns, the presented id first. */
  intsOf(guid: string): number[];
  /** The keeper GUID behind any crosswalk id of this tenant, or null when unmapped. */
  guidForPlayerId(playerId: number): string | null;
  /** The group's display name: the keeper's curated name, else `fallback`. */
  nameFor(guid: string, fallback: string | null): string | null;
}

/** Build the identity slice from a tenant's crosswalk rows and curation. Pure. */
export function buildClubIdentity(
  crosswalk: readonly { participantId: string; playerId: number }[],
  curation: CurationOverlay,
): ClubIdentity {
  const merges = curation.canonicalByGuid;
  const canonicalOf = (guid: string) => merges.get(guid) ?? guid;

  const rawInt = new Map(crosswalk.map((r) => [r.participantId, r.playerId]));
  const guidByRawInt = new Map(crosswalk.map((r) => [r.playerId, r.participantId]));

  // Group members, keeper first.
  const groups = new Map<string, string[]>();
  for (const [from, keeper] of merges) {
    const g = groups.get(keeper) ?? [keeper];
    g.push(from);
    groups.set(keeper, g);
  }
  const membersOf = (guid: string): string[] => {
    const keeper = canonicalOf(guid);
    return groups.get(keeper) ?? [keeper];
  };

  // The id a group presents as: the keeper's own row, else the lowest member id.
  const presentedId = (keeper: string): number | undefined => {
    const own = rawInt.get(keeper);
    if (own !== undefined) return own;
    const ids = membersOf(keeper)
      .map((g) => rawInt.get(g))
      .filter((id): id is number => id !== undefined);
    return ids.length > 0 ? Math.min(...ids) : undefined;
  };

  const intByGuid = new Map(rawInt);
  for (const [keeper, members] of groups) {
    const id = presentedId(keeper);
    if (id === undefined) continue;
    for (const g of members) intByGuid.set(g, id);
  }

  return {
    merges,
    nameByGuid: curation.nameByGuid,
    intByGuid,
    canonicalOf,
    membersOf,
    intsOf: (guid) => {
      const members = membersOf(guid);
      const first = intByGuid.get(members[0]!);
      const ids = members
        .map((g) => rawInt.get(g))
        .filter((id): id is number => id !== undefined && id !== first);
      return first === undefined ? ids : [first, ...ids];
    },
    guidForPlayerId: (playerId) => {
      const guid = guidByRawInt.get(playerId);
      return guid === undefined ? null : canonicalOf(guid);
    },
    nameFor: (guid, fallback) => {
      const keeper = canonicalOf(guid);
      return curation.nameByGuid.get(keeper) ?? fallback;
    },
  };
}

/** Load the identity slice of a tenant's club overlay (crosswalk + confirmed merges). */
export async function loadClubIdentity(tenantId: number): Promise<ClubIdentity> {
  const [crosswalk, curation] = await Promise.all([
    db
      .select({
        participantId: playerIdMapTable.participantId,
        playerId: playerIdMapTable.playerId,
      })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId)),
    resolveCuration(tenantId),
  ]);
  return buildClubIdentity(crosswalk, curation);
}
