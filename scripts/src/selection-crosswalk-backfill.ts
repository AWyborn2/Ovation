/**
 * selection-crosswalk-backfill.ts — seed a club's Selection Hub crosswalk
 * (`squad_member_participants`, ADR-008 §4) from its existing team lists.
 *
 * A PlayHQ team-list row carries the player's participant GUID. Where that GUID
 * already resolves to exactly one squad member — through the Hub's matcher (a
 * unique link or a unique name), or for a "Private Player" row through a link
 * exactly one member holds — the backfill remembers it, so the next draft or
 * "Use PlayHQ team" places that player even when PlayHQ shows only "Private
 * Player". Rules: selection-crosswalk-backfill-core.ts.
 *
 *   # preview (default — writes nothing)
 *   pnpm --filter @workspace/scripts run selection-crosswalk-backfill -- --tenant=1
 *   # write the "insert" rows, after reviewing the preview
 *   pnpm --filter @workspace/scripts run selection-crosswalk-backfill -- --tenant=1 --apply --yes
 *
 * Never overwrites a crosswalk row (an admin's match wins) and never writes a
 * GUID whose rows disagree. Re-running inserts nothing new. Needs DATABASE_URL;
 * `--apply` against a non-local database also needs `--yes`.
 * Output (player names — scripts/exports/ is git-ignored, never commit it):
 * plan.csv and summary.json in a timestamped folder.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  db,
  closeDb,
  squadMemberParticipantsTable,
  squadMembersTable,
  teamListsTable,
  fixturesTable,
  tenantsTable,
} from "@workspace/db";
import { toCsv } from "./hh-central-crosswalk-core";
import { confirmDatabaseTarget } from "./lib/cli";
import { parseBackfillArgs, planCrosswalkBackfill } from "./selection-crosswalk-backfill-core";

const USAGE = `selection-crosswalk-backfill — seed the Selection Hub's PlayHQ participant crosswalk.

  pnpm --filter @workspace/scripts run selection-crosswalk-backfill -- --tenant=<id> [--apply [--yes]] [--out=<dir>]

  --tenant=<id>  required: the club to backfill (run once per club)
  --apply        write the planned rows (default: preview, writes nothing)
  --yes          confirm writing to a non-local database
  --out=<dir>    parent folder for the timestamped report (default: scripts/exports)`;

const EXPORTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../exports");

async function main(): Promise<void> {
  const args = parseBackfillArgs(process.argv.slice(2).filter((a) => a !== "--"));
  if ("error" in args) {
    console.error(`${args.error}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const { tenantId, apply } = args;
  const [tenant] = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) throw new Error(`No tenant ${tenantId}.`);
  console.log(`Tenant ${tenant.id}: ${tenant.name}`);

  const [members, lists, existingRows] = await Promise.all([
    db
      .select({
        id: squadMembersTable.id,
        firstName: squadMembersTable.firstName,
        lastName: squadMembersTable.lastName,
        preferredName: squadMembersTable.preferredName,
        linkedPlayerId: squadMembersTable.linkedPlayerId,
        active: squadMembersTable.active,
        gradeHint: squadMembersTable.gradeHint,
        section: squadMembersTable.section,
      })
      .from(squadMembersTable)
      .where(eq(squadMembersTable.tenantId, tenantId)),
    db
      .select({
        fixtureId: teamListsTable.fixtureId,
        grade: fixturesTable.grade,
        players: teamListsTable.players,
      })
      .from(teamListsTable)
      .innerJoin(
        fixturesTable,
        and(
          eq(fixturesTable.id, teamListsTable.fixtureId),
          eq(fixturesTable.tenantId, teamListsTable.tenantId),
        ),
      )
      .where(eq(teamListsTable.tenantId, tenantId)),
    db
      .select({
        participantId: squadMemberParticipantsTable.participantId,
        memberId: squadMemberParticipantsTable.memberId,
      })
      .from(squadMemberParticipantsTable)
      .where(eq(squadMemberParticipantsTable.tenantId, tenantId)),
  ]);
  const existing = new Map(existingRows.map((r) => [r.participantId.toLowerCase(), r.memberId]));
  const plan = planCrosswalkBackfill({ members, lists, existing });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(
    args.out ?? EXPORTS,
    `selection-crosswalk-backfill-${tenantId}-${stamp}`,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "plan.csv"),
    toCsv(
      [
        "participant_id",
        "action",
        "member_id",
        "member_name",
        "all_member_ids",
        "existing_member_id",
        "rows",
        "grades",
        "via",
      ],
      plan.rows.map((r) => [
        r.participantId,
        r.action,
        r.memberId,
        r.memberName,
        r.memberIds.join(" "),
        r.existingMemberId ?? "",
        r.rows,
        r.grades.join("; "),
        r.via.join(" "),
      ]),
    ),
  );

  let inserted = 0;
  if (apply) {
    confirmDatabaseTarget();
    const toInsert = plan.rows.filter((r) => r.action === "insert");
    if (toInsert.length > 0) {
      const written = await db
        .insert(squadMemberParticipantsTable)
        .values(
          toInsert.map((r) => ({
            tenantId,
            participantId: r.participantId,
            memberId: r.memberId,
            createdBy: "backfill",
          })),
        )
        // A row an admin made meanwhile wins.
        .onConflictDoNothing({
          target: [
            squadMemberParticipantsTable.tenantId,
            squadMemberParticipantsTable.participantId,
          ],
        })
        .returning({ id: squadMemberParticipantsTable.id });
      inserted = written.length;
    }
  }

  const summary = {
    tenantId,
    tenant: tenant.name,
    mode: apply ? "apply" : "preview",
    teamLists: lists.length,
    participants: plan.participants,
    unresolvedRows: plan.unresolvedRows,
    ...plan.counts,
    inserted,
  };
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${outDir}`);
  if (!apply && plan.counts.insert > 0) {
    console.log(`Preview only. Re-run with --apply to write ${plan.counts.insert} row(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
