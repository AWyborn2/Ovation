import { pgTable, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Platform-admin privacy overrides for central players
 * (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md, D4 / P8).
 *
 * Central players are shared by every tenant, so privacy is a platform decision, keyed by the
 * PlayHQ participant GUID. The PlayHQ → central projector applies these to
 * `central.players.is_private`: on every projected match, and straight away when an admin saves
 * one (the app itself never writes central). An override can set or clear the flag; without one,
 * the projector only ever raises it (a withheld PlayHQ name), never lowers it.
 */
export const playerPrivacyOverridesTable = pgTable("player_privacy_overrides", {
  participantId: text("participant_id").primaryKey(),
  isPrivate: boolean("is_private").notNull(),
  reason: text("reason"),
  setByPlatformAdminId: integer("set_by_platform_admin_id"),
  setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerPrivacyOverrideRow = typeof playerPrivacyOverridesTable.$inferSelect;
