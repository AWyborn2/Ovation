import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantIdColumn } from "./_tenant";

/**
 * Season shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md, U1).
 *
 * Tenant-curated content, like the cap register: never written to the central
 * database. One register per side — senior entries in `shirt_numbers`, junior
 * entries in `junior_shirt_numbers` — so junior and senior numbers never share
 * a row, a route or a display (juniors isolation).
 *
 * Shared rules (settings read, carry-forward) live in `src/shirt-numbers.ts`
 * so the PlayHQ ingest and the API use one implementation (KTD9).
 */

/**
 * Where a register entry came from (KTD1). `squad`: added from the club's squad
 * register (`squad_members`, the availability squad import) by "Add squad to
 * register".
 */
export type ShirtNumberSource = "upload" | "squad" | "lineup" | "admin" | "rollover";

/** SQL for the digit rule on `number` (KTD3): 1-3 digits, leading zeros kept. */
const NUMBER_CHECK = sql`"number" IS NULL OR "number" ~ '^[0-9]{1,3}$'`;
const SOURCE_CHECK = sql`"source" IN ('upload', 'squad', 'lineup', 'admin', 'rollover')`;

// One entry per person per season. "Held" is derived, not stored (KTD2): an
// entry is held while `playerId` is null and becomes public once linked.
// Uniqueness is per person, never per number (KTD4) — duplicate numbers are a
// club policy enforced in the service layer.
export const shirtNumbersTable = pgTable(
  "shirt_numbers",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // Season start year, matching matches.season (2026 = 2026/27).
    season: integer("season").notNull(),
    // Display name as uploaded or entered (trimmed, length-capped by writers).
    name: text("name").notNull(),
    // PlayHQ participant GUID, always stored lowercased (normaliseParticipantId).
    participantId: text("participant_id"),
    // A player id in the TENANT's id space — deliberately no FK, exactly like
    // cap_register.playerId; writes are checked by assertPlayerInTenantSpace.
    playerId: integer("player_id"),
    // 1-3 digit string; null = on the register but unnumbered.
    number: text("number"),
    source: text("source").$type<ShirtNumberSource>().notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("shirt_numbers_tenant_idx").on(t.tenantId),
    idxPlayer: index("shirt_numbers_player_idx").on(t.playerId),
    uqParticipant: uniqueIndex("shirt_numbers_tenant_season_participant_uidx")
      .on(t.tenantId, t.season, t.participantId)
      .where(sql`"participant_id" IS NOT NULL`),
    uqPlayer: uniqueIndex("shirt_numbers_tenant_season_player_uidx")
      .on(t.tenantId, t.season, t.playerId)
      .where(sql`"player_id" IS NOT NULL`),
    chkNumber: check("shirt_numbers_number_check", NUMBER_CHECK),
    chkSource: check("shirt_numbers_source_check", SOURCE_CHECK),
  }),
);

export type ShirtNumberRow = typeof shirtNumbersTable.$inferSelect;

// The juniors register: keyed on the PlayHQ participant (junior_participants),
// never a senior playerId (juniors isolation). No lineup source exists for
// juniors, but the source column keeps the shared value set.
export const juniorShirtNumbersTable = pgTable(
  "junior_shirt_numbers",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    season: integer("season").notNull(),
    // PlayHQ participant GUID, always stored lowercased.
    participantId: text("participant_id").notNull(),
    name: text("name").notNull(),
    number: text("number"),
    source: text("source").$type<ShirtNumberSource>().notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("junior_shirt_numbers_tenant_idx").on(t.tenantId),
    uqParticipant: uniqueIndex("junior_shirt_numbers_tenant_season_participant_uidx").on(
      t.tenantId,
      t.season,
      t.participantId,
    ),
    chkNumber: check("junior_shirt_numbers_number_check", NUMBER_CHECK),
    chkSource: check("junior_shirt_numbers_source_check", SOURCE_CHECK),
  }),
);

export type JuniorShirtNumberRow = typeof juniorShirtNumbersTable.$inferSelect;

export type ShirtNumberDuplicatePolicy = "warn" | "block";
export type ShirtNumberRolloverPolicy = "carry" | "blank";

// One row per tenant (unique on tenantId), created on first access by
// getOrCreateSettings (KTD5). One switch and one set of policies cover both
// registers. Read-only callers use getShirtNumberSettings, which returns the
// defaults when no row exists yet.
export const shirtNumberSettingsTable = pgTable(
  "shirt_number_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    enabled: boolean("enabled").notNull().default(false),
    duplicatePolicy: text("duplicate_policy")
      .$type<ShirtNumberDuplicatePolicy>()
      .notNull()
      .default("warn"),
    rolloverPolicy: text("rollover_policy")
      .$type<ShirtNumberRolloverPolicy>()
      .notNull()
      .default("carry"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenant: uniqueIndex("shirt_number_settings_tenant_unique").on(t.tenantId),
    chkDuplicate: check(
      "shirt_number_settings_duplicate_policy_check",
      sql`"duplicate_policy" IN ('warn', 'block')`,
    ),
    chkRollover: check(
      "shirt_number_settings_rollover_policy_check",
      sql`"rollover_policy" IN ('carry', 'blank')`,
    ),
  }),
);

export type ShirtNumberSettingsRow = typeof shirtNumberSettingsTable.$inferSelect;

export type ShirtNumberUploadSide = "senior" | "junior";
/** Only the club's number spreadsheet; registered players come from the squad register. */
export type ShirtNumberUploadKind = "numbers";
export type ShirtNumberUploadStatus = "pending" | "committed" | "discarded";

// Upload previews (KTD8): a parsed number spreadsheet waiting
// for an admin to review and commit. Tenant-scoped (every lookup filters on the
// request's tenant), not importsTable. The payload is cleared on commit or
// discard; its shape is owned by the api-server upload service.
export const shirtNumberUploadsTable = pgTable(
  "shirt_number_uploads",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    side: text("side").$type<ShirtNumberUploadSide>().notNull(),
    kind: text("kind").$type<ShirtNumberUploadKind>().notNull(),
    season: integer("season").notNull(),
    status: text("status").$type<ShirtNumberUploadStatus>().notNull().default("pending"),
    payload: jsonb("payload").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("shirt_number_uploads_tenant_idx").on(t.tenantId),
    chkSide: check("shirt_number_uploads_side_check", sql`"side" IN ('senior', 'junior')`),
    chkKind: check("shirt_number_uploads_kind_check", sql`"kind" IN ('numbers')`),
    chkStatus: check(
      "shirt_number_uploads_status_check",
      sql`"status" IN ('pending', 'committed', 'discarded')`,
    ),
  }),
);

export type ShirtNumberUploadRow = typeof shirtNumberUploadsTable.$inferSelect;
