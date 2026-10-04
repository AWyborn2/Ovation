/**
 * link-hh-cap-only-players.ts — link Halls Head's approved cap-only players to
 * their PlayHQ records (rules and the approved list: link-hh-cap-only-players-core.ts).
 *
 * For each approved player, in ONE transaction:
 *   1. a regular native `players` row (the next id below 90000) copies the
 *      cap-only row, without the cap-only flag;
 *   2. every Halls Head curated link moves from the cap-only id to it — cap,
 *      awards, premierships, club roles, photos, ballots … — through the same
 *      helper a native player merge uses (reassignMergedNativePlayer);
 *   3. `player_id_map` maps the PlayHQ GUID onto it;
 *   4. the cap-only row is deleted.
 * Before the cut-over nothing visible changes (the new row has no native stats,
 * like the cap-only one); after it, the player's page shows their PlayHQ stats.
 *
 *   # preview (default — writes nothing)
 *   pnpm --filter @workspace/scripts run link-hh-cap-only-players -- --tenant=1
 *   # write, after Ash has reviewed the preview
 *   pnpm --filter @workspace/scripts run link-hh-cap-only-players -- --tenant=1 --commit
 *
 * Needs DATABASE_URL (app) and CENTRAL_DATABASE_URL (central, read only). A
 * re-run links nothing more: a linked player no longer has a cap-only row.
 * Output: plan.csv, refused.csv, summary.json and, after a commit,
 * reversal.json (what was written, and how to undo it).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  closeDb,
  mintFloor,
  MINT_LOCK_KEY,
  playerIdMapTable,
  playersTable,
  tenantsTable,
} from "@workspace/db";
import {
  centralDb,
  centralMatchRostersTable,
  centralPlayersTable,
  closeCentralDb,
} from "@workspace/db/central";
import { HALLS_HEAD_CENTRAL_CLUB_ID } from "@workspace/db/central-queries";
import { reassignMergedNativePlayer } from "../../artifacts/api-server/src/lib/curated-player-detach";
import { toCsv } from "./hh-central-crosswalk-core";
import { HALLS_HEAD_TENANT_ID, isCentralPrivate } from "./hh-central-crosswalk-read";
import {
  APPROVED_CAP_ONLY_LINKS,
  CAP_ONLY_RANGE_FLOOR,
  parseLinkArgs,
  planCapOnlyLinks,
  type CentralIdentity,
  type LinkPlan,
} from "./link-hh-cap-only-players-core";

const USAGE = `link-hh-cap-only-players — link Halls Head's approved cap-only players to their PlayHQ records.

  pnpm --filter @workspace/scripts run link-hh-cap-only-players -- --tenant=1 [--commit] [--out=<dir>]

  --tenant=1   required (Halls Head only)
  --commit     write in one transaction (default: preview, writes nothing)
  --out=<dir>  parent directory for the timestamped report folder (default: OS temp dir)`;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select" | "execute">;

async function readCentralIdentities(guids: string[]): Promise<Map<string, CentralIdentity>> {
  if (guids.length === 0) return new Map();
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inArray(centralPlayersTable.participantId, guids));
  const appearances = await centralDb
    .select({ participantId: centralMatchRostersTable.participantId, n: count() })
    .from(centralMatchRostersTable)
    .where(
      and(
        eq(centralMatchRostersTable.clubId, HALLS_HEAD_CENTRAL_CLUB_ID),
        inArray(centralMatchRostersTable.participantId, guids),
      ),
    )
    .groupBy(centralMatchRostersTable.participantId);
  const n = new Map(appearances.map((a) => [a.participantId, Number(a.n)]));
  return new Map(
    players.map((p) => [
      p.participantId.toLowerCase(),
      {
        participantId: p.participantId,
        displayName: p.displayName,
        isPrivate: isCentralPrivate(p.isPrivate),
        clubMatches: n.get(p.participantId) ?? 0,
      },
    ]),
  );
}

/**
 * Where the `players.id` serial stands, when below the fill-in range: an id it
 * has already handed out (even to a since-deleted player) is never reused.
 */
async function serialPosition(reader: Reader): Promise<number> {
  const res = await reader.execute(sql`select last_value::int as v from players_id_seq`);
  const row = res.rows[0] as { v?: number } | undefined;
  const v = Number(row?.v ?? 0);
  return v < CAP_ONLY_RANGE_FLOOR ? v : 0;
}

async function buildPlan(reader: Reader, central: Map<string, CentralIdentity>): Promise<LinkPlan> {
  const nativeRows = await reader
    .select({
      id: playersTable.id,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      isCapOnly: playersTable.isCapOnly,
    })
    .from(playersTable)
    .where(eq(playersTable.isCapOnly, true));
  const mapped = await reader
    .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, HALLS_HEAD_TENANT_ID));
  return planCapOnlyLinks({
    requests: APPROVED_CAP_ONLY_LINKS,
    nativeRows,
    mappedParticipantIds: new Set(mapped.map((m) => m.participantId.toLowerCase())),
    central,
    mintFloor: Math.max(
      await mintFloor(
        reader,
        HALLS_HEAD_TENANT_ID,
        mapped.map((m) => m.playerId),
      ),
      await serialPosition(reader),
    ),
  });
}

