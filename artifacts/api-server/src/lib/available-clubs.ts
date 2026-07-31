import { db, tenantsTable, provisioningExclusionsTable } from "@workspace/db";
import { slugify } from "./slug";

export interface AvailableClubDto {
  centralClubId: number;
  name: string;
  shortName: string | null;
  backgroundColour: string | null;
  suggestedSlug: string;
}

/**
 * Central PCA clubs eligible for provisioning, shared by the public self-serve
 * picker (`GET /platform/available-clubs`) and the platform-admin concierge
 * picker (`GET /platform/admin/available-clubs`). Both exclude already-claimed
 * and folded/renamed (`active_to` set) clubs; they differ only in which
 * provisioning-exclusion visibility they honour:
 *
 * - `excludeSelfServeOnly: true` (public/self-serve) — excludes clubs marked
 *   either "everywhere" or "self_serve_only".
 * - `excludeSelfServeOnly: false` (concierge) — excludes only "everywhere";
 *   a "self_serve_only" club stays available for a platform admin to pick.
 */
export async function listAvailableClubs(opts: {
  excludeSelfServeOnly: boolean;
}): Promise<AvailableClubDto[]> {
  const { centralDb, centralClubsTable, isCentralClubProvisionable } =
    await import("@workspace/db/central");

  const [claimed, exclusions] = await Promise.all([
    db.select({ centralClubId: tenantsTable.centralClubId }).from(tenantsTable),
    db
      .select({
        centralClubId: provisioningExclusionsTable.centralClubId,
        visibility: provisioningExclusionsTable.visibility,
      })
      .from(provisioningExclusionsTable),
  ]);
  const claimedIds = new Set(claimed.map((c) => c.centralClubId));
  const excludedIds = new Set(
    exclusions
      .filter(
        (e) =>
          e.visibility === "everywhere" ||
          (opts.excludeSelfServeOnly && e.visibility === "self_serve_only"),
      )
      .map((e) => e.centralClubId),
  );

  const clubs = await centralDb.select().from(centralClubsTable);
  return clubs
    .filter(
      (c) =>
        !claimedIds.has(c.clubId) &&
        isCentralClubProvisionable(c) &&
        !excludedIds.has(c.clubId),
    )
    .map((c) => ({
      centralClubId: c.clubId,
      name: c.name ?? `Club ${c.clubId}`,
      shortName: c.shortName ?? null,
      backgroundColour: c.primaryColour ?? null,
      suggestedSlug: slugify(c.name ?? `club-${c.clubId}`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
