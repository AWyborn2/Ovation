import { pgTable, serial, integer, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Grade captains: a second login role, distinct from admins. A captain can be
 * granted permission to vote for one or more grades (see
 * `captain_grade_permissions`). Reuses the same bcrypt password hashing as
 * admins, but carries its own HMAC session cookie.
 *
 * Scoped per tenant exactly like `admins` (see `admins.ts`): `username` is
 * unique WITHIN a tenant, not globally, so two clubs can each have a
 * "captain1". `tenantId` defaults to 1 (Halls Head) so the column backfills
 * cleanly onto the pre-white-label single-tenant rows. Cross-tenant access is
 * denied in `requireCaptain`/`resolveCaptain` by asserting the resolved
 * captain's `tenantId` matches the request's tenant.
 *
 * NOTE: The (tenant_id, username) composite unique is intentionally NOT declared
 * here. drizzle-kit 0.31 cannot detect the existing constraint and re-proposes
 * it every push, hanging the non-interactive post-merge on a TTY "truncate?"
 * prompt. The constraint is created idempotently by ensure-constraints.ts.
 * See lib/db/src/schema/cap_register.ts for the full rationale.
 */
export const captainsTable = pgTable(
  "captains",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** See adminsTable.sessionEpoch. */
    sessionEpoch: integer("session_epoch").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("captains_tenant_idx").on(t.tenantId),
    uqTenantUsername: unique("captains_tenant_username_unique").on(t.tenantId, t.username),
  }),
);

/**
 * Which grades a captain may submit ballots for. One row per (captain, grade).
 * The (captain_id, grade) uniqueness is enforced by `ensure-constraints` rather
 * than the Drizzle schema (drizzle-kit 0.31 can't reliably detect an existing
 * multi-column unique and re-proposes it every push).
 */
export const captainGradePermissionsTable = pgTable(
  "captain_grade_permissions",
  {
    id: serial("id").primaryKey(),
    captainId: integer("captain_id")
      .notNull()
      .references(() => captainsTable.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(),
  },
  (t) => ({
    uqCaptainGrade: unique("captain_grade_permissions_captain_grade_unique").on(
      t.captainId,
      t.grade,
    ),
  }),
);

export type CaptainRow = typeof captainsTable.$inferSelect;
export type CaptainGradePermissionRow = typeof captainGradePermissionsTable.$inferSelect;
