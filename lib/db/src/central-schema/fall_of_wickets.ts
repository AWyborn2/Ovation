import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA fall-of-wickets: one row per wicket per innings. `wicket` is the
 * wicket number (1..10), `runs` the team total when it fell, `participant_id`
 * the batter dismissed.
 */
export const centralFallOfWicketsTable = centralSchema.table(
  "fall_of_wickets",
  {
    id: integer("id").primaryKey(),
    matchId: integer("match_id"),
    innings: integer("innings"),
    wicket: integer("wicket"),
    runs: integer("runs"),
    participantId: text("participant_id"),
  },
);

export type CentralFallOfWicketRow =
  typeof centralFallOfWicketsTable.$inferSelect;
