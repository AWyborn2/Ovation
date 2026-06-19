import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

// A board / page background source. kind "none" clears any inherited image;
// "url" is an arbitrary image URL (or uploaded object path); "texture" is one
// of the built-in CSS textures keyed by id.
export interface HonourBackgroundJson {
  kind: "none" | "url" | "texture";
  value?: string | null;
}

// Per-board display override (all optional; unset falls back to the board's
// natural default). Stored keyed by board id in board_configs.
export interface BoardDisplayConfigJson {
  columns?: number;
  transition?: "scroll" | "slide" | "wrap";
  fit?: boolean;
  // Side-by-side block count for the "wrap" fill mode (grid boards), 2..4.
  wrapBlocks?: number;
  // Per-board content/style overrides (all optional).
  // Per-board skin override (built-in p1..p9 or "custom:<uuid>"); unset = club-wide.
  skin?: string | null;
  // Free-text footnote rendered under the board.
  footnote?: string | null;
  heading?: string | null;
  subtitle?: string | null;
  textSize?: "sm" | "md" | "lg";
  density?: "comfortable" | "compact";
  font?: string | null;
  logo?: boolean;
  background?: HonourBackgroundJson | null;
  // Ordered column keys for grid-capable boards (offices, award keys, grades).
  // Non-empty switches a grid-capable board into its season-grid layout.
  gridColumns?: string[];
}

// One column of an admin-built custom grid board. `source` picks where the
// column's cells come from; "manual" columns are typed by the admin.
export interface CustomGridColumnJson {
  key: string;
  label: string;
  source: "office" | "award" | "grade" | "premiership" | "manual";
  sourceKey?: string | null;
  // For manual columns: season label ("2024/25") → cell text.
  manualValues?: Record<string, string> | null;
}

// An admin-built season-grid board: season rows × freely chosen columns drawn
// from any data source (or typed manually). Carries its own look + fill mode.
export interface CustomGridDefJson {
  id: string; // "grid:<uuid>"
  title: string;
  subtitle?: string | null;
  footnote?: string | null;
  skin?: string | null;
  seasonFrom?: number | null;
  seasonTo?: number | null;
  fillMode?: "scroll" | "slide" | "wrap" | null;
  wrapBlocks?: number | null;
  columns: CustomGridColumnJson[];
}

// A full-screen advertising creative placed between boards in the kiosk
// rotation (distinct from the club sponsor library).
export interface KioskAdJson {
  id: string; // "ad:<uuid>"
  name: string;
  imageUrl: string;
}

// An admin-authored skin/theme. Built-in skins (p1..p8) are CSS-only and not
// stored here; these are admin-created presets applied via inline CSS vars.
export interface HonourSkinJson {
  id: string; // "custom:<uuid>"
  name: string;
  background: string; // page backdrop (colour or gradient)
  boardBg: string; // board surface
  ink: string; // primary text
  muted: string; // secondary text
  accent: string; // gold / accent
  accentInk: string; // text on the accent
  font: string; // title font stack
  backgroundImage?: HonourBackgroundJson | null; // optional page background image
}

// Club-wide colour overrides layered on top of the active skin. Each is
// optional; an unset/empty value restores the skin's own colour.
export interface HonourColourOverridesJson {
  background?: string | null;
  text?: string | null;
  accent?: string | null;
}

// Admin-defined composite "columns" board (several existing list boards placed
// side-by-side as columns, like the club's physical honour board).
export interface CompositeDefJson {
  id: string;
  title: string;
  subtitle?: string | null;
  seasonAligned: boolean;
  columns: { boardId: string; heading: string }[];
  transition?: "scroll" | "slide" | null;
  fit?: boolean | null;
}

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
  // Sponsor advertising on the kiosk (reuses the club sponsor library). The
  // strip embeds a "proudly supported by" logo bar on every board screen;
  // slides rotate a full-screen sponsor board in after every N boards. Both
  // independently toggleable and only render when there are active sponsors.
  kioskSponsorStrip: boolean("kiosk_sponsor_strip").notNull().default(false),
  kioskSponsorSlides: boolean("kiosk_sponsor_slides").notNull().default(false),
  kioskSponsorSlideEvery: integer("kiosk_sponsor_slide_every").notNull().default(3),
  // Sponsor slide style: one grid of all sponsors, or one large sponsor per slide.
  kioskSponsorSlideStyle: text("kiosk_sponsor_slide_style").notNull().default("grid"),
  // Which sponsors appear on the kiosk (subset of active); empty = all active.
  kioskSponsorIds: jsonb("kiosk_sponsor_ids")
    .$type<number[]>()
    .notNull()
    .default([]),
  // Admin-uploaded full-screen ad creatives placed between boards.
  kioskAds: jsonb("kiosk_ads")
    .$type<KioskAdJson[]>()
    .notNull()
    .default([]),
  // Long-lived read-only access token that lets a fixed clubroom TV / Raspberry
  // Pi load the kiosk rotation without an admin login. NULL = no link issued
  // (kiosk token access disabled). Rotating/clearing this revokes old links.
  kioskToken: text("kiosk_token"),
  // Per-board display overrides keyed by board id (column count, transition, fit).
  boardConfigs: jsonb("board_configs")
    .$type<Record<string, BoardDisplayConfigJson>>()
    .notNull()
    .default({}),
  // Admin-defined composite "columns" boards.
  composites: jsonb("composites")
    .$type<CompositeDefJson[]>()
    .notNull()
    .default([]),
  // Admin-built custom season-grid boards.
  customGrids: jsonb("custom_grids")
    .$type<CustomGridDefJson[]>()
    .notNull()
    .default([]),
  // Admin-authored skins/themes (built-in p1..p8 are CSS-only, not stored here).
  skins: jsonb("skins")
    .$type<HonourSkinJson[]>()
    .notNull()
    .default([]),
  // Club-wide colour overrides layered on top of the active skin.
  colourOverrides: jsonb("colour_overrides")
    .$type<HonourColourOverridesJson>()
    .notNull()
    .default({}),
  // Club-wide default title font stack (null = the skin's own font).
  defaultFont: text("default_font"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type HonourDisplaySettingsRow =
  typeof honourDisplaySettingsTable.$inferSelect;
