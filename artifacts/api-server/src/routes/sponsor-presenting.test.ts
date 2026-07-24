import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
// Import via the `./schema` entrypoint (NOT `@workspace/db`) so the DB pool
// module — which throws without DATABASE_URL — is never loaded. This keeps the
// suite a pure, DB-free schema/contract round-trip.
import { sponsorsTable } from "@workspace/db/schema";
import {
  CreateSponsorBody,
  UpdateSponsorBody,
  ListSponsorsResponseItem,
} from "@workspace/api-zod";

/**
 * A7 — presenting-sponsor designation: schema + OpenAPI contract round-trip.
 *
 * DB-free: asserts the Drizzle `sponsors` table carries the tenant-scoped
 * `is_presenting` flag with the "at most one per tenant" partial unique index,
 * and that the generated Zod bodies (from openapi.yaml) round-trip the flag.
 * The route's transactional unset (verified against a live DB in the isolation
 * suites) plus this index together enforce the one-presenting invariant.
 */
describe("A7 sponsors.is_presenting — schema + contract round-trip", () => {
  const config = getTableConfig(sponsorsTable);

  it("adds a tenant-scoped is_presenting boolean column, default false, not null", () => {
    const col = config.columns.find((c) => c.name === "is_presenting");
    expect(col, "is_presenting column present").toBeTruthy();
    expect(col?.notNull).toBe(true);
    expect(col?.hasDefault).toBe(true);
    expect(col?.default).toBe(false);
  });

  it("enforces at most one presenting sponsor per tenant via a partial unique index", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "sponsors_one_presenting_per_tenant",
    );
    expect(idx, "partial unique index present").toBeTruthy();
    expect(idx?.config.unique).toBe(true);
    // Scoped to tenant_id, partial on is_presenting.
    const cols = (idx?.config.columns ?? []).map((c) =>
      typeof c === "object" && c !== null && "name" in c ? (c as { name: string }).name : "",
    );
    expect(cols).toContain("tenant_id");
    expect(idx?.config.where, "index is partial (WHERE is_presenting)").toBeTruthy();
  });

  it("round-trips isPresenting through the create / update / response Zod schemas", () => {
    // Create accepts the flag and it survives parsing.
    const created = CreateSponsorBody.parse({
      name: "Acme Motors",
      logoUrl: "https://cdn.example.com/acme.png",
      isPresenting: true,
    });
    expect(created.isPresenting).toBe(true);

    // Update accepts it too (used by the admin toggle).
    const updated = UpdateSponsorBody.parse({ isPresenting: false });
    expect(updated.isPresenting).toBe(false);

    // The flag is optional on input — omitting it is valid (defaults to false server-side).
    expect(CreateSponsorBody.parse({ name: "No Flag", logoUrl: "x" }).isPresenting).toBeUndefined();

    // The response item REQUIRES isPresenting (always materialised from the row).
    const resp = ListSponsorsResponseItem.parse({
      id: 1,
      name: "Acme Motors",
      logoUrl: "https://cdn.example.com/acme.png",
      link: "",
      cardKinds: [],
      isPresenting: true,
      displayOrder: 0,
    });
    expect(resp.isPresenting).toBe(true);
    expect(() =>
      ListSponsorsResponseItem.parse({
        id: 1,
        name: "Missing Flag",
        logoUrl: "x",
        link: "",
        cardKinds: [],
        displayOrder: 0,
      }),
    ).toThrow();
  });
});
