CREATE TABLE "social_connection_pending" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"admin_id" integer NOT NULL,
	"meta_user_id" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"provider" text DEFAULT 'meta' NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"meta_user_id" text,
	"page_id" text,
	"page_name" text,
	"ig_user_id" text,
	"ig_username" text,
	"page_token" jsonb,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status_reason" text,
	"connected_by_admin_id" integer,
	"connected_at" timestamp with time zone,
	"last_health_check_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_connections_status_check" CHECK ("status" IN ('connected', 'needs_reconnect', 'disconnected'))
);
--> statement-breakpoint
CREATE TABLE "social_publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"draft_id" integer NOT NULL,
	"platform" text NOT NULL,
	"post_type" text DEFAULT 'feed' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media_created_at" timestamp with time zone,
	"image_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_post_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_publications_status_check" CHECK ("status" IN ('scheduled', 'held', 'publishing', 'published', 'failed', 'cancelled')),
	CONSTRAINT "social_publications_platform_check" CHECK ("platform" IN ('facebook', 'instagram')),
	CONSTRAINT "social_publications_post_type_check" CHECK ("post_type" IN ('feed', 'story'))
);
--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN "auto_publish_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "social_settings" ADD COLUMN "auto_publish_freshness_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_connection_pending" ADD CONSTRAINT "social_connection_pending_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_publications" ADD CONSTRAINT "social_publications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_publications" ADD CONSTRAINT "social_publications_draft_id_social_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."social_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_connection_pending_tenant_idx" ON "social_connection_pending" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connections_tenant_provider_unique" ON "social_connections" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE INDEX "social_connections_meta_user_idx" ON "social_connections" USING btree ("meta_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_publications_active_unique" ON "social_publications" USING btree ("draft_id","platform","post_type") WHERE status IN ('scheduled', 'held', 'publishing', 'published');--> statement-breakpoint
CREATE INDEX "social_publications_due_idx" ON "social_publications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "social_publications_tenant_draft_idx" ON "social_publications" USING btree ("tenant_id","draft_id");