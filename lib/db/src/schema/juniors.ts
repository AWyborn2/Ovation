import { sql } from "drizzle-orm";
import {
  pgTable,
  pgSequence,
  serial,
  integer,
  text,
  boolean,
  real,
  index,
  jsonb,
  timestamp,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { tenantIdColumn } from "./_tenant";
import type { TeamListRole } from "./fixtures";

/**
 * Ids for rows the junior PlayHQ sync creates in the explicit-id junior tables
 * (junior_matches and its line tables). Junior PlayHQ sync plan KTD6: the sync owns
 * seasons from 2026/27, and "sync origin" is `id >= JUNIOR_SYNC_ID_START`. Loader
 * rows sit below 100,000,000 and admin-added lines in 100,000,000-199,999,999.
 */
export const JUNIOR_SYNC_ID_START = 200_000_000;

/** The first season the junior sync owns (2026/27). Earlier seasons belong to the one-off loader. */
export const JUNIOR_SYNC_FIRST_SEASON = 2026;

/** The name shown for a withheld (private) junior, and stored when PlayHQ gives none. */
export const JUNIOR_WITHHELD_NAME = "Private Player";

export const juniorSyncIdSeq = pgSequence("junior_sync_id_seq", {
  startWith: JUNIOR_SYNC_ID_START,
  minValue: JUNIOR_SYNC_ID_START,
});

/**
 * Halls Head JUNIORS data — kept COMPLETELY SEPARATE from the senior tables by
 * club decision. These tables mirror the self-contained juniors PostgreSQL
 * export (see scripts/src/load-juniors-db.ts + scripts/sql/juniors-etl.sql) and
 * are read-only display data: bulk-loaded with the export's explicit integer
 * IDs, never written by the app. Junior and senior stats/games NEVER combine;
 * the only cross-link is juniorParticipantsTable.seniorPlayerId, which is for
 * profile cross-reference ONLY and never merges any figures.
 *
 * Players are keyed by the PlayHQ participant_id (TEXT). Opposition batting /
 * bowling / roster lines also carry a participant_id but those are NOT Halls
 * Head participants, so participant_id is intentionally NOT a foreign key.
 */
export const juniorMatchesTable = pgTable(
  "junior_matches",
  {
    id: integer("id").primaryKey(),
    tenantId: tenantIdColumn(),
    playhqMatchId: text("playhq_match_id"),
    season: text("season"),
    seasonStartYear: integer("season_start_year"),
    grade: text("grade"),
    // age_group is the app's age-group GROUPING token. By club decision it now
    // holds the unified school-year BAND (Year 4 … Year 10-11) — the dump's
    // age_band, which merges the legacy Under-age naming (U10→Year 4, … U14→Year 8,
    // U15→Year 9, U16 + U17 → Year 10-11). The original raw label is kept in
    // age_group_raw for traceability. Loaded by scripts/sql/juniors-etl.sql.
    ageGroup: text("age_group"),
    ageGroupRaw: text("age_group_raw"),
    teamName: text("team_name"),
    competition: text("competition"),
    // PlayHQ governing-competition classification (Peel Junior Cricket Association,
    // Community Cup, Girls League, South West Junior (SWMJCC)).
    association: text("association"),
    round: text("round"),
    matchDate: text("match_date"),
    venue: text("venue"),
    venueOval: text("venue_oval"),
    venueAddress: text("venue_address"),
    venueSuburb: text("venue_suburb"),
    status: text("status"),
    team1: text("team1"),
    team1Score: text("team1_score"),
    team2: text("team2"),
    team2Score: text("team2_score"),
    hhTeamId: text("hh_team_id"),
    hhResult: text("hh_result"),
    winner: text("winner"),
    tossWinner: text("toss_winner"),
    hhBattedFirst: boolean("hh_batted_first"),
    opponentName: text("opponent_name"),
    // Optional link to the shared clubs register so junior scorecards/cards can
    // render opposition club crests + colours, mirroring senior matches. Populated
    // by a conservative normalized-name match in juniors-etl.sql; most metro junior
    // opponents are not in the (Peel-focused) clubs table, so this stays NULL for
    // them and renderers fall back gracefully. clubs is a neutral shared reference
    // table (not a senior stat table), so this does not blend junior + senior data.
    opponentClubId: integer("opponent_club_id").references(() => clubsTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    idxTenant: index("junior_matches_tenant_idx").on(t.tenantId),
    // One junior match per PlayHQ match per tenant: the junior projection's upsert
    // key (junior PlayHQ sync plan U2). Migration 0040 builds it only when existing
    // rows have no duplicates, so it can never fail half-way.
    uqTenantPlayhqMatch: uniqueIndex("junior_matches_tenant_playhq_match_uidx")
      .on(t.tenantId, t.playhqMatchId)
      .where(sql`"playhq_match_id" IS NOT NULL`),
  }),
);

export type JuniorMatchRow = typeof juniorMatchesTable.$inferSelect;

export const juniorMatchBattingTable = pgTable(
  "junior_match_batting",
  {
    id: integer("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => juniorMatchesTable.id, { onDelete: "cascade" }),
    innings: integer("innings"),
    battingTeam: text("batting_team"),
    isHallsHead: boolean("is_halls_head").notNull().default(false),
    batOrder: integer("bat_order"),
    participantId: text("participant_id"),
    playerName: text("player_name"),
    runs: integer("runs"),
    balls: integer("balls"),
    fours: integer("fours"),
    sixes: integer("sixes"),
    strikeRate: real("strike_rate"),
    dismissal: text("dismissal"),
  },
  (t) => ({
    idxMatch: index("junior_match_batting_match_idx").on(t.matchId),
  }),
);

export type JuniorMatchBattingRow = typeof juniorMatchBattingTable.$inferSelect;

export const juniorMatchBowlingTable = pgTable(
  "junior_match_bowling",
  {
    id: integer("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => juniorMatchesTable.id, { onDelete: "cascade" }),
    innings: integer("innings"),
    bowlingTeam: text("bowling_team"),
    isHallsHead: boolean("is_halls_head").notNull().default(false),
    participantId: text("participant_id"),
    playerName: text("player_name"),
    overs: real("overs"),
    maidens: integer("maidens"),
    runs: integer("runs"),
    wickets: integer("wickets"),
    economy: real("economy"),
    wides: integer("wides"),
    noBalls: integer("no_balls"),
  },
  (t) => ({
    idxMatch: index("junior_match_bowling_match_idx").on(t.matchId),
  }),
);

export type JuniorMatchBowlingRow = typeof juniorMatchBowlingTable.$inferSelect;

export const juniorMatchRostersTable = pgTable(
  "junior_match_rosters",
  {
    id: integer("id").primaryKey(),
    matchId: integer("match_id")
      .notNull()
      .references(() => juniorMatchesTable.id, { onDelete: "cascade" }),
    teamName: text("team_name"),
    isHallsHead: boolean("is_halls_head").notNull().default(false),
    participantId: text("participant_id"),
    playerName: text("player_name"),
  },
  (t) => ({
    idxMatch: index("junior_match_rosters_match_idx").on(t.matchId),
  }),
);

export type JuniorMatchRosterRow = typeof juniorMatchRostersTable.$inferSelect;

/**
 * One row per junior player per club, keyed by (tenant_id, PlayHQ participant_id)
 * so a child registered at two clubs is two independent rows (junior PlayHQ sync
 * plan KTD8; migration 0040 replaced the global participant_id key). `isPrivate` marks
 * the handful of participants the club wants hidden everywhere — the API masks
 * their scorecard lines and omits them from every directory / leaderboard.
 * `seniorPlayerId` is an OPTIONAL cross-reference to a senior player record for
 * profile linking only; it NEVER combines junior and senior stats. It is a plain
 * nullable integer with NO foreign key to the senior `players` table by club
 * decision — the juniors dataset must stay fully decoupled from senior tables so
 * neither schema constrains the other.
 */
export const juniorParticipantsTable = pgTable(
  "junior_participants",
  {
    participantId: text("participant_id").notNull(),
    tenantId: tenantIdColumn(),
    displayName: text("display_name"),
    isPrivate: boolean("is_private").notNull().default(false),
    // Admin override that shows a private player's name anyway (KTD12). The sync
    // never writes it; privacy only ever tightens automatically (KTD8).
    privacyOverride: boolean("privacy_override").notNull().default(false),
    privacyOverrideBy: text("privacy_override_by"),
    privacyOverrideAt: timestamp("privacy_override_at", { withTimezone: true }),
    // Photo consent (junior card photos plan, ADR-007): the club's registration form
    // carries consent, so a photo is allowed unless an admin withholds it here. Written
    // only by the admin PATCH, never by the sync. Who and when, like the override.
    photoWithheld: boolean("photo_withheld").notNull().default(false),
    photoWithheldBy: text("photo_withheld_by"),
    photoWithheldAt: timestamp("photo_withheld_at", { withTimezone: true }),
    scorecardLines: integer("scorecard_lines"),
    rosterAppearances: integer("roster_appearances"),
    firstSeason: text("first_season"),
    lastSeason: text("last_season"),
    teams: text("teams"),
    seniorPlayerId: integer("senior_player_id"),
  },
  (t) => ({
    pk: primaryKey({
      name: "junior_participants_tenant_participant_pk",
      columns: [t.tenantId, t.participantId],
    }),
    idxTenant: index("junior_participants_tenant_idx").on(t.tenantId),
  }),
);

export type JuniorParticipantRow = typeof juniorParticipantsTable.$inferSelect;

/**
 * A junior player's photos, uploaded by a club admin (junior card photos plan, ADR-007).
 * Keyed by PlayHQ participant id like every junior row — deliberately separate from the
 * senior photo library (`club_photos`, integer player ids, senior-only by design) and the
 * senior headshots (`player_images`). `is_default` marks the one a card or profile uses.
 * Objects live under the private `library/juniors/` prefix and are served only through
 * the gated `/juniors/photos/:id` route, which checks the player is still allowed a photo.
 */
export const juniorPhotosTable = pgTable(
  "junior_photos",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    participantId: text("participant_id").notNull(),
    objectPath: text("object_path").notNull(),
    thumbPath: text("thumb_path"),
    width: integer("width"),
    height: integer("height"),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxParticipant: index("junior_photos_tenant_participant_idx").on(t.tenantId, t.participantId),
  }),
);

export type JuniorPhotoRow = typeof juniorPhotosTable.$inferSelect;

export const juniorPremiershipsTable = pgTable(
  "junior_premierships",
  {
    id: integer("id").primaryKey(),
    tenantId: tenantIdColumn(),
    season: text("season"),
    // age_group holds the unified school-year BAND (see juniorMatchesTable.ageGroup);
    // ageGroupRaw keeps the original Under-age / year label for traceability.
    ageGroup: text("age_group"),
    ageGroupRaw: text("age_group_raw"),
    teamName: text("team_name"),
    competition: text("competition"),
    association: text("association"),
    matchDate: text("match_date"),
    venue: text("venue"),
    venueOval: text("venue_oval"),
    opponent: text("opponent"),
    hhScore: text("hh_score"),
    oppScore: text("opp_score"),
    resultText: text("result_text"),
    // Man-of-the-match name. NOT present in the PlayHQ dump — entered manually by
    // admins, so the juniors ETL snapshots + re-applies it across a reload.
    mom: text("mom"),
    matchId: integer("match_id").references(() => juniorMatchesTable.id, {
      onDelete: "set null",
    }),
    playhqMatchId: text("playhq_match_id"),
  },
  (t) => ({
    idxTenant: index("junior_premierships_tenant_idx").on(t.tenantId),
  }),
);

export type JuniorPremiershipRow = typeof juniorPremiershipsTable.$inferSelect;

export const juniorPremiershipPlayersTable = pgTable("junior_premiership_players", {
  id: integer("id").primaryKey(),
  premiershipId: integer("premiership_id")
    .notNull()
    .references(() => juniorPremiershipsTable.id, { onDelete: "cascade" }),
  participantId: text("participant_id"),
  playerName: text("player_name"),
  // Captain flag. NOT present in the PlayHQ dump — set manually by admins, so
  // the juniors ETL snapshots + re-applies it across a reload.
  isCaptain: boolean("is_captain").notNull().default(false),
});

export type JuniorPremiershipPlayerRow = typeof juniorPremiershipPlayersTable.$inferSelect;

/**
 * Halls Head Junior Cricket Club office bearers, entered and managed MANUALLY by
 * admins (there is no junior cap register and no spreadsheet import for this).
 * One row per (season, role) office-bearer entry. Kept COMPLETELY SEPARATE from
 * the senior `club_roles` table — this never mixes with senior records.
 *
 * `season` is the start year of a cricket season (e.g. 2024 → "2024/25"),
 * mirroring how the senior committee admin stores seasons. `participantId` is an
 * OPTIONAL cross-reference to a junior participant (PlayHQ participant_id, TEXT)
 * for profile linking only; like every other junior cross-link it is a plain
 * nullable column with NO foreign key, so the juniors dataset stays decoupled.
 * `published` gates public visibility so admins can prepare a season privately.
 */
export const juniorOfficeBearersTable = pgTable(
  "junior_office_bearers",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    season: integer("season").notNull(),
    role: text("role").notNull(),
    name: text("name").notNull(),
    participantId: text("participant_id"),
    displayOrder: integer("display_order").notNull().default(0),
    published: boolean("published").notNull().default(false),
  },
  (t) => ({
    idxSeason: index("junior_office_bearers_season_idx").on(t.season),
    idxTenant: index("junior_office_bearers_tenant_idx").on(t.tenantId),
  }),
);

