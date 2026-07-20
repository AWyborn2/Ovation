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

let insertedRows: MockRow[] = [];
let existingRows: MockRow[] = [];

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
    values: (row: MockRow) => {
      insertedRows.push(row);
      return { returning: () => [row] };
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
    _resetEnsuredTenants();
  });

  // --- getPackById ----------------------------------------------------------

  it("returns the pack definition for a known id", () => {
    const pack = getPackById("matchSummary-v1");
    expect(pack).toBeDefined();
    expect(pack!.id).toBe("matchSummary-v1");
    expect(pack!.name).toBe("Match Summary Pack");
    expect(pack!.cardKinds).toEqual(["matchSummary"]);
  });

  it("returns undefined for an unknown id", () => {
    expect(getPackById("nonexistent")).toBeUndefined();
  });

  // --- PACKS static shape ---------------------------------------------------

  it("matchSummary-v1 has three variants with correct dimensions", () => {
    const pack = PACKS.find((p) => p.id === "matchSummary-v1")!;
    expect(pack.variants).toHaveLength(3);

    const square = pack.variants.find((v) => v.key === "square")!;
    expect(square.width).toBe(1080);
    expect(square.height).toBe(1080);
    expect(square.motionPreset).toBeNull();
    expect(square.backgroundKind).toBe("image");

    const portrait = pack.variants.find((v) => v.key === "portrait")!;
    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBe(1350);
    expect(portrait.motionPreset).toBeNull();
    expect(portrait.backgroundKind).toBe("image");

    const story = pack.variants.find((v) => v.key === "story")!;
    expect(story.width).toBe(1080);
    expect(story.height).toBe(1920);
    expect(story.motionPreset).toBe("matchReveal");
    expect(story.backgroundKind).toBe("video");
  });

  // --- ensurePackTemplates --------------------------------------------------

  it("creates 3 template rows for matchSummary-v1 on first call", async () => {
    await ensurePackTemplates(42);

    expect(insertedRows).toHaveLength(3);
    for (const row of insertedRows) {
      expect(row.tenantId).toBe(42);
      expect(row.source).toBe("pack");
      expect(row.packId).toBe("matchSummary-v1");
    }

    const variants = insertedRows.map((r) => r.packVariant);
    expect(variants).toContain("square");
    expect(variants).toContain("portrait");
    expect(variants).toContain("story");
  });

  it("sets correct dimensions per variant", async () => {
    await ensurePackTemplates(1);

    const square = insertedRows.find((r) => r.packVariant === "square")!;
    expect(square.bgWidth).toBe(1080);
    expect(square.bgHeight).toBe(1080);

    const portrait = insertedRows.find((r) => r.packVariant === "portrait")!;
    expect(portrait.bgWidth).toBe(1080);
    expect(portrait.bgHeight).toBe(1350);

    const story = insertedRows.find((r) => r.packVariant === "story")!;
    expect(story.bgWidth).toBe(1080);
    expect(story.bgHeight).toBe(1920);
    expect(story.motionPreset).toBe("matchReveal");
  });

  it("sets cardKinds from the pack definition", async () => {
    await ensurePackTemplates(1);

    for (const row of insertedRows) {
      expect(row.cardKinds).toEqual(["matchSummary"]);
    }
  });

  it("is idempotent — second call inserts nothing when rows already exist", async () => {
    // Simulate all variants already present in the DB.
    existingRows = [
      { tenantId: 1, source: "pack", packId: "matchSummary-v1", packVariant: "square", id: 100 },
    ];

    await ensurePackTemplates(1);

    // Because existingRows is non-empty for every select, all variants are
    // skipped and nothing is inserted.
    expect(insertedRows).toHaveLength(0);
  });
});
