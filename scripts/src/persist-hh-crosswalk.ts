/**
 * persist-hh-crosswalk.ts — store the Halls Head crosswalk (plan U4).
 *
 * Re-runs the scorecard-evidence matcher (hh-central-crosswalk-core, the same
 * rules as the read-only `hh-crosswalk` diagnostic) and persists its CLEAN
 * result for tenant 1:
 *   - player_id_map: one row per CLEAN player, keeper GUID → native players.id
 *   - player_curation: merged_into_participant_id = keeper for each other GUID
 *     the same player was assigned (split identities)
 * Split identities (AMBIGUOUS only because the player's lines spread over
 * several of its own GUIDs) are persisted the same way once every GUID passes
 * the split gate (not shared, not weak-only, not private, never two in one
 * central match). Other AMBIGUOUS players and every unsafe row go to
 * review.csv only, with a specific reason code. Nothing visible
 * changes: Halls Head still reads native until its cut-over.
 *
 *   # preview (default — READ ONLY, writes nothing to any database)
 *   pnpm --filter @workspace/scripts run persist-hh-crosswalk -- --tenant=1
 *   # write, in ONE transaction, after Ash has reviewed the preview
 *   pnpm --filter @workspace/scripts run persist-hh-crosswalk -- --tenant=1 --commit
 *
 *   --tenant=1   required; any other tenant is refused
 *   --commit     write (default is preview only)
 *   --out=<dir>  parent directory for the timestamped report folder (default: OS temp dir)
 *
 * Needs DATABASE_URL (app DB) and CENTRAL_DATABASE_URL (central, read only —
 * never written). Idempotent: existing rows are left alone, a differing
 * existing row is reported rather than overwritten, and a re-run writes 0.
 * Output: plan-map.csv, plan-merges.csv, review.csv, summary.json, and after a
 * commit reversal.json (exactly what was written, and how to undo it).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, closeDb, playerCurationTable, playerIdMapTable, tenantsTable } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import { HALLS_HEAD_CENTRAL_CLUB_ID } from "@workspace/db/central-queries";
import {
  linkNativeToCentral,
  matchesByParticipant,
  toCsv,
  type NativePlayer,
  type PlayerLink,
} from "./hh-central-crosswalk-core";
import {
  HALLS_HEAD_TENANT_ID,
  isCentralPrivate,
  readCentral,
  readNative,
} from "./hh-central-crosswalk-read";
import { parsePersistArgs, planPersistence, type PersistPlan } from "./persist-hh-crosswalk-core";

const USAGE = `persist-hh-crosswalk — persist the Halls Head keeper-GUID → native id crosswalk + split-identity merges.

  pnpm --filter @workspace/scripts run persist-hh-crosswalk -- --tenant=1 [--commit] [--out=<dir>]

  --tenant=1   required (Halls Head only)
  --commit     write in one transaction (default: preview, writes nothing)
  --out=<dir>  parent directory for the timestamped report folder (default: OS temp dir)`;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;

async function readExisting(reader: Reader, tenantId: number) {
  const existingMap = await reader
    .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
    .from(playerIdMapTable)
    .where(eq(playerIdMapTable.tenantId, tenantId));
  const existingCuration = await reader
    .select({
      participantId: playerCurationTable.participantId,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
    })
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId));
  return { existingMap, existingCuration };
}

/** Stable fingerprint of what a plan would write, to prove commit == preview. */
const writeSet = (p: PersistPlan): string =>
  JSON.stringify({
    map: p.mapInserts.map((r) => `${r.participantId}=${r.playerId}`).sort(),
    merges: p.merges.map((m) => `${m.participantId}>${m.keeperParticipantId}:${m.kind}`).sort(),
  });

