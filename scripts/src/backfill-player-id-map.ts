/**
 * backfill-player-id-map.ts — build the player identity crosswalk for existing
 * central-data tenants.
 *
 * The crosswalk (player_id_map: central PlayHQ participant GUID -> stable
 * per-tenant int id) is minted at provisioning, but tenants provisioned before
 * that step, or clubs that fielded new participants since, can be missing rows.
 * A missing row is why central-club player links are dead (the read path can't
 * resolve a real playerId). This backfills every central tenant idempotently.
 *
 *   pnpm --filter @workspace/scripts run backfill-player-id-map
 *   ... -- --tenant-id=N        # limit to one tenant
 *   ... -- --dry-run            # report what WOULD be minted, insert nothing
 *
 * Requires DATABASE_URL (tenant) AND CENTRAL_DATABASE_URL (central). Idempotent:
 * re-running mints 0 once every participant is mapped. Never writes to central.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db, tenantsTable, playerIdMapTable } from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";
import { centralClubParticipants } from "@workspace/db/central-queries";

const flag = (n: string): boolean =>
  process.argv.slice(2).includes(`--${n}`);
const arg = (n: string): string | undefined =>
  process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

async function main(): Promise<void> {
  const dryRun = flag("dry-run");
  const onlyTenant = arg("tenant-id");

  // Central-data tenants only: reads_from_central AND a resolved central club.
  const conds = [
    eq(tenantsTable.readsFromCentral, true),
    isNotNull(tenantsTable.centralClubId),
  ];
  if (onlyTenant) conds.push(eq(tenantsTable.id, Number(onlyTenant)));
  const tenants = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      centralClubId: tenantsTable.centralClubId,
    })
    .from(tenantsTable)
    .where(and(...conds));

  if (tenants.length === 0) {
    console.log("backfill-player-id-map: no central-data tenants matched.");
    return;
  }

  let totalMinted = 0;
  for (const t of tenants) {
    if (t.centralClubId === null) continue; // narrowed by isNotNull, keeps TS happy

    if (dryRun) {
      // Count central participants vs already-mapped rows without inserting.
      const participants = await centralClubParticipants(t.centralClubId);
      const mapped = await db
        .select({ playerId: playerIdMapTable.playerId })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, t.id));
      const missing = participants.length - mapped.length;
      console.log(
        `[dry-run] tenant #${t.id} ${t.slug} (${t.name}): ` +
          `${mapped.length}/${participants.length} mapped, would mint ${Math.max(0, missing)}.`,
      );
      continue;
    }

    const { minted, totalParticipants } = await mintPlayerIdMap(
      t.id,
      t.centralClubId,
    );
    totalMinted += minted;
    console.log(
      `tenant #${t.id} ${t.slug} (${t.name}): minted ${minted} new mapping(s) ` +
        `(${totalParticipants} central participants total).`,
    );
  }

  console.log(
    dryRun
      ? "backfill-player-id-map: dry run complete, nothing written."
      : `backfill-player-id-map: done — minted ${totalMinted} mapping(s) across ${tenants.length} tenant(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
