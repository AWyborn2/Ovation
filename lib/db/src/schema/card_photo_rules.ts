import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";
import { clubPhotosTable } from "./club_photos";

/**
 * How a card's photo is picked for one grade and card type (Social Studio card
 * photo rules). With no rule, drafts use the automatic order (player-tagged
 * photo, headshot, grade photo).
 *
 *   - `player`: the card's featured player (a tagged library photo, then their
 *     headshot); a match summary features the club's top run-scorer. Falls back
 *     to a random grade photo.
 *   - `random`: a photo of the grade, chosen deterministically per draft.
 *   - `fixed`: always `photoId`. The API requires a photo; if the photo is later
 *     removed from the library the FK clears it and drafts use the automatic
 *     order until the admin picks another.
 *
 * Junior cards never get a photo, whatever the rule says.
 */
export const cardPhotoRulesTable = pgTable(
  "card_photo_rules",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    grade: text("grade").notNull(),
    cardKind: text("card_kind").notNull(),
    mode: text("mode").notNull(), // "player" | "random" | "fixed"
    photoId: integer("photo_id").references(() => clubPhotosTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqGradeKind: uniqueIndex("card_photo_rules_tenant_grade_kind_unique").on(
      t.tenantId,
      t.grade,
      t.cardKind,
    ),
    chkMode: check("card_photo_rules_mode_check", sql`"mode" IN ('player', 'random', 'fixed')`),
  }),
);

export type CardPhotoRuleRow = typeof cardPhotoRulesTable.$inferSelect;
