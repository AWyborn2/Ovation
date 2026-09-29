import { desc, asc } from "drizzle-orm";
import { playersTable } from "@workspace/db";
import { getTenantId } from "../middlewares/tenant-context";
import { loadClubIdentity } from "./club-overlay";

/**
 * Shared helpers for the players routes: central-name splitting, directory
 * ordering, and the central-tenant id crosswalk.
 *
 * Extracted from routes/players.ts. They only depend on the db layer and
 * request context — never on a route — so importing them back into the router
 * cannot create a cycle.
 */

/** Split a central display name into given/surname (surname = last token). */
export function splitCentralName(displayName: string): { givenName: string; surname: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0], surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

export function getPlayerOrderCol(sortBy: string | undefined, sortOrder: string | undefined) {
  const dir = sortOrder === "desc" ? desc : asc;
  switch (sortBy) {
    case "games":
      return dir(playersTable.totalGames);
    case "runs":
      return dir(playersTable.totalRuns);
    case "wickets":
      return dir(playersTable.totalWickets);
    case "name":
    default:
      return dir(playersTable.surname);
  }
}

/**
 * Resolve a central tenant's int player id to that player's participant GUIDs
 * — the keeper first, then every GUID a confirmed merge folds into it — or null
 * when the id isn't in this tenant's crosswalk. A merged-away player's id
 * resolves to its keeper's group (KTD2). Central-tenant int ids overlap the
 * native players.id range, so the native tables must NEVER be queried with a
 * central tenant's id — resolve via player_id_map or 404.
 */
export async function centralPlayerGroupFor(
  req: Parameters<typeof getTenantId>[0],
  playerId: number,
): Promise<string[] | null> {
  const identity = await loadClubIdentity(getTenantId(req));
  const keeper = identity.guidForPlayerId(playerId);
  return keeper === null ? null : identity.membersOf(keeper);
}
