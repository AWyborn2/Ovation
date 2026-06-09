import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Singleton, global app-config controlling what every player's trading card
// shows: which career stats appear (ordered list of stat keys) and which awards
// are eligible to appear (list of award keys). Empty statKeys = fall back to the
// per-role default stat selection; empty awardKeys = every published award the
// player has won is eligible. App-config (never replaced by the master ETL).
export const tradingCardSettingsTable = pgTable("trading_card_settings", {
  id: serial("id").primaryKey(),
  // Ordered stat keys shown on the card face and the career-stats animation
  // page (see STAT_CATALOG on the client). Empty = per-role defaults.
  statKeys: text("stat_keys").array().notNull().default([]),
  // Award keys (awards.key) eligible to appear; each player's card shows the
  // ones that player has actually won. Empty = all published awards eligible.
  awardKeys: text("award_keys").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TradingCardSettingsRow = typeof tradingCardSettingsTable.$inferSelect;
