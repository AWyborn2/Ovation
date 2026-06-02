import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Grade captains: a second login role, distinct from admins. A captain can be
 * granted permission to vote for one or more grades (see
 * `captain_grade_permissions`). Reuses the same bcrypt password hashing as
 * admins, but carries its own HMAC session cookie.
 */
export const captainsTable = pgTable("captains", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Which grades a captain may submit ballots for. One row per (captain, grade).
 * The (captain_id, grade) uniqueness is enforced by `ensure-constraints` rather
 * than the Drizzle schema (drizzle-kit 0.31 can't reliably detect an existing
 * multi-column unique and re-proposes it every push).
 */
export const captainGradePermissionsTable = pgTable("captain_grade_permissions", {
  id: serial("id").primaryKey(),
  captainId: integer("captain_id")
    .notNull()
    .references(() => captainsTable.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
});

export type CaptainRow = typeof captainsTable.$inferSelect;
export type CaptainGradePermissionRow = typeof captainGradePermissionsTable.$inferSelect;
