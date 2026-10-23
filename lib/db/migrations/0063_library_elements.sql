-- Library elements (editable-elements plan, Stream D1; numbered 0062 after main took 0059). A shared
-- table like the library templates (ADR-011): every element is public, holds no club's assets,
-- and is inserted into a card as a copy of its layers (decision E2):
--   library_elements         reusable decorations; origin bundle (extracted from the looks,
--                            synced at boot) | club (saved by a club, public at once, E1) |
--                            console; listed until the author or Ovation unlists it
--   library_element_reports  a club's report of an element, one per club and element, for the
--                            platform console's moderation
-- Additive only: no existing table changes.
--
-- Apply in Production SQL before republishing the release that ships the element library (the
-- running code doesn't read these tables before then, so applying it early is harmless).
--
-- Idempotent (production was push-built and baselined at 0000): CREATE ... IF NOT EXISTS, and
-- each foreign key dropped if present and re-added.

CREATE TABLE IF NOT EXISTS "library_element_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"element_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"admin_id" integer,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"look_id" integer,
	"origin" text NOT NULL,
	"author_tenant_id" integer,
	"created_by_admin_id" integer,
	"document" jsonb NOT NULL,
	"signature" text,
	"bundle_hash" text,
	"thumbnail_url" text,
	"listed" boolean DEFAULT true NOT NULL,
	"unlisted_at" timestamp with time zone,
	"unlisted_by" text,
	"unlist_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_elements_slug_unique" UNIQUE("slug"),
	CONSTRAINT "library_elements_origin_check" CHECK ("origin" IN ('bundle', 'console', 'club')),
	CONSTRAINT "library_elements_category_check" CHECK ("category" IN ('frames', 'bands', 'badges', 'rules', 'glows', 'crest-frames', 'sponsor-strips', 'data-blocks')),
	CONSTRAINT "library_elements_unlisted_by_check" CHECK ("unlisted_by" IS NULL OR "unlisted_by" IN ('author', 'ovation'))
);
--> statement-breakpoint
ALTER TABLE "library_element_reports" DROP CONSTRAINT IF EXISTS "library_element_reports_element_id_library_elements_id_fk";--> statement-breakpoint
ALTER TABLE "library_element_reports" ADD CONSTRAINT "library_element_reports_element_id_library_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."library_elements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_element_reports" DROP CONSTRAINT IF EXISTS "library_element_reports_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "library_element_reports" ADD CONSTRAINT "library_element_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_elements" DROP CONSTRAINT IF EXISTS "library_elements_look_id_template_looks_id_fk";--> statement-breakpoint
ALTER TABLE "library_elements" ADD CONSTRAINT "library_elements_look_id_template_looks_id_fk" FOREIGN KEY ("look_id") REFERENCES "public"."template_looks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_elements" DROP CONSTRAINT IF EXISTS "library_elements_author_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "library_elements" ADD CONSTRAINT "library_elements_author_tenant_id_tenants_id_fk" FOREIGN KEY ("author_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_element_reports_element_tenant" ON "library_element_reports" USING btree ("element_id","tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_elements_category_listed" ON "library_elements" USING btree ("category") WHERE listed;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_elements_author" ON "library_elements" USING btree ("author_tenant_id");