import { eq } from "drizzle-orm";
import type { Db } from "./index";
import { playerIdMapTable } from "./schema/player_id_map";
import { availabilitySettingsTable, squadMembersTable } from "./schema/availability";
import type { CurrentSeasonSquadPlayer } from "./central/squad-link";

/**
 * Central display names for PlayHQ-loaded players are "Surname, Firstname"
 * ("Barnes, Casey"); roster names are "Firstname Surname" or "J Barnes".
 */
export function splitSeasonName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const comma = trimmed.indexOf(",");
  if (comma > 0) {
    const lastName = trimmed.slice(0, comma).trim();
    const firstName = trimmed.slice(comma + 1).trim();
    if (firstName && lastName) return { firstName, lastName };
  }
  const tokens = trimmed.split(/\s+/);
  const firstName = tokens.shift() ?? "";
  return { firstName, lastName: tokens.join(" ") };
}

/** Inside provisioning's transaction; reruns never undo a staff roster decision. */
export async function seedCurrentSeasonSquad(
  tx: Pick<Db, "select" | "insert">,
  tenantId: number,
  players: readonly CurrentSeasonSquadPlayer[],
): Promise<number> {
  const mappings = await tx
    .select()
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const ids = new Map(mappings.map((m) => [m.participantId, m.playerId]));
  const existing = await tx
    .select()
    .from(squadMembersTable)
    .where(eq(squadMembersTable.tenantId, tenantId));
  const linked = new Set(existing.map((m) => m.linkedPlayerId).filter((id) => id !== null));
  const nameKey = (first: string, last: string) =>
    `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, " ");
  const names = new Set(
    existing.filter((m) => m.linkedPlayerId === null).map((m) => nameKey(m.firstName, m.lastName)),
  );
  let created = 0;
  for (const p of players) {
    const playerId = p.section === "senior" ? (ids.get(p.participantId) ?? null) : null;
    const { firstName, lastName } = splitSeasonName(p.name);
    if (names.has(nameKey(firstName, lastName)) || (playerId !== null && linked.has(playerId)))
      continue;
    await tx.insert(squadMembersTable).values({
      tenantId,
      firstName,
      lastName,
      section: p.section,
      gradeHint: p.gradeHint,
      isPrivate: p.isPrivate,
      linkedPlayerId: playerId,
      active: true,
    });
    if (playerId === null) names.add(nameKey(firstName, lastName));
    if (playerId !== null) linked.add(playerId);
    created++;
  }
  return created;
}

/**
 * Note that a season seed filled the register (`availability_settings.season_seeded_at`),
 * so the hourly top-up of an empty register never refills a club that later
 * empties its list on purpose. Called only when a seed added someone.
 */
export async function markSquadSeasonSeeded(
  tx: Pick<Db, "insert">,
  tenantId: number,
  now: Date = new Date(),
): Promise<void> {
  await tx
    .insert(availabilitySettingsTable)
    .values({ tenantId, seasonSeededAt: now })
    .onConflictDoUpdate({
      target: availabilitySettingsTable.tenantId,
      set: { seasonSeededAt: now },
    });
}
