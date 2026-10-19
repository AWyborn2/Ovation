-- Selection Hub decoupled from Availability (ADR-008; .10x/decisions/architect/selection-hub-decoupling.md).
-- Additive only:
--   availability_responses.source / set_by_admin_id / set_by_name
--                                     "admin" marks a verbal answer an admin or captain recorded in
--                                     the Hub; every existing row is a member's own answer ("member")
--   selection_events.round_id         a round-level audit row (an admin-set status for a member in
--                                     no side); selection_id becomes nullable, and a check keeps at
--                                     least one of the two set. Every existing row has selection_id
--   squad_member_participants         the club's crosswalk from a PlayHQ participant GUID to a squad
--                                     member, so a "Private Player" team-list row resolves
--   squad_members.show_name_publicly / _by / _at
--                                     an admin's choice to name a private member publicly; off by
--                                     default, so no public surface changes until an admin turns it on
-- Apply BEFORE republishing: the new code selects these columns and this table.
--
-- Idempotent (production was push-built and baselined at 0000): ADD COLUMN IF NOT EXISTS,
-- CREATE TABLE / INDEX IF NOT EXISTS, and each constraint is dropped if present and re-added.

ALTER TABLE "availability_responses" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_responses" ADD COLUMN IF NOT EXISTS "set_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "availability_responses" ADD COLUMN IF NOT EXISTS "set_by_name" text;--> statement-breakpoint
ALTER TABLE "availability_responses" DROP CONSTRAINT IF EXISTS "availability_responses_source_check";--> statement-breakpoint
ALTER TABLE "availability_responses" ADD CONSTRAINT "availability_responses_source_check" CHECK ("source" IN ('member', 'admin'));--> statement-breakpoint
ALTER TABLE "selection_events" ALTER COLUMN "selection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "selection_events" ADD COLUMN IF NOT EXISTS "round_id" integer;--> statement-breakpoint
ALTER TABLE "selection_events" DROP CONSTRAINT IF EXISTS "selection_events_round_id_availability_rounds_id_fk";--> statement-breakpoint
ALTER TABLE "selection_events" ADD CONSTRAINT "selection_events_round_id_availability_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."availability_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "selection_events_round_idx" ON "selection_events" USING btree ("round_id","created_at");--> statement-breakpoint
ALTER TABLE "selection_events" DROP CONSTRAINT IF EXISTS "selection_events_target_check";--> statement-breakpoint
ALTER TABLE "selection_events" ADD CONSTRAINT "selection_events_target_check" CHECK ("selection_id" IS NOT NULL OR "round_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "squad_members" ADD COLUMN IF NOT EXISTS "show_name_publicly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "squad_members" ADD COLUMN IF NOT EXISTS "show_name_publicly_by" text;--> statement-breakpoint
ALTER TABLE "squad_members" ADD COLUMN IF NOT EXISTS "show_name_publicly_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "squad_member_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"participant_id" text NOT NULL,
	"member_id" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "squad_member_participants" DROP CONSTRAINT IF EXISTS "squad_member_participants_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "squad_member_participants" ADD CONSTRAINT "squad_member_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_member_participants" DROP CONSTRAINT IF EXISTS "squad_member_participants_member_id_squad_members_id_fk";--> statement-breakpoint
ALTER TABLE "squad_member_participants" ADD CONSTRAINT "squad_member_participants_member_id_squad_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."squad_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "squad_member_participants_tenant_participant_uidx" ON "squad_member_participants" USING btree ("tenant_id","participant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "squad_member_participants_member_idx" ON "squad_member_participants" USING btree ("member_id");