export type JuniorOfficeBearerRow = typeof juniorOfficeBearersTable.$inferSelect;

/** Public junior name style (KTD12). */
export type JuniorNameStyle = "full" | "first_initial" | "first";

/** Social publishing mode for one junior team (KTD14). */
export type JuniorTeamPublishMode = "approval" | "auto";

/**
 * Per-team publishing map keyed by age group, then team name:
 * `{ "Year 6": { "Halls Head Hawks": "auto" } }`. A missing age group or team means
 * `approval`; only an explicit `auto` lets a junior draft be auto-posted.
 */
export type JuniorTeamPublishing = Record<string, Record<string, JuniorTeamPublishMode>>;

/**
 * Singleton settings controlling how the public Juniors Matches page behaves by
 * default: which age group + season load first and the order age groups appear
 * in the age-group menu. Mirrors the senior matchDisplaySettingsTable but is
 * age-group based (juniors have no fixed grade list) and intentionally has NO
 * round-order option — junior rounds are messy free text, so there is no
 * reliable within-season round direction to configure. App-config; never touched
 * by the juniors ETL full-replace.
 */
export const juniorMatchDisplaySettingsTable = pgTable(
  "junior_match_display_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // Default age group pre-selected on first load. Empty string = "All age groups".
    defaultAgeGroup: text("default_age_group").notNull().default(""),
    // "latest" (newest available season), "specific" (defaultSeason), or "all".
    defaultSeasonMode: text("default_season_mode").notNull().default("all"),
    // Specific season string (e.g. "2024/25") used when defaultSeasonMode = "specific".
    // Junior seasons are free-text strings, not start-year ints like seniors.
    defaultSeason: text("default_season"),
    // Ordered list of age-group tokens for the menu. Tokens not listed fall back
    // to the natural order, appended after the configured ones.
    ageGroupOrder: text("age_group_order").array().notNull().default([]),
    // How public junior surfaces render a player's name (KTD12): `full`,
    // `first_initial` ("Sam T") or `first` ("Sam"). Admin responses always carry
    // full names; withheld players stay "Private Player" whatever the style.
    nameStyle: text("name_style").$type<JuniorNameStyle>().notNull().default("full"),
    // Per-team social publishing (KTD14), see `JuniorTeamPublishing`. A team absent
    // from the map is `approval`.
    teamPublishing: jsonb("team_publishing").$type<JuniorTeamPublishing>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenant: uniqueIndex("junior_match_display_settings_tenant_unique").on(t.tenantId),
    chkNameStyle: check(
      "junior_match_display_settings_name_style_check",
      sql`"name_style" IN ('full', 'first_initial', 'first')`,
    ),
  }),
);

