import { boolean, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { playhqSchema } from "./_schema";

/** One PlayHQ grade = one grade in one season. */
export const playhqGradesTable = playhqSchema.table("grades", {
  id: uuid("id").primaryKey(),
  name: text("name"),
  seasonId: uuid("season_id"),
  seasonName: text("season_name"),
  /** The association that runs the grade. */
  ownerOrgId: uuid("owner_org_id"),
  /** The organisation whose discovery run found it (club or association). */
  sourceOrgId: uuid("source_org_id"),
  /** Junior / pathway grade — always excluded from senior surfaces. */
  isJunior: boolean("is_junior"),
  raw: jsonb("raw"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type PlayhqGradeRow = typeof playhqGradesTable.$inferSelect;
