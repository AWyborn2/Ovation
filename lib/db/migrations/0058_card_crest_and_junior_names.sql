-- Club-set crests and junior names for social cards (Social Studio "Team and competition names").
-- Additive only; with no rows every card keeps the automatic crest and names, as the code does today:
--   team_crest_overrides                a crest per central club: crest_source 'upload' | 'known'
--                                       (a PlayHQ crest) with crest_url, or 'initials' (crest_url NULL)
--   junior_team_name_overrides          a short name per junior opponent, keyed on team_key (the
--                                       normalised automatic short name of the PlayHQ opponent name)
--   junior_team_crest_overrides         a crest per junior opponent, as team_crest_overrides
--   junior_competition_label_overrides  a card label per junior grade (age group, else grade)
-- Junior names live in their own tables: junior and senior names never mix (juniors isolation).
-- Tenant-curated content: never written to `central`.
-- Apply BEFORE republishing: the new code selects these tables.
--
-- Idempotent (production was push-built and baselined at 0000): CREATE TABLE IF NOT EXISTS,
-- and each constraint is dropped if present and re-added.

CREATE TABLE IF NOT EXISTS "team_crest_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"central_club_id" integer NOT NULL,
	"crest_source" text NOT NULL,
	"crest_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_competition_label_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade_key" text NOT NULL,
	"label" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_team_crest_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"team_key" text NOT NULL,
	"crest_source" text NOT NULL,
	"crest_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_team_name_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"team_key" text NOT NULL,
	"short_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_crest_overrides" DROP CONSTRAINT IF EXISTS "team_crest_overrides_tenant_club_unique";--> statement-breakpoint
ALTER TABLE "team_crest_overrides" ADD CONSTRAINT "team_crest_overrides_tenant_club_unique" UNIQUE("tenant_id","central_club_id");--> statement-breakpoint
ALTER TABLE "junior_competition_label_overrides" DROP CONSTRAINT IF EXISTS "junior_competition_label_overrides_tenant_grade_unique";--> statement-breakpoint
ALTER TABLE "junior_competition_label_overrides" ADD CONSTRAINT "junior_competition_label_overrides_tenant_grade_unique" UNIQUE("tenant_id","grade_key");--> statement-breakpoint
ALTER TABLE "junior_team_crest_overrides" DROP CONSTRAINT IF EXISTS "junior_team_crest_overrides_tenant_team_unique";--> statement-breakpoint
ALTER TABLE "junior_team_crest_overrides" ADD CONSTRAINT "junior_team_crest_overrides_tenant_team_unique" UNIQUE("tenant_id","team_key");--> statement-breakpoint
ALTER TABLE "junior_team_name_overrides" DROP CONSTRAINT IF EXISTS "junior_team_name_overrides_tenant_team_unique";--> statement-breakpoint
ALTER TABLE "junior_team_name_overrides" ADD CONSTRAINT "junior_team_name_overrides_tenant_team_unique" UNIQUE("tenant_id","team_key");--> statement-breakpoint
ALTER TABLE "team_crest_overrides" DROP CONSTRAINT IF EXISTS "team_crest_overrides_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "team_crest_overrides" ADD CONSTRAINT "team_crest_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_competition_label_overrides" DROP CONSTRAINT IF EXISTS "junior_competition_label_overrides_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "junior_competition_label_overrides" ADD CONSTRAINT "junior_competition_label_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_team_crest_overrides" DROP CONSTRAINT IF EXISTS "junior_team_crest_overrides_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "junior_team_crest_overrides" ADD CONSTRAINT "junior_team_crest_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_team_name_overrides" DROP CONSTRAINT IF EXISTS "junior_team_name_overrides_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "junior_team_name_overrides" ADD CONSTRAINT "junior_team_name_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
