import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { playhqSchema } from "./_schema";

/** Clubs and associations as PlayHQ names them (`logo_url` is the Cloudinary crest). */
export const playhqOrganisationsTable = playhqSchema.table("organisations", {
  id: uuid("id").primaryKey(),
  name: text("name"),
  shortName: text("short_name"),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export type PlayhqOrganisationRow = typeof playhqOrganisationsTable.$inferSelect;
