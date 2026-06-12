import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

// One editable tour step's copy. `key` matches an in-code step definition in the
// frontend (src/lib/tour.ts); only the title + description are admin-editable —
// the DOM target, side and alignment stay in code. Empty title/description means
// "fall back to the in-code default".
export type TourStepContent = {
  key: string;
  title: string;
  description: string;
};

// Singleton (id = 1) holding admin-editable onboarding copy: the first-visit
// welcome dialog title/body and the per-step titles/descriptions for the fan and
// admin guided tours. Stored as overrides only — anything left blank falls back
// to the in-code defaults, so the code remains the single source of truth for
// tour *structure* (which sections are highlighted) while clubs can re-word the
// copy without a developer. App-config (never replaced by the master ETL).
export const tourContentTable = pgTable("tour_content", {
  id: serial("id").primaryKey(),
  // NOTE(tenant): singleton (id=1) today; per-tenant copy needs the singleton
  // keyed by tenant_id (follow-up). Column added so the row carries its tenant.
  tenantId: tenantIdColumn(),
  welcomeTitle: text("welcome_title").notNull().default(""),
  welcomeBody: text("welcome_body").notNull().default(""),
  fanSteps: jsonb("fan_steps").$type<TourStepContent[]>().notNull().default([]),
  adminSteps: jsonb("admin_steps").$type<TourStepContent[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TourContentRow = typeof tourContentTable.$inferSelect;
