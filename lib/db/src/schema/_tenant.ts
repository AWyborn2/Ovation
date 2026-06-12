import { integer } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/**
 * Tenant-scope column for curated club tables (white-label isolation, Phase 0
 * step 6).
 *
 * `NOT NULL DEFAULT 1` so a `db push` adds the column and backfills every
 * existing row to Halls Head (tenant #1) non-interactively — no prompt, no
 * manual migration. FK → tenants.id. Read paths add
 * `eq(table.tenantId, getTenantId(req))`; write paths set it from the request
 * context.
 *
 * Each call returns a fresh column builder (Drizzle requires a distinct builder
 * per column), so use it as `tenantId: tenantIdColumn(),`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INVENTORY — tenant-curated tables (the differentiating club content + the
 * per-club stats core). Excluded (stay global): `admins` (app auth), `clubs`
 * (shared register), `tenants` itself, and the central/generated tables.
 *
 * APPLIED in this migration (curated content):
 *   honour_boards, honour_board_overrides, life_members, awards, award_winners,
 *   team_of_decade_boards, team_of_decade_members, premierships,
 *   premiership_players, cap_register, club_roles, non_player_people,
 *   partnership_records, partnerships_50plus, centuries, club_records,
 *   five_wicket_hauls, honour_board_records, tour_content, nav_items,
 *   player_images, sponsors, card_themes, junior_participants, junior_matches,
 *   junior_premierships, junior_office_bearers.
 *
 * STAGED (follow-up, with rationale — column NOT added here):
 *   - Per-club STATS core (players, player_grade_stats, player_grade_season_stats,
 *     grade_summaries, matches, match_player_lines, match_opposition_lines,
 *     match_hat_tricks, imports, baseline_adjustments): these are slated to be
 *     REPLACED by central-DB reads filtered by the tenant's club_id (CLAUDE.md
 *     "central-read replacement"), so adding a tenant_id now would be throwaway.
 *     They remain single-tenant (Halls Head) until that refactor.
 *   - SETTINGS singletons (honour_display_settings, match_display_settings,
 *     records_display_settings, trading_card_settings, award_voting_config,
 *     award_points_config, milestone_board_settings, junior_match_display_settings):
 *     these use a fixed id=1 PK, so going per-tenant needs the PK/uniqueness
 *     reworked to (tenant_id) — a schema change beyond a column add. Tracked
 *     separately so tenant 1's singleton is untouched.
 *   - Auth-adjacent (captains, captain_grade_permissions): per-club captain
 *     logins; `username` is globally unique, so multi-tenant needs it keyed by
 *     tenant — handled with the auth model in a follow-up.
 *   - Remaining curated content not yet wired (social_settings + the other
 *     social/card tables, the historical/honour singletons), plus the social/card
 *     and junior child tables
 *     (card_audio_tracks, card_templates, card_sets, card_layouts,
 *     caption_templates, tracked_links, social_drafts, milestone_events,
 *     card_effect_presets, junior_match_batting/bowling/rosters,
 *     junior_premiership_players): isolated transitively via their tenant-scoped
 *     parent; direct tenant_id is a mechanical follow-up.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const tenantIdColumn = () =>
  integer("tenant_id")
    .notNull()
    .default(1)
    .references(() => tenantsTable.id);

/** The default tenant (Halls Head) every existing row backfills to. */
export const DEFAULT_TENANT_ID = 1;