export type JuniorMatchDisplaySettingsRow = typeof juniorMatchDisplaySettingsTable.$inferSelect;

/**
 * Junior fixtures projected from PlayHQ by the junior sync (junior PlayHQ sync plan
 * KTD9): matches not yet started, plus started or finished matches without a
 * published scorecard, whose `status` the sync keeps current. A scored match also
 * becomes a `junior_matches` row; an unscored one only ever lives here and never
 * reaches match pages or stats (KTD10). Junior-only: nothing here is written to the
 * senior `fixtures` table, and nothing senior is written here.
 *
 * Upsert key `(tenant_id, playhq_match_id)`. `teamName` is the club's own junior
 * team; `opponentName` the other side as PlayHQ names it.
 */
export const juniorFixturesTable = pgTable(
  "junior_fixtures",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    playhqMatchId: text("playhq_match_id").notNull(),
    seasonStartYear: integer("season_start_year").notNull(),
    // Unified school-year band, as on junior_matches.age_group.
    ageGroup: text("age_group"),
    grade: text("grade"),
    teamName: text("team_name"),
    opponentName: text("opponent_name"),
    venue: text("venue"),
    startAt: timestamp("start_at", { withTimezone: true }),
    isHome: boolean("is_home"),
    // PlayHQ match status as last synced (e.g. UPCOMING, IN_PROGRESS, COMPLETED).
    status: text("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("junior_fixtures_tenant_idx").on(t.tenantId),
    idxTenantStart: index("junior_fixtures_tenant_start_idx").on(t.tenantId, t.startAt),
    uqTenantPlayhqMatch: uniqueIndex("junior_fixtures_tenant_playhq_match_uidx").on(
      t.tenantId,
      t.playhqMatchId,
    ),
  }),
);

