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
  logoDataUrl: text("logo_data_url").notNull(),
  link: text("link").notNull().default(""),
  activeFrom: date("active_from"),
  activeTo: date("active_to"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SponsorRow = typeof sponsorsTable.$inferSelect;

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
