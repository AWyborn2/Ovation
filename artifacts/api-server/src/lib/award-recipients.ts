import { inArray, sql } from "drizzle-orm";
import { awardWinnersTable, db, playersTable } from "@workspace/db";
import { curatedIdsAreNative, assertPlayerInTenantSpace } from "./curated-player-space";
import { loadClubOverlay } from "./club-overlay";

type LinkedWinner = { playerId: number | null; playerIds?: number[] | null };

/** NULL means legacy. An explicit empty array must never revive the old link. */
export function winnerPlayerIds(winner: LinkedWinner): number[] {
  return [...new Set(winner.playerIds ?? (winner.playerId == null ? [] : [winner.playerId]))];
}

export function winnerMatchesPlayers(ids: readonly number[]) {
  return sql`coalesce(${awardWinnersTable.playerIds},
    array_remove(ARRAY[${awardWinnersTable.playerId}], NULL)) &&
    ARRAY[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::integer[]`;
}

/** A legacy PATCH changes only its first link; co-recipients are never lost. */
export function patchWinnerLinks(
  body: { playerIds?: number[]; playerId?: number | null },
  current?: LinkedWinner,
) {
  if (body.playerIds !== undefined) return body.playerIds;
  if (body.playerId === undefined) return undefined;
  const rest = current ? winnerPlayerIds(current).slice(1) : [];
  return [...new Set(body.playerId == null ? rest : [body.playerId, ...rest])];
}

export async function validateWinnerLinks(tenantId: number, ids: number[]) {
  if (new Set(ids).size !== ids.length) {
    throw Object.assign(new Error("Select each player only once."), { status: 400 });
  }
  await assertPlayerInTenantSpace(tenantId, ids);
}

export type Recipient = { playerId: number; name: string };

/** Resolve only this tenant's identity space, folding confirmed merges and privacy. */
async function recipientDirectory(tenantId: number, ids: number[]) {
  const result = new Map<number, Recipient>();
  if (!ids.length) return result;
  if (await curatedIdsAreNative(tenantId)) {
    const rows = await db.select().from(playersTable).where(inArray(playersTable.id, ids));
    for (const p of rows)
      result.set(p.id, { playerId: p.id, name: `${p.givenName} ${p.surname}`.trim() });
  } else {
    const { identity } = await loadClubOverlay(tenantId);
    const guids = ids
      .map((id) => identity.guidForPlayerId(id))
      .filter((g): g is string => g != null);
    const { centralPlayerNames } = await import("@workspace/db/central-queries");
    const names = await centralPlayerNames(guids, identity.merges);
    for (const id of ids) {
      const guid = identity.guidForPlayerId(id);
      if (!guid) continue;
      const p = names.get(guid);
      if (p?.isPrivate) continue;
      const name = identity.nameFor(guid, p?.displayName ?? null);
      if (name) result.set(id, { playerId: identity.intByGuid.get(guid) ?? id, name });
    }
  }
  return result;
}

export async function withAwardRecipients<T extends LinkedWinner & { name: string }>(
  tenantId: number,
  rows: T[],
  publicOnly = false,
) {
  const directory = await recipientDirectory(tenantId, [...new Set(rows.flatMap(winnerPlayerIds))]);
  return rows.map((row) => {
    const playerIds = winnerPlayerIds(row);
    const seen = new Set<number>();
    const recipients = playerIds.flatMap((id) => {
      const person = directory.get(id);
      if (!person || seen.has(person.playerId)) return [];
      seen.add(person.playerId);
      return [person];
    });
    return {
      ...row,
      playerId: publicOnly ? (recipients[0]?.playerId ?? null) : row.playerId,
      playerIds: publicOnly ? recipients.map((p) => p.playerId) : playerIds,
      recipients,
    };
  });
}

/** Expand links, not display-name text. A linked row never becomes an extra person. */
export async function awardCreditRows<T extends LinkedWinner & { name: string; season: number }>(
  tenantId: number,
  rows: T[],
) {
  return (await withAwardRecipients(tenantId, rows)).flatMap<T>((w) =>
    w.playerIds.length ? w.recipients.map((p) => ({ ...w, ...p })) : [{ ...w, playerId: null }],
  );
}
