import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPackById, PACKS } from "./design-packs";

// ---------------------------------------------------------------------------
// Mock @workspace/db so ensurePackTemplates never hits a real database.
// We capture all insert/select calls and drive them through a minimal stub
// that mirrors Drizzle's chained-builder API.
// ---------------------------------------------------------------------------

type MockRow = {
  tenantId: number;
  source: string;
  packId: string | null;
  packVariant: string | null;
  [key: string]: unknown;
};

/** Shape of the `onConflictDoUpdate` config the insert chain receives. */
type OnConflictConfig = {
  target?: unknown;
  targetWhere?: unknown;
  setWhere?: unknown;
  set?: Record<string, unknown>;
};

let insertedRows: MockRow[] = [];
let existingRows: MockRow[] = [];
let onConflictDoUpdateCalls: OnConflictConfig[] = [];
let onConflictDoNothingCalls = 0;

// Drizzle-like chained builder stubs for SELECT.
function makeSelectChain() {
  let _table: unknown;
  const conditions: unknown[] = [];

  const chain = {
    from: (table: unknown) => {
      _table = table;
      return chain;
    },
    where: (cond: unknown) => {
      conditions.push(cond);
      return chain;
    },
    limit: (_n: number) => {
      // The real implementation filters; we do a simplified match.
      // ensurePackTemplates checks (tenantId, source:"pack", packId, packVariant).
      // We match rows in existingRows that satisfy those values.
      return existingRows.length > 0 ? [existingRows[0]] : [];
    },
  };
  return chain;
}

// Drizzle-like chained builder stubs for INSERT.
function makeInsertChain() {
  return {
    values: (rows: MockRow | MockRow[]) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      insertedRows.push(...arr);
      return {
        returning: () => arr,
        onConflictDoNothing: () => {
          onConflictDoNothingCalls += 1;
          return { returning: () => arr };
        },
        // NOTE: this stub records the emitted call shape only. It has no notion
        // of a pre-existing row and no conflict semantics, so it CANNOT prove
        // reconciliation — asserting upsert behaviour here would be asserting
        // the mock. The reconciliation semantics live in
        // `src/routes/pack-reconcile-integration.test.ts` against a real DB.
        onConflictDoUpdate: (cfg: OnConflictConfig) => {
          onConflictDoUpdateCalls.push(cfg);
          return { returning: () => arr };
        },
      };
    },
  };
}

vi.mock("@workspace/db", () => {
  // Minimal table symbol so `eq(cardTemplatesTable.tenantId, ...)` doesn't
  // throw. The real Drizzle columns are opaque objects; we just need truthy
  // stand-ins for the mock.
  const cardTemplatesTable = {
    id: Symbol("id"),
    tenantId: Symbol("tenantId"),
    source: Symbol("source"),
    packId: Symbol("packId"),
    packVariant: Symbol("packVariant"),
  };

  return {
    db: {
      select: () => makeSelectChain(),
      insert: () => makeInsertChain(),
    },
    cardTemplatesTable,
  };
});

