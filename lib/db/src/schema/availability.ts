import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";
import { fixturesTable } from "./fixtures";

/**
 * Player availability and the Selection Hub.
 *
 * A club's squad register is imported from the PlayHQ participant export into
 * `squad_members` — never into `players`, which has no tenant_id and is
 * the stats register, so contact details never reach it. Seniors and juniors
 * share the one register, told apart by `section`: this feature writes
 * no stats and never reads or writes `junior_*` tables.
 *
 * Each week an `availability_rounds` row drives the send → reminder → cut-off
 * steps; every recipient gets an `availability_requests` row and a fresh
 * hashed token per message; answers land in `availability_responses`.
 * At cut-off each fixture gets a `selections` row that the Hub edits
 * with versioned whole-row saves and that publishes into `team_lists`
 * (source = "selection") on finalise. Every change is logged in
 * `selection_events`.
 *
 * Every table carries tenant_id (reads filter, writes set it from the request
 * context), even where it is also reachable through a parent, so no read has
 * to join through the parent to be tenant-scoped. Nothing is sent for a club
 * until an admin sets `availability_settings.enabled`.
 */

/** "senior" | "junior" — which side of the club a member plays in. */
export type SquadSection = "senior" | "junior";
/** Who a request goes to: the account holder (adults) or a guardian. */
export type RecipientSlot = "account" | "guardian1" | "guardian2";
export type AvailabilityStatus = "yes" | "no" | "maybe";
export type SelectionState = "draft" | "final";
/** Who may edit a side in the Selection Hub. */
export type SelectionRule = "captains_own_grade" | "captains_all_grades" | "admins_only";
/** Why a slot is open: the label reads "was <name> · <reason>". */
export type SelectionGapReason =
  "no" | "maybe" | "no_reply" | "not_on_register" | "withdrew" | "picked_elsewhere";

/**
 * One of a side's 11 slots. `memberId` null is an open slot; `gap` names the
 * player who held it and why they left.
 */
export type SelectionSlot = {
  memberId: number | null;
  gap?: { name: string; reason: SelectionGapReason };
};

// The club's squad register, upserted from the PlayHQ participant export
// by (tenant, PlayHQ profile id). Only the import's column whitelist is stored.
// Contact columns are admin-only: they never appear in captain payloads, public
// pages or logs. `linked_player_id` is a tenant-space app player id for
// team-list `playerId`s; fill-in ids (>= 90000) are never linked. No FK —
// player ids are tenant-space, not native players.id.
export const squadMembersTable = pgTable(
  "squad_members",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // PlayHQ `Profile ID`; NULL for a member an admin added by hand.
    playhqProfileId: text("playhq_profile_id"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    // Decides contact routing: under 18 → guardians, else account holder.
    dateOfBirth: date("date_of_birth"),
    section: text("section").$type<SquadSection>().notNull().default("senior"),
    // Active squad members are the ones asked each week.
    active: boolean("active").notNull().default(true),
    // True once an admin set `active` by hand; a re-import never overrides it.
    activeSetByAdmin: boolean("active_set_by_admin").notNull().default(false),
    // Imported PlayHQ grade/team/age group — hints only; a member's grade comes
    // first from the most recent team list the member appears in.
    gradeHint: text("grade_hint"),
    teamName: text("team_name"),
    ageGroup: text("age_group"),
    // PlayHQ `Privacy Setting` is private.
    isPrivate: boolean("is_private").notNull().default(false),
    linkedPlayerId: integer("linked_player_id"),
    accountHolderName: text("account_holder_name"),
    accountHolderMobile: text("account_holder_mobile"),
    accountHolderEmail: text("account_holder_email"),
    guardian1Name: text("guardian1_name"),
    guardian1Mobile: text("guardian1_mobile"),
    guardian1Email: text("guardian1_email"),
    guardian2Name: text("guardian2_name"),
    guardian2Mobile: text("guardian2_mobile"),
    guardian2Email: text("guardian2_email"),
    // Per-contact SMS opt-out, set when Twilio rejects a send with 21610 (the
    // recipient replied STOP). An opted-out contact keeps getting email.
    accountSmsOptOut: boolean("account_sms_opt_out").notNull().default(false),
    guardian1SmsOptOut: boolean("guardian1_sms_opt_out").notNull().default(false),
    guardian2SmsOptOut: boolean("guardian2_sms_opt_out").notNull().default(false),
    // Set when a player or guardian changes a contact from their link;
    // the flag stays up until an admin clears it.
    contactChangedAt: timestamp("contact_changed_at", { withTimezone: true }),
    contactChangeFlag: boolean("contact_change_flag").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("squad_members_tenant_idx").on(t.tenantId),
    // One member per PlayHQ profile per tenant — the re-import upsert target.
    uqTenantProfile: uniqueIndex("squad_members_tenant_profile_uidx")
      .on(t.tenantId, t.playhqProfileId)
      .where(sql`"playhq_profile_id" IS NOT NULL`),
    chkSection: check("squad_members_section_check", sql`"section" IN ('senior', 'junior')`),
  }),
);

