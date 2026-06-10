import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

// Singleton settings (id=1) for the Digital Honour Boards Display + TV kiosk.
// Holds the club-wide default template (skin), optional per-board template
// overrides, viewer/tab toggles, and the kiosk rotation config. App-config
// (never replaced by the master ETL).
export const honourDisplaySettingsTable = pgTable("honour_display_settings", {
  id: serial("id").primaryKey(),
  // Club-wide default template id: one of p1..p7.
  defaultTemplate: text("default_template").notNull().default("p1"),
  // Per-board template overrides, keyed by board id -> template id (p1..p7).
  boardOverrides: jsonb("board_overrides")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  // Whether the public display page shows the category tab switcher.
  showTabs: boolean("show_tabs").notNull().default(true),
  // Whether visitors may switch skins; false locks them to the default.
  allowViewerTemplateSwitch: boolean("allow_viewer_template_switch")
    .notNull()
    .default(true),
  // Ordered list of board ids the kiosk rotates through. Empty = all boards.
  kioskSequence: jsonb("kiosk_sequence")
    .$type<string[]>()
    .notNull()
    .default([]),
  // Hold (ms) on each board before any credit-scroll begins.
  kioskDwellMs: integer("kiosk_dwell_ms").notNull().default(3500),
  // Credit-scroll speed in px/sec for boards taller than the viewport.
  kioskScrollSpeed: integer("kiosk_scroll_speed").notNull().default(36),
  // Hold (ms) at the bottom of a scrolled board / on short boards before advancing.
  kioskEndHoldMs: integer("kiosk_end_hold_ms").notNull().default(3000),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type HonourDisplaySettingsRow =
  typeof honourDisplaySettingsTable.$inferSelect;
