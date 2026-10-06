-- Player availability and the Selection Hub (plan 2026-10-06-002, U1). Nine NEW
-- tenant-scoped tables and nothing else:
--   squad_members           the club squad register imported from PlayHQ (contacts admin-only)
--   availability_settings   one row per tenant: weekly rhythm, SMS switch, selection rule;
--                           enabled defaults to false, so nothing is sent until a club opts in
--   availability_rounds     one per tenant per weekend; step started_at columns are the claims
--   availability_requests   one per (round, member, recipient slot), delivery per channel
--   availability_tokens     hashed personal-link tokens, several live per request
--   availability_responses  one answer per (round, member, date)
--   availability_away       dates a member will be away
--   selections              one side per fixture (slots, captain, keeper, state, version)
--   selection_events        log of every selection change
-- No existing table, column or row is touched.
--
-- Idempotent (production is applied by hand in the SQL runner): tables and indexes use
-- IF NOT EXISTS and every foreign key is added in a DO block that ignores an existing one.
-- Re-running the file is a no-op.

CREATE TABLE IF NOT EXISTS "availability_away" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"member_id" integer NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_away_range_check" CHECK ("to_date" >= "from_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "availability_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"round_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"recipient_slot" text NOT NULL,
	"sms_result" text,
	"sms_at" timestamp with time zone,
	"email_result" text,
	"email_at" timestamp with time zone,
	"last_manual_reminder_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_requests_slot_check" CHECK ("recipient_slot" IN ('account', 'guardian1', 'guardian2'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "availability_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"round_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"responded_by_slot" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	CONSTRAINT "availability_responses_status_check" CHECK ("status" IN ('yes', 'no', 'maybe'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "availability_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"weekend_date" date NOT NULL,
	"send_started_at" timestamp with time zone,
	"send_completed_at" timestamp with time zone,
	"reminder_started_at" timestamp with time zone,
	"reminder_completed_at" timestamp with time zone,
	"cutoff_started_at" timestamp with time zone,
	"cutoff_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "availability_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sms_enabled" boolean DEFAULT true NOT NULL,
	"send_dow" integer DEFAULT 1 NOT NULL,
	"send_time" text DEFAULT '18:00' NOT NULL,
	"reminder_dow" integer DEFAULT 3 NOT NULL,
	"reminder_time" text DEFAULT '18:00' NOT NULL,
	"cutoff_dow" integer DEFAULT 4 NOT NULL,
	"cutoff_time" text DEFAULT '18:00' NOT NULL,
	"finalise_dow" integer DEFAULT 5 NOT NULL,
	"finalise_time" text DEFAULT '20:00' NOT NULL,
	"selection_rule" text DEFAULT 'captains_own_grade' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_settings_dow_check" CHECK ("send_dow" BETWEEN 0 AND 6 AND "reminder_dow" BETWEEN 0 AND 6 AND "cutoff_dow" BETWEEN 0 AND 6 AND "finalise_dow" BETWEEN 0 AND 6),
	CONSTRAINT "availability_settings_rule_check" CHECK ("selection_rule" IN ('captains_own_grade', 'captains_all_grades', 'admins_only'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "availability_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"request_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "selection_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"selection_id" integer NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" integer,
	"actor_name" text,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"round_id" integer NOT NULL,
	"fixture_id" integer NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captain_member_id" integer,
	"keeper_member_id" integer,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"finalised_at" timestamp with time zone,
	"finalised_by" text,
	"notified_member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "selections_state_check" CHECK ("state" IN ('draft', 'final'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "squad_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"playhq_profile_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
	"date_of_birth" date,
	"section" text DEFAULT 'senior' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"active_set_by_admin" boolean DEFAULT false NOT NULL,
	"grade_hint" text,
	"team_name" text,
	"age_group" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"linked_player_id" integer,
	"account_holder_name" text,
	"account_holder_mobile" text,
	"account_holder_email" text,
	"guardian1_name" text,
	"guardian1_mobile" text,
	"guardian1_email" text,
	"guardian2_name" text,
	"guardian2_mobile" text,
	"guardian2_email" text,
	"account_sms_opt_out" boolean DEFAULT false NOT NULL,
	"guardian1_sms_opt_out" boolean DEFAULT false NOT NULL,
	"guardian2_sms_opt_out" boolean DEFAULT false NOT NULL,
	"contact_changed_at" timestamp with time zone,
	"contact_change_flag" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squad_members_section_check" CHECK ("section" IN ('senior', 'junior'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_away" ADD CONSTRAINT "availability_away_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_away" ADD CONSTRAINT "availability_away_member_id_squad_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."squad_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_requests" ADD CONSTRAINT "availability_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_requests" ADD CONSTRAINT "availability_requests_round_id_availability_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."availability_rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_requests" ADD CONSTRAINT "availability_requests_member_id_squad_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."squad_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_round_id_availability_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."availability_rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_member_id_squad_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."squad_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_rounds" ADD CONSTRAINT "availability_rounds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_settings" ADD CONSTRAINT "availability_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_tokens" ADD CONSTRAINT "availability_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "availability_tokens" ADD CONSTRAINT "availability_tokens_request_id_availability_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."availability_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selection_events" ADD CONSTRAINT "selection_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selection_events" ADD CONSTRAINT "selection_events_selection_id_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."selections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selections" ADD CONSTRAINT "selections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selections" ADD CONSTRAINT "selections_round_id_availability_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."availability_rounds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selections" ADD CONSTRAINT "selections_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selections" ADD CONSTRAINT "selections_captain_member_id_squad_members_id_fk" FOREIGN KEY ("captain_member_id") REFERENCES "public"."squad_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "selections" ADD CONSTRAINT "selections_keeper_member_id_squad_members_id_fk" FOREIGN KEY ("keeper_member_id") REFERENCES "public"."squad_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "squad_members" ADD CONSTRAINT "squad_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_away_member_idx" ON "availability_away" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_requests_round_member_slot_uidx" ON "availability_requests" USING btree ("round_id","member_id","recipient_slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_requests_member_idx" ON "availability_requests" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_responses_round_member_date_uidx" ON "availability_responses" USING btree ("round_id","member_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_responses_member_idx" ON "availability_responses" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_rounds_tenant_weekend_uidx" ON "availability_rounds" USING btree ("tenant_id","weekend_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_settings_tenant_uidx" ON "availability_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "availability_tokens_hash_uidx" ON "availability_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "availability_tokens_request_idx" ON "availability_tokens" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "selection_events_selection_idx" ON "selection_events" USING btree ("selection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "selections_fixture_uidx" ON "selections" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "selections_tenant_round_idx" ON "selections" USING btree ("tenant_id","round_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "squad_members_tenant_idx" ON "squad_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "squad_members_tenant_profile_uidx" ON "squad_members" USING btree ("tenant_id","playhq_profile_id") WHERE "playhq_profile_id" IS NOT NULL;