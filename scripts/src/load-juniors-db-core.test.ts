/**
 * load-juniors-db-core.test.ts — the juniors loader reports and protects tenant 1 only
 * (junior PlayHQ sync plan U3; KTD6, AE2). No database: the functions return SQL text.
 */
import { describe, expect, it } from "vitest";
import {
  LOADER_SEASON_LIMIT,
  LOADER_TENANT_ID,
  SYNC_ID_START,
  TRACKED_TABLES,
  protectedRowsSql,
  tenantCountSql,
} from "./load-juniors-db-core";

describe("tenantCountSql", () => {
  it("counts tenant 1 only, for every tracked table", () => {
    for (const table of TRACKED_TABLES) {
      const sql = tenantCountSql(table);
      expect(sql).toContain(`FROM public.${table} `);
      expect(sql).toContain(`tenant_id = ${LOADER_TENANT_ID}`);
    }
  });

  it("reaches the tenant through the match for line tables", () => {
    expect(tenantCountSql("junior_match_batting")).toBe(
      "SELECT count(*) FROM public.junior_match_batting " +
        "WHERE match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1)",
    );
  });

  it("reaches the tenant through the premiership for premiership players", () => {
    expect(tenantCountSql("junior_premiership_players")).toBe(
      "SELECT count(*) FROM public.junior_premiership_players " +
        "WHERE premiership_id IN (SELECT id FROM public.junior_premierships WHERE tenant_id = 1)",
    );
  });

  it("uses the table's own tenant column where it has one", () => {
    expect(tenantCountSql("junior_participants")).toBe(
      "SELECT count(*) FROM public.junior_participants WHERE tenant_id = 1",
    );
  });
});

describe("protectedRowsSql", () => {
  it("counts tenant 1's synced and sync-season matches", () => {
    const sql = protectedRowsSql();
    expect(sql).toContain("tenant_id = 1");
    expect(sql).toContain(`id >= ${SYNC_ID_START}`);
    expect(sql).toContain(`>= ${LOADER_SEASON_LIMIT}`);
  });

  it("matches the boundaries the ETL enforces", () => {
    expect(SYNC_ID_START).toBe(200_000_000);
    expect(LOADER_SEASON_LIMIT).toBe(2026);
  });
});
