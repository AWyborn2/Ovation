import { db, tenantsTable } from "@workspace/db";
import { isNotNull, or } from "drizzle-orm";

/**
 * Opponent-brand overlay: a club that has signed up as a tenant and uploaded its
 * own logo / colours should appear with THAT brand wherever it shows as an
 * opponent on another tenant's scorecards and match lists — not just the
 * PlayHQ-scraped default in the shared clubs register.
 *
 * The uploaded brand lives on the `tenants` row (see lib/tenant-brand.ts, which
 * resolves a tenant's OWN site chrome). This module resolves the same public
 * brand fields for the OPPOSITE direction: given an opponent club id, is that
 * club a tenant with an uploaded brand, and if so what are its cosmetic fields.
 *
 * ISOLATION: only ever reads the public, cosmetic brand columns (short name,
 * logo, colours) — the exact fields a club already shows on its own public site.
 * Never touches curated or private tenant data, so this is not a cross-tenant
 * data leak, just brand propagation.
 *
 * Applied as a read-time overlay (never written back into the shared clubs
 * register), so a master re-import can't wipe it and the central path — whose
 * register has no logo column at all — still gets a logo from the tenants row.
 */

/** Cosmetic opponent-brand fields sourced from a tenant's uploaded brand. */
export interface OpponentBrandOverlay {
  shortName: string | null;
  logoUrl: string | null;
  logoUrl128: string | null;
  backgroundColour: string | null;
  primaryColour: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface OverlayMaps {
  /** app clubs-register id (= matches.opponent_club_id) → overlay. */
  byAppClubId: Map<number, OpponentBrandOverlay>;
  /** central clubs-register club_id → overlay. */
  byCentralClubId: Map<number, OpponentBrandOverlay>;
}

let cache: { maps: OverlayMaps; at: number } | null = null;

async function loadOverlays(): Promise<OverlayMaps> {
  // Only tenants that have actually uploaded something brand-worthy; a club with
  // no logo/colours of its own falls through to the register default.
  const rows = await db
    .select({
      appClubId: tenantsTable.appClubId,
      centralClubId: tenantsTable.centralClubId,
      shortName: tenantsTable.shortName,
      logoUrl: tenantsTable.logoUrl,
      backgroundColour: tenantsTable.backgroundColour,
      primaryColour: tenantsTable.primaryColour,
    })
    .from(tenantsTable)
    .where(
      or(
        isNotNull(tenantsTable.logoUrl),
        isNotNull(tenantsTable.backgroundColour),
        isNotNull(tenantsTable.primaryColour),
      ),
    );

  const byAppClubId = new Map<number, OpponentBrandOverlay>();
  const byCentralClubId = new Map<number, OpponentBrandOverlay>();
  for (const r of rows) {
    const overlay: OpponentBrandOverlay = {
      shortName: r.shortName,
      logoUrl: r.logoUrl,
      // The tenants row carries no dedicated 128px logo; reuse the uploaded logo
      // so the club's own crest shows at both sizes rather than a stale register
      // 128px from before it branded.
      logoUrl128: r.logoUrl,
      backgroundColour: r.backgroundColour,
      primaryColour: r.primaryColour,
    };
    if (r.appClubId != null) byAppClubId.set(r.appClubId, overlay);
    // central_club_id is NOT NULL on every tenant.
    byCentralClubId.set(r.centralClubId, overlay);
  }
  return { byAppClubId, byCentralClubId };
}

async function overlays(): Promise<OverlayMaps> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.maps;
  const maps = await loadOverlays();
  cache = { maps, at: Date.now() };
  return maps;
}

/**
 * Drop the overlay cache so a just-uploaded brand shows as opponent branding on
 * other tenants' scorecards immediately, not after the {@link CACHE_TTL_MS} lag.
 * Call after any write to a tenant's brand columns.
 */
export function invalidateClubBrandOverlayCache(): void {
  cache = null;
}

/** Overlays for a set of app clubs-register ids (opponent_club_id values). */
export async function getOpponentBrandsByAppClubId(
  ids: number[],
): Promise<Map<number, OpponentBrandOverlay>> {
  if (ids.length === 0) return new Map();
  const { byAppClubId } = await overlays();
  const out = new Map<number, OpponentBrandOverlay>();
  for (const id of ids) {
    const o = byAppClubId.get(id);
    if (o) out.set(id, o);
  }
  return out;
}

/** Overlays for a set of central clubs-register ids (central club_id values). */
export async function getOpponentBrandsByCentralClubId(
  ids: number[],
): Promise<Map<number, OpponentBrandOverlay>> {
  if (ids.length === 0) return new Map();
  const { byCentralClubId } = await overlays();
  const out = new Map<number, OpponentBrandOverlay>();
  for (const id of ids) {
    const o = byCentralClubId.get(id);
    if (o) out.set(id, o);
  }
  return out;
}

/**
 * Merge an overlay over an opponent-club branding object. The tenant's uploaded
 * value wins per-field; a field the tenant left unset falls back to the
 * register-derived value (so a club that set only colours keeps its register
 * logo, and vice versa). Extra fields on the input object (id, name,
 * secondaryColour, …) pass through untouched.
 */
export function mergeOpponentBrand<
  T extends {
    shortName: string | null;
    logoUrl: string | null;
    logoUrl128: string | null;
    primaryColour: string | null;
    backgroundColour?: string | null;
  },
>(opp: T, overlay: OpponentBrandOverlay | undefined): T {
  if (!overlay) return opp;
  const merged: T = {
    ...opp,
    shortName: overlay.shortName ?? opp.shortName,
    logoUrl: overlay.logoUrl ?? opp.logoUrl,
    logoUrl128: overlay.logoUrl128 ?? opp.logoUrl128,
    primaryColour: overlay.primaryColour ?? opp.primaryColour,
  };
  if ("backgroundColour" in opp) {
    merged.backgroundColour = overlay.backgroundColour ?? opp.backgroundColour ?? null;
  }
  return merged;
}
