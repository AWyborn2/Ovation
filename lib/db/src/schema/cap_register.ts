import { pgTable, serial, integer, text, boolean, index, unique } from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { tenantIdColumn } from "./_tenant";

// NOTE: Postgres enforces a composite UNIQUE constraint
// `cap_register_tenant_category_cap_number_unique` on
// (tenant_id, category, cap_number) — one cap number per category PER TENANT.
// Cap numbering is a per-club sequence: every club's A Grade list starts at #1,
// so tenant_id is part of the identity, and `cap-sync.ts` derives its next cap
// number from the tenant's own high-water mark. (This superseded a
// `(category, cap_number)` unique that made cap #1 global across all clubs.)
// It is intentionally NOT declared in this Drizzle schema.
//
// drizzle-kit 0.31's `push` fails to detect existing multi-column unique
// constraints, so it re-proposes adding this one on every run. That renders an
// interactive "truncate cap_register?" prompt which has no TTY during the
// automatic post-merge migration, so every push (and therefore every schema
// migration) silently fails. Leaving the constraint out of the schema keeps
// push's diff empty (drizzle is blind to it on both sides) while the real
// constraint stays enforced in the database. It is (re)created idempotently via
// raw SQL by `scripts/src/ensure-constraints.ts`, run from post-merge.
export const capRegisterTable = pgTable(
  "cap_register",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    capNumber: integer("cap_number").notNull(),
    category: text("category").notNull().default("male"),
    name: text("name").notNull(),
    deceased: boolean("deceased").notNull().default(false),
    inStats: boolean("in_stats").notNull().default(false),
    gamesAGrade: integer("games_a_grade").notNull().default(0),
    // Overall debut order across both cap categories (from the master DB).
    debutSeq: integer("debut_seq"),
    // Free-text note about the player's stats tracking (from the master DB).
    capNote: text("cap_note"),
    // True when cap-sync created this row from imported stats (so rollback can
    // safely remove it). False for caps entered/edited by the club by hand.
    autoCreated: boolean("auto_created").notNull().default(false),
    playerId: integer("player_id").references(() => playersTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    idxTenant: index("cap_register_tenant_idx").on(t.tenantId),
    uqTenantCap: unique("cap_register_tenant_category_cap_number_unique").on(
      t.tenantId,
      t.category,
      t.capNumber,
    ),
    idxPlayer: index("cap_register_player_idx").on(t.playerId),
  }),
);

export type CapRegisterRow = typeof capRegisterTable.$inferSelect;