export type JuniorFixtureRow = typeof juniorFixturesTable.$inferSelect;

/**
 * One entry in a junior team list. Names are never stored: public reads derive them
 * from `junior_participants` through the club's name style (KTD12). `participantId`
 * is the lowercased PlayHQ participant GUID.
 */
export type JuniorTeamListPlayer = {
  order: number;
  participantId: string;
  role?: TeamListRole;
};

/** Who wrote a junior team list (KTD9); `selection` is a side finalised in the Selection Hub. */
export type JuniorTeamListSource = "playhq" | "admin" | "selection";

/**
 * The team list for a junior fixture, one per fixture (KTD9). `source` is `playhq`
 * (the side the club named in PlayHQ, written published by the sync) or `admin`
 * (saved by a club admin, never overwritten by the sync). Deleting the fixture
 * cascades.
 */
export const juniorTeamListsTable = pgTable(
  "junior_team_lists",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    juniorFixtureId: integer("junior_fixture_id")
      .notNull()
      .references(() => juniorFixturesTable.id, { onDelete: "cascade" }),
    players: jsonb("players").$type<JuniorTeamListPlayer[]>().notNull().default([]),
    isPublished: boolean("is_published").notNull().default(false),
    source: text("source").$type<JuniorTeamListSource>().notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantFixture: uniqueIndex("junior_team_lists_tenant_fixture_uidx").on(
      t.tenantId,
      t.juniorFixtureId,
    ),
    chkSource: check(
      "junior_team_lists_source_check",
      sql`"source" IN ('playhq', 'admin', 'selection')`,
    ),
  }),
);

export type JuniorTeamListRow = typeof juniorTeamListsTable.$inferSelect;
