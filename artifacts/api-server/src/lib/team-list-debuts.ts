import { eq } from "drizzle-orm";
import { db, tenantsTable, type TeamListPlayer } from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { loadClubIdentity } from "./club-overlay";

/**
 * Automatic DEBUT badges on a team list: the register-linked players in the
 * XI the match records say have never played a senior game for the club
 * before the fixture.
 *
 * Only PlayHQ (central) clubs read this: their match records are complete.
 * A native club's records can have gaps, so its debuts are set by hand (the
 * admin's `debut` override), and this returns nothing for it. A player the
 * crosswalk can't place (a free-typed name, a junior moving up who isn't
 * mapped yet) is never guessed a debutant either.
 */
export async function autoDebutPlayerIds(
  tenantId: number,
  playerIds: readonly (number | null | undefined)[],
  before: Date | null,
): Promise<number[]> {
  const ids = [
    ...new Set(
      playerIds.filter((id): id is number => id != null && id > 0 && id < FILL_IN_THRESHOLD),
    ),
  ];
  if (ids.length === 0) return [];
  const [t] = await db
    .select({
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!t?.readsFromCentral || t.centralClubId == null) return [];

  const identity = await loadClubIdentity(tenantId);
  const guidOf = new Map<number, string>();
  for (const id of ids) {
    const guid = identity.guidForPlayerId(id);
    if (guid) guidOf.set(id, guid);
  }
  if (guidOf.size === 0) return [];
  const guids = new Set<string>();
  for (const g of guidOf.values()) for (const m of identity.membersOf(g)) guids.add(m);

  const { centralClubSeniorPlayers } = await import("@workspace/db/central-queries");
  const played = await centralClubSeniorPlayers(t.centralClubId, [...guids], {
    before: before ? before.toISOString().slice(0, 10) : null,
    merges: identity.merges,
  });
  return [...guidOf.entries()]
    .filter(([, guid]) => !played.has(identity.canonicalOf(guid)))
    .map(([id]) => id);
}

/** A player's effective debut: the admin's override, else the automatic call. */
export function isDebut(p: TeamListPlayer, autoDebuts: ReadonlySet<number>): boolean {
  if (typeof p.debut === "boolean") return p.debut;
  return p.playerId != null && autoDebuts.has(p.playerId);
}
