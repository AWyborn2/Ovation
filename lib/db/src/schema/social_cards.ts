import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sponsorsTable = pgTable("sponsors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull(),
  link: text("link").notNull().default(""),
  activeFrom: date("active_from"),
  activeTo: date("active_to"),
  // Which social card types this sponsor's logo may appear on. Empty = all cards.
  // Values match ShareCardInput["kind"]: milestone | player | record | gradeLeader | premiership | debut | newCap | century | fiveFor.
  cardKinds: text("card_kinds").array().notNull().default([]),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SponsorRow = typeof sponsorsTable.$inferSelect;

// Named, selectable card themes (colors + optional background image + optional logo).
// Admins pick a theme per social card; one row is flagged isDefault.
export const cardThemesTable = pgTable("card_themes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  bgDark: text("bg_dark").notNull().default("#322F3D"),
  bgPanel: text("bg_panel").notNull().default("#3F3C4C"),
  accent: text("accent").notNull().default("#FBD039"),
  textLight: text("text_light").notNull().default("#F5F2E8"),
  backgroundImageUrl: text("background_image_url"),
  logoUrl: text("logo_url"),
  isDefault: boolean("is_default").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CardThemeRow = typeof cardThemesTable.$inferSelect;

// Curated / admin-uploaded background music tracks for animated share-card video
// clips. A track is OPTIONAL on any clip (no track = silent export, unchanged).
// `url` is a storage object path (served via /api/storage/...) — either a curated
// library track or an admin upload. `durationMs` is the source track length when
// known (purely informational for the trim UI); the clip itself only ever uses a
// `durationMs`-long window starting at the admin-chosen trim offset.
export const cardAudioTracksTable = pgTable("card_audio_tracks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  durationMs: integer("duration_ms"),
  // Marks the small built-in royalty-free library so it can be visually
  // distinguished from admin uploads (and protected from accidental deletion).
  isCurated: boolean("is_curated").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CardAudioTrackRow = typeof cardAudioTracksTable.$inferSelect;

// One labelled, data-bound region painted over a custom uploaded design.
// All geometry is stored as a fraction (0-1) of the BACKGROUND image so the
// renderer can map it through an object-fit:cover transform onto any card size
// and keep the slot glued to the design element it was placed over.
export type CardTemplateSlot = {
  id: string;
  type: "text" | "photo";
  /** Data field key bound to this slot (see card-template.ts CARD_FIELD_CATALOG). */
  field: string;
  /** Geometry as fractions (0-1) of the background image. */
  x: number;
  y: number;
  w: number;
  h: number;
  // Text styling (text slots only).
  /** Font size as a fraction (0-1) of the background image height. */
  fontSize?: number;
  color?: string;
  fontWeight?: number; // 400-900
  align?: "left" | "center" | "right";
  fontFamily?: "sans" | "serif";
  uppercase?: boolean;
  // Photo styling (photo slots only).
  photoFit?: "cover" | "contain";
  shape?: "rect" | "circle";
};

// Admin-uploaded "bring your own" tile designs (Canva/Figma exports). The
// flattened image is the background; slots bind data fields onto it per card
// kind. Cards fall back to the built-in layout when no template applies.
export const cardTemplatesTable = pgTable("card_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Which ShareCardInput["kind"] values this template is ASSIGNED to (the asset
  // types it may be used for). Empty = applies to every card kind.
  cardKinds: text("card_kinds").array().notNull().default([]),
  // The design source. "background" = a "bring your own" flattened image with
  // data-bound slots (the original BYO templates). "layers" = a design authored
  // in the layer editor (built-in chrome overrides + extra image/text/sticker
  // layers); stored in `layers` and consumed via the renderer's `layout` option.
  source: text("source").notNull().default("background"),
  // The card kind a "layers" design was authored against (drives the editor's
  // field/element context + the gallery thumbnail). Null for BYO backgrounds.
  baseKind: text("base_kind"),
  // Layer-editor design (source = "layers"). Empty for BYO backgrounds.
  layers: jsonb("layers").$type<CardLayoutLayer[]>().notNull().default([]),
  // Nullable: BYO backgrounds carry an image URL; "layers" designs have none.
  backgroundImageUrl: text("background_image_url"),
  // Media kind of the uploaded background: "image" (still PNG/JPG/WebP), "gif"
  // (self-animating), or "video" (MP4/WebM). Drives whether the card animates.
  backgroundKind: text("background_kind").notNull().default("image"),
  // Playback length of an animated (video) background, in milliseconds. Null for
  // still/gif backgrounds (gifs loop on their own at an unknown cadence).
  backgroundDurationMs: integer("background_duration_ms"),
  // Built-in motion preset applied to the data-bound slots / whole card:
  // "none" | "fadeIn" | "slideUp" | "countUp". Independent of the background.
  motionPreset: text("motion_preset").notNull().default("none"),
  bgWidth: integer("bg_width").notNull().default(1080),
  bgHeight: integer("bg_height").notNull().default(1080),
  slots: jsonb("slots").$type<CardTemplateSlot[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  // Legacy single global default (kept for back-compat reads). Per-asset defaults
  // are driven by `defaultForKinds` below.
  isDefault: boolean("is_default").notNull().default(false),
  // The card kinds for which THIS template is the default applied by the app.
  // A kind appears in at most one template's array (enforced in the route).
  defaultForKinds: text("default_for_kinds").array().notNull().default([]),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CardTemplateRow = typeof cardTemplatesTable.$inferSelect;

// --- Layer-based card design studio ----------------------------------------
// A single layer in a custom layout for a BUILT-IN card kind. Unlike template
// slots (which sit over an uploaded background), these layers compose the
// built-in card itself: `element` layers OVERRIDE the position/visibility/stack
// of a built-in piece (photo, title, name, each stat, logo, sponsor, ...) keyed
// by a stable semantic id; `image` / `sticker` / `text` layers are admin-added
// extras. All geometry is normalized as a fraction (0-1) of the card's base
// WIDTH (1080) for BOTH axes — width is constant across square/portrait/story,
// so one layout maps cleanly onto every size and circles stay circular.
export type CardLayoutLayer = {
  id: string;
  kind: "element" | "image" | "sticker" | "text" | "libsticker";
  // Geometry (fractions of base width 1080). Optional for `element` layers that
  // only toggle visibility / stacking; required for added layers.
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  // Whether y is measured from the top (default) or the bottom of the frame, so
  // bottom-anchored chrome (footer / sponsors) stays glued to the bottom edge.
  vAnchor?: "top" | "bottom";
  // Stacking order (ascending). Defaults to the element's natural order.
  z?: number;
  // `element` only: hide a built-in piece.
  hidden?: boolean;
  // `image` only: uploaded asset URL.
  url?: string;
  // `image` / `sticker`: outline shape.
  shape?: "rect" | "circle" | "line";
  // `image` only: object-fit behaviour.
  fit?: "cover" | "contain";
  // `image` only: focal point + zoom for cover crop (matches feature-photo math).
  focalX?: number;
  focalY?: number;
  zoom?: number;
  // `sticker` / `text`: colour (hex; constrained to the club palette in the UI).
  color?: string;
  // `sticker` (rect): corner radius as a fraction of width; (line): thickness.
  radius?: number;
  // `text` only.
  text?: string;
  fontSize?: number; // fraction of base width 1080
  fontWeight?: number; // 400-900
  align?: "left" | "center" | "right";
  fontFamily?: "sans" | "serif";
  uppercase?: boolean;
  // `libsticker` only: which catalog sticker, and (for data-bound badges) which
  // card field auto-fills its text slot.
  assetId?: string;
  field?: string;
  // Optional per-layer visual effects (opaque here; CardLayerEffects in the spec).
  effects?: Record<string, unknown>;
};

// One custom layout per built-in card kind. Absent row = the card uses its
// pristine built-in layout (pixel-identical to the original design). Present
// row = the renderer applies these layer overrides + extra layers.
export const cardLayoutsTable = pgTable(
  "card_layouts",
  {
    id: serial("id").primaryKey(),
    // ShareCardInput["kind"] this layout customises (one row per kind).
    cardKind: text("card_kind").notNull(),
    layers: jsonb("layers").$type<CardLayoutLayer[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqCardKind: uniqueIndex("card_layouts_card_kind_unique").on(t.cardKind),
  }),
);

export type CardLayoutRow = typeof cardLayoutsTable.$inferSelect;

// --- Reusable layer effect presets -----------------------------------------
// A named, reusable bundle of per-layer visual effects (the same shape stored
// on a layer's `effects`). Admins save the current layer's effects as a preset
// and apply it to any layer in one click. A handful of curated built-in presets
// ship in the client; these rows are the admin-created additions.
export const cardEffectPresetsTable = pgTable("card_effect_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // A LayerEffects object (CardLayerEffects in the OpenAPI spec). Opaque jsonb
  // here so new effect fields need no schema change.
  effects: jsonb("effects").$type<Record<string, unknown>>().notNull().default({}),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CardEffectPresetRow = typeof cardEffectPresetsTable.$inferSelect;

// --- Multi-card / carousel sets --------------------------------------------
// One slide in a carousel set. A slide bundles the bound card data (`input`, a
// ShareCardInput JSON frozen from real club data at bind time) with its own
// per-slide render config: an optional studio `layout` (reusing the single-card
// layer model), an optional theme override and a motion preset. The `input`
// field is left opaque here (the db lib must not depend on the frontend's
// ShareCardInput union); the client casts it on the way in/out.
export type CardSetSlide = {
  id: string;
  input: Record<string, unknown>;
  layout?: CardLayoutLayer[];
  themeId?: number | null;
  motionPreset?: string;
};

// An ordered set of linked social slides (a carousel). Authored by admins;
// exported as numbered images / video at a chosen platform size.
export const cardSetsTable = pgTable("card_sets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Untitled set"),
  // Chosen export platform size: "square" | "portrait" | "story".
  platformSize: text("platform_size").notNull().default("square"),
  slides: jsonb("slides").$type<CardSetSlide[]>().notNull().default([]),
  // Draft/published state. Public reads only see published sets; admins see all.
  // New sets start as drafts so in-progress carousels stay private.
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CardSetRow = typeof cardSetsTable.$inferSelect;

export const socialSettingsTable = pgTable("social_settings", {
  id: serial("id").primaryKey(),
  engineOnDemand: boolean("engine_on_demand").notNull().default(true),
  engineMilestone: boolean("engine_milestone").notNull().default(false),
  engineRoundUp: boolean("engine_round_up").notNull().default(false),
  engineRecap: boolean("engine_recap").notNull().default(false),
  sizeSquare: boolean("size_square").notNull().default(true),
  sizePortrait: boolean("size_portrait").notNull().default(true),
  sizeStory: boolean("size_story").notNull().default(true),
  sponsorsEnabled: boolean("sponsors_enabled").notNull().default(true),
  captionsEnabled: boolean("captions_enabled").notNull().default(true),
  clubHashtag: text("club_hashtag").notNull().default("#HHCC"),
  clubUrl: text("club_url").notNull().default("hallsheadcricket.com.au"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialSettingsRow = typeof socialSettingsTable.$inferSelect;

// Singleton settings for the public "Significant Milestones" section on the
// Honour Boards page. Controls whether the board shows recent achievers,
// players approaching a club, or both, plus the configurable thresholds that
// define what counts as a "significant" club for games / runs / wickets.
export const milestoneBoardSettingsTable = pgTable("milestone_board_settings", {
  id: serial("id").primaryKey(),
  displayMode: text("display_mode").notNull().default("recent"), // "recent" | "approaching" | "both"
  gamesThreshold: integer("games_threshold").notNull().default(100),
  runsThreshold: integer("runs_threshold").notNull().default(1000),
  wicketsThreshold: integer("wickets_threshold").notNull().default(100),
  // How many weeks back (measured by real match dates) counts as a "recent"
  // achievement on the Milestones board. When ≥5 players achieved within this
  // window the board features recent achievers first; otherwise it ranks by
  // tier significance.
  recencyWeeks: integer("recency_weeks").notNull().default(4),
  // Club-editable significance tiers per stat. The first (lowest) entry is the
  // baseline tier; bigger values rank higher. Defaults keep 100 games / 1000
  // runs / 100 wickets as the baseline lowest tier.
  gamesTiers: integer("games_tiers").array().notNull().default([100, 150, 200, 250, 300]),
  runsTiers: integer("runs_tiers").array().notNull().default([1000, 2000, 3000, 5000, 7500, 10000]),
  wicketsTiers: integer("wickets_tiers").array().notNull().default([100, 150, 200, 300]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MilestoneBoardSettingsRow = typeof milestoneBoardSettingsTable.$inferSelect;

// One template per (engine, platform).
export const captionTemplatesTable = pgTable(
  "caption_templates",
  {
    id: serial("id").primaryKey(),
    engine: text("engine").notNull(), // "ondemand" | "milestone" | "roundup" | "recap"
    platform: text("platform").notNull(), // "instagram" | "facebook" | "twitter"
    template: text("template").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqEnginePlatform: uniqueIndex("caption_templates_engine_platform_unique").on(
      t.engine,
      t.platform,
    ),
  }),
);

export type CaptionTemplateRow = typeof captionTemplatesTable.$inferSelect;

// Milestone events emitted by the detector (scaffolded for follow-up work).
// Other features (e.g. push notifications) will subscribe to this table.
export const milestoneEventsTable = pgTable("milestone_events", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  boardKey: text("board_key").notNull(),
  tierIndex: integer("tier_index").notNull(),
  tierLabel: text("tier_label").notNull(),
  value: integer("value").notNull(),
  threshold: integer("threshold").notNull(),
  source: text("source").notNull(), // "import" | "manual"
  sourceImportId: integer("source_import_id"),
  payload: jsonb("payload"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
});

export type MilestoneEventRow = typeof milestoneEventsTable.$inferSelect;

// Ready-to-post draft queue. Populated by the auto-detectors (milestone, round-up, recap)
// and reviewed by admins in /admin/social-queue.
export const socialDraftsTable = pgTable("social_drafts", {
  id: serial("id").primaryKey(),
  engine: text("engine").notNull(), // "milestone" | "roundup" | "recap"
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "dismissed"
  cardInput: jsonb("card_input").notNull(), // ShareCardInput JSON
  appPath: text("app_path").notNull().default(""),
  trackedSlug: text("tracked_slug"), // populated when approved
  milestoneEventId: integer("milestone_event_id"),
  sourceImportId: integer("source_import_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type SocialDraftRow = typeof socialDraftsTable.$inferSelect;

// Short links for tracking which cards drive traffic. /go/:slug → targetUrl + log click.
export const trackedLinksTable = pgTable(
  "tracked_links",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    targetUrl: text("target_url").notNull(),
    label: text("label").notNull().default(""),
    engine: text("engine").notNull().default("ondemand"),
    platform: text("platform").notNull().default(""),
    clickCount: integer("click_count").notNull().default(0),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: uniqueIndex("tracked_links_slug_unique").on(t.slug),
  }),
);

export type TrackedLinkRow = typeof trackedLinksTable.$inferSelect;
