import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { playhqSchema } from "./_schema";

/**
 * Fixtures AND results: every match a grade listing returns, whatever its
 * status (UPCOMING / PENDING / COMPLETED / ABANDONED …). Symmetric home/away,
 * keyed on the PlayHQ match GUID (= `central.matches.playhq_match_id`).
 */
export const playhqMatchesTable = playhqSchema.table(
  "matches",
  {
    id: uuid("id").primaryKey(),
    gradeId: uuid("grade_id"),
    status: text("status"),
    statusId: integer("status_id"),
    matchType: text("match_type"),
    matchTypeId: integer("match_type_id"),
    roundId: uuid("round_id"),
    roundName: text("round_name"),
    roundShort: text("round_short"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    matchDays: integer("match_days"),
    venueName: text("venue_name"),
    venueLine1: text("venue_line1"),
    venueSuburb: text("venue_suburb"),
    venueState: text("venue_state"),
    venuePostcode: text("venue_postcode"),
    surfaceName: text("surface_name"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    resultText: text("result_text"),
    homeTeamId: uuid("home_team_id"),
    homeTeamName: text("home_team_name"),
    homeOrgId: uuid("home_org_id"),
    homeScore: text("home_score"),
    homeOvers: numeric("home_overs"),
    awayTeamId: uuid("away_team_id"),
    awayTeamName: text("away_team_name"),
    awayOrgId: uuid("away_org_id"),
    awayScore: text("away_score"),
    awayOvers: numeric("away_overs"),
    winnerTeamId: uuid("winner_team_id"),
    isLiveStreaming: boolean("is_live_streaming"),
    raw: jsonb("raw"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => ({
    // Declared for documentation; the DDL in scripts/sql/playhq-schema.sql owns them.
    idxGrade: index("playhq_matches_grade_idx").on(t.gradeId),
    idxStart: index("playhq_matches_start_idx").on(t.startAt),
    idxHomeOrg: index("playhq_matches_home_org_idx").on(t.homeOrgId),
    idxAwayOrg: index("playhq_matches_away_org_idx").on(t.awayOrgId),
  }),
);

export type PlayhqMatchRow = typeof playhqMatchesTable.$inferSelect;
