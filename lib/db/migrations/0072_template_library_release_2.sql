-- Template library release 2 (ADR-012; .10x/decisions/architect/template-library-release-2.md).
-- Additive only:
--   library_templates.tags                       style tags, checked set (GIN index)
--   library_template_versions.published_by_tenant_id, rights_confirmed_by_admin_id,
--     rights_confirmed_at                        who published a club version; the rights confirmation
--   card_templates.published_template_id         the library template a club template publishes to
--   card_templates_origin_template_idx           "used by N clubs"
--   library_template_reports                     clubs reporting a template (as for elements)
--   library_template_favourites                  a club's favourite templates
--   figma_connections, figma_connection_pending  a club's own Figma sign-in or pasted token (sealed)
--   template_generations.error                   why a generation failed
--   platform_settings.club_generate_enabled      Ovation's switch for club Generate (off)
-- Nothing is set on deploy, so the app behaves exactly as before.
-- Apply BEFORE republishing: the new code selects these columns.
--
-- Idempotent (production was push-built and baselined at 0000): IF NOT EXISTS throughout,
-- and each constraint is dropped if present before it is added.

CREATE TABLE IF NOT EXISTS "library_template_favourites" (
	"tenant_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_template_favourites_tenant_id_template_id_pk" PRIMARY KEY("tenant_id","template_id")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_template_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"admin_id" integer,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "figma_connection_pending" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"admin_id" integer NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "figma_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"access_token" jsonb NOT NULL,
	"refresh_token" jsonb,
	"expires_at" timestamp with time zone,
	"figma_user_id" text,
	"figma_handle" text,
	"status_reason" text,
	"connected_by_admin_id" integer,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figma_connections_method_check" CHECK ("method" IN ('oauth', 'token')),
	CONSTRAINT "figma_connections_status_check" CHECK ("status" IN ('connected', 'needs_reconnect'))
);--> statement-breakpoint
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "published_template_id" integer;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "club_generate_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "library_template_versions" ADD COLUMN IF NOT EXISTS "published_by_tenant_id" integer;--> statement-breakpoint
ALTER TABLE "library_template_versions" ADD COLUMN IF NOT EXISTS "rights_confirmed_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "library_template_versions" ADD COLUMN IF NOT EXISTS "rights_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "library_templates" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "template_generations" ADD COLUMN IF NOT EXISTS "error" text;--> statement-breakpoint
ALTER TABLE "library_template_favourites" DROP CONSTRAINT IF EXISTS "library_template_favourites_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "library_template_favourites" ADD CONSTRAINT "library_template_favourites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_template_favourites" DROP CONSTRAINT IF EXISTS "library_template_favourites_template_id_library_templates_id_fk";--> statement-breakpoint
ALTER TABLE "library_template_favourites" ADD CONSTRAINT "library_template_favourites_template_id_library_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."library_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_template_reports" DROP CONSTRAINT IF EXISTS "library_template_reports_template_id_library_templates_id_fk";--> statement-breakpoint
ALTER TABLE "library_template_reports" ADD CONSTRAINT "library_template_reports_template_id_library_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."library_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_template_reports" DROP CONSTRAINT IF EXISTS "library_template_reports_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "library_template_reports" ADD CONSTRAINT "library_template_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_connection_pending" DROP CONSTRAINT IF EXISTS "figma_connection_pending_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "figma_connection_pending" ADD CONSTRAINT "figma_connection_pending_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_connections" DROP CONSTRAINT IF EXISTS "figma_connections_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "figma_connections" ADD CONSTRAINT "figma_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_template_reports_template_tenant" ON "library_template_reports" USING btree ("template_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "figma_connection_pending_nonce_unique" ON "figma_connection_pending" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "figma_connection_pending_tenant_idx" ON "figma_connection_pending" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "figma_connections_tenant_unique" ON "figma_connections" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "card_templates" DROP CONSTRAINT IF EXISTS "card_templates_published_template_id_library_templates_id_fk";--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_published_template_id_library_templates_id_fk" FOREIGN KEY ("published_template_id") REFERENCES "public"."library_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_template_versions" DROP CONSTRAINT IF EXISTS "library_template_versions_published_by_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "library_template_versions" ADD CONSTRAINT "library_template_versions_published_by_tenant_id_tenants_id_fk" FOREIGN KEY ("published_by_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_templates_origin_template_idx" ON "card_templates" USING btree ("origin_template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_templates_tags_gin" ON "library_templates" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "library_templates" DROP CONSTRAINT IF EXISTS "library_templates_tags_check";--> statement-breakpoint
ALTER TABLE "library_templates" ADD CONSTRAINT "library_templates_tags_check" CHECK ("tags" <@ ARRAY['photo-led', 'bold-type', 'minimal', 'dark', 'light', 'retro', 'broadcast', 'textured']::text[]);
