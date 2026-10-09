import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { playerIdMapTable } from "./schema/player_id_map";
import { squadMembersTable } from "./schema/availability";
import type { CurrentSeasonSquadPlayer } from "./central/squad-link";

/** Inside provisioning's transaction; reruns never undo a staff roster decision. */
export async function seedCurrentSeasonSquad(
  tx: Pick<Db, "select" | "insert">,
  tenantId: number,
  players: readonly CurrentSeasonSquadPlayer[],
): Promise<number> {
  const mappings = await tx.select().from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const ids = new Map(mappings.map((m) => [m.participantId, m.playerId]));
  const existing = await tx.select().from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId));
  const linked = new Set(existing.map((m) => m.linkedPlayerId).filter((id) => id !== null));
  const nameKey = (first: string, last: string) => `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, " ");
  const names = new Set(existing.filter((m) => m.linkedPlayerId === null)
    .map((m) => nameKey(m.firstName, m.lastName)));
  let created = 0;
  for (const p of players) {
    const playerId = p.section === "senior" ? ids.get(p.participantId) ?? null : null;
    const tokens = p.name.trim().split(/\s+/);
    const firstName = tokens.shift()!;
    const lastName = tokens.join(" ");
    if (names.has(nameKey(firstName, lastName)) || (playerId !== null && linked.has(playerId))) continue;
    await tx.insert(squadMembersTable).values({
      tenantId, firstName, lastName,
      section: p.section, gradeHint: p.gradeHint, isPrivate: p.isPrivate,
      linkedPlayerId: playerId, active: true,
    });
    if (playerId === null) names.add(nameKey(firstName, lastName));
    if (playerId !== null) linked.add(playerId);
    created++;
  }
  return created;
}
