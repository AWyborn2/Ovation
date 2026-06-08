import { pgTable, integer, text, boolean, real } from "drizzle-orm/pg-core";

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
