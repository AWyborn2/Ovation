import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  boundaryFor,
  clubHistoryBatchCoverageTable,
  clubHistoryBatchesTable,
  clubHistoryBoundariesTable,
  clubHistoryRowsTable,
  coverageOf,
} from "./club_history";
import { CORRECTABLE_FIELDS, clubCorrectionsTable, isCorrectableField } from "./club_corrections";
import * as schemaIndex from "./index";

/**
 * Club history store (hybrid stats plan U9). Hermetic: these pin the schema
 * shape and the pure helpers. The behaviour against real Postgres (cascade
 * undo, the one-active-correction index, tenant scoping, re-applying 0021) is
 * pinned by artifacts/api-server/src/lib/club-history-store.test.ts in CI.
 */

const TABLES: PgTable[] = [
  clubHistoryBatchesTable,
  clubHistoryBatchCoverageTable,
  clubHistoryRowsTable,
  clubHistoryBoundariesTable,
  clubCorrectionsTable,
];

const MIGRATION = readFileSync(
  new URL("../../migrations/0021_club_history_store.sql", import.meta.url),
  "utf8",
);
const JOURNAL = JSON.parse(
  readFileSync(new URL("../../migrations/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: { idx: number; when: number; tag: string }[] };

function fkTargets(table: PgTable) {
  return getTableConfig(table).foreignKeys.map((fk) => {
    const ref = fk.reference();
    return {
      columns: ref.columns.map((c) => c.name),
      target: getTableConfig(ref.foreignTable).name,
      onDelete: fk.onDelete,
    };
  });
}

function column(table: PgTable, name: string) {
  const col = getTableConfig(table).columns.find((c) => c.name === name);
  if (!col) throw new Error(`${getTableConfig(table).name}.${name} missing`);
  return col;
}

describe("batch coverage", () => {
  it("a batch covering two grades records both", () => {
    const coverage = coverageOf([
      { grade: "B Grade", season: 1998 },
      { grade: "A Grade", season: 1998 },
      { grade: "A Grade", season: 1997 },
      { grade: "A Grade", season: 1998 },
      { grade: "B Grade", season: null },
    ]);
    expect(coverage).toEqual([
      { grade: "A Grade", season: 1997 },
      { grade: "A Grade", season: 1998 },
      { grade: "B Grade", season: null },
      { grade: "B Grade", season: 1998 },
    ]);
    expect(new Set(coverage.map((c) => c.grade))).toEqual(new Set(["A Grade", "B Grade"]));
  });

  it("coverage is stored per (batch, grade, season), cascading from its batch", () => {
    expect(fkTargets(clubHistoryBatchCoverageTable)).toContainEqual({
      columns: ["batch_id"],
      target: "club_history_batches",
      onDelete: "cascade",
    });
    const uq = getTableConfig(clubHistoryBatchCoverageTable).uniqueConstraints;
    expect(uq.map((u) => [u.columns.map((c) => c.name), u.nullsNotDistinct])).toEqual([
      [["batch_id", "grade", "season"], true],
    ]);
  });
});

describe("history rows", () => {
  it("deleting a batch removes its rows (cascade on batch_id only)", () => {
    expect(fkTargets(clubHistoryRowsTable)).toEqual(
      expect.arrayContaining([
        { columns: ["batch_id"], target: "club_history_batches", onDelete: "cascade" },
        { columns: ["tenant_id"], target: "tenants", onDelete: "no action" },
      ]),
    );
  });

  it("player_id is a tenant-space id with no FK to native players (KTD3)", () => {
    const fkCols = fkTargets(clubHistoryRowsTable).flatMap((f) => f.columns);
    expect(fkCols).not.toContain("player_id");
    expect(column(clubHistoryRowsTable, "player_id").notNull).toBe(true);
  });

  it("carries grain, optional season and the figure columns", () => {
    expect(column(clubHistoryRowsTable, "grain").notNull).toBe(true);
    expect(column(clubHistoryRowsTable, "season").notNull).toBe(false);
    for (const name of [
      "games",
      "innings",
      "not_outs",
      "runs",
      "high_score",
      "high_score_not_out",
      "balls_faced",
      "fours",
      "sixes",
      "fifties",
      "hundreds",
      "balls_bowled",
      "maidens",
      "runs_conceded",
      "wickets",
      "best_bowling_wickets",
      "best_bowling_runs",
      "catches",
      "stumpings",
      "run_outs",
      "match_date",
      "opponent",
      "round",
    ]) {
      expect(column(clubHistoryRowsTable, name).notNull).toBe(false);
    }
    const checks = getTableConfig(clubHistoryRowsTable).checks.map((c) => c.name);
    expect(checks).toEqual(
      expect.arrayContaining([
        "club_history_rows_grain_check",
        "club_history_rows_grain_season_check",
        "club_history_rows_match_descriptor_check",
      ]),
    );
  });
});

describe("boundary", () => {
  const boundaries = [
    { grade: null, startSeason: 2003 },
    { grade: "B Grade", startSeason: 2004 },
  ];

  it("a grade override wins over the club default (AE1)", () => {
    expect(boundaryFor(boundaries, "B Grade")).toBe(2004);
    expect(boundaryFor(boundaries, "A Grade")).toBe(2003);
  });

  it("no rows means no boundary", () => {
    expect(boundaryFor([], "A Grade")).toBeNull();
    expect(boundaryFor([{ grade: "B Grade", startSeason: 2004 }], "A Grade")).toBeNull();
  });

  it("one default and one row per grade per tenant", () => {
    const uq = getTableConfig(clubHistoryBoundariesTable).uniqueConstraints;
    expect(uq.map((u) => [u.columns.map((c) => c.name), u.nullsNotDistinct])).toEqual([
      [["tenant_id", "grade"], true],
    ]);
    expect(column(clubHistoryBoundariesTable, "start_season").notNull).toBe(true);
  });
});

describe("corrections journal", () => {
  it("a correction requires a PlayHQ match id, GUID, field and previous value", () => {
    for (const name of [
      "playhq_match_id",
      "participant_id",
      "field",
      "previous_value",
      "new_value",
      "created_by",
    ]) {
      expect(column(clubCorrectionsTable, name).notNull).toBe(true);
    }
    expect(column(clubCorrectionsTable, "removed_at").notNull).toBe(false);
  });

  it("only one active correction per (tenant, match, participant, field)", () => {
    const idx = getTableConfig(clubCorrectionsTable).indexes.find(
      (i) => i.config.name === "club_corrections_active_uidx",
    );
    expect(idx?.config.unique).toBe(true);
    expect(idx?.config.columns.map((c) => ("name" in c ? c.name : null))).toEqual([
      "tenant_id",
      "playhq_match_id",
      "participant_id",
      "field",
    ]);
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "club_corrections_active_uidx"[^;]*WHERE "removed_at" IS NULL;/,
    );
  });

  it("the field check lists exactly the correctable figures", () => {
    const check = getTableConfig(clubCorrectionsTable).checks.find(
      (c) => c.name === "club_corrections_field_check",
    );
    expect(check).toBeDefined();
    const inList = MIGRATION.match(/"club_corrections_field_check" CHECK \("field" IN \(([^)]*)\)/);
    const listed = inList?.[1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(listed).toEqual([...CORRECTABLE_FIELDS]);
    expect(isCorrectableField("runs")).toBe(true);
    expect(isCorrectableField("dismissal")).toBe(false);
  });
});

describe("tenant scoping", () => {
  it("every new table has a NOT NULL tenant_id referencing tenants", () => {
    for (const table of TABLES) {
      const name = getTableConfig(table).name;
      expect(column(table, "tenant_id").notNull, name).toBe(true);
      expect(fkTargets(table), name).toContainEqual({
        columns: ["tenant_id"],
        target: "tenants",
        onDelete: "no action",
      });
    }
  });

  it("is exported from the schema index", () => {
    expect(schemaIndex.clubHistoryBatchesTable).toBe(clubHistoryBatchesTable);
    expect(schemaIndex.clubHistoryBatchCoverageTable).toBe(clubHistoryBatchCoverageTable);
    expect(schemaIndex.clubHistoryRowsTable).toBe(clubHistoryRowsTable);
    expect(schemaIndex.clubHistoryBoundariesTable).toBe(clubHistoryBoundariesTable);
    expect(schemaIndex.clubCorrectionsTable).toBe(clubCorrectionsTable);
  });
});

describe("migration 0021", () => {
  it("is journalled after 0020 with a later `when`", () => {
    const e20 = JOURNAL.entries.find((e) => e.idx === 20);
    const e21 = JOURNAL.entries.find((e) => e.idx === 21);
    expect(e21?.tag).toBe("0021_club_history_store");
    expect(e21!.when).toBeGreaterThan(e20!.when);
    expect(e21!.when).toBeGreaterThan(1790726605272);
  });

  it("only creates the new tables, idempotently", () => {
    const creates = [...MIGRATION.matchAll(/CREATE TABLE (IF NOT EXISTS )?"(\w+)"/g)];
    expect(creates.map((m) => m[2]).sort()).toEqual(
      TABLES.map((t) => getTableConfig(t).name).sort(),
    );
    expect(creates.every((m) => m[1])).toBe(true);
    // No ALTER of an existing table, no DROP, no data change.
    const altered = new Set([...MIGRATION.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]));
    for (const t of altered) expect(creates.map((m) => m[2])).toContain(t);
    expect(MIGRATION).not.toMatch(/^\s*(DROP|UPDATE|DELETE|INSERT|TRUNCATE)\b/m);
    expect(MIGRATION).not.toMatch(/DROP (TABLE|COLUMN|CONSTRAINT|INDEX)/);
  });

  it("guards every constraint and index", () => {
    const statements = MIGRATION.split("--> statement-breakpoint");
    for (const s of statements) {
      if (/ADD CONSTRAINT/.test(s)) {
        expect(s).toMatch(/DO \$\$ BEGIN/);
        expect(s).toMatch(/EXCEPTION WHEN duplicate_object/);
      }
      if (/CREATE (UNIQUE )?INDEX/.test(s)) expect(s).toMatch(/INDEX IF NOT EXISTS/);
    }
    // Every constraint and index the schema declares appears in the migration.
    for (const table of TABLES) {
      const cfg = getTableConfig(table);
      for (const c of cfg.checks) expect(MIGRATION).toContain(`"${c.name}"`);
      for (const u of cfg.uniqueConstraints) expect(MIGRATION).toContain(`"${u.name}"`);
      for (const i of cfg.indexes) expect(MIGRATION).toContain(`"${i.config.name}"`);
    }
  });
});
