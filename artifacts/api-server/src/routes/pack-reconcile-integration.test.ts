import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Pack-row reconciliation against a REAL database.
 *
 * `ensurePackTemplates` upserts every registered pack variant into
 * `card_templates`. The conflict arbiter is `card_templates_pack_unique`, a
 * PARTIAL unique index (`.where(sql`source = 'pack'`)`,
 * lib/db/src/schema/social_cards.ts:170-172). Postgres will not infer a partial
 * index from a bare column list — it raises 42P10 — so the upsert must repeat
 * the predicate via `targetWhere`.
 *
 * None of that is observable through the unit suite: `design-packs.test.ts`
 * mocks `@workspace/db` with a stub that has no notion of a pre-existing row
 * and no conflict semantics, so it can only assert the emitted call shape.
 * Only a real Postgres exercises partial-index arbiter inference — the exact
 * defect class this change is most likely to hit. Hence this file.
 *
 * Real-DB integration test (needs DATABASE_URL), following the pattern in
 * `tenant-isolation.test.ts`. Skipped cleanly without DATABASE_URL — note the
 * imports below are dynamic for that reason: `@workspace/db` throws at module
 * load when DATABASE_URL is unset, so a static import would crash collection
 * instead of skipping.
 *
 * ENVIRONMENT PRECONDITION: `card_templates_pack_unique` must exist in the
 * target database. The repo applies schema via `drizzle-kit push` with no
 * migrations directory, so an environment that never pushed it will fail these
 * tests at the ensure call (42P10) rather than reporting a wrong value.
 */

const HAS_DB = !!process.env.DATABASE_URL;

const dbMod = HAS_DB ? await import("@workspace/db") : null;
const packsMod = HAS_DB ? await import("../lib/design-packs") : null;

// Non-null views. Only dereferenced inside hook/test bodies, which never run
// when the suite is skipped (describe callbacks DO run during collection).
const D = dbMod as NonNullable<typeof dbMod>;
const P = packsMod as NonNullable<typeof packsMod>;

const STAMP = Date.now();

