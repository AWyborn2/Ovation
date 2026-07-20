import {
  pgTable,
  serial,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Map of merged duplicate junior profiles: PlayHQ occasionally minted two
 * participant GUIDs for the same child, splitting their games/runs/wickets
 * across two directory entries. An admin merge reassigns every junior line
 * from the duplicate GUID to the keeper and deletes the duplicate
 * junior_participants row — but the junior tables are FULLY REPLACED by every
 * juniors ETL reload, and the dump would re-create the duplicate row and its
 * lines. This table is the durable record: the ETL re-applies every merge
 * after its replace (step 7 in scripts/sql/juniors-etl.sql). It is app-owned —
 * the ETL reads it but NEVER deletes it.
 *
 * The map is kept FLAT (no chains): merging a GUID that is itself a keeper
 * re-points its existing rows to the new keeper in the same transaction.
 * `duplicateRow` snapshots the absorbed participant row — the only audit
 * record of its name/privacy/senior-link after deletion. Merges are permanent
 * from the admin's perspective (senior-merge parity); recovering a mistaken
 * merge means deleting the map row manually and reloading the juniors dump.
 */
export const juniorParticipantMergesTable = pgTable(
  "junior_participant_merges",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    duplicateParticipantId: text("duplicate_participant_id").notNull(),
    keeperParticipantId: text("keeper_participant_id").notNull(),
    /** Snapshot of the absorbed junior_participants row (audit). */
    duplicateRow: jsonb("duplicate_row"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqTenantDuplicate: uniqueIndex(
      "junior_participant_merges_tenant_duplicate_uq",
    ).on(t.tenantId, t.duplicateParticipantId),
    idxTenant: index("junior_participant_merges_tenant_idx").on(t.tenantId),
    idxKeeper: index("junior_participant_merges_keeper_idx").on(
      t.keeperParticipantId,
    ),
  }),
);

export type JuniorParticipantMergeRow =
  typeof juniorParticipantMergesTable.$inferSelect;
