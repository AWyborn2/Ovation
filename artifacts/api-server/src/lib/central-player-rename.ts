import { db, playerCurationTable } from "@workspace/db";
import { displayNameForShow, splitDisplayName } from "@workspace/db/central-queries";
import { loadClubIdentity } from "./club-overlay";
import { invalidateMilestonesCache } from "./milestones-cache";

/**
 * Renaming a player for a club that reads its stats from the central database.
 *
 * The central name comes from PlayHQ and is shared by every club, so a club's
 * correction is stored as its own rename override (`player_curation`, the same
 * row the merge review uses) on the player's keeper GUID. Only that row's name
 * changes: an existing merge or merge decision on it is kept as it is. Nothing
 * here writes the central database or the native stats tables.
 */

export interface CentralRenamePatch {
  givenName?: string;
  surname?: string;
  deceased?: boolean;
  imageUrl?: string | null;
  cardRole?: string | null;
  cardRating?: number | null;
}

export type CentralRenameResult =
  | { status: "not_found" }
  | { status: "refused"; message: string }
  | {
      status: "ok";
      participantId: string;
      overrideDisplayName: string | null;
      player: {
        id: number;
        givenName: string;
        surname: string;
        deceased: boolean;
        imageUrl: null;
        cardRole: null;
        cardRating: null;
      };
    };

/** Fields a central club can't change from the player editor. */
const NON_NAME_FIELDS = ["deceased", "imageUrl", "cardRole", "cardRating"] as const;

/**
 * The stored form of a name. "Given Surname" reads back the same way; a
 * surname of more than one word ("van der Merwe") is stored surname first,
 * which the name splitter also reads back exactly.
 */
export function storedDisplayName(givenName: string, surname: string): string {
  if (surname.includes(" ") && givenName) return `${surname}, ${givenName}`;
  return [givenName, surname].filter(Boolean).join(" ");
}

export async function renameCentralPlayer(
  tenantId: number,
  playerId: number,
  patch: CentralRenamePatch,
): Promise<CentralRenameResult> {
  const other = NON_NAME_FIELDS.filter((f) => patch[f] !== undefined);
  if (other.length > 0) {
    return {
      status: "refused",
      message:
        "Only a player's name can be changed here: this club's stats come from " +
        "PlayHQ through the shared database.",
    };
  }

  const identity = await loadClubIdentity(tenantId);
  const keeper = identity.guidForPlayerId(playerId);
  if (keeper === null) return { status: "not_found" };

  const { centralPlayerNames } = await import("@workspace/db/central-queries");
  const central = (await centralPlayerNames([keeper], identity.merges)).get(keeper);
  // A private player is not shown anywhere, so it can't be renamed either.
  if (!central || central.isPrivate) return { status: "not_found" };

  const current = splitDisplayName(identity.nameFor(keeper, central.displayName) ?? "");
  const givenName = (patch.givenName ?? current.givenName).trim().replace(/\s+/g, " ");
  const surname = (patch.surname ?? current.surname).trim().replace(/\s+/g, " ");
  if (!givenName && !surname) {
    return { status: "refused", message: "A player's name can't be blank." };
  }

  // Setting the name back to the central one clears the override, so a later
  // PlayHQ correction shows through again.
  const wanted = storedDisplayName(givenName, surname);
  const overrideDisplayName =
    displayNameForShow(wanted) === displayNameForShow(central.displayName) ? null : wanted;

  const now = new Date();
  await db
    .insert(playerCurationTable)
    .values({
      tenantId,
      participantId: keeper,
      overrideDisplayName,
      mergedIntoParticipantId: null,
      mergeStatus: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [playerCurationTable.tenantId, playerCurationTable.participantId],
      // Name only: a merge or merge decision on this row stays as it was.
      set: { overrideDisplayName, updatedAt: now },
    });
  invalidateMilestonesCache(tenantId);

  return {
    status: "ok",
    participantId: keeper,
    overrideDisplayName,
    player: {
      id: identity.intByGuid.get(keeper) ?? playerId,
      givenName,
      surname,
      deceased: false,
      imageUrl: null,
      cardRole: null,
      cardRating: null,
    },
  };
}
