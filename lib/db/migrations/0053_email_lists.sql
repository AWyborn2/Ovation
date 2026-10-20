-- Email distribution lists, PR1 (.10x/decisions/architect/email-distribution-lists.md).
-- Additive only; with no rows nothing is emailed:
--   email_lists         a club's named lists (kind team_sheet | social) with jsonb settings
--   email_list_members  name + email per list (admin-only PII; unique per list, case-insensitive)
--   email_list_teams    the senior grades a team-sheet list covers
--   email_sends         outbox + send log; idempotency_key UNIQUE; never stores addresses
-- Apply BEFORE republishing: the finalise route enqueues into these tables.
--
-- Idempotent (production was push-built and baselined at 0000): CREATE TABLE / INDEX IF NOT
-- EXISTS, and each constraint is dropped if present and re-added.

CREATE TABLE IF NOT EXISTS "email_list_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"list_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_list_teams" (
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"list_id" integer NOT NULL,
	"grade_key" text NOT NULL,
	CONSTRAINT "email_list_teams_list_id_grade_key_pk" PRIMARY KEY("list_id","grade_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_lists_kind_check" CHECK ("email_lists"."kind" IN ('team_sheet', 'social'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"list_id" integer NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_sends_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "email_sends_status_check" CHECK ("email_sends"."status" IN ('queued', 'sending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "email_list_members" DROP CONSTRAINT IF EXISTS "email_list_members_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_list_members" DROP CONSTRAINT IF EXISTS "email_list_members_list_id_email_lists_id_fk";--> statement-breakpoint
ALTER TABLE "email_list_members" ADD CONSTRAINT "email_list_members_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_list_teams" DROP CONSTRAINT IF EXISTS "email_list_teams_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "email_list_teams" ADD CONSTRAINT "email_list_teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_list_teams" DROP CONSTRAINT IF EXISTS "email_list_teams_list_id_email_lists_id_fk";--> statement-breakpoint
ALTER TABLE "email_list_teams" ADD CONSTRAINT "email_list_teams_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_lists" DROP CONSTRAINT IF EXISTS "email_lists_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_sends" DROP CONSTRAINT IF EXISTS "email_sends_list_id_email_lists_id_fk";--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_list_members_list_email_unique" ON "email_list_members" USING btree ("list_id",lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_list_teams_tenant_grade_idx" ON "email_list_teams" USING btree ("tenant_id","grade_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_lists_tenant_idx" ON "email_lists" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_tenant_queued_idx" ON "email_sends" USING btree ("tenant_id","queued_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_status_idx" ON "email_sends" USING btree ("status");