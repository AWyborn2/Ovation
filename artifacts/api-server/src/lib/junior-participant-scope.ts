import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  db,
  juniorMatchesTable,
  juniorParticipantsTable,
  juniorPremiershipsTable,
} from "@workspace/db";

/**
 * Tenant-required building blocks for every query that touches a junior participant
 * (junior PlayHQ sync plan U3; KTD8, R14).
 *
 * `junior_participants` is keyed `(tenant_id, participant_id)`: the same PlayHQ GUID can
 * be a junior at two clubs, as two independent rows. So a participant id alone never
 * identifies a row — every lookup and every join must also match the tenant, or a
 * query reads (or double-counts, or edits) another club's child.
 *
 * The line tables (`junior_match_batting` / `_bowling` / `_rosters`) and
 * `junior_premiership_players` have no tenant column: they reach their tenant through
 * their match / premiership. A write or read that selects their rows by participant id
 * must therefore also restrict them to the tenant's matches / premierships.
 *
 * `junior-participant-joins.test.ts` scans the API source and fails on any junior
 * participant query that skips these.
 */

/**
 * Join condition from a line's participant id to the SAME tenant's participant row.
 * `tenant` is the tenant id, or the tenant column of an already-joined table.
 */
export function juniorParticipantJoin(
  participantIdColumn: AnyPgColumn,
  tenant: number | AnyPgColumn,
): SQL {
  return and(
    sql`lower(${juniorParticipantsTable.participantId}) = lower(${participantIdColumn})`,
    eq(juniorParticipantsTable.tenantId, tenant),
  ) as SQL;
}

/** WHERE condition for exactly one tenant's participant row. */
export function juniorParticipantKey(tenantId: number, participantId: string): SQL {
  return and(
    eq(juniorParticipantsTable.tenantId, tenantId),
    eq(juniorParticipantsTable.participantId, participantId),
  ) as SQL;
}

/** Subquery of the tenant's junior match ids — the tenant scope of the line tables. */
export function tenantJuniorMatchIds(tenantId: number) {
  return db
    .select({ id: juniorMatchesTable.id })
    .from(juniorMatchesTable)
    .where(eq(juniorMatchesTable.tenantId, tenantId));
}

/** Subquery of the tenant's junior premiership ids — the scope of premiership players. */
export function tenantJuniorPremiershipIds(tenantId: number) {
  return db
    .select({ id: juniorPremiershipsTable.id })
    .from(juniorPremiershipsTable)
    .where(eq(juniorPremiershipsTable.tenantId, tenantId));
}
