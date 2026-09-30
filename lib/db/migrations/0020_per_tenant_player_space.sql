-- Per-tenant player id space and per-tenant curated keys (hybrid stats plan U8,
-- R16, R17, KTD3).
--
-- 1. Curated tables stop referencing the NATIVE players table. A curated row's
--    player id is an id in its tenant's own space (the tenant's crosswalk ints;
--    for Halls Head also its native players.id while it reads native), checked
--    on write by assertPlayerInTenantSpace in the api-server. Central tenants'
--    crosswalk ids start at 1 and overlap native Halls Head ids, so the FKs
--    silently tied other clubs' rows to Halls Head players. Columns and values
--    are untouched; the native stats core (players, matches, match_player_lines,
--    player_grade_stats, player_grade_season_stats, baseline_adjustments,
--    imports, match_hat_tricks) keeps its FKs.
-- 2. Curated keys become unique per tenant: honour_boards.key, awards.key,
--    team_of_decade_boards.key, honour_board_overrides (board_key, player_id)
--    and club_roles (season, role, grade). Per-tenant is strictly looser than
--    global, so no existing row can violate the new constraints.
--
-- Idempotent (production was push-built and baselined at 0000): every step is
-- guarded, and the FK drop finds constraints by what they reference, not by
-- name, so a pushed database with differently named FKs is handled too.
-- Re-running the whole file is a no-op.

-- ── Per-tenant uniques (added before the global ones are dropped) ───────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'honour_boards_tenant_key_unique' AND r.relname = 'honour_boards' AND n.nspname = 'public') THEN
    ALTER TABLE "honour_boards" ADD CONSTRAINT "honour_boards_tenant_key_unique" UNIQUE ("tenant_id", "key");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'awards_tenant_key_unique' AND r.relname = 'awards' AND n.nspname = 'public') THEN
    ALTER TABLE "awards" ADD CONSTRAINT "awards_tenant_key_unique" UNIQUE ("tenant_id", "key");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'team_of_decade_boards_tenant_key_unique' AND r.relname = 'team_of_decade_boards' AND n.nspname = 'public') THEN
    ALTER TABLE "team_of_decade_boards" ADD CONSTRAINT "team_of_decade_boards_tenant_key_unique" UNIQUE ("tenant_id", "key");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
                 WHERE c.conname = 'club_roles_tenant_season_role_grade_unique' AND r.relname = 'club_roles' AND n.nspname = 'public') THEN
    ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_tenant_season_role_grade_unique" UNIQUE NULLS NOT DISTINCT ("tenant_id", "season", "role", "grade");
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hbo_tenant_board_player_unique" ON "honour_board_overrides" USING btree ("tenant_id","board_key","player_id");--> statement-breakpoint

-- ── Global uniques they supersede ───────────────────────────────────────────
ALTER TABLE "honour_boards" DROP CONSTRAINT IF EXISTS "honour_boards_key_unique";--> statement-breakpoint
ALTER TABLE "awards" DROP CONSTRAINT IF EXISTS "awards_key_unique";--> statement-breakpoint
ALTER TABLE "team_of_decade_boards" DROP CONSTRAINT IF EXISTS "team_of_decade_boards_key_unique";--> statement-breakpoint
ALTER TABLE "club_roles" DROP CONSTRAINT IF EXISTS "club_roles_season_role_grade_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "hbo_board_player_unique";--> statement-breakpoint

-- ── Curated foreign keys to the native players table ────────────────────────
-- Every FK from these tables whose target is public.players, whatever its name
-- (on a migrated database they are <table>_<column>_players_id_fk).
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT r.relname AS tbl, c.conname AS con
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND c.confrelid = 'public.players'::regclass
      AND r.relname IN (
        'award_winners', 'award_ballots', 'life_members', 'team_of_decade_members',
        'cap_register', 'club_roles', 'honour_board_overrides', 'player_images',
        'premiership_players', 'centuries', 'five_wicket_hauls'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', fk.tbl, fk.con);
  END LOOP;
END $$;
