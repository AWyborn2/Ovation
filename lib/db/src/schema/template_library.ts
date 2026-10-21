import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantsTable } from "./tenants";

/**
 * Social template library (ADR-011, migration 0059).
 *
 * The library tables hold only shareable data: nothing in them references a
 * tenant's assets, and library reads never return `card_templates` rows. A
 * club's own copies stay in `card_templates` (`source = 'kind'`, many per kind,
 * one default per kind) and are always tenant-filtered.
 *
 *   template_looks             a named set of templates, one per kind it covers
 *   library_templates          one kind each; origin 'bundle' (repo JSON synced at
 *                              boot), 'console' (platform designers) or 'club' (R2)
 *   library_template_versions  immutable documents, with coverage and fit result
 *   template_generations       AI designer usage and cost, one row per job
 */

/** Where a library look or template comes from. */
export type TemplateOrigin = "bundle" | "console" | "club";

/** The fit check's verdict on a template version or a club copy. */
export type TemplateFitStatus = "pending" | "pass" | "fail";

/**
 * Which pages and sizes a library version designs. Declared here (not imported
 * from `@workspace/scorecard`) so the schema package keeps no dependency on it.
 */
export type TemplateCoverageColumn = { pages: string[]; sizes: string[] };

/**
 * The fit check's report: warnings per page × size × preset, with the renderer
 * and fonts versions it ran against. Its detailed shape belongs to the fit job.
 */
export type TemplateFitReportColumn = Record<string, unknown>;

export const templateLooksTable = pgTable(
  "template_looks",
  {
    id: serial("id").primaryKey(),
    // 'club-kit', 'gold-foil', 'clubhouse'.
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    // Null = Ovation.
    authorTenantId: integer("author_tenant_id").references(() => tenantsTable.id, {
      onDelete: "set null",
    }),
    origin: text("origin").$type<TemplateOrigin>().notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    chkOrigin: check(
      "template_looks_origin_check",
      sql`"origin" IN ('bundle', 'console', 'club')`,
    ),
  }),
);

export type TemplateLookRow = typeof templateLooksTable.$inferSelect;

export const libraryTemplatesTable = pgTable(
  "library_templates",
  {
    id: serial("id").primaryKey(),
    // 'club-kit/matchDay' for bundle templates; null otherwise.
    slug: text("slug").unique(),
    lookId: integer("look_id").references(() => templateLooksTable.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    // Null = Ovation.
    authorTenantId: integer("author_tenant_id").references(() => tenantsTable.id, {
      onDelete: "set null",
    }),
    origin: text("origin").$type<TemplateOrigin>().notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    // Listed templates show in every club's library once their current version
    // passes the fit check at every page, size and preset.
    listed: boolean("listed").notNull().default(false),
    listedAt: timestamp("listed_at", { withTimezone: true }),
    unlistedAt: timestamp("unlisted_at", { withTimezone: true }),
    unlistedBy: text("unlisted_by").$type<"author" | "ovation">(),
    unlistReason: text("unlist_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxKindListed: index("library_templates_kind_listed")
      .on(t.kind)
      .where(sql`listed`),
    chkOrigin: check(
      "library_templates_origin_check",
      sql`"origin" IN ('bundle', 'console', 'club')`,
    ),
    chkUnlistedBy: check(
      "library_templates_unlisted_by_check",
      sql`"unlisted_by" IS NULL OR "unlisted_by" IN ('author', 'ovation')`,
    ),
  }),
);

export type LibraryTemplateRow = typeof libraryTemplatesTable.$inferSelect;

export const libraryTemplateVersionsTable = pgTable(
  "library_template_versions",
  {
    templateId: integer("template_id")
      .notNull()
      .references(() => libraryTemplatesTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    document: jsonb("document").notNull(),
    coverage: jsonb("coverage").$type<TemplateCoverageColumn>().notNull(),
    fitStatus: text("fit_status").$type<TemplateFitStatus>().notNull().default("pending"),
    fitReport: jsonb("fit_report").$type<TemplateFitReportColumn>(),
    // Bundle origin only: the hash of the bundle file this version came from.
    bundleHash: text("bundle_hash"),
    // The platform admin who made a console version.
    createdByAdminId: integer("created_by_admin_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.templateId, t.version] }),
    chkFitStatus: check(
      "library_template_versions_fit_status_check",
      sql`"fit_status" IN ('pending', 'pass', 'fail')`,
    ),
  }),
);

export type LibraryTemplateVersionRow = typeof libraryTemplateVersionsTable.$inferSelect;

export const templateGenerationsTable = pgTable(
  "template_generations",
  {
    id: serial("id").primaryKey(),
    // Null = Ovation's designer tool (platform console).
    tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    // A club admin or a platform admin.
    adminId: integer("admin_id"),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    status: text("status").$type<"queued" | "running" | "done" | "failed">().notNull().default("queued"),
    inputTokens: integer("input_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    outputTokens: integer("output_tokens"),
    costMicros: bigint("cost_micros", { mode: "number" }),
    attempts: integer("attempts").notNull().default(0),
    firstTryFit: boolean("first_try_fit"),
    // 'pass' | 'warnings' | 'invalid' | 'provider_error' | 'refused'.
    outcome: text("outcome"),
    // { libraryTemplateId | copyId, version }.
    resultRef: jsonb("result_ref").$type<Record<string, number>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    idxTenantMonth: index("template_generations_tenant_month").on(t.tenantId, t.createdAt),
    chkStatus: check(
      "template_generations_status_check",
      sql`"status" IN ('queued', 'running', 'done', 'failed')`,
    ),
  }),
);

export type TemplateGenerationRow = typeof templateGenerationsTable.$inferSelect;
