import { and, eq, ilike, isNotNull } from "drizzle-orm";
import { db, type Db } from "./index";

/**
 * Anything that can run tenant-DB reads and inserts: the shared `db` handle or
 * a transaction handle from `db.transaction`, so callers can mint atomically
 * with their own writes.
 */
type TenantExecutor = Pick<Db, "select" | "insert">;
import { tenantsTable, type TenantRow } from "./schema/tenants";
import { playerIdMapTable } from "./schema/player_id_map";
import { playerCurationTable } from "./schema/player_curation";
import { MINT_ID_CEILING, mintFloor } from "./player-id-mint";
import { adminsTable, type AdminRow } from "./schema/admins";
import {
  provisioningExclusionsTable,
  isExcludedForContext,
  type ProvisioningContext,
} from "./schema/provisioning_exclusions";
import { centralDb, centralClubsTable, isCentralClubProvisionable } from "./central";
import { centralClubParticipants, centralCurrentSeasonSquad } from "./central-queries";
import { seasonStartYearFor } from "./seasons";
import { markSquadSeasonSeeded, seedCurrentSeasonSquad } from "./squad-seed";
import { seedTenantPremierships, type SeedTenantPremiershipsResult } from "./premierships-seed";

/**
 * Tenant provisioning — the single source of truth for onboarding a club onto the
 * platform, shared by the concierge CLI (scripts/seed-*-tenant) and the self-serve
 * signup API so both do exactly the same thing:
 *
 *   1. resolve the club's row in central.clubs (by id, else exact name),
 *   2. upsert/insert the tenants row (reads_from_central, brand from the central
 *      primary colour),
 *   3. mint the player_id_map crosswalk (one stable per-tenant int id per central
 *      participant the club fielded) — idempotent, continues the per-tenant max,
 *   4. seed the premiership honour board from central.premiers (results, Grand
 *      Final scorecard link, team lists) — best-effort, after the commit.
 *
 * Importing this module loads ./central (needs CENTRAL_DATABASE_URL), so only the
 * provisioning paths import it — the tenant-only request path never touches it.
 */

export type ProvisionErrorCode =
  | "club_not_found"
  | "club_ambiguous"
  | "club_folded"
  | "club_excluded"
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
  /**
   * Which provisioning-exclusion rule applies (see provisioning_exclusions
   * table): "self-serve" (default, the more restrictive of the two) rejects a
   * club excluded either "everywhere" or "self_serve_only". "concierge"
   * rejects only an "everywhere" exclusion — a platform admin can still
   * provision a club that's merely hidden from public self-serve signup.
   */
  context?: ProvisioningContext;
  /**
   * Create the first admin INSIDE the same transaction as the tenant row and
   * the crosswalk mint (self-serve signup). Without this, a failure after
   * provisioning left a tenant with no admin behind a "slug taken" error on
   * every retry (rmdcc/bmdcc, 10 Sep 2026). The caller hashes the password.
   * Concierge callers that create admins separately leave this unset.
   */
  firstAdmin?: { username: string; displayName: string; passwordHash: string };
}

export interface ProvisionTenantResult {
  tenant: TenantRow;
  centralClub: { clubId: number; name: string | null };
  mintedMappings: number;
  totalParticipants: number;
  /** The first admin, when `firstAdmin` was supplied. */
  admin?: AdminRow;
  /**
   * Premiership honour-board seed outcome. Best-effort: a failure here never
   * fails provisioning (the tenant is already committed) — `error` carries the
   * message so the caller can log it, and the seed can be re-run with
   * `pnpm --filter @workspace/scripts run seed-central-premierships`.
   */
  premierships: SeedTenantPremiershipsResult | { error: string };
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
  const club = rows[0]!;
  if (!isCentralClubProvisionable(club)) {
    // Folded, or renamed/merged into a successor row (active_to set) — this id
    // is not the one to provision, regardless of whether the picker was
    // bypassed. Defense-in-depth: /platform/available-clubs already excludes
    // these from both the self-serve and concierge pickers.
    throw new ProvisionError(
      "club_folded",
      `${club.name ?? `Club ${club.clubId}`} is no longer active and can't be provisioned as a tenant.`,
    );
  }

  const [exclusion] = await db
    .select({ visibility: provisioningExclusionsTable.visibility })
    .from(provisioningExclusionsTable)
    .where(eq(provisioningExclusionsTable.centralClubId, club.clubId));
  if (exclusion && isExcludedForContext(exclusion.visibility, opts.context ?? "self-serve")) {
    throw new ProvisionError(
      "club_excluded",
      `${club.name ?? `Club ${club.clubId}`} has been excluded from provisioning.`,
    );
  }