async function commitPlan(tx: Tx, tenantId: number, plan: PersistPlan): Promise<void> {
  if (plan.mapInserts.length > 0) {
    // Plain insert: a unique-index clash (tenant+GUID or tenant+player id)
    // aborts the whole transaction instead of being silently skipped.
    await tx.insert(playerIdMapTable).values(
      plan.mapInserts.map((r) => ({
        tenantId,
        participantId: r.participantId,
        playerId: r.playerId,
      })),
    );
  }
  const inserts = plan.merges.filter((m) => m.kind === "insert");
  if (inserts.length > 0) {
    await tx.insert(playerCurationTable).values(
      inserts.map((m) => ({
        tenantId,
        participantId: m.participantId,
        mergedIntoParticipantId: m.keeperParticipantId,
        // Scorecard-evidence merges, reviewed via the dry run before --commit:
        // confirmed, so they fold on read (only confirmed merges do).
        mergeStatus: "confirmed" as const,
      })),
    );
  }
  for (const m of plan.merges.filter((x) => x.kind === "update")) {
    // Only ever fills an EMPTY merge pointer; the rename (if any) is kept.
    const res = await tx
      .update(playerCurationTable)
      .set({
        mergedIntoParticipantId: m.keeperParticipantId,
        mergeStatus: "confirmed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playerCurationTable.tenantId, tenantId),
          eq(playerCurationTable.participantId, m.participantId),
          isNull(playerCurationTable.mergedIntoParticipantId),
        ),
      );
    if (res.rowCount !== 1) {
      throw new Error(`curation update for ${m.participantId} touched ${res.rowCount} rows`);
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const args = parsePersistArgs(argv);
  if ("error" in args) {
    console.error(args.error);
    console.error(USAGE);
    process.exit(2);
  }
  if (!process.env.DATABASE_URL || !process.env.CENTRAL_DATABASE_URL) {
    console.error("Both DATABASE_URL (app) and CENTRAL_DATABASE_URL (central) must be set.");
    process.exit(2);
  }
  const tenantId = args.tenantId;
  if (tenantId !== HALLS_HEAD_TENANT_ID) throw new Error("only tenant 1 is supported");

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      centralClubId: tenantsTable.centralClubId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) throw new Error(`tenant ${tenantId} not found`);
  if (tenant.centralClubId !== HALLS_HEAD_CENTRAL_CLUB_ID) {
    throw new Error(
      `tenant ${tenantId} (${tenant.slug}) has central club ${tenant.centralClubId}, expected ` +
        `${HALLS_HEAD_CENTRAL_CLUB_ID} — refusing.`,
    );
  }

  console.log(args.commit ? "MODE: COMMIT" : "MODE: PREVIEW (nothing is written)");
  console.log("Reading native (READ ONLY transaction)…");
  const native = await readNative();
  console.log(`Reading central club_id=${HALLS_HEAD_CENTRAL_CLUB_ID} (read-only proxy)…`);
  const central = await readCentral();
  const { playerLinks, conflicts, appIndex } = linkNativeToCentral({ native, central });
  const privateByGuid = new Map(
    central.players.map((p) => [p.participantId, isCentralPrivate(p.isPrivate)]),
  );
  const centralMatchesByGuid = matchesByParticipant(appIndex);

  const existing = await readExisting(db, tenantId);
  const plan = planPersistence({
    links: playerLinks,
    privateByGuid,
    centralMatchesByGuid,
    ...existing,
  });

  // ---- Report (local files only) ----------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(args.out ?? os.tmpdir(), `persist-hh-crosswalk-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const playerById = new Map(native.players.map((p) => [p.id, p]));
  const centralName = new Map(central.players.map((p) => [p.participantId, p.displayName]));
  const linkById = new Map<number, PlayerLink>(playerLinks.map((l) => [l.nativePlayerId, l]));
  const fmtName = (p: NativePlayer | undefined): string =>
    p ? `${p.givenName} ${p.surname}`.trim() : "";

  writeFileSync(
    path.join(outDir, "plan-map.csv"),
    toCsv(
      ["action", "native_player_id", "native_name", "participant_id", "central_name", "lines"],
      [
        ...plan.mapInserts.map((r) => ["insert", r] as const),
        ...plan.mapUnchanged.map((r) => ["unchanged", r] as const),
      ].map(([action, r]) => [
        action,
        r.playerId,
        fmtName(playerById.get(r.nativePlayerId)),
        r.participantId,
        centralName.get(r.participantId) ?? "",
        linkById.get(r.nativePlayerId)?.matchedLines ?? "",
      ]),
    ),
  );
  writeFileSync(
    path.join(outDir, "plan-merges.csv"),
    toCsv(
      ["action", "native_player_id", "native_name", "participant_id", "central_name", "keeper"],
      [
        ...plan.merges.map((m) => [m.kind, m] as const),
        ...plan.mergesUnchanged.map((m) => ["unchanged", m] as const),
      ].map(([action, m]) => [
        action,
        m.nativePlayerId,
        fmtName(playerById.get(m.nativePlayerId)),
        m.participantId,
        centralName.get(m.participantId) ?? "",
        m.keeperParticipantId,
      ]),
    ),
  );
  writeFileSync(
    path.join(outDir, "review.csv"),
    toCsv(
      ["reason", "native_player_id", "native_name", "participant_id", "central_name", "detail"],
      plan.review.map((r) => [
        r.reason,
        r.nativePlayerId,
        fmtName(playerById.get(r.nativePlayerId)),
        r.participantId ?? "",
        r.participantId ? (centralName.get(r.participantId) ?? "") : "",
        r.detail,
      ]),
    ),
  );
  const reviewByReason: Record<string, number> = {};
  for (const r of plan.review) reviewByReason[r.reason] = (reviewByReason[r.reason] ?? 0) + 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.commit ? "commit" : "preview",
    tenantId,
    centralClubId: HALLS_HEAD_CENTRAL_CLUB_ID,
    players: plan.counts,
    crosswalk: {
      toInsert: plan.mapInserts.length,
      unchanged: plan.mapUnchanged.length,
      totalAfter: plan.counts.mapRows,
    },
    merges: {
      toWrite: plan.merges.length,
      unchanged: plan.mergesUnchanged.length,
      totalAfter: plan.counts.mergeRows,
    },
    review: reviewByReason,
    severeConflicts: conflicts.filter((c) => c.severe).length,
    outputDir: outDir,
  };
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  console.log("\n=== Halls Head crosswalk persistence ===");
  console.log("Players:", plan.counts);
  console.log("Crosswalk rows:", summary.crosswalk);
  console.log("Merges:", summary.merges);
  console.log("Review:", reviewByReason);
  console.log(`Report: ${outDir}`);

  if (!args.commit) {
    console.log("\nPREVIEW only — nothing written. Re-run with --commit after review.");
    return;
  }

  // ---- Commit: one transaction, re-planned against locked current rows ----
  await db.transaction(async (tx) => {
    // Block concurrent writers to both tables for the life of the transaction
    // (reads still proceed), then re-plan against what is there now.
    await tx.execute(
      sql`LOCK TABLE ${playerIdMapTable}, ${playerCurationTable} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const now = await readExisting(tx, tenantId);
    const txPlan = planPersistence({
      links: playerLinks,
      privateByGuid,
      centralMatchesByGuid,
      ...now,
    });
    if (writeSet(txPlan) !== writeSet(plan)) {
      throw new Error("rows changed since the preview — aborting, nothing written. Re-run.");
    }
    await commitPlan(tx, tenantId, txPlan);
  });

  const reversal = {
    committedAt: new Date().toISOString(),
    tenantId,
    playerIdMapInserted: plan.mapInserts.map((r) => ({
      participantId: r.participantId,
      playerId: r.playerId,
    })),
    playerCurationInserted: plan.merges
      .filter((m) => m.kind === "insert")
      .map((m) => ({
        participantId: m.participantId,
        mergedIntoParticipantId: m.keeperParticipantId,
      })),
    playerCurationUpdated: plan.merges
      .filter((m) => m.kind === "update")
      .map((m) => ({
        participantId: m.participantId,
        mergedIntoParticipantId: m.keeperParticipantId,
        previousMergedIntoParticipantId: null,
      })),
    undo:
      "DELETE the inserted player_id_map rows and player_curation rows (tenant_id + participant_id); " +
      "set merged_into_participant_id and merge_status back to NULL on the updated curation rows.",
  };
  writeFileSync(path.join(outDir, "reversal.json"), JSON.stringify(reversal, null, 2) + "\n");
  console.log(
    `\nCOMMITTED: ${plan.mapInserts.length} crosswalk row(s), ${plan.merges.length} merge(s). ` +
      `Reversal record: ${path.join(outDir, "reversal.json")}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closeDb(), closeCentralDb()]);
  });
