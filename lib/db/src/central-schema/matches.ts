import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA match — symmetric: both sides are first-class clubs
 * (`home_club_id` / `away_club_id`), unlike the tenant `public.matches` which is
 * one-club-centric. `season`, `round`, `match_date` are free TEXT (e.g.
 * "Summer 2002/03"); scores are TEXT.
 */
export const centralMatchesTable = centralSchema.table("matches", {
  matchId: integer("match_id").primaryKey(),
  playhqMatchId: text("playhq_match_id"),
  season: text("season"),
  grade: text("grade"),
  gradeId: text("grade_id"),
  compType: text("comp_type"),
  round: text("round"),
  matchDate: text("match_date"),
  venue: text("venue"),
  venueOval: text("venue_oval"),
  status: text("status"),
  homeClubId: integer("home_club_id"),
  awayClubId: integer("away_club_id"),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  homeScore: text("home_score"),
  awayScore: text("away_score"),
  tossWinnerClubId: integer("toss_winner_club_id"),
  winnerClubId: integer("winner_club_id"),
  resultText: text("result_text"),
});

export type CentralMatchRow = typeof centralMatchesTable.$inferSelect;