  return club;
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
    // central.clubs carries only a background colour; accents derive from it
    // (the brand resolver fills primary/juniors from the background colour).
    backgroundColour: club.primaryColour ?? null,
    primaryColour: null,
    juniorsColour: null,
    customDomain: null,
    plan: opts.plan ?? "free",
  };

  // A concierge re-run (upsert) refreshes the tenant's IDENTITY from central
  // but must not clobber branding an admin has since set in the app — the old
  // `set: values` reset logo, colours, favicon, custom domain and plan to their
  // provisioning defaults on every re-run.
  const identityOnly = {
    centralClubId: values.centralClubId,
    appClubId: values.appClubId,
    readsFromCentral: values.readsFromCentral,
    name: values.name,
    shortName: values.shortName,
  };

  const currentPlayers = await centralCurrentSeasonSquad(
    club.clubId,
    seasonStartYearFor(new Date()),
  );
  // Tenant row + crosswalk mint in ONE transaction: a failure while minting
  // used to leave a tenant with a partial player_id_map.
  const { tenant, admin, minted, totalParticipants } = await db.transaction(async (tx) => {
    const [row] =
      mode === "create"
        ? await tx.insert(tenantsTable).values(values).returning()
        : await tx
            .insert(tenantsTable)
            .values(values)
            .onConflictDoUpdate({ target: tenantsTable.slug, set: identityOnly })
            .returning();

    if (!row) throw new Error(`provisioning: tenant upsert for "${values.slug}" returned no row`);

    // Mint the player identity crosswalk (idempotent) via the shared helper so the
    // provisioning path and the backfill script (scripts/backfill-player-id-map)
    // mint identically.
    const mint = await mintPlayerIdMap(row.id, row.centralClubId, tx);
    if ((await seedCurrentSeasonSquad(tx, row.id, currentPlayers)) > 0) {
      await markSquadSeasonSeeded(tx, row.id);
    }

    // First admin in the SAME transaction: if this insert fails, the tenant and
    // its crosswalk roll back with it, so a retry can never hit "already taken"
    // for a tenant nobody can log in to.
    let admin: AdminRow | undefined;
    if (opts.firstAdmin) {
      const [created] = await tx
        .insert(adminsTable)
        .values({ tenantId: row.id, ...opts.firstAdmin })
        .returning();
      if (!created) {
        throw new Error(`provisioning: first-admin insert for "${values.slug}" returned no row`);
      }
      admin = created;
    }
    return { tenant: row, admin, ...mint };
  });

  // Outside the transaction: the honour board is curated content layered on
  // the tenant, not part of its identity — a central hiccup must not roll back
  // (or block) onboarding. Idempotent, so an upsert re-run only backfills.
  let premierships: ProvisionTenantResult["premierships"];
  try {
    premierships = await seedTenantPremierships(tenant.id, tenant.centralClubId);
  } catch (e) {
    premierships = { error: e instanceof Error ? e.message : String(e) };
  }

  return {
    tenant,
    centralClub: { clubId: club.clubId, name: club.name },
    mintedMappings: minted,
    totalParticipants,
    admin,
    premierships,
  };
}

/**
 * Minted player ids stay strictly below this (ids >= 90000 are the fill-in /
 * cap-only ranges). The per-tenant sequence — including Halls Head starting
 * above its highest native id — lives in ./player-id-mint, shared with the
 * synthetic pre-digital players a club history import mints (U11).
 */
export { MINT_ID_CEILING };

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
  /** Tenant-DB executor; pass a transaction handle to mint atomically with other writes. */
  executor: TenantExecutor = db,
): Promise<MintPlayerIdMapResult> {
  const participants = await centralClubParticipants(centralClubId);
  const existing = await executor
    .select({
      participantId: playerIdMapTable.participantId,
      playerId: playerIdMapTable.playerId,
    })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  // Merged-away GUIDs fold into their keeper on read, so they never get a
  // fresh id of their own (KTD2). Any crosswalk row they already have is kept.
  // Only a CONFIRMED merge folds: a suggested or rejected pair is still two
  // players, and each needs its own id.
  const mergedAway = await executor
    .select({ participantId: playerCurationTable.participantId })
    .from(playerCurationTable)
    .where(
      and(
        eq(playerCurationTable.tenantId, tenantId),
        isNotNull(playerCurationTable.mergedIntoParticipantId),
        eq(playerCurationTable.mergeStatus, "confirmed"),
      ),
    );
  const skipGuids = new Set([
    ...existing.map((e) => e.participantId),
    ...mergedAway.map((m) => m.participantId),
  ]);

  // Continue the per-tenant sequence below the fill-in / cap-only ranges. For
  // Halls Head, whose persisted keeper rows reuse native `players.id`s, start
  // above the highest native id so a minted id never collides with one.
  const floor = await mintFloor(
    executor,
    tenantId,
    existing.map((e) => e.playerId),
  );

  let nextId = floor + 1;
  const toInsert = participants
    .filter((p) => !skipGuids.has(p.participantId))
    .map((p) => ({ tenantId, participantId: p.participantId, playerId: nextId++ }));
  if (toInsert.length > 0 && nextId - 1 >= MINT_ID_CEILING) {
    throw new Error(
      `mintPlayerIdMap: tenant ${tenantId} would mint player id ${nextId - 1}, at or above ` +
        `${MINT_ID_CEILING} (the fill-in / cap-only range). Nothing was minted.`,
    );
  }
  if (toInsert.length > 0) {
    await executor.insert(playerIdMapTable).values(toInsert);
  }
  return { minted: toInsert.length, totalParticipants: participants.length };
}