export type SquadMemberRow = typeof squadMembersTable.$inferSelect;

// One row per tenant: the weekly rhythm in Perth time. Days are 0–6
// (Sunday–Saturday), times "HH:MM". Finalise-by is display only. `enabled`
// defaults off, so the scheduled sweep does nothing for a club until an admin
// turns it on.
export const availabilitySettingsTable = pgTable(
  "availability_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    enabled: boolean("enabled").notNull().default(false),
    // Off → email only.
    smsEnabled: boolean("sms_enabled").notNull().default(true),
    sendDow: integer("send_dow").notNull().default(1),
    sendTime: text("send_time").notNull().default("18:00"),
    reminderDow: integer("reminder_dow").notNull().default(3),
    reminderTime: text("reminder_time").notNull().default("18:00"),
    cutoffDow: integer("cutoff_dow").notNull().default(4),
    cutoffTime: text("cutoff_time").notNull().default("18:00"),
    finaliseDow: integer("finalise_dow").notNull().default(5),
    finaliseTime: text("finalise_time").notNull().default("20:00"),
    selectionRule: text("selection_rule")
      .$type<SelectionRule>()
      .notNull()
      .default("captains_own_grade"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenant: uniqueIndex("availability_settings_tenant_uidx").on(t.tenantId),
    chkDows: check(
      "availability_settings_dow_check",
      sql`"send_dow" BETWEEN 0 AND 6 AND "reminder_dow" BETWEEN 0 AND 6 AND "cutoff_dow" BETWEEN 0 AND 6 AND "finalise_dow" BETWEEN 0 AND 6`,
    ),
    chkRule: check(
      "availability_settings_rule_check",
      sql`"selection_rule" IN ('captains_own_grade', 'captains_all_grades', 'admins_only')`,
    ),
  }),
);

export type AvailabilitySettingsRow = typeof availabilitySettingsTable.$inferSelect;

// One round per tenant per weekend (keyed by the weekend's Saturday). Each
// step's `*_started_at` is its atomic claim: set by a conditional update only
// while NULL, before any message goes out, so an overlapping "Run now" or a
// retry after a crash never re-sends. `*_completed_at` stamps the end.
export const availabilityRoundsTable = pgTable(
  "availability_rounds",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    weekendDate: date("weekend_date").notNull(),
    sendStartedAt: timestamp("send_started_at", { withTimezone: true }),
    sendCompletedAt: timestamp("send_completed_at", { withTimezone: true }),
    reminderStartedAt: timestamp("reminder_started_at", { withTimezone: true }),
    reminderCompletedAt: timestamp("reminder_completed_at", { withTimezone: true }),
    cutoffStartedAt: timestamp("cutoff_started_at", { withTimezone: true }),
    cutoffCompletedAt: timestamp("cutoff_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantWeekend: uniqueIndex("availability_rounds_tenant_weekend_uidx").on(
      t.tenantId,
      t.weekendDate,
    ),
  }),
);

export type AvailabilityRoundRow = typeof availabilityRoundsTable.$inferSelect;

// One request per (round, member, recipient slot): a junior's two guardians
// each get one. Delivery is tracked per channel so later ticks re-attempt
// only failed recipients. Result values are short kinds ("sent",
// "failed", "opted_out", "no_contact", "off") — never a number or address.
export const availabilityRequestsTable = pgTable(
  "availability_requests",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    roundId: integer("round_id")
      .notNull()
      .references(() => availabilityRoundsTable.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => squadMembersTable.id, { onDelete: "cascade" }),
    recipientSlot: text("recipient_slot").$type<RecipientSlot>().notNull(),
    smsResult: text("sms_result"),
    smsAt: timestamp("sms_at", { withTimezone: true }),
    emailResult: text("email_result"),
    emailAt: timestamp("email_at", { withTimezone: true }),
    // Manual reminders go at most once per recipient per 12 hours.
    lastManualReminderAt: timestamp("last_manual_reminder_at", { withTimezone: true }),
    // Hourly re-attempts of a failed delivery, capped (see retryFailedDeliveries).
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqRoundMemberSlot: uniqueIndex("availability_requests_round_member_slot_uidx").on(
      t.roundId,
      t.memberId,
      t.recipientSlot,
    ),
    idxMember: index("availability_requests_member_idx").on(t.memberId),
    chkSlot: check(
      "availability_requests_slot_check",
      sql`"recipient_slot" IN ('account', 'guardian1', 'guardian2')`,
    ),
  }),
);

