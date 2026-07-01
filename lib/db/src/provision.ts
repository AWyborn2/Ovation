import { eq, ilike } from "drizzle-orm";
import { db } from "./index";
import { tenantsTable, type TenantRow } from "./schema/tenants";
import { playerIdMapTable } from "./schema/player_id_map";
import { centralDb, centralClubsTable } from "./central";
import { centralClubParticipants } from "./central-queries";

/**
 * Tenant provisioning — the single source of truth for onboarding a club onto the
 * platform, shared by the concierge CLI (scripts/seed-*-tenant) and the self-serve
 * signup API so both do exactly the same thing:
 *
 *   1. resolve the club's row in central.clubs (by id, else exact name),
 *   2. upsert/insert the tenants row (reads_from_central, brand from the central
 *      primary colour),
 *   3. mint the player_id_map crosswalk (one stable per-tenant int id per central
 *      participant the club fielded) — idempotent, continues the per-tenant max.
 *
 * Importing this module loads ./central (needs CENTRAL_DATABASE_URL), so only the
 * provisioning paths import it — the tenant-only request path never touches it.
 */

export type ProvisionErrorCode =
  | "club_not_found"
  | "club_ambiguous"
  | "slug_taken"
  | "club_claimed";

export class ProvisionError extends Error {
  constructor(
    public code: ProvisionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

export interface ProvisionTenantOptions {
  slug: string;
  /** Pin the central club by id; otherwise resolve by exact `name`. */
  centralClubId?: number;
  name?: string;
  logoUrl?: string | null;
  plan?: string;
  /**
   * "upsert" (default) re-points an existing tenant with the same slug — the
   * idempotent concierge path. "create" rejects a slug that's already taken or a
   * central club already claimed by another tenant — the self-serve signup path.
   */
  mode?: "upsert" | "create";
}

export interface ProvisionTenantResult {
  tenant: TenantRow;
  centralClub: { clubId: number; name: string | null };
  mintedMappings: number;
  totalParticipants: number;
}

/** Resolve the central.clubs row by explicit id, else by exact (case-insensitive) name. */
async function resolveCentralClub(opts: ProvisionTenantOptions) {
  const rows = opts.centralClubId
    ? await centralDb
        .select()
        .from(centralClubsTable)
        .where(eq(centralClubsTable.clubId, opts.centralClubId))
    : opts.name
      ? await centralDb
          .select()
          .from(centralClubsTable)
          .where(ilike(centralClubsTable.name, opts.name))
      : [];
  if (rows.length === 0) {
    throw new ProvisionError(
      "club_not_found",
      `No central.clubs row matching ${opts.centralClubId ?? `"${opts.name}"`}.`,
    );
  }
  if (rows.length > 1) {
    throw new ProvisionError(
      "club_ambiguous",
      `Multiple central.clubs match "${opts.name}": ` +
        rows.map((c) => `${c.clubId}=${c.name}`).join(", ") +
        ". Provide centralClubId.",
    );
  }
  return rows[0];
}

export async function provisionTenant(
  opts: ProvisionTenantOptions,
): Promise<ProvisionTenantResult> {
  const slug = opts.slug.trim().toLowerCase();
  const mode = opts.mode ?? "upsert";
  const club = await resolveCentralClub(opts);

  if (mode === "create") {
    const [slugTaken] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug));
    if (slugTaken) {
      throw new ProvisionError("slug_taken", `The slug "${slug}" is already taken.`);
    }
    const [claimed] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.centralClubId, club.clubId));
    if (claimed) {
      throw new ProvisionError(
        "club_claimed",
        `${club.name ?? "That club"} has already been claimed.`,
      );
    }
  }

  const values = {
    slug,
    centralClubId: club.clubId,
    appClubId: null, // central-sourced club has no native clubs-register row
    readsFromCentral: true,
    name: club.name ?? opts.name ?? slug,
    shortName: club.shortName ?? null,
    logoUrl: opts.logoUrl ?? null,
    faviconUrl: null,
    // central.clubs carries only a primary colour; accents derive from it
    // (the brand resolver fills secondary/tertiary from the primary).
    primaryColour: club.primaryColour ?? null,
    secondaryColour: null,
    tertiaryColour: null,
    customDomain: null,
    plan: opts.plan ?? "free",
  };

  const [tenant] =
    mode === "create"
      ? await db.insert(tenantsTable).values(values).returning()
      : await db
          .insert(tenantsTable)
          .values(values)
          .onConflictDoUpdate({ target: tenantsTable.slug, set: values })
          .returning();

  // Mint the player identity crosswalk (idempotent) via the shared helper so the
  // provisioning path and the backfill script (scripts/backfill-player-id-map)
  // mint identically.
  const { minted, totalParticipants } = await mintPlayerIdMap(
    tenant.id,
    tenant.centralClubId,
  );

  return {
    tenant,
    centralClub: { clubId: club.clubId, name: club.name },
    mintedMappings: minted,
    totalParticipants,
  };
}

export interface MintPlayerIdMapResult {
  /** New crosswalk rows inserted this run (0 when already fully mapped). */
  minted: number;
  /** Central participants the club has fielded (the target crosswalk size). */
  totalParticipants: number;
}

/**
 * Mint the player identity crosswalk for one tenant: one stable per-tenant int id
 * per central participant the club fielded. Idempotent — only GUIDs not already
 * mapped get a fresh int, and the per-tenant sequence continues from the current
 * max, so re-running (or running after new participants appear) never renumbers
 * or duplicates. Shared by `provisionTenant` and the backfill script so both
 * paths agree.
 */
export async function mintPlayerIdMap(
  tenantId: number,
  centralClubId: number,
): Promise<MintPlayerIdMapResult> {
  const participants = await centralClubParticipants(centralClubId);
  const existing = await db
    .select({
      participantId: playerIdMapTable.participantId,
      playerId: playerIdMapTable.playerId,
    })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const mappedGuids = new Set(existing.map((e) => e.participantId));
  let nextId = existing.reduce((m, e) => Math.max(m, e.playerId), 0) + 1;
  const toInsert = participants
    .filter((p) => !mappedGuids.has(p.participantId))
    .map((p) => ({ tenantId, participantId: p.participantId, playerId: nextId++ }));
  if (toInsert.length > 0) {
    await db.insert(playerIdMapTable).values(toInsert);
  }
  return { minted: toInsert.length, totalParticipants: participants.length };
}
