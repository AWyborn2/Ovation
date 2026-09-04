-- Reconcile a database that was built with `drizzle-kit push` (before this
-- migrations directory existed) with the schema in 0000_initial_schema.sql.
--
-- `push` never owned the composite / NULLS NOT DISTINCT / partial uniques, the
-- stats-core performance indexes, the tenant_id indexes or the CHECK
-- constraints: they were re-applied after every push by
-- scripts/src/ensure-constraints.ts. src/migrate.ts baselines such a database
-- at 0000 (recorded, not executed) and then runs this file, which adds every
-- one of those objects idempotently. On a fresh database 0000 has already
-- created them all and every statement here is a no-op.
--
-- CHECK constraints are added NOT VALID so a legacy row with an unexpected
-- value cannot block the deploy; new writes are still checked. Validate them
-- once the data has been reviewed:
--   ALTER TABLE "tenants" VALIDATE CONSTRAINT "tenants_plan_check";

-- ── Superseded identities ───────────────────────────────────────────────────
ALTER TABLE "cap_register" DROP CONSTRAINT IF EXISTS "cap_register_category_cap_number_unique";--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_grade_season_round_stage_unique";--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_grade_season_round_unique";--> statement-breakpoint

-- ── Composite UNIQUE constraints ────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'cap_register_tenant_category_cap_number_unique' AND r.relname = 'cap_register' AND n.nspname = 'public') THEN
    ALTER TABLE "cap_register" ADD CONSTRAINT "cap_register_tenant_category_cap_number_unique" UNIQUE ("tenant_id", "category", "cap_number");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'admins_tenant_username_unique' AND r.relname = 'admins' AND n.nspname = 'public') THEN
    ALTER TABLE "admins" ADD CONSTRAINT "admins_tenant_username_unique" UNIQUE ("tenant_id", "username");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'captains_tenant_username_unique' AND r.relname = 'captains' AND n.nspname = 'public') THEN
    ALTER TABLE "captains" ADD CONSTRAINT "captains_tenant_username_unique" UNIQUE ("tenant_id", "username");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'captain_grade_permissions_captain_grade_unique' AND r.relname = 'captain_grade_permissions' AND n.nspname = 'public') THEN
    ALTER TABLE "captain_grade_permissions" ADD CONSTRAINT "captain_grade_permissions_captain_grade_unique" UNIQUE ("captain_id", "grade");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'baseline_adjustments_grade_season_player_id_unique' AND r.relname = 'baseline_adjustments' AND n.nspname = 'public') THEN
    ALTER TABLE "baseline_adjustments" ADD CONSTRAINT "baseline_adjustments_grade_season_player_id_unique" UNIQUE ("grade", "season", "player_id");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'award_voting_config_award_season_unique' AND r.relname = 'award_voting_config' AND n.nspname = 'public') THEN
    ALTER TABLE "award_voting_config" ADD CONSTRAINT "award_voting_config_award_season_unique" UNIQUE ("award_id", "season");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'award_ballots_config_captain_grade_round_unique' AND r.relname = 'award_ballots' AND n.nspname = 'public') THEN
    ALTER TABLE "award_ballots" ADD CONSTRAINT "award_ballots_config_captain_grade_round_unique" UNIQUE ("config_id", "captain_id", "grade", "round");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'award_points_config_award_season_unique' AND r.relname = 'award_points_config' AND n.nspname = 'public') THEN
    ALTER TABLE "award_points_config" ADD CONSTRAINT "award_points_config_award_season_unique" UNIQUE ("award_id", "season");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'club_roles_season_role_grade_unique' AND r.relname = 'club_roles' AND n.nspname = 'public') THEN
    ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_season_role_grade_unique" UNIQUE NULLS NOT DISTINCT ("season", "role", "grade");
  END IF;
END $$;--> statement-breakpoint

