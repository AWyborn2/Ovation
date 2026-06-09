import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Singleton, global app-config controlling what every player's trading card
// shows: which career stats appear (ordered list of stat keys) and which awards
// are eligible to appear (list of award keys). Empty statKeys = fall back to the
// per-role default stat selection; empty awardKeys = every published award the
// player has won is eligible. App-config (never replaced by the master ETL).
export const tradingCardSettingsTable = pgTable("trading_card_settings", {
  id: serial("id").primaryKey(),
  // Ordered stat keys shown on the card face and the career-stats animation
  // page (see STAT_CATALOG on the client). Acts as the default for every role.
  // Empty = per-role smart defaults.
  statKeys: text("stat_keys").array().notNull().default([]),
  // Per-role stat key overrides, keyed by CardRole ("Batsman", "Bowler",
  // "All-Rounder", "Wicket-Keeper"). A role with a non-empty list overrides the
  // global statKeys above for players of that role; an empty/absent role falls
  // back to statKeys, then to the per-role smart defaults.
  statKeysByRole: jsonb("stat_keys_by_role")
    .$type<Record<string, string[]>>()
    .notNull()
    .default({}),
  // Award keys (awards.key) eligible to appear; each player's card shows the
  // ones that player has actually won. Empty = all published awards eligible.
  awardKeys: text("award_keys").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TradingCardSettingsRow = typeof tradingCardSettingsTable.$inferSelect;