// Import AFTER the mock is in place so the module picks up the stub.
const { ensurePackTemplates, _resetEnsuredTenants } = await import("./design-packs");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("design-packs registry", () => {
  beforeEach(() => {
    insertedRows = [];
    existingRows = [];
    onConflictDoUpdateCalls = [];
    onConflictDoNothingCalls = 0;
    _resetEnsuredTenants();
  });

  // The 18 card kinds Pack A ("broadcast-dark-v1") covers.
  const ALL_KINDS = [
    "matchSummary",
    "player",
    "milestone",
    "debut",
    "record",
    "gradeLeader",
    "premiership",
    "newCap",
    "century",
    "fiveFor",
    "matchDay",
    "teamList",
    "weekendWrap",
    "ladder",
    "bigMoment",
    "newSigning",
    "countdown",
    "clubLeaderboard",
  ];

  // --- getPackById ----------------------------------------------------------

  it("returns the pack definition for a known id", () => {
    const pack = getPackById("broadcast-dark-v1");
    expect(pack).toBeDefined();
    expect(pack!.id).toBe("broadcast-dark-v1");
    expect(pack!.name).toBe("Broadcast Dark");
    expect(pack!.cardKinds).toEqual(ALL_KINDS);
  });

  it("no longer exposes the retired matchSummary-v1 pack", () => {
    expect(getPackById("matchSummary-v1")).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(getPackById("nonexistent")).toBeUndefined();
  });

  // --- PACKS static shape ---------------------------------------------------

  it("broadcast-dark-v1 covers all 18 card kinds", () => {
    const pack = PACKS.find((p) => p.id === "broadcast-dark-v1")!;
    expect(pack.cardKinds).toHaveLength(18);
    expect(new Set(pack.cardKinds)).toEqual(new Set(ALL_KINDS));
  });

  it("broadcast-dark-v1 has three static variants with correct dimensions", () => {
    const pack = PACKS.find((p) => p.id === "broadcast-dark-v1")!;
    expect(pack.variants).toHaveLength(3);

    const square = pack.variants.find((v) => v.key === "square")!;
    expect(square.width).toBe(1080);
    expect(square.height).toBe(1080);
    expect(square.motionPreset).toBe("none");
    expect(square.backgroundKind).toBe("image");

    const portrait = pack.variants.find((v) => v.key === "portrait")!;
    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBe(1350);
    expect(portrait.motionPreset).toBe("none");
    expect(portrait.backgroundKind).toBe("image");

    const story = pack.variants.find((v) => v.key === "story")!;
    expect(story.width).toBe(1080);
    expect(story.height).toBe(1920);
    // Pack A ships static — no motion, image background — so MP4 export hides.
    expect(story.motionPreset).toBe("none");
    expect(story.backgroundKind).toBe("image");
  });

  // --- ensurePackTemplates --------------------------------------------------

  it("creates one row per variant of every registered pack on first call", async () => {
    await ensurePackTemplates(42);

    const expectedRows = PACKS.reduce((n, p) => n + p.variants.length, 0);
    expect(insertedRows).toHaveLength(expectedRows);
    for (const row of insertedRows) {
      expect(row.tenantId).toBe(42);
      expect(row.source).toBe("pack");
    }

    // Every registered pack gets its full variant set — a pack whose rows were
    // never materialised can never be selected by a tenant.
    for (const pack of PACKS) {
      const rows = insertedRows.filter((r) => r.packId === pack.id);
      expect(rows, pack.id).toHaveLength(pack.variants.length);
      const variants = rows.map((r) => r.packVariant);
      for (const v of pack.variants) expect(variants, pack.id).toContain(v.key);
    }
  });

  it("materialises broadcast-dark-v1 with all three variants", async () => {
    await ensurePackTemplates(42);

    const rows = insertedRows.filter((r) => r.packId === "broadcast-dark-v1");
    expect(rows).toHaveLength(3);
    const variants = rows.map((r) => r.packVariant);
    expect(variants).toContain("square");
    expect(variants).toContain("portrait");
    expect(variants).toContain("story");
  });

  it("sets correct dimensions per variant", async () => {
    await ensurePackTemplates(1);

    const square = insertedRows.find((r) => r.packVariant === "square")!;
    expect(square.bgWidth).toBe(1080);
    expect(square.bgHeight).toBe(1080);
    expect(square.motionPreset).toBe("none");
    expect(square.backgroundKind).toBe("image");

    const portrait = insertedRows.find((r) => r.packVariant === "portrait")!;
    expect(portrait.bgWidth).toBe(1080);
    expect(portrait.bgHeight).toBe(1350);

    const story = insertedRows.find((r) => r.packVariant === "story")!;
    expect(story.bgWidth).toBe(1080);
    expect(story.bgHeight).toBe(1920);
    expect(story.motionPreset).toBe("none");
    expect(story.backgroundKind).toBe("image");
  });

  it("seeds each row with its OWN pack's declared cardKinds", async () => {
    await ensurePackTemplates(1);

    // cardKinds is the coverage contract: a row must only offer the kinds its
    // pack can actually render, so a partially-transcribed pack (Gold Foil) is
    // never offered for a kind that would fall back to another pack's design.
    for (const row of insertedRows) {
      const pack = PACKS.find((p) => p.id === row.packId);
      expect(pack, `unknown packId ${row.packId}`).toBeDefined();
      expect(row.cardKinds, `${row.packId}`).toEqual(pack!.cardKinds);
    }
  });

  it("gives Broadcast Dark full coverage of all 18 kinds", async () => {
    await ensurePackTemplates(1);

    for (const row of insertedRows.filter((r) => r.packId === "broadcast-dark-v1")) {
      expect(row.cardKinds).toEqual(ALL_KINDS);
    }
  });

  // --- upsert call shape ----------------------------------------------------
  // These assert only what the statement LOOKS like. Whether the upsert
  // actually reconciles a pre-existing row is proven in
  // `src/routes/pack-reconcile-integration.test.ts` against a real database —
  // only a real Postgres exercises partial-index arbiter inference.

  it("reconciles via onConflictDoUpdate, not onConflictDoNothing", async () => {
    await ensurePackTemplates(7);

    expect(onConflictDoUpdateCalls).toHaveLength(1);
    // DO NOTHING would leave a pack row frozen at first materialisation — the
    // exact defect this upsert exists to fix.
    expect(onConflictDoNothingCalls).toBe(0);
  });

  it("names the four-column conflict target", async () => {
    await ensurePackTemplates(7);

    const { cardTemplatesTable } = await import("@workspace/db");
    const cfg = onConflictDoUpdateCalls[0];
    expect(Array.isArray(cfg.target)).toBe(true);
    expect(cfg.target).toEqual([
      cardTemplatesTable.tenantId,
      cardTemplatesTable.source,
      cardTemplatesTable.packId,
      cardTemplatesTable.packVariant,
    ]);
  });

  it("repeats the partial index predicate as targetWhere", async () => {
    await ensurePackTemplates(7);

    // `card_templates_pack_unique` is PARTIAL (`.where(sql`source = 'pack'`)`).
    // Postgres will not infer a partial index as an ON CONFLICT arbiter from a
    // bare column list — it raises 42P10, which the caller
    // (`routes/social-cards.ts:426-428`) swallows, producing symptoms identical
    // to the stale-row bug. The predicate is mandatory, not polish.
    const cfg = onConflictDoUpdateCalls[0];
    expect(cfg.targetWhere).toBeDefined();

    const chunks =
      (cfg.targetWhere as { queryChunks?: Array<{ value?: string[] }> }).queryChunks ?? [];
    const rendered = chunks.map((c) => (c.value ?? []).join("")).join("");
    expect(rendered).toContain("source = 'pack'");
  });

  it("updates registry-owned columns ONLY — no tenant-owned column in `set`", async () => {
    await ensurePackTemplates(7);

    const cfg = onConflictDoUpdateCalls[0];
    const keys = Object.keys(cfg.set ?? {}).sort();
    expect(keys).toEqual(
      ["backgroundKind", "bgHeight", "bgWidth", "cardKinds", "motionPreset", "name"].sort(),
    );

    // Stated separately from the exact-keys assertion so a future widening of
    // `set` fails with the reason attached: these four are TENANT state. A
    // blanket update would reset every tenant's pack choice on every restart.
    for (const tenantOwned of ["defaultForKinds", "isActive", "displayOrder", "isDefault"]) {
      expect(keys, `${tenantOwned} is tenant-owned and must never be reconciled`).not.toContain(
        tenantOwned,
      );
    }
  });

  it("is idempotent — second call for same tenant inserts nothing", async () => {
    // First call seeds the in-memory cache.
    await ensurePackTemplates(1);
    const firstCallCount = insertedRows.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // Second call for the same tenant hits the ensuredTenants cache and
    // returns early without touching the DB.
    await ensurePackTemplates(1);
    expect(insertedRows).toHaveLength(firstCallCount);
  });
});
