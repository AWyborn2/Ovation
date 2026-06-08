import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  index,
  timestamp,
} from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";

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
export const juniorMatchesTable = pgTable("junior_matches", {
  id: integer("id").primaryKey(),
  playhqMatchId: text("playhq_match_id"),
  season: text("season"),
  seasonStartYear: integer("season_start_year"),
  grade: text("grade"),
  ageGroup: text("age_group"),
  teamName: text("team_name"),
  competition: text("competition"),
  round: text("round"),
  matchDate: text("match_date"),
  venue: text("venue"),
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
});

export type JuniorMatchRow = typeof juniorMatchesTable.$inferSelect;

export const juniorMatchBattingTable = pgTable("junior_match_batting", {
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
});

export type JuniorMatchBattingRow = typeof juniorMatchBattingTable.$inferSelect;

export const juniorMatchBowlingTable = pgTable("junior_match_bowling", {
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
});

export type JuniorMatchBowlingRow = typeof juniorMatchBowlingTable.$inferSelect;

export const juniorMatchRostersTable = pgTable("junior_match_rosters", {
  id: integer("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => juniorMatchesTable.id, { onDelete: "cascade" }),
  teamName: text("team_name"),
  isHallsHead: boolean("is_halls_head").notNull().default(false),
  participantId: text("participant_id"),
  playerName: text("player_name"),
});

export type JuniorMatchRosterRow = typeof juniorMatchRostersTable.$inferSelect;

/**
 * One row per junior player, keyed by PlayHQ participant_id. `isPrivate` marks
 * the handful of participants the club wants hidden everywhere — the API masks
 * their scorecard lines and omits them from every directory / leaderboard.
 * `seniorPlayerId` is an OPTIONAL cross-reference to a senior player record for
 * profile linking only; it NEVER combines junior and senior stats. It is a plain
 * nullable integer with NO foreign key to the senior `players` table by club
 * decision — the juniors dataset must stay fully decoupled from senior tables so
 * neither schema constrains the other.
 */
export const juniorParticipantsTable = pgTable("junior_participants", {
  participantId: text("participant_id").primaryKey(),
  displayName: text("display_name"),
  isPrivate: boolean("is_private").notNull().default(false),
  scorecardLines: integer("scorecard_lines"),
  rosterAppearances: integer("roster_appearances"),
  firstSeason: text("first_season"),
  lastSeason: text("last_season"),
  teams: text("teams"),
  seniorPlayerId: integer("senior_player_id"),
});

export type JuniorParticipantRow = typeof juniorParticipantsTable.$inferSelect;

export const juniorPremiershipsTable = pgTable("junior_premierships", {
  id: integer("id").primaryKey(),
  season: text("season"),
  ageGroup: text("age_group"),
  teamName: text("team_name"),
  competition: text("competition"),
  matchDate: text("match_date"),
  opponent: text("opponent"),
  hhScore: text("hh_score"),
  oppScore: text("opp_score"),
  resultText: text("result_text"),
  matchId: integer("match_id").references(() => juniorMatchesTable.id, {
    onDelete: "set null",
  }),
  playhqMatchId: text("playhq_match_id"),
});

export type JuniorPremiershipRow = typeof juniorPremiershipsTable.$inferSelect;

export const juniorPremiershipPlayersTable = pgTable(
  "junior_premiership_players",
  {
    id: integer("id").primaryKey(),
    premiershipId: integer("premiership_id")
      .notNull()
      .references(() => juniorPremiershipsTable.id, { onDelete: "cascade" }),
    participantId: text("participant_id"),
    playerName: text("player_name"),
  },
);

export type JuniorPremiershipPlayerRow =
  typeof juniorPremiershipPlayersTable.$inferSelect;

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
    season: integer("season").notNull(),
    role: text("role").notNull(),
    name: text("name").notNull(),
    participantId: text("participant_id"),
    displayOrder: integer("display_order").notNull().default(0),
    published: boolean("published").notNull().default(false),
  },
  (t) => ({
    idxSeason: index("junior_office_bearers_season_idx").on(t.season),
  }),
);

export type JuniorOfficeBearerRow =
  typeof juniorOfficeBearersTable.$inferSelect;

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
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type JuniorMatchDisplaySettingsRow =
  typeof juniorMatchDisplaySettingsTable.$inferSelect;
