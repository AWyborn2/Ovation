CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"surname" text NOT NULL,
	"given_name" text NOT NULL,
	"grades_played" text,
	"total_games" integer,
	"total_runs" integer,
	"total_wickets" integer,
	"deceased" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"card_role" text,
	"card_rating" integer,
	"is_fill_in" boolean DEFAULT false NOT NULL,
	"is_cap_only" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"player_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_grade_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"surname" text NOT NULL,
	"given_name" text NOT NULL,
	"grade" text NOT NULL,
	"season" integer,
	"games" integer,
	"innings" integer,
	"not_outs" integer,
	"runs" integer,
	"bat_avg" real,
	"high_score" text,
	"fifties" integer,
	"hundreds" integer,
	"wickets" integer,
	"runs_conceded" integer,
	"bowl_avg" real,
	"best_bowling" text,
	"five_wickets" integer,
	"catches" integer,
	"stumpings" integer,
	"run_outs" integer
);
--> statement-breakpoint
CREATE TABLE "grade_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" text NOT NULL,
	"players" integer,
	"games" integer,
	"innings" integer,
	"runs" integer,
	"wickets" integer,
	"catches" integer,
	"stumpings" integer,
	"run_outs" integer,
	CONSTRAINT "grade_summaries_grade_unique" UNIQUE("grade")
);
--> statement-breakpoint
CREATE TABLE "premiership_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"premiership_id" integer NOT NULL,
	"player_id" integer,
	"name" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"is_motm" boolean DEFAULT false NOT NULL,
	"batting_order" integer
);
--> statement-breakpoint
CREATE TABLE "premierships" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"year" integer NOT NULL,
	"grade" text NOT NULL,
	"competition" text NOT NULL,
	"venue" text,
	"match_date" text,
	"result" text,
	"mom" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"grade" text,
	"season" integer,
	"kind" text DEFAULT 'csv' NOT NULL,
	"round" integer,
	"row_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_kind_check" CHECK ("kind" IN ('csv', 'match', 'match-batch'))
);
--> statement-breakpoint
CREATE TABLE "match_hat_tricks" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"source_key" text,
	"grade" text NOT NULL,
	"season" integer NOT NULL,
	"round" integer,
	"stage" text,
	"competition" text,
	"match_date" text,
	"venue" text,
	"result" text,
	"opponent" text,
	"opponent_club_id" integer,
	"hhcc_score" text,
	"opponent_score" text,
	"hhcc_batted_first" boolean,
	"abandoned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_player_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"batted" boolean DEFAULT false NOT NULL,
	"batting_pos" integer,
	"runs" integer,
	"balls" integer,
	"fours" integer,
	"sixes" integer,
	"not_out" boolean DEFAULT false NOT NULL,
	"dismissal" text,
	"bowled" boolean DEFAULT false NOT NULL,
	"overs" text,
	"maidens" integer,
	"runs_conceded" integer,
	"wickets" integer,
	"wides" integer,
	"no_balls" integer,
	"catches" integer DEFAULT 0 NOT NULL,
	"stumpings" integer DEFAULT 0 NOT NULL,
	"run_outs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_opposition_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"name" text NOT NULL,
	"batted" boolean DEFAULT false NOT NULL,
	"batting_pos" integer,
	"runs" integer,
	"balls" integer,
	"fours" integer,
	"sixes" integer,
	"not_out" boolean DEFAULT false NOT NULL,
	"dismissal" text,
	"bowled" boolean DEFAULT false NOT NULL,
	"overs" text,
	"maidens" integer,
	"runs_conceded" integer,
	"wickets" integer,
	"wides" integer,
	"no_balls" integer,
	"catches" integer DEFAULT 0 NOT NULL,
	"stumpings" integer DEFAULT 0 NOT NULL,
	"run_outs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_grade_season_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer,
	"player_id" integer NOT NULL,
	"grade" text NOT NULL,
	"season" integer,
	"games" integer,
	"innings" integer,
	"not_outs" integer,
	"runs" integer,
	"high_score" text,
	"fifties" integer,
	"hundreds" integer,
	"wickets" integer,
	"runs_conceded" integer,
	"best_bowling" text,
	"five_wickets" integer,
	"catches" integer,
	"stumpings" integer,
	"run_outs" integer
);
--> statement-breakpoint
CREATE TABLE "baseline_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" text NOT NULL,
	"season" integer NOT NULL,
	"player_id" integer NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"innings" integer DEFAULT 0 NOT NULL,
	"not_outs" integer DEFAULT 0 NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"fifties" integer DEFAULT 0 NOT NULL,
	"hundreds" integer DEFAULT 0 NOT NULL,
	"wickets" integer DEFAULT 0 NOT NULL,
	"runs_conceded" integer DEFAULT 0 NOT NULL,
	"five_wickets" integer DEFAULT 0 NOT NULL,
	"catches" integer DEFAULT 0 NOT NULL,
	"stumpings" integer DEFAULT 0 NOT NULL,
	"run_outs" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "baseline_adjustments_grade_season_player_id_unique" UNIQUE("grade","season","player_id")
);
--> statement-breakpoint
CREATE TABLE "cap_register" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"cap_number" integer NOT NULL,
	"category" text DEFAULT 'male' NOT NULL,
	"name" text NOT NULL,
	"deceased" boolean DEFAULT false NOT NULL,
	"in_stats" boolean DEFAULT false NOT NULL,
	"games_a_grade" integer DEFAULT 0 NOT NULL,
	"debut_seq" integer,
	"cap_note" text,
	"auto_created" boolean DEFAULT false NOT NULL,
	"player_id" integer,
	CONSTRAINT "cap_register_tenant_category_cap_number_unique" UNIQUE("tenant_id","category","cap_number")
);
--> statement-breakpoint
CREATE TABLE "life_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"induction_year" integer NOT NULL,
	"is_playing_member" boolean DEFAULT true NOT NULL,
	"player_id" integer,
	"role_label" text,
	"blurb" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_tenant_username_unique" UNIQUE("tenant_id","username")
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "admin_password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"admin_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_platform_admin_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honour_board_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"board_key" text NOT NULL,
	"player_id" integer NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honour_boards" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"headline_label" text DEFAULT '' NOT NULL,
	"supporting_label" text DEFAULT '' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "honour_boards_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "award_winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"award_id" integer NOT NULL,
	"season" integer NOT NULL,
	"player_id" integer,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"voting_enabled" boolean DEFAULT false NOT NULL,
	"mechanism" text DEFAULT 'manual' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"points_grade" text,
	CONSTRAINT "awards_key_unique" UNIQUE("key"),
	CONSTRAINT "awards_mechanism_check" CHECK ("mechanism" IN ('voted', 'points', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "captain_grade_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"captain_id" integer NOT NULL,
	"grade" text NOT NULL,
	CONSTRAINT "captain_grade_permissions_captain_grade_unique" UNIQUE("captain_id","grade")
);
--> statement-breakpoint
CREATE TABLE "captains" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "captains_tenant_username_unique" UNIQUE("tenant_id","username")
);
--> statement-breakpoint
CREATE TABLE "award_ballots" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"captain_id" integer NOT NULL,
	"grade" text NOT NULL,
	"round" integer NOT NULL,
	"pick1_player_id" integer NOT NULL,
	"pick2_player_id" integer NOT NULL,
	"pick3_player_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_ballots_config_captain_grade_round_unique" UNIQUE("config_id","captain_id","grade","round")
);
--> statement-breakpoint
CREATE TABLE "award_voting_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"award_id" integer NOT NULL,
	"season" integer NOT NULL,
	"voting_enabled" boolean DEFAULT true NOT NULL,
	"voting_open" boolean DEFAULT true NOT NULL,
	"grades" text[] DEFAULT '{}' NOT NULL,
	"tally_visible" boolean DEFAULT false NOT NULL,
	"auto_hide_after_rounds" integer,
	"finalised_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_voting_config_award_season_unique" UNIQUE("award_id","season")
);
--> statement-breakpoint
CREATE TABLE "award_points_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"award_id" integer NOT NULL,
	"season" integer NOT NULL,
	"include_finals" boolean DEFAULT false NOT NULL,
	"leaderboard_visible" boolean DEFAULT false NOT NULL,
	"runs_enabled" boolean DEFAULT true NOT NULL,
	"runs_value" real DEFAULT 1 NOT NULL,
	"wickets_enabled" boolean DEFAULT true NOT NULL,
	"wickets_value" real DEFAULT 1 NOT NULL,
	"catches_enabled" boolean DEFAULT true NOT NULL,
	"catches_value" real DEFAULT 1 NOT NULL,
	"stumpings_enabled" boolean DEFAULT true NOT NULL,
	"stumpings_value" real DEFAULT 1 NOT NULL,
	"run_outs_enabled" boolean DEFAULT false NOT NULL,
	"run_outs_value" real DEFAULT 1 NOT NULL,
	"games_enabled" boolean DEFAULT false NOT NULL,
	"games_value" real DEFAULT 0 NOT NULL,
	"fifties_enabled" boolean DEFAULT false NOT NULL,
	"fifties_value" real DEFAULT 0 NOT NULL,
	"hundreds_enabled" boolean DEFAULT false NOT NULL,
	"hundreds_value" real DEFAULT 0 NOT NULL,
	"five_wickets_enabled" boolean DEFAULT false NOT NULL,
	"five_wickets_value" real DEFAULT 0 NOT NULL,
	"finalised_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_points_config_award_season_unique" UNIQUE("award_id","season")
);
--> statement-breakpoint
CREATE TABLE "caption_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"engine" text NOT NULL,
	"platform" text NOT NULL,
	"template" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_audio_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"duration_ms" integer,
	"is_curated" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_effect_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"card_kind" text NOT NULL,
	"layers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'Untitled set' NOT NULL,
	"platform_size" text DEFAULT 'square' NOT NULL,
	"slides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"source_kind" text,
	"source_round" integer,
	"season" integer,
	"grade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"card_kinds" text[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'background' NOT NULL,
	"pack_id" text,
	"pack_variant" text,
	"base_kind" text,
	"layers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"background_image_url" text,
	"background_kind" text DEFAULT 'image' NOT NULL,
	"background_duration_ms" integer,
	"motion_preset" text DEFAULT 'none' NOT NULL,
	"bg_width" integer DEFAULT 1080 NOT NULL,
	"bg_height" integer DEFAULT 1080 NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"default_for_kinds" text[] DEFAULT '{}' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"bg_dark" text DEFAULT '#322F3D' NOT NULL,
	"bg_panel" text DEFAULT '#3F3C4C' NOT NULL,
	"accent" text DEFAULT '#FBD039' NOT NULL,
	"text_light" text DEFAULT '#F5F2E8' NOT NULL,
	"display_font" text,
	"background_image_url" text,
	"logo_url" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_board_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"display_mode" text DEFAULT 'recent' NOT NULL,
	"games_threshold" integer DEFAULT 100 NOT NULL,
	"runs_threshold" integer DEFAULT 1000 NOT NULL,
	"wickets_threshold" integer DEFAULT 100 NOT NULL,
	"recency_weeks" integer DEFAULT 4 NOT NULL,
	"games_tiers" integer[] DEFAULT '{100,150,200,250,300}' NOT NULL,
	"runs_tiers" integer[] DEFAULT '{1000,2000,3000,5000,7500,10000}' NOT NULL,
	"wickets_tiers" integer[] DEFAULT '{100,150,200,300}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"player_id" integer NOT NULL,
	"board_key" text NOT NULL,
	"tier_index" integer NOT NULL,
	"tier_label" text NOT NULL,
	"value" integer NOT NULL,
	"threshold" integer NOT NULL,
	"source" text NOT NULL,
	"source_import_id" integer,
	"payload" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"posted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"engine" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"card_input" jsonb NOT NULL,
	"app_path" text DEFAULT '' NOT NULL,
	"tracked_slug" text,
	"milestone_event_id" integer,
	"source_import_id" integer,
	"source_kind" text,
	"source_match_id" integer,
	"source_match_is_junior" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "social_drafts_status_check" CHECK ("status" IN ('pending', 'approved', 'dismissed', 'posted'))
);
--> statement-breakpoint
CREATE TABLE "social_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"engine_on_demand" boolean DEFAULT true NOT NULL,
	"engine_milestone" boolean DEFAULT false NOT NULL,
	"engine_round_up" boolean DEFAULT false NOT NULL,
	"engine_recap" boolean DEFAULT false NOT NULL,
	"engine_match_summary" boolean DEFAULT true NOT NULL,
	"match_summary_grade_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"autoseed_carousels" boolean DEFAULT false NOT NULL,
	"size_square" boolean DEFAULT true NOT NULL,
	"size_portrait" boolean DEFAULT true NOT NULL,
	"size_story" boolean DEFAULT true NOT NULL,
	"sponsors_enabled" boolean DEFAULT true NOT NULL,
	"captions_enabled" boolean DEFAULT true NOT NULL,
	"club_hashtag" text DEFAULT '' NOT NULL,
	"club_url" text DEFAULT '' NOT NULL,
	"season_start_date" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"logo_url" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"active_from" date,
	"active_to" date,
	"card_kinds" text[] DEFAULT '{}' NOT NULL,
	"is_presenting" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"slug" text NOT NULL,
	"target_url" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"engine" text DEFAULT 'ondemand' NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade" text NOT NULL,
	"round_label" text,
	"opponent_name" text NOT NULL,
	"opponent_club_id" integer,
	"opponent_logo_url" text,
	"venue" text,
	"start_at" timestamp with time zone NOT NULL,
	"is_home" boolean DEFAULT true NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"fixture_id" integer NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_display_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"default_grade" text DEFAULT '' NOT NULL,
	"default_season_mode" text DEFAULT 'all' NOT NULL,
	"default_season" integer,
	"grade_order" text[] DEFAULT '{}' NOT NULL,
	"round_order" text DEFAULT 'desc' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tour_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"welcome_title" text DEFAULT '' NOT NULL,
	"welcome_body" text DEFAULT '' NOT NULL,
	"fan_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"admin_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records_display_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"default_tab" text DEFAULT 'total' NOT NULL,
	"by_grade_default_grade" text DEFAULT '' NOT NULL,
	"partnerships_default_grade" text DEFAULT '' NOT NULL,
	"centuries_sort" text DEFAULT 'season-desc' NOT NULL,
	"five_for_sort" text DEFAULT 'season-desc' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "honour_display_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"default_template" text DEFAULT 'p1' NOT NULL,
	"kiosk_sequence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kiosk_dwell_ms" integer DEFAULT 3500 NOT NULL,
	"kiosk_scroll_speed" integer DEFAULT 36 NOT NULL,
	"kiosk_end_hold_ms" integer DEFAULT 3000 NOT NULL,
	"kiosk_sponsor_strip" boolean DEFAULT false NOT NULL,
	"kiosk_sponsor_slides" boolean DEFAULT false NOT NULL,
	"kiosk_sponsor_slide_every" integer DEFAULT 3 NOT NULL,
	"kiosk_sponsor_slide_style" text DEFAULT 'grid' NOT NULL,
	"kiosk_sponsor_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kiosk_ads" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kiosk_token" text,
	"board_configs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"composites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_grids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colour_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_font" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_card_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"stat_keys" text[] DEFAULT '{}' NOT NULL,
	"stat_keys_by_role" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"award_keys" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nav_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"surface" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon_key" text DEFAULT '' NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nav_items_surface_check" CHECK ("surface" IN ('senior_menu', 'junior_menu', 'junior_quick_links', 'admin_tiles'))
);
--> statement-breakpoint
CREATE TABLE "team_of_decade_boards" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"team_label" text DEFAULT '' NOT NULL,
	"period_label" text DEFAULT '' NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "team_of_decade_boards_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "team_of_decade_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"board_id" integer NOT NULL,
	"player_id" integer,
	"name" text NOT NULL,
	"batting_order" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"is_vice_captain" boolean DEFAULT false NOT NULL,
	"is_wicketkeeper" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "non_player_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"bio" text
);
--> statement-breakpoint
CREATE TABLE "club_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"season" integer NOT NULL,
	"role" text NOT NULL,
	"grade" text,
	"player_id" integer,
	"non_player_id" integer,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	CONSTRAINT "club_roles_season_role_grade_unique" UNIQUE NULLS NOT DISTINCT("season","role","grade")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"playhq_org_id" text,
	"name" text NOT NULL,
	"slug" text,
	"type" text,
	"role" text,
	"playhq_org_page" text,
	"logo_url" text,
	"logo_url_128" text,
	"background_colour" text,
	"primary_colour" text,
	"juniors_colour" text,
	"quaternary_colour" text,
	"tertiary_approx" boolean DEFAULT false NOT NULL,
	"short_name" text
);
--> statement-breakpoint
CREATE TABLE "partnership_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade" text NOT NULL,
	"wicket" text NOT NULL,
	"runs" integer NOT NULL,
	"batsmen" text NOT NULL,
	"opposition" text,
	"season" text
);
--> statement-breakpoint
CREATE TABLE "partnerships_50plus" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"grade" text NOT NULL,
	"wicket" text NOT NULL,
	"runs" integer NOT NULL,
	"batsmen" text NOT NULL,
	"opposition" text,
	"season" text,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "centuries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"player_id" integer,
	"grade" text NOT NULL,
	"batsman" text NOT NULL,
	"score" text,
	"season" text
);
--> statement-breakpoint
CREATE TABLE "club_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"record_type" text NOT NULL,
	"grade" text,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "five_wicket_hauls" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"player_id" integer,
	"grade" text NOT NULL,
	"bowler" text NOT NULL,
	"figures" text,
	"season" text
);
--> statement-breakpoint
CREATE TABLE "honour_board_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"category" text NOT NULL,
	"rank" integer,
	"name" text,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "junior_match_batting" (
	"id" integer PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"innings" integer,
	"batting_team" text,
	"is_halls_head" boolean DEFAULT false NOT NULL,
	"bat_order" integer,
	"participant_id" text,
	"player_name" text,
	"runs" integer,
	"balls" integer,
	"fours" integer,
	"sixes" integer,
	"strike_rate" real,
	"dismissal" text
);
--> statement-breakpoint
CREATE TABLE "junior_match_bowling" (
	"id" integer PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"innings" integer,
	"bowling_team" text,
	"is_halls_head" boolean DEFAULT false NOT NULL,
	"participant_id" text,
	"player_name" text,
	"overs" real,
	"maidens" integer,
	"runs" integer,
	"wickets" integer,
	"economy" real,
	"wides" integer,
	"no_balls" integer
);
--> statement-breakpoint
CREATE TABLE "junior_match_display_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"default_age_group" text DEFAULT '' NOT NULL,
	"default_season_mode" text DEFAULT 'all' NOT NULL,
	"default_season" text,
	"age_group_order" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "junior_match_rosters" (
	"id" integer PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"team_name" text,
	"is_halls_head" boolean DEFAULT false NOT NULL,
	"participant_id" text,
	"player_name" text
);
--> statement-breakpoint
CREATE TABLE "junior_matches" (
	"id" integer PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"playhq_match_id" text,
	"season" text,
	"season_start_year" integer,
	"grade" text,
	"age_group" text,
	"age_group_raw" text,
	"team_name" text,
	"competition" text,
	"association" text,
	"round" text,
	"match_date" text,
	"venue" text,
	"venue_oval" text,
	"venue_address" text,
	"venue_suburb" text,
	"status" text,
	"team1" text,
	"team1_score" text,
	"team2" text,
	"team2_score" text,
	"hh_team_id" text,
	"hh_result" text,
	"winner" text,
	"toss_winner" text,
	"hh_batted_first" boolean,
	"opponent_name" text,
	"opponent_club_id" integer
);
--> statement-breakpoint
CREATE TABLE "junior_office_bearers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"season" integer NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"participant_id" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "junior_participants" (
	"participant_id" text PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"display_name" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"scorecard_lines" integer,
	"roster_appearances" integer,
	"first_season" text,
	"last_season" text,
	"teams" text,
	"senior_player_id" integer
);
--> statement-breakpoint
CREATE TABLE "junior_premiership_players" (
	"id" integer PRIMARY KEY NOT NULL,
	"premiership_id" integer NOT NULL,
	"participant_id" text,
	"player_name" text,
	"is_captain" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "junior_premierships" (
	"id" integer PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"season" text,
	"age_group" text,
	"age_group_raw" text,
	"team_name" text,
	"competition" text,
	"association" text,
	"match_date" text,
	"venue" text,
	"venue_oval" text,
	"opponent" text,
	"hh_score" text,
	"opp_score" text,
	"result_text" text,
	"mom" text,
	"match_id" integer,
	"playhq_match_id" text
);
--> statement-breakpoint
CREATE TABLE "junior_stat_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"target_table" text NOT NULL,
	"target_id" text NOT NULL,
	"op" text NOT NULL,
	"patch" jsonb,
	"prev_values" jsonb,
	"match_id" integer,
	"playhq_match_id" text,
	"participant_id" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "junior_participant_merges" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"duplicate_participant_id" text NOT NULL,
	"keeper_participant_id" text NOT NULL,
	"duplicate_row" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"central_club_id" integer NOT NULL,
	"app_club_id" integer,
	"reads_from_central" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"logo_url" text,
	"favicon_url" text,
	"background_url" text,
	"background_colour" text,
	"primary_colour" text,
	"juniors_colour" text,
	"tagline" text,
	"use_navy_base" boolean DEFAULT false NOT NULL,
	"theme_overrides" jsonb,
	"custom_domain" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"badge_style" text,
	"last_active_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_plan_check" CHECK ("plan" IN ('free', 'club', 'pro', 'pilot'))
);
--> statement-breakpoint
CREATE TABLE "player_id_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"participant_id" text NOT NULL,
	"player_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_curation" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 1 NOT NULL,
	"participant_id" text NOT NULL,
	"override_display_name" text,
	"merged_into_participant_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"logo_url" text,
	"accent_colour" text,
	"favicon_url" text
);
--> statement-breakpoint
CREATE TABLE "provisioning_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"central_club_id" integer NOT NULL,
	"club_name" text NOT NULL,
	"visibility" text NOT NULL,
	"reason" text,
	"created_by_platform_admin_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provisioning_exclusions_central_club_id_unique" UNIQUE("central_club_id")
);
--> statement-breakpoint
ALTER TABLE "player_images" ADD CONSTRAINT "player_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_images" ADD CONSTRAINT "player_images_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_grade_stats" ADD CONSTRAINT "player_grade_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premiership_players" ADD CONSTRAINT "premiership_players_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premiership_players" ADD CONSTRAINT "premiership_players_premiership_id_premierships_id_fk" FOREIGN KEY ("premiership_id") REFERENCES "public"."premierships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premiership_players" ADD CONSTRAINT "premiership_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premierships" ADD CONSTRAINT "premierships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_hat_tricks" ADD CONSTRAINT "match_hat_tricks_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_hat_tricks" ADD CONSTRAINT "match_hat_tricks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_club_id_clubs_id_fk" FOREIGN KEY ("opponent_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_lines" ADD CONSTRAINT "match_player_lines_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player_lines" ADD CONSTRAINT "match_player_lines_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_opposition_lines" ADD CONSTRAINT "match_opposition_lines_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_grade_season_stats" ADD CONSTRAINT "player_grade_season_stats_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_grade_season_stats" ADD CONSTRAINT "player_grade_season_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_adjustments" ADD CONSTRAINT "baseline_adjustments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_register" ADD CONSTRAINT "cap_register_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_register" ADD CONSTRAINT "cap_register_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_members" ADD CONSTRAINT "life_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_members" ADD CONSTRAINT "life_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_resets" ADD CONSTRAINT "admin_password_resets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honour_board_overrides" ADD CONSTRAINT "honour_board_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honour_board_overrides" ADD CONSTRAINT "honour_board_overrides_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honour_boards" ADD CONSTRAINT "honour_boards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_winners" ADD CONSTRAINT "award_winners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_winners" ADD CONSTRAINT "award_winners_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_winners" ADD CONSTRAINT "award_winners_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captain_grade_permissions" ADD CONSTRAINT "captain_grade_permissions_captain_id_captains_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."captains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captains" ADD CONSTRAINT "captains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_ballots" ADD CONSTRAINT "award_ballots_config_id_award_voting_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."award_voting_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_ballots" ADD CONSTRAINT "award_ballots_captain_id_captains_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."captains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_ballots" ADD CONSTRAINT "award_ballots_pick1_player_id_players_id_fk" FOREIGN KEY ("pick1_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_ballots" ADD CONSTRAINT "award_ballots_pick2_player_id_players_id_fk" FOREIGN KEY ("pick2_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_ballots" ADD CONSTRAINT "award_ballots_pick3_player_id_players_id_fk" FOREIGN KEY ("pick3_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_voting_config" ADD CONSTRAINT "award_voting_config_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_points_config" ADD CONSTRAINT "award_points_config_award_id_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."awards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_templates" ADD CONSTRAINT "caption_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_audio_tracks" ADD CONSTRAINT "card_audio_tracks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_effect_presets" ADD CONSTRAINT "card_effect_presets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_layouts" ADD CONSTRAINT "card_layouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_sets" ADD CONSTRAINT "card_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_themes" ADD CONSTRAINT "card_themes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_board_settings" ADD CONSTRAINT "milestone_board_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_events" ADD CONSTRAINT "milestone_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_settings" ADD CONSTRAINT "social_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_lists" ADD CONSTRAINT "team_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_lists" ADD CONSTRAINT "team_lists_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_display_settings" ADD CONSTRAINT "match_display_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_content" ADD CONSTRAINT "tour_content_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records_display_settings" ADD CONSTRAINT "records_display_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honour_display_settings" ADD CONSTRAINT "honour_display_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_card_settings" ADD CONSTRAINT "trading_card_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_of_decade_boards" ADD CONSTRAINT "team_of_decade_boards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_of_decade_members" ADD CONSTRAINT "team_of_decade_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_of_decade_members" ADD CONSTRAINT "team_of_decade_members_board_id_team_of_decade_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."team_of_decade_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_of_decade_members" ADD CONSTRAINT "team_of_decade_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_player_people" ADD CONSTRAINT "non_player_people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_non_player_id_non_player_people_id_fk" FOREIGN KEY ("non_player_id") REFERENCES "public"."non_player_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnership_records" ADD CONSTRAINT "partnership_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships_50plus" ADD CONSTRAINT "partnerships_50plus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centuries" ADD CONSTRAINT "centuries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centuries" ADD CONSTRAINT "centuries_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_records" ADD CONSTRAINT "club_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_wicket_hauls" ADD CONSTRAINT "five_wicket_hauls_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "five_wicket_hauls" ADD CONSTRAINT "five_wicket_hauls_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "honour_board_records" ADD CONSTRAINT "honour_board_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_match_batting" ADD CONSTRAINT "junior_match_batting_match_id_junior_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."junior_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_match_bowling" ADD CONSTRAINT "junior_match_bowling_match_id_junior_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."junior_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_match_display_settings" ADD CONSTRAINT "junior_match_display_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_match_rosters" ADD CONSTRAINT "junior_match_rosters_match_id_junior_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."junior_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_matches" ADD CONSTRAINT "junior_matches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_matches" ADD CONSTRAINT "junior_matches_opponent_club_id_clubs_id_fk" FOREIGN KEY ("opponent_club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_office_bearers" ADD CONSTRAINT "junior_office_bearers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_participants" ADD CONSTRAINT "junior_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_premiership_players" ADD CONSTRAINT "junior_premiership_players_premiership_id_junior_premierships_id_fk" FOREIGN KEY ("premiership_id") REFERENCES "public"."junior_premierships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_premierships" ADD CONSTRAINT "junior_premierships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_premierships" ADD CONSTRAINT "junior_premierships_match_id_junior_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."junior_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_stat_corrections" ADD CONSTRAINT "junior_stat_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "junior_participant_merges" ADD CONSTRAINT "junior_participant_merges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_id_map" ADD CONSTRAINT "player_id_map_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_curation" ADD CONSTRAINT "player_curation_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_images_tenant_idx" ON "player_images" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "player_images_player_idx" ON "player_images" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_grade_stats_player_idx" ON "player_grade_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_grade_stats_grade_idx" ON "player_grade_stats" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "premiership_players_tenant_idx" ON "premiership_players" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "premiership_players_premiership_idx" ON "premiership_players" USING btree ("premiership_id");--> statement-breakpoint
CREATE INDEX "premierships_tenant_idx" ON "premierships" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_source_key_uidx" ON "matches" USING btree ("source_key") WHERE "source_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "matches_grade_season_idx" ON "matches" USING btree ("grade","season");--> statement-breakpoint
CREATE INDEX "matches_match_date_idx" ON "matches" USING btree ("match_date");--> statement-breakpoint
CREATE INDEX "match_player_lines_match_idx" ON "match_player_lines" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "match_player_lines_player_idx" ON "match_player_lines" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "pgss_player_idx" ON "player_grade_season_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "pgss_grade_season_idx" ON "player_grade_season_stats" USING btree ("grade","season");--> statement-breakpoint
CREATE INDEX "cap_register_tenant_idx" ON "cap_register" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cap_register_player_idx" ON "cap_register" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "life_members_tenant_idx" ON "life_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "admins_tenant_idx" ON "admins" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "admin_password_resets_token_hash_idx" ON "admin_password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_password_resets_admin_idx" ON "admin_password_resets" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_password_resets_tenant_idx" ON "admin_password_resets" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hbo_board_player_unique" ON "honour_board_overrides" USING btree ("board_key","player_id");--> statement-breakpoint
CREATE INDEX "hbo_board_idx" ON "honour_board_overrides" USING btree ("board_key");--> statement-breakpoint
CREATE INDEX "honour_board_overrides_tenant_idx" ON "honour_board_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "honour_boards_tenant_idx" ON "honour_boards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "award_winners_award_idx" ON "award_winners" USING btree ("award_id");--> statement-breakpoint
CREATE INDEX "award_winners_tenant_idx" ON "award_winners" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "awards_tenant_idx" ON "awards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "captains_tenant_idx" ON "captains" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "caption_templates_tenant_engine_platform_unique" ON "caption_templates" USING btree ("tenant_id","engine","platform");--> statement-breakpoint
CREATE INDEX "card_audio_tracks_tenant_idx" ON "card_audio_tracks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "card_effect_presets_tenant_idx" ON "card_effect_presets" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_layouts_tenant_card_kind_unique" ON "card_layouts" USING btree ("tenant_id","card_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "card_sets_source_dedupe" ON "card_sets" USING btree ("tenant_id","source_kind",coalesce("season", -1),coalesce("source_round", -1),coalesce("grade", '')) WHERE source_kind is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "card_templates_pack_unique" ON "card_templates" USING btree ("tenant_id","source","pack_id","pack_variant") WHERE source = 'pack';--> statement-breakpoint
CREATE INDEX "card_themes_tenant_idx" ON "card_themes" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_board_settings_tenant_unique" ON "milestone_board_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "milestone_events_tenant_idx" ON "milestone_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_drafts_match_dedupe" ON "social_drafts" USING btree ("tenant_id","source_kind","source_match_id","source_match_is_junior") WHERE source_kind = 'matchSummary' AND status != 'dismissed';--> statement-breakpoint
CREATE UNIQUE INDEX "social_settings_tenant_unique" ON "social_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_one_presenting_per_tenant" ON "sponsors" USING btree ("tenant_id") WHERE is_presenting;--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_tenant_slug_unique" ON "tracked_links" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "fixtures_tenant_idx" ON "fixtures" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_lists_tenant_fixture_unique" ON "team_lists" USING btree ("tenant_id","fixture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_display_settings_tenant_unique" ON "match_display_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tour_content_tenant_unique" ON "tour_content" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "records_display_settings_tenant_unique" ON "records_display_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "honour_display_settings_tenant_unique" ON "honour_display_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "honour_display_settings_kiosk_token_unique" ON "honour_display_settings" USING btree ("kiosk_token");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_card_settings_tenant_unique" ON "trading_card_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "nav_items_surface_idx" ON "nav_items" USING btree ("surface");--> statement-breakpoint
CREATE INDEX "nav_items_tenant_idx" ON "nav_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "team_of_decade_boards_tenant_idx" ON "team_of_decade_boards" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tod_members_board_idx" ON "team_of_decade_members" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "team_of_decade_members_tenant_idx" ON "team_of_decade_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "non_player_people_tenant_idx" ON "non_player_people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "club_roles_season_idx" ON "club_roles" USING btree ("season");--> statement-breakpoint
CREATE INDEX "club_roles_grade_idx" ON "club_roles" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "club_roles_tenant_idx" ON "club_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "partnership_records_tenant_idx" ON "partnership_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "partnerships_50plus_tenant_idx" ON "partnerships_50plus" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "centuries_tenant_idx" ON "centuries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "club_records_tenant_idx" ON "club_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "five_wicket_hauls_tenant_idx" ON "five_wicket_hauls" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "honour_board_records_tenant_idx" ON "honour_board_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_match_batting_match_idx" ON "junior_match_batting" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "junior_match_bowling_match_idx" ON "junior_match_bowling" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "junior_match_display_settings_tenant_unique" ON "junior_match_display_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_match_rosters_match_idx" ON "junior_match_rosters" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "junior_matches_tenant_idx" ON "junior_matches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_office_bearers_season_idx" ON "junior_office_bearers" USING btree ("season");--> statement-breakpoint
CREATE INDEX "junior_office_bearers_tenant_idx" ON "junior_office_bearers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_participants_tenant_idx" ON "junior_participants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_premierships_tenant_idx" ON "junior_premierships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_stat_corrections_tenant_idx" ON "junior_stat_corrections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_stat_corrections_target_idx" ON "junior_stat_corrections" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "junior_participant_merges_tenant_duplicate_uq" ON "junior_participant_merges" USING btree ("tenant_id","duplicate_participant_id");--> statement-breakpoint
CREATE INDEX "junior_participant_merges_tenant_idx" ON "junior_participant_merges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "junior_participant_merges_keeper_idx" ON "junior_participant_merges" USING btree ("keeper_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_central_club_id_uidx" ON "tenants" USING btree ("central_club_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_custom_domain_uidx" ON "tenants" USING btree ("custom_domain") WHERE "custom_domain" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "player_id_map_tenant_participant_uq" ON "player_id_map" USING btree ("tenant_id","participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_id_map_tenant_player_uq" ON "player_id_map" USING btree ("tenant_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_curation_tenant_participant_uq" ON "player_curation" USING btree ("tenant_id","participant_id");