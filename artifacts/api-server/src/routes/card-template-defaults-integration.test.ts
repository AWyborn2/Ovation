import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * `clearDefaultKinds` against a REAL database.
 *
 * This is the routine every design-pack selection runs through: before a
 * template claims a set of card kinds, the claimed kinds are stripped from every
 * other template of the tenant, so a kind has at most one default.
 *
 * It shipped broken and stayed broken through a release. The predicate
 * interpolated a JS array straight into a `sql` template —
 * `${kinds}::text[]` — but drizzle expands an interpolated array into a
 * parenthesised PARAMETER LIST (`($1)`, `($1, $2)`; see
 * `buildQueryFromSourceParams`'s `Array.isArray` branch), not an array literal.
 * Postgres therefore received `($1)::text[]` and refused it — `cannot cast type
 * text to text[]` for one kind, and a plain syntax error for two or more. Every
 * pack selection returned a bare 500.
 *
 * Nothing caught it, and the reason is the point of this file:
 *  - the client suite mocks the server, so it could only assert the request the
 *    browser SENDS;
 *  - `PATCH /card-templates/:id` had no server-side test at all;
 *  - the failure was invisible in the UI, because the hook's error state was
 *    rendered by nobody.
 * Only real Postgres can reject malformed SQL, so only a real-DB test can hold
 * this line. Both the single-kind and multi-kind shapes are covered below
 * because they failed for DIFFERENT reasons and a fix could plausibly address
 * one and not the other.
 *
 * Real-DB integration test (needs DATABASE_URL). Skipped cleanly without it —
 * the imports are dynamic because `@workspace/db` throws at module load when
 * DATABASE_URL is unset, which would crash collection instead of skipping.
 */

const HAS_DB = !!process.env.DATABASE_URL;

const dbMod = HAS_DB ? await import("@workspace/db") : null;
const helpersMod = HAS_DB ? await import("../lib/social-cards-helpers") : null;

const D = dbMod as NonNullable<typeof dbMod>;
const H = helpersMod as NonNullable<typeof helpersMod>;

const STAMP = Date.now();

describe.skipIf(!HAS_DB)("clearDefaultKinds (real Postgres)", () => {
  let tenantId: number;
  let otherTenantId: number;

  /** Insert a plain (non-pack) template holding `defaultForKinds`. */
  async function seedTemplate(name: string, defaultForKinds: string[], forTenant?: number) {
    const [row] = await D.db
      .insert(D.cardTemplatesTable)
      .values({
        tenantId: forTenant ?? tenantId,
        name,
        cardKinds: [],
        source: "background",
        defaultForKinds,
      })
      .returning();
    return row;
  }

  const kindsOf = async (id: number) => {
    const [row] = await D.db
      .select({ k: D.cardTemplatesTable.defaultForKinds })
      .from(D.cardTemplatesTable)
      .where(eq(D.cardTemplatesTable.id, id));
    return row?.k ?? [];
  };

  /** Run the helper the way the routes do — inside a transaction. */
  const clear = (kinds: string[], exceptId?: number) =>
    D.db.transaction((tx) => H.clearDefaultKinds(tx, tenantId, kinds, exceptId));

  beforeAll(async () => {
    const [t] = await D.db
      .insert(D.tenantsTable)
      .values({
        slug: `cleardefaults-${STAMP}`,
        centralClubId: 996,
        appClubId: null,
        name: "Clear Defaults Test Tenant",
        plan: "pilot",
      })
      .returning();
    tenantId = t.id;

    const [o] = await D.db
      .insert(D.tenantsTable)
      .values({
        slug: `cleardefaults-other-${STAMP}`,
        centralClubId: 995,
        appClubId: null,
        name: "Clear Defaults Bystander",
        plan: "pilot",
      })
      .returning();
    otherTenantId = o.id;
  });

  beforeEach(async () => {
    for (const id of [tenantId, otherTenantId]) {
      await D.db.delete(D.cardTemplatesTable).where(eq(D.cardTemplatesTable.tenantId, id));
    }
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      if (!id) continue;
      await D.db.delete(D.cardTemplatesTable).where(eq(D.cardTemplatesTable.tenantId, id));
      await D.db.delete(D.tenantsTable).where(eq(D.tenantsTable.id, id));
    }
  });

  it("strips a SINGLE claimed kind from the previous owner", async () => {
    // The exact shape a per-kind selector click produces. Pre-fix this raised
    // `cannot cast type text to text[]` and the route 500'd.
    const prev = await seedTemplate("Previous owner", ["century", "record"]);

    await clear(["century"]);

    expect(await kindsOf(prev.id)).toEqual(["record"]);
  });

  it("strips MANY claimed kinds at once", async () => {
    // The "Use for all card types" path. Two or more kinds rendered
    // `($1, $2, …)::text[]`, which is a syntax error rather than a bad cast —
    // a different failure from the single-kind case, hence its own test.
    const prev = await seedTemplate("Previous owner", ["century", "record", "debut", "milestone"]);

    await clear(["century", "record", "debut"]);

    expect(await kindsOf(prev.id)).toEqual(["milestone"]);
  });

  it("empties the array rather than nulling it when every kind is taken", async () => {
    // The COALESCE(..., '{}') arm: array_agg over no rows returns NULL, and the
    // column is NOT NULL.
    const prev = await seedTemplate("Loses everything", ["century"]);

    await clear(["century"]);

    expect(await kindsOf(prev.id)).toEqual([]);
  });

  it("leaves the claiming row's own kinds intact via exceptId", async () => {
    const claimant = await seedTemplate("Claimant", ["century"]);
    const other = await seedTemplate("Other", ["century"]);

    await clear(["century"], claimant.id);

    expect(await kindsOf(claimant.id)).toEqual(["century"]);
    expect(await kindsOf(other.id)).toEqual([]);
  });

  it("never touches another tenant's claim on the same kind", async () => {
    const mine = await seedTemplate("Mine", ["century"]);
    const theirs = await seedTemplate("Theirs", ["century"], otherTenantId);

    await clear(["century"]);

    expect(await kindsOf(mine.id)).toEqual([]);
    expect(await kindsOf(theirs.id)).toEqual(["century"]);
  });

  it("is a no-op for an empty kind list", async () => {
    // `arrayOverlaps` throws on an empty array; unguarded that would surface as
    // the same opaque 500 this file exists to prevent.
    const row = await seedTemplate("Untouched", ["century"]);

    await expect(clear([])).resolves.not.toThrow();

    expect(await kindsOf(row.id)).toEqual(["century"]);
  });
});