describe.skipIf(!HAS_DB)("ensurePackTemplates reconciles pack rows to the registry", () => {
  let tenantId: number;
  /** A second tenant that no test acts on — the isolation control. */
  let otherTenantId: number;

  /** Every pack row currently stored for the synthetic tenant. */
  async function packRows() {
    return D.db
      .select()
      .from(D.cardTemplatesTable)
      .where(
        and(
          eq(D.cardTemplatesTable.tenantId, tenantId),
          eq(D.cardTemplatesTable.source, "pack"),
        ),
      );
  }

  async function packRow(packId: string, packVariant: string) {
    const rows = await packRows();
    return rows.find((r) => r.packId === packId && r.packVariant === packVariant);
  }

  /** Wipe the tenant's pack rows and clear the per-process ensured cache. */
  async function reset() {
    await D.db
      .delete(D.cardTemplatesTable)
      .where(eq(D.cardTemplatesTable.tenantId, tenantId));
    P._resetEnsuredTenants();
  }

  // Lazy: the describe callback still runs during collection when the suite is
  // skipped, so nothing may dereference the dynamic imports at this level.
  const sunsetPack = () => P.PACKS.find((p) => p.id === "sunset-v1")!;

  /**
   * Seed a Sunset square row as it would look if it had been materialised
   * mid-catalogue-build: Sunset shipped at 1 kind and finished at 18.
   */
  async function seedStaleSunsetSquare(overrides: Record<string, unknown> = {}) {
    await D.db.insert(D.cardTemplatesTable).values({
      tenantId,
      name: "Sunset — Square (stale)",
      cardKinds: ["matchSummary"],
      source: "pack",
      packId: "sunset-v1",
      packVariant: "square",
      backgroundKind: "image",
      motionPreset: "none",
      bgWidth: 999,
      bgHeight: 999,
      slots: [],
      isActive: true,
      isDefault: false,
      displayOrder: 0,
      defaultForKinds: [],
      ...overrides,
    });
  }

  beforeAll(async () => {
    const [tenant] = await D.db
      .insert(D.tenantsTable)
      .values({
        slug: `pack-reconcile-${STAMP}`,
        centralClubId: 998,
        appClubId: null,
        name: "Pack Reconcile Test Tenant",
        plan: "pilot",
      })
      .returning();
    tenantId = tenant.id;

    const [other] = await D.db
      .insert(D.tenantsTable)
      .values({
        slug: `pack-reconcile-other-${STAMP}`,
        centralClubId: 997,
        appClubId: null,
        name: "Pack Reconcile Bystander Tenant",
        plan: "pilot",
      })
      .returning();
    otherTenantId = other.id;
  });

  beforeEach(async () => {
    await reset();
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      if (!id) continue;
      await D.db
        .delete(D.cardTemplatesTable)
        .where(eq(D.cardTemplatesTable.tenantId, id));
      await D.db.delete(D.tenantsTable).where(eq(D.tenantsTable.id, id));
    }
    P._resetEnsuredTenants();
  });

  // --- tenant isolation -----------------------------------------------------
  // CONTRIBUTING.md requires extending the isolation suites whenever a
  // tenant-scoped table's write path changes, and this upsert is the first
  // write-path change to `card_templates` since that policy was written. The
  // conflict target carries `tenantId`, so a mis-specified arbiter is the one
  // way reconciliation could reach across tenants — assert it cannot.

  it("reconciling one tenant neither creates nor mutates another tenant's rows", async () => {
    // A bystander tenant with a deliberately stale row and its own selection.
    await D.db.insert(D.cardTemplatesTable).values({
      tenantId: otherTenantId,
      name: "Sunset — Square (bystander, stale)",
      cardKinds: ["matchSummary"],
      source: "pack",
      packId: "sunset-v1",
      packVariant: "square",
      backgroundKind: "image",
      motionPreset: "none",
      bgWidth: 999,
      bgHeight: 999,
      slots: [],
      isActive: true,
      isDefault: false,
      displayOrder: 0,
      defaultForKinds: ["matchSummary"],
    });

    await P.ensurePackTemplates(tenantId);

    const bystander = await D.db
      .select()
      .from(D.cardTemplatesTable)
      .where(eq(D.cardTemplatesTable.tenantId, otherTenantId));

    // Untouched: still exactly one row, still stale, still holding its claim.
    expect(bystander).toHaveLength(1);
    expect(bystander[0].cardKinds).toEqual(["matchSummary"]);
    expect(bystander[0].defaultForKinds).toEqual(["matchSummary"]);
  });

  // --- materialisation ------------------------------------------------------

  it("gives a tenant with no pack rows one row per pack per variant, with registry cardKinds", async () => {
    await P.ensurePackTemplates(tenantId);

    const rows = await packRows();
    const expectedCount = P.PACKS.reduce((n, p) => n + p.variants.length, 0);
    expect(rows).toHaveLength(expectedCount);

    for (const pack of P.PACKS) {
      for (const variant of pack.variants) {
        const row = rows.find((r) => r.packId === pack.id && r.packVariant === variant.key);
        expect(row, `${pack.id}/${variant.key}`).toBeDefined();
        expect(row!.cardKinds, `${pack.id}/${variant.key}`).toEqual(pack.cardKinds);
        expect(row!.bgWidth).toBe(variant.width);
        expect(row!.bgHeight).toBe(variant.height);
      }
    }
  });

  // --- reconciliation: registry-owned columns track the code ----------------

  it("reconciles a stale pack row's cardKinds up to the registry's full coverage", async () => {
    // The defect that would silently narrow the switcher: Sunset shipped at one
    // kind and finished at 18, so any tenant materialised mid-build holds a row
    // claiming a subset of what the pack now renders.
    await seedStaleSunsetSquare();
    expect((await packRow("sunset-v1", "square"))!.cardKinds).toEqual(["matchSummary"]);

    await P.ensurePackTemplates(tenantId);

    const row = await packRow("sunset-v1", "square");
    expect(row!.cardKinds).toEqual(sunsetPack().cardKinds);
    expect(row!.cardKinds).toHaveLength(18);
    // The other registry-owned columns reconcile too.
    expect(row!.bgWidth).toBe(1080);
    expect(row!.bgHeight).toBe(1080);
    expect(row!.name).toBe("Sunset — Square (1080×1080)");
  });

  it("does not duplicate the reconciled row", async () => {
    await seedStaleSunsetSquare();
    await P.ensurePackTemplates(tenantId);

    const sunsetSquare = (await packRows()).filter(
      (r) => r.packId === "sunset-v1" && r.packVariant === "square",
    );
    expect(sunsetSquare).toHaveLength(1);
  });

  // --- tenant-owned columns survive (KTD4's four exclusions) ----------------

  it("preserves defaultForKinds — the tenant's pack choice", async () => {
    await seedStaleSunsetSquare({ defaultForKinds: ["matchSummary"] });
    await P.ensurePackTemplates(tenantId);

    const row = await packRow("sunset-v1", "square");
    expect(row!.defaultForKinds).toEqual(["matchSummary"]);
    // ...while the registry-owned column beside it still reconciled.
    expect(row!.cardKinds).toHaveLength(18);
  });

  it("preserves isActive: false — a pack row the tenant deactivated", async () => {
    await seedStaleSunsetSquare({ isActive: false });
    await P.ensurePackTemplates(tenantId);

    const row = await packRow("sunset-v1", "square");
    expect(row!.isActive).toBe(false);
    expect(row!.cardKinds).toHaveLength(18);
  });

  it("preserves a non-default displayOrder", async () => {
    await seedStaleSunsetSquare({ displayOrder: 7 });
    await P.ensurePackTemplates(tenantId);

    const row = await packRow("sunset-v1", "square");
    expect(row!.displayOrder).toBe(7);
    expect(row!.cardKinds).toHaveLength(18);
  });

  it("preserves isDefault: true — still read as a fallback by resolvePackIdForKind", async () => {
    await seedStaleSunsetSquare({ isDefault: true });
    await P.ensurePackTemplates(tenantId);

    const row = await packRow("sunset-v1", "square");
    expect(row!.isDefault).toBe(true);
    expect(row!.cardKinds).toHaveLength(18);
  });

  // --- idempotence: the arbiter actually resolved ---------------------------

  it("running ensure twice produces no duplicates and no column churn", async () => {
    // This is the scenario that catches a missing `targetWhere`. Without it the
    // statement raises 42P10, which surfaces here as a thrown error from
    // ensurePackTemplates — in production the caller's best-effort catch
    // swallows it and the rows stay frozen, indistinguishable from the bug.
    await P.ensurePackTemplates(tenantId);
    const first = (await packRows()).sort((a, b) => a.id - b.id);
    expect(first.length).toBeGreaterThan(0);

    P._resetEnsuredTenants();
    await P.ensurePackTemplates(tenantId);
    const second = (await packRows()).sort((a, b) => a.id - b.id);

    // Same rows (same ids — nothing was re-inserted), same values.
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(second).toEqual(first);
  });

  it("a second ensure over a tenant-customised row still leaves that state intact", async () => {
    await seedStaleSunsetSquare({
      defaultForKinds: ["matchSummary"],
      isActive: false,
      displayOrder: 7,
      isDefault: true,
    });

    await P.ensurePackTemplates(tenantId);
    P._resetEnsuredTenants();
    await P.ensurePackTemplates(tenantId);

    const row = await packRow("sunset-v1", "square");
    expect(row!.defaultForKinds).toEqual(["matchSummary"]);
    expect(row!.isActive).toBe(false);
    expect(row!.displayOrder).toBe(7);
    expect(row!.isDefault).toBe(true);
    expect(row!.cardKinds).toEqual(sunsetPack().cardKinds);
  });
});
