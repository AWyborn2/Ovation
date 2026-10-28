import type { Logger } from "pino";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, sponsorPlayersTable, sponsorsTable, type SponsorRow } from "@workspace/db";
import { migrateSponsorLogos } from "./sponsor-logo-migration";

export type SponsorPlayer = { id: number; name: string };
export type SponsorWithPlayers = SponsorRow & { players: SponsorPlayer[] };

/**
 * Each sponsor with the players it backs (player sponsors), in tag order. A
 * player's name is the label saved with the tag; it is only sent to the club's
 * admins (`withNames`), so public reads carry the ids the card rule needs and
 * no player names.
 */
export async function withSponsorPlayers<R extends { id: number }>(
  tenantId: number,
  rows: R[],
  { withNames }: { withNames: boolean },
): Promise<Array<R & { players: SponsorPlayer[] }>> {
  if (rows.length === 0) return [];
  const tags = await db
    .select({
      sponsorId: sponsorPlayersTable.sponsorId,
      playerId: sponsorPlayersTable.playerId,
      playerName: sponsorPlayersTable.playerName,
    })
    .from(sponsorPlayersTable)
    .where(
      and(
        eq(sponsorPlayersTable.tenantId, tenantId),
        inArray(
          sponsorPlayersTable.sponsorId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .orderBy(asc(sponsorPlayersTable.id));
  const bySponsor = new Map<number, SponsorPlayer[]>();
  for (const t of tags) {
    const list = bySponsor.get(t.sponsorId) ?? [];
    list.push({ id: t.playerId, name: withNames ? t.playerName : "" });
    bySponsor.set(t.sponsorId, list);
  }
  return rows.map((r) => ({ ...r, players: bySponsor.get(r.id) ?? [] }));
}

/**
 * One tenant's sponsors whose active window covers today, ordered by
 * displayOrder. The date-window rule treats a null bound as open-ended (no
 * start / no end). Logos are run through the lazy data-URL → object-storage
 * migration on read. Shared by the social-card bundle and the honour-board
 * kiosk so both surface the same "live" sponsor set. NOTE: card-kind filtering
 * is a share-card concern and is applied by the caller, never here. Each
 * sponsor carries its players' ids (player sponsors), without names.
 *
 * `tenantId` is REQUIRED and is the whole point of the signature. This query
 * previously filtered on the date window alone, so every tenant received the
 * union of every tenant's sponsors — a club's share cards and its honour-board
 * kiosk rendered another club's logos, and the "presented by" line named
 * another club's sponsor. `sponsors` is tenant-owned curated content; it must
 * never be read across the boundary.
 */
export async function loadActiveSponsors(
  tenantId: number,
  log: Logger,
): Promise<SponsorWithPlayers[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(sponsorsTable)
    .where(
      and(
        eq(sponsorsTable.tenantId, tenantId),
        or(isNull(sponsorsTable.activeFrom), sql`${sponsorsTable.activeFrom} <= ${today}`),
        or(isNull(sponsorsTable.activeTo), sql`${sponsorsTable.activeTo} >= ${today}`),
      ),
    )
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  return withSponsorPlayers(tenantId, await migrateSponsorLogos(rows, log), { withNames: false });
}
