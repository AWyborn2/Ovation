-- Platform decisions about PlayHQ competitions Ovation can't place in a grade: map one to a
-- recognised label, or mark it as not tracked. Read (never written) by the central projector;
-- see scripts/sql/central-projector.sql for its SELECT grant. Idempotent (production was
-- push-built and baselined at 0000).
CREATE TABLE IF NOT EXISTS "playhq_grade_decisions" (
	"grade_key" text PRIMARY KEY NOT NULL,
	"grade_name" text NOT NULL,
	"action" text NOT NULL,
	"central_grade" text,
	"reason" text,
	"set_by_platform_admin_id" integer,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playhq_grade_decisions_action_check" CHECK ("playhq_grade_decisions"."action" in ('map', 'ignore')),
	CONSTRAINT "playhq_grade_decisions_map_needs_grade" CHECK (("playhq_grade_decisions"."action" = 'map') = ("playhq_grade_decisions"."central_grade" is not null))
);