-- ── Partial / unique indexes ────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_central_club_id_uidx" ON "tenants" USING btree ("central_club_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_custom_domain_uidx" ON "tenants" USING btree ("custom_domain") WHERE "custom_domain" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matches_source_key_uidx" ON "matches" USING btree ("source_key") WHERE "source_key" IS NOT NULL;--> statement-breakpoint
-- Admin per-match uploads (source_key IS NULL): one match per identity, with
-- NULL round/stage colliding. Drizzle's index builder cannot express NULLS NOT
-- DISTINCT together with a WHERE clause, so this index lives only here (and in
-- ensure-constraints' verification list) rather than in the schema.
CREATE UNIQUE INDEX IF NOT EXISTS "matches_identity_manual_uidx" ON "matches" USING btree ("grade", "season", "round", "stage") NULLS NOT DISTINCT WHERE "source_key" IS NULL;--> statement-breakpoint

-- ── Stats-core performance indexes ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "match_player_lines_match_idx" ON "match_player_lines" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_player_lines_player_idx" ON "match_player_lines" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_grade_stats_player_idx" ON "player_grade_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_grade_stats_grade_idx" ON "player_grade_stats" USING btree ("grade");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pgss_player_idx" ON "player_grade_season_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pgss_grade_season_idx" ON "player_grade_season_stats" USING btree ("grade", "season");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_grade_season_idx" ON "matches" USING btree ("grade", "season");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_match_date_idx" ON "matches" USING btree ("match_date");--> statement-breakpoint

-- ── Foreign-key indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "cap_register_player_idx" ON "cap_register" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "premiership_players_premiership_idx" ON "premiership_players" USING btree ("premiership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_match_batting_match_idx" ON "junior_match_batting" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_match_bowling_match_idx" ON "junior_match_bowling" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_match_rosters_match_idx" ON "junior_match_rosters" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_images_player_idx" ON "player_images" USING btree ("player_id");--> statement-breakpoint

-- ── tenant_id indexes on tenant-scoped curated tables ───────────────────────
CREATE INDEX IF NOT EXISTS "admin_password_resets_tenant_idx" ON "admin_password_resets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admins_tenant_idx" ON "admins" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "awards_tenant_idx" ON "awards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "award_winners_tenant_idx" ON "award_winners" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cap_register_tenant_idx" ON "cap_register" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "captains_tenant_idx" ON "captains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_roles_tenant_idx" ON "club_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixtures_tenant_idx" ON "fixtures" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "centuries_tenant_idx" ON "centuries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "five_wicket_hauls_tenant_idx" ON "five_wicket_hauls" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "club_records_tenant_idx" ON "club_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "honour_board_records_tenant_idx" ON "honour_board_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "honour_boards_tenant_idx" ON "honour_boards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "honour_board_overrides_tenant_idx" ON "honour_board_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_matches_tenant_idx" ON "junior_matches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_participants_tenant_idx" ON "junior_participants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_premierships_tenant_idx" ON "junior_premierships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_office_bearers_tenant_idx" ON "junior_office_bearers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "life_members_tenant_idx" ON "life_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nav_items_tenant_idx" ON "nav_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "non_player_people_tenant_idx" ON "non_player_people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partnership_records_tenant_idx" ON "partnership_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partnerships_50plus_tenant_idx" ON "partnerships_50plus" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_images_tenant_idx" ON "player_images" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "premierships_tenant_idx" ON "premierships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "premiership_players_tenant_idx" ON "premiership_players" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_themes_tenant_idx" ON "card_themes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_audio_tracks_tenant_idx" ON "card_audio_tracks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_effect_presets_tenant_idx" ON "card_effect_presets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestone_events_tenant_idx" ON "milestone_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_of_decade_boards_tenant_idx" ON "team_of_decade_boards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_of_decade_members_tenant_idx" ON "team_of_decade_members" USING btree ("tenant_id");--> statement-breakpoint

-- ── CHECK constraints for comment-only value sets (NOT VALID on legacy rows) ─
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'tenants_plan_check' AND r.relname = 'tenants' AND n.nspname = 'public') THEN
    ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_check" CHECK ("plan" IN ('free', 'club', 'pro', 'pilot')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'imports_kind_check' AND r.relname = 'imports' AND n.nspname = 'public') THEN
    ALTER TABLE "imports" ADD CONSTRAINT "imports_kind_check" CHECK ("kind" IN ('csv', 'match', 'match-batch')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'social_drafts_status_check' AND r.relname = 'social_drafts' AND n.nspname = 'public') THEN
    ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_status_check" CHECK ("status" IN ('pending', 'approved', 'dismissed', 'posted')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'awards_mechanism_check' AND r.relname = 'awards' AND n.nspname = 'public') THEN
    ALTER TABLE "awards" ADD CONSTRAINT "awards_mechanism_check" CHECK ("mechanism" IN ('voted', 'points', 'manual')) NOT VALID;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'nav_items_surface_check' AND r.relname = 'nav_items' AND n.nspname = 'public') THEN
    ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_surface_check" CHECK ("surface" IN ('senior_menu', 'junior_menu', 'junior_quick_links', 'admin_tiles')) NOT VALID;
  END IF;
END $$;
