-- Social template library (ADR-011; designed as 0057, renumbered after #412, the crest
-- overrides and the Selection Hub sync took 0057–0059). Shared library tables, club copies in card_templates, and
-- the template a draft was copied from:
--   template_looks              named sets of templates (Club Kit, Gold Foil, Clubhouse, ...)
--   library_templates           one kind each; origin bundle | console | club; listed or not
--   library_template_versions   immutable documents with coverage and the fit result
--   template_generations        AI designer usage and cost (one row per job)
--   card_templates              + is_kind_default, origin_template_id, origin_version,
--                                 edited_at, fit_status, fit_report
--   social_drafts               + template_ref
-- The library tables hold no tenant-private data. Copies stay tenant-scoped in card_templates.
--
-- Pilot carry-over: every existing kind row (source = 'kind') becomes its tenant's default
-- for its kind, with its id, version and document unchanged. The one-row-per-kind unique
-- index card_templates_kind_unique gives way to card_templates_kind_default_unique (one
-- DEFAULT per tenant and kind), so a club can hold many copies of a kind.
--
-- Apply in Production SQL RIGHT BEFORE republishing the release (not earlier: the running
-- code relies on card_templates_kind_unique; not left to the publish: its schema sync does
-- not run the UPDATE below).
--
-- Idempotent (production was push-built and baselined at 0000): CREATE ... IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, each constraint dropped if present and re-added, and the UPDATE
-- only marks a kind that has no default yet.

CREATE TABLE IF NOT EXISTS "template_looks" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"author_tenant_id" integer,
	"origin" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text,
	"look_id" integer,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"author_tenant_id" integer,
	"origin" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"listed" boolean DEFAULT false NOT NULL,
	"listed_at" timestamp with time zone,
	"unlisted_at" timestamp with time zone,
	"unlisted_by" text,
	"unlist_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_template_versions" (
	"template_id" integer NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"coverage" jsonb NOT NULL,
	"fit_status" text DEFAULT 'pending' NOT NULL,
	"fit_report" jsonb,
	"bundle_hash" text,
	"created_by_admin_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_template_versions_template_id_version_pk" PRIMARY KEY("template_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"admin_id" integer,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"output_tokens" integer,
	"cost_micros" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_try_fit" boolean,
	"outcome" text,
	"result_ref" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "template_looks" DROP CONSTRAINT IF EXISTS "template_looks_slug_unique";--> statement-breakpoint
ALTER TABLE "template_looks" ADD CONSTRAINT "template_looks_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "template_looks" DROP CONSTRAINT IF EXISTS "template_looks_origin_check";--> statement-breakpoint
ALTER TABLE "template_looks" ADD CONSTRAINT "template_looks_origin_check" CHECK ("origin" IN ('bundle', 'console', 'club'));--> statement-breakpoint
ALTER TABLE "library_templates" DROP CONSTRAINT IF EXISTS "library_templates_slug_unique";--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "library_templates" DROP CONSTRAINT IF EXISTS "library_templates_origin_check";--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_origin_check" CHECK ("origin" IN ('bundle', 'console', 'club'));--> statement-breakpoint
ALTER TABLE "library_templates" DROP CONSTRAINT IF EXISTS "library_templates_unlisted_by_check";--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_unlisted_by_check" CHECK ("unlisted_by" IS NULL OR "unlisted_by" IN ('author', 'ovation'));--> statement-breakpoint
ALTER TABLE "library_template_versions" DROP CONSTRAINT IF EXISTS "library_template_versions_fit_status_check";--> statement-breakpoint
ALTER TABLE "library_template_versions" ADD CONSTRAINT "library_template_versions_fit_status_check" CHECK ("fit_status" IN ('pending', 'pass', 'fail'));--> statement-breakpoint
ALTER TABLE "template_generations" DROP CONSTRAINT IF EXISTS "template_generations_status_check";--> statement-breakpoint
ALTER TABLE "template_generations" ADD CONSTRAINT "template_generations_status_check" CHECK ("status" IN ('queued', 'running', 'done', 'failed'));--> statement-breakpoint
ALTER TABLE "template_looks" DROP CONSTRAINT IF EXISTS "template_looks_author_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "template_looks" ADD CONSTRAINT "template_looks_author_tenant_id_tenants_id_fk" FOREIGN KEY ("author_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_templates" DROP CONSTRAINT IF EXISTS "library_templates_look_id_template_looks_id_fk";--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_look_id_template_looks_id_fk" FOREIGN KEY ("look_id") REFERENCES "public"."template_looks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_templates" DROP CONSTRAINT IF EXISTS "library_templates_author_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_author_tenant_id_tenants_id_fk" FOREIGN KEY ("author_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_template_versions" DROP CONSTRAINT IF EXISTS "library_template_versions_template_id_library_templates_id_fk";--> statement-breakpoint
ALTER TABLE "library_template_versions" ADD CONSTRAINT "library_template_versions_template_id_library_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."library_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_generations" DROP CONSTRAINT IF EXISTS "template_generations_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "template_generations" ADD CONSTRAINT "template_generations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_templates_kind_listed" ON "library_templates" USING btree ("kind") WHERE listed;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_generations_tenant_month" ON "template_generations" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "is_kind_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "origin_template_id" integer;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "origin_version" integer;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "fit_status" text DEFAULT 'pass' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "fit_report" jsonb;--> statement-breakpoint
ALTER TABLE "card_templates" DROP CONSTRAINT IF EXISTS "card_templates_origin_template_id_library_templates_id_fk";--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_origin_template_id_library_templates_id_fk" FOREIGN KEY ("origin_template_id") REFERENCES "public"."library_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "template_ref" jsonb;--> statement-breakpoint
-- Pilot carry-over: today's kind rows (one per tenant and kind, under the old index) become
-- each kind's default. Ids, versions and documents are untouched. Safe to re-run: a kind
-- that already has a default keeps it, so copies a club made since are never promoted, and
-- if a tenant somehow has several unmarked rows for a kind only the oldest becomes default.
UPDATE "card_templates" AS t SET "is_kind_default" = true
WHERE t."source" = 'kind' AND NOT t."is_kind_default"
  AND NOT EXISTS (
    SELECT 1 FROM "card_templates" d
    WHERE d."source" = 'kind' AND d."is_kind_default"
      AND d."tenant_id" IS NOT DISTINCT FROM t."tenant_id" AND d."base_kind" IS NOT DISTINCT FROM t."base_kind"
  )
  AND t."id" = (
    SELECT min(c."id") FROM "card_templates" c
    WHERE c."source" = 'kind' AND NOT c."is_kind_default"
      AND c."tenant_id" IS NOT DISTINCT FROM t."tenant_id" AND c."base_kind" IS NOT DISTINCT FROM t."base_kind"
  );--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "card_templates_kind_default_unique" ON "card_templates" USING btree ("tenant_id","base_kind") WHERE source = 'kind' and is_kind_default;--> statement-breakpoint
DROP INDEX IF EXISTS "card_templates_kind_unique";
