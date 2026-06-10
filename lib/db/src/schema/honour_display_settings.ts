import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// Singleton settings (id=1) for the Digital Honour Boards Display + TV kiosk
// (admin-only clubroom tools). Holds the SINGLE club-wide skin and the kiosk
// rotation config. App-config (never replaced by the master ETL).
export const honourDisplaySettingsTable = pgTable("honour_display_settings", {
  id: serial("id").primaryKey(),
  // The one skin every board renders in: one of p1..p7. Each board keeps its
  // natural layout; the skin only changes the look.
  defaultTemplate: text("default_template").notNull().default("p1"),
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
  // Long-lived read-only access token that lets a fixed clubroom TV / Raspberry
  // Pi load the kiosk rotation without an admin login. NULL = no link issued
  // (kiosk token access disabled). Rotating/clearing this revokes old links.
  kioskToken: text("kiosk_token"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type HonourDisplaySettingsRow =
  typeof honourDisplaySettingsTable.$inferSelect;
