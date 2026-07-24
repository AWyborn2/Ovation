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
 * per-club stats core). Excluded (stay global): `admins` (app auth, its own
 * `(tenant_id, username)` unique — see admins.ts), `clubs` (shared register),
 * `tenants` itself, and the central/generated tables.
 *
 * APPLIED (curated content, Phase 0 step 6):
 *   honour_boards, honour_board_overrides, life_members, awards, award_winners,
 *   team_of_decade_boards, team_of_decade_members, premierships,
 *   premiership_players, cap_register, club_roles, non_player_people,
 *   partnership_records, partnerships_50plus, centuries, club_records,
 *   five_wicket_hauls, honour_board_records, tour_content, nav_items,
 *   player_images, sponsors, card_themes, junior_participants, junior_matches,
 *   junior_premierships, junior_office_bearers.
 *
 * APPLIED (Phase 3 — isolation gaps):
 *   - Auth: captains (mirrors admins.ts: `(tenant_id, username)` unique;
 *     `resolveCaptain` rejects a cross-tenant session like `resolveAdmin`).
 *   - Enforcement gaps closed on already-scoped tables: sponsors PATCH/DELETE
 *     and every card_themes route now filter by tenant_id (the column existed
 *     but no route ever checked it — the READ ME here for the next such gap).
 *   - Settings singletons reworked from a fixed id=1 PK to one row per tenant
 *     (unique on tenant_id; created on first access via
 *     `artifacts/api-server/src/lib/settings.ts`'s `getOrCreateSettings`,
 *     seeded with schema defaults — never copied from another tenant):
 *     social_settings (clubHashtag/clubUrl defaults changed from Halls Head's
 *     own values to ""), milestone_board_settings, trading_card_settings,
 *     records_display_settings, junior_match_display_settings.
 *   - Content-library tables (previously one shared library for every
 *     tenant): card_audio_tracks (curated/isCurated rows stay a shared
 *     platform-wide library across tenants by design — see the GET route's
 *     comment; only a tenant's own uploads are tenant-scoped),
 *     card_templates, card_layouts (unique now `(tenant_id, card_kind)`),
 *     card_effect_presets, card_sets, caption_templates (unique now
 *     `(tenant_id, engine, platform)`), milestone_events, social_drafts,
 *     tracked_links (unique now `(tenant_id, slug)` — a slug may repeat
 *     across tenants; `/go/:slug` resolves the tenant from the request host
 *     via `tenantContext`, now applied to that router in app.ts).
 *
 * APPLIED (Pack A social templates — fixtures store):
 *   fixtures, team_lists (unique `(tenant_id, fixture_id)` — one XI per
 *   fixture). Admin-entered upcoming fixtures + ordered XIs feeding the
 *   fixture-driven social cards; directly tenant-scoped from day one (reads
 *   filter, writes set from request context).
 *
 * STILL STAGED (follow-up, with rationale — column NOT added / not enforced):
 *   - Per-club STATS core (players, player_grade_stats, player_grade_season_stats,
 *     grade_summaries, matches, match_player_lines, match_opposition_lines,
 *     match_hat_tricks, imports, baseline_adjustments): these are slated to be
 *     REPLACED by central-DB reads filtered by the tenant's club_id (CLAUDE.md
 *     "central-read replacement"), so adding a tenant_id now would be throwaway.
 *     They remain single-tenant (Halls Head) until that refactor.
 *   - honour_display_settings, match_display_settings: these DO have a
 *     tenant_id column (added for forward-compatibility, defaults every
 *     existing row to tenant 1) but their ROUTES (honour-display.ts,
 *     matches.ts) still resolve the singleton by a fixed id / DEFAULT_TENANT_ID
 *     — both are deeply entangled with the still-single-tenant matches /
 *     honour-board-assembly pipeline above, so tenant-scoping just the
 *     settings row without the data it configures would be a hollow, illusory
 *     "works but shows Halls Head's boards regardless" state. Needs its own
 *     follow-up once (or alongside) the stats-core central-read refactor.
 *   - award_voting_config, award_points_config: NOT singletons — keyed per
 *     `(award_id, season)`, and `award_id` FKs into the already tenant-scoped
 *     `awards` table, so they're isolated transitively already; no column
 *     needed.
 *   - Junior child tables (junior_match_batting/bowling/rosters,
 *     junior_premiership_players): isolated transitively via their
 *     tenant-scoped parent (junior_matches / junior_premierships).
 *
 * APPLIED (junior stat corrections):
 *   junior_stat_corrections — app-owned journal of admin edits to the
 *   read-only junior dump data; the juniors ETL re-applies it after its full
 *   replace but never deletes it. Directly tenant-scoped (reads filter,
 *   writes set from request context).
 *   junior_participant_merges — app-owned map of merged duplicate junior
 *   profiles (duplicate GUID → keeper GUID, flat, permanent); the ETL
 *   re-applies it after its full replace (step 7) but never deletes it.
 *   Directly tenant-scoped like the corrections journal.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const tenantIdColumn = () =>
  integer("tenant_id")
    .notNull()
    .default(1)
    .references(() => tenantsTable.id);

/** The default tenant (Halls Head) every existing row backfills to. */
export const DEFAULT_TENANT_ID = 1;
