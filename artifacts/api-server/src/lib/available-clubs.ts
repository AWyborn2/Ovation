import {
  db,
  tenantsTable,
  provisioningExclusionsTable,
  isExcludedForContext,
  type ProvisioningContext,
} from "@workspace/db";
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
 * picker (`GET /platform/available-clubs`, `context: "self-serve"`) and the
 * platform-admin concierge picker (`GET /platform/admin/available-clubs`,
 * `context: "concierge"`). Both exclude already-claimed and folded/renamed
 * (`active_to` set) clubs; the exclusion-visibility rule itself is
 * `isExcludedForContext` -- the same predicate `provisionTenant()` uses server
 * -side, so the picker and the actual provisioning guard can't disagree about
 * what's allowed.
 */
export async function listAvailableClubs(opts: {
  context: ProvisioningContext;
}): Promise<AvailableClubDto[]> {
  const { centralDb, centralClubsTable, isCentralClubProvisionable } =
    await import("@workspace/db/central");

  const [claimed, exclusions, clubs] = await Promise.all([
    db.select({ centralClubId: tenantsTable.centralClubId }).from(tenantsTable),
    db
      .select({
        centralClubId: provisioningExclusionsTable.centralClubId,
        visibility: provisioningExclusionsTable.visibility,
      })
      .from(provisioningExclusionsTable),
    centralDb.select().from(centralClubsTable),
  ]);
  const claimedIds = new Set(claimed.map((c) => c.centralClubId));
  const excludedIds = new Set(
    exclusions
      .filter((e) => isExcludedForContext(e.visibility, opts.context))
      .map((e) => e.centralClubId),
  );

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
