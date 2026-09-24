import { eq } from "drizzle-orm";
import { db, clubsTable, tenantsTable } from "@workspace/db";
import type { DataSource } from "./tenant";

/**
 * Opponent-club resolver (stats analytics KTD6). A fixture names its opponent
 * in one of two ways — the app clubs register id (`Fixture.opponentClubId`) or
 * the PlayHQ organisation GUID (`PlayhqOpponent.orgId`) — while the stats reads
 * key opponents in the READ PATH's own id space:
 *
 *   - native:  the app clubs register id (`matches.opponent_club_id`);
 *   - central: `central.clubs.club_id` (`central.matches.home/away_club_id`).
 *
 * This maps any of those references into the read path's space. It reuses the
 * same app↔central club mapping the opponent-brand overlay
 * (`club-brand.ts`) relies on — the `tenants` row, which carries both
 * `app_club_id` and `central_club_id` (plus `playhq_org_id`) — and, for a club
 * that isn't a tenant, derives the central id from the matches PlayHQ and
 * central share. It never guesses by name: an opponent it can't map comes back
 * `resolved: false`, so the caller reports "not resolved" instead of rendering
 * a silent empty list.
 */

/** How the caller identifies the opponent. Tried in this order. */
export interface OpponentRef {
  /** Already in the read path's own id space (e.g. `PlayerMatch.opponentClubId`). */
  opponentClubId?: number;
  /** App clubs register id (`Fixture.opponentClubId`). */
  appClubId?: number;
  /** PlayHQ organisation GUID (`PlayhqOpponent.orgId`). */
  orgId?: string;
}

export type ResolvedOpponent =
  | { resolved: true; clubId: number; name: string | null }
  | { resolved: false; clubId: null; name: null };

const UNRESOLVED: ResolvedOpponent = { resolved: false, clubId: null, name: null };

async function appClubRow(
  id: number,
): Promise<{ id: number; name: string; playhqOrgId: string | null } | null> {
  const [row] = await db
    .select({ id: clubsTable.id, name: clubsTable.name, playhqOrgId: clubsTable.playhqOrgId })
    .from(clubsTable)
    .where(eq(clubsTable.id, id));
  return row ?? null;
}

async function tenantByAppClubId(id: number) {
  const [row] = await db
    .select({ centralClubId: tenantsTable.centralClubId, playhqOrgId: tenantsTable.playhqOrgId })
    .from(tenantsTable)
    .where(eq(tenantsTable.appClubId, id));
  return row ?? null;
}

async function tenantByOrgId(orgId: string) {
  const [row] = await db
    .select({ centralClubId: tenantsTable.centralClubId, appClubId: tenantsTable.appClubId })
    .from(tenantsTable)
    .where(eq(tenantsTable.playhqOrgId, orgId));
  return row ?? null;
}

// ---- native: app clubs register space -------------------------------------

async function resolveNative(ref: OpponentRef): Promise<ResolvedOpponent> {
  const asApp = async (id: number | null | undefined): Promise<ResolvedOpponent | null> => {
    if (id == null) return null;
    const row = await appClubRow(id);
    return row ? { resolved: true, clubId: row.id, name: row.name } : null;
  };

  // Native's own space IS the app register, so both ids check the same way.
  const direct = (await asApp(ref.opponentClubId)) ?? (await asApp(ref.appClubId));
  if (direct) return direct;

  const orgId = ref.orgId?.trim();
  if (orgId) {
    const [byOrg] = await db
      .select({ id: clubsTable.id, name: clubsTable.name })
      .from(clubsTable)
      .where(eq(clubsTable.playhqOrgId, orgId));
    if (byOrg) return { resolved: true, clubId: byOrg.id, name: byOrg.name };
    const viaTenant = await asApp((await tenantByOrgId(orgId))?.appClubId);
    if (viaTenant) return viaTenant;
  }
  return UNRESOLVED;
}

// ---- central: central.clubs space -----------------------------------------

async function resolveCentral(
  source: Extract<DataSource, { kind: "central" }>,
  ref: OpponentRef,
): Promise<ResolvedOpponent> {
  const { centralClubById, centralClubIdForPlayhqOrg } =
    await import("@workspace/db/central-queries");
  const asCentral = async (id: number | null | undefined): Promise<ResolvedOpponent | null> => {
    // The tenant's own club is never its own opponent.
    if (id == null || id === source.clubId) return null;
    const club = await centralClubById(id);
    return club ? { resolved: true, clubId: club.clubId, name: club.name ?? club.shortName } : null;
  };
  const fromOrg = async (orgId: string | null | undefined): Promise<ResolvedOpponent | null> => {
    const org = orgId?.trim();
    if (!org) return null;
    return (
      (await asCentral((await tenantByOrgId(org))?.centralClubId)) ??
      (await asCentral(await centralClubIdForPlayhqOrg(org)))
    );
  };

  const direct = await asCentral(ref.opponentClubId);
  if (direct) return direct;

  if (ref.appClubId != null) {
    // An app-register club that signed up as a tenant carries its central id.
    const tenant = await tenantByAppClubId(ref.appClubId);
    const viaTenant =
      (await asCentral(tenant?.centralClubId)) ?? (await fromOrg(tenant?.playhqOrgId));
    if (viaTenant) return viaTenant;
    // Otherwise the register row's PlayHQ org links it to central matches.
    const viaRegister = await fromOrg((await appClubRow(ref.appClubId))?.playhqOrgId);
    if (viaRegister) return viaRegister;
  }

  return (await fromOrg(ref.orgId)) ?? UNRESOLVED;
}

/** Map an opponent reference into the read path's own club id space. */
export async function resolveOpponentClub(
  source: DataSource,
  ref: OpponentRef,
): Promise<ResolvedOpponent> {
  return source.kind === "central" ? resolveCentral(source, ref) : resolveNative(ref);
}