export type AvailabilityRequestRow = typeof availabilityRequestsTable.$inferSelect;

// Personal-link tokens. Only the hash is stored, so every outbound
// message mints a fresh token; a request may hold several live tokens, all
// valid until `expires_at` (the day after the round's last fixture). A contact
// change revokes the recipient's other live tokens.
export const availabilityTokensTable = pgTable(
  "availability_tokens",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    requestId: integer("request_id")
      .notNull()
      .references(() => availabilityRequestsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqHash: uniqueIndex("availability_tokens_hash_uidx").on(t.tokenHash),
    idxRequest: index("availability_tokens_request_idx").on(t.requestId),
  }),
);

export type AvailabilityTokenRow = typeof availabilityTokensTable.$inferSelect;

// A member's answer for one Perth date of a round. One row per (round,
// member, date): either guardian may answer and the latest answer wins,
// recorded by upsert. `late` marks an answer after cut-off.
export const availabilityResponsesTable = pgTable(
  "availability_responses",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    roundId: integer("round_id")
      .notNull()
      .references(() => availabilityRoundsTable.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => squadMembersTable.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status").$type<AvailabilityStatus>().notNull(),
    note: text("note"),
    // Who answered; NULL when the system recorded it (an away period).
    respondedBySlot: text("responded_by_slot").$type<RecipientSlot>(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
    late: boolean("late").notNull().default(false),
  },
  (t) => ({
    uqRoundMemberDate: uniqueIndex("availability_responses_round_member_date_uidx").on(
      t.roundId,
      t.memberId,
      t.date,
    ),
    idxMember: index("availability_responses_member_idx").on(t.memberId),
    chkStatus: check(
      "availability_responses_status_check",
      sql`"status" IN ('yes', 'no', 'maybe')`,
    ),
  }),
);

export type AvailabilityResponseRow = typeof availabilityResponsesTable.$inferSelect;

// Future dates a member will be away, inclusive. Covered weekends record
// No and are not asked again.
export const availabilityAwayTable = pgTable(
  "availability_away",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    memberId: integer("member_id")
      .notNull()
      .references(() => squadMembersTable.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxMember: index("availability_away_member_idx").on(t.memberId),
    chkRange: check("availability_away_range_check", sql`"to_date" >= "from_date"`),
  }),
);

export type AvailabilityAwayRow = typeof availabilityAwayTable.$inferSelect;

// One side per fixture, unique on fixture_id; deleting the fixture or
// the round removes it. `slots` is the ordered XI (11 entries) and `version`
// is the optimistic-concurrency check for Hub saves: a save carries its
// last-seen version and bumps it. Captain and keeper are members in the side
// and clear when that member leaves it. Finalising publishes into
// the fixture's `team_lists` row with source "selection".
export const selectionsTable = pgTable(
  "selections",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    roundId: integer("round_id")
      .notNull()
      .references(() => availabilityRoundsTable.id, { onDelete: "cascade" }),
    fixtureId: integer("fixture_id")
      .notNull()
      .references(() => fixturesTable.id, { onDelete: "cascade" }),
    slots: jsonb("slots").$type<SelectionSlot[]>().notNull().default([]),
    captainMemberId: integer("captain_member_id").references(() => squadMembersTable.id, {
      onDelete: "set null",
    }),
    keeperMemberId: integer("keeper_member_id").references(() => squadMembersTable.id, {
      onDelete: "set null",
    }),
    state: text("state").$type<SelectionState>().notNull().default("draft"),
    version: integer("version").notNull().default(1),
    finalisedAt: timestamp("finalised_at", { withTimezone: true }),
    finalisedBy: text("finalised_by"),
    // Members told about the last finalise, so a re-finalise notifies only the
    // players it affects.
    notifiedMemberIds: jsonb("notified_member_ids").$type<number[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqFixture: uniqueIndex("selections_fixture_uidx").on(t.fixtureId),
    idxTenantRound: index("selections_tenant_round_idx").on(t.tenantId, t.roundId),
    chkState: check("selections_state_check", sql`"state" IN ('draft', 'final')`),
  }),
);

export type SelectionRow = typeof selectionsTable.$inferSelect;

// Append-only log of every selection change: who ("admin" | "captain" |
// "player" | "system"), what (`action`, e.g. "move", "captain", "finalise",
// "reopen", "withdraw") and the details. Deleted with its selection.
export const selectionEventsTable = pgTable(
  "selection_events",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    selectionId: integer("selection_id")
      .notNull()
      .references(() => selectionsTable.id, { onDelete: "cascade" }),
    actorKind: text("actor_kind").notNull(),
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxSelection: index("selection_events_selection_idx").on(t.selectionId, t.createdAt),
  }),
);

export type SelectionEventRow = typeof selectionEventsTable.$inferSelect;