const writeSet = (p: LinkPlan): string =>
  JSON.stringify(p.links.map((l) => `${l.capOnlyId}>${l.newId}=${l.participantId}`));

async function commitPlan(tx: Tx, plan: LinkPlan): Promise<void> {
  for (const l of plan.links) {
    const [old] = await tx.select().from(playersTable).where(eq(playersTable.id, l.capOnlyId));
    if (!old?.isCapOnly || old.id < CAP_ONLY_RANGE_FLOOR) {
      throw new Error(`player ${l.capOnlyId} is no longer a cap-only row`);
    }
    await tx.insert(playersTable).values({ ...old, id: l.newId, isCapOnly: false });
    await reassignMergedNativePlayer(tx, l.capOnlyId, l.newId);
    await tx.insert(playerIdMapTable).values({
      tenantId: HALLS_HEAD_TENANT_ID,
      participantId: l.participantId,
      playerId: l.newId,
    });
    await tx.delete(playersTable).where(eq(playersTable.id, l.capOnlyId));
  }
  // Explicit ids below the serial's position must never be handed out again.
  await tx.execute(sql`
    select setval(pg_get_serial_sequence('players', 'id'),
                  greatest((select max(id) from players where id < ${CAP_ONLY_RANGE_FLOOR}),
                           (select last_value from players_id_seq)))
  `);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const args = parseLinkArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (args.tenant !== HALLS_HEAD_TENANT_ID) {
    console.error("--tenant=1 is required (Halls Head only).");
    console.error(USAGE);
    process.exit(2);
  }
  if (!process.env.DATABASE_URL || !process.env.CENTRAL_DATABASE_URL) {
    console.error("Both DATABASE_URL (app) and CENTRAL_DATABASE_URL (central) must be set.");
    process.exit(2);
  }
  const [tenant] = await db
    .select({ centralClubId: tenantsTable.centralClubId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, HALLS_HEAD_TENANT_ID));
  if (tenant?.centralClubId !== HALLS_HEAD_CENTRAL_CLUB_ID) {
    throw new Error(`tenant 1 is not linked to central club ${HALLS_HEAD_CENTRAL_CLUB_ID}`);
  }

  console.log(args.commit ? "MODE: COMMIT" : "MODE: PREVIEW (nothing is written)");
  const central = await readCentralIdentities(
    APPROVED_CAP_ONLY_LINKS.map((l) => l.participantId.toLowerCase()),
  );
  const plan = await buildPlan(db, central);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(args.out ?? os.tmpdir(), `link-hh-cap-only-players-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "plan.csv"),
    toCsv(
      ["name", "cap_only_id", "new_player_id", "participant_id", "central_name", "hh_matches"],
      plan.links.map((l) => [
        l.name,
        l.capOnlyId,
        l.newId,
        l.participantId,
        l.centralName ?? "",
        l.clubMatches,
      ]),
    ),
  );
  writeFileSync(
    path.join(outDir, "refused.csv"),
    toCsv(
      ["name", "participant_id", "reason"],
      plan.refused.map((r) => [r.name, r.participantId, r.reason]),
    ),
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.commit ? "commit" : "preview",
    tenantId: HALLS_HEAD_TENANT_ID,
    approved: APPROVED_CAP_ONLY_LINKS.length,
    toLink: plan.links.length,
    refused: plan.refused.length,
  };
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  for (const l of plan.links) {
    console.log(
      `  link ${l.name}: cap-only #${l.capOnlyId} -> player #${l.newId} = ${l.participantId} ` +
        `("${l.centralName ?? ""}", ${l.clubMatches} Halls Head matches)`,
    );
  }
  for (const r of plan.refused) console.log(`  refuse ${r.name}: ${r.reason}`);
  console.log(`${plan.links.length} to link, ${plan.refused.length} refused. Report: ${outDir}`);

  if (args.commit && plan.links.length > 0) {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${MINT_LOCK_KEY}, ${HALLS_HEAD_TENANT_ID})`,
      );
      const again = await buildPlan(tx, central);
      if (writeSet(again) !== writeSet(plan)) {
        throw new Error("the data changed since the preview — nothing written; re-run");
      }
      await commitPlan(tx, plan);
    });
    writeFileSync(
      path.join(outDir, "reversal.json"),
      JSON.stringify(
        {
          committedAt: new Date().toISOString(),
          tenantId: HALLS_HEAD_TENANT_ID,
          links: plan.links,
          undo:
            "For each link: re-create the cap-only players row at cap_only_id (copy of new_player_id, " +
            "is_cap_only = true), move the curated links back with reassignMergedNativePlayer(tx, " +
            "newId, capOnlyId), delete the player_id_map row (tenant 1, participant_id) and the " +
            "players row new_player_id.",
        },
        null,
        2,
      ),
    );
    console.log(`Committed ${plan.links.length} link(s). reversal.json written.`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCentralDb();
    await closeDb();
  });
