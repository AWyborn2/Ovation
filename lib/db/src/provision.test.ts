// @ts-nocheck — `@workspace/db` deliberately carries no vitest devDependency
// (it is a leaf lib; the workspace's test runner lives in the api-server
// package). Run this suite with the api-server's vitest install, e.g. from
// lib/db:  node ../../artifacts/api-server/node_modules/vitest/vitest.mjs run
// Both the central DB and the tenant DB are fully mocked below, so neither
// CENTRAL_DATABASE_URL nor DATABASE_URL is needed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** FIFO of result sets the mocked centralDb.select() query resolves to. */
const queuedCentralResults: unknown[][] = [];

vi.mock("./central", async () => {
  const schema = await vi.importActual("./central-schema");
  const makeBuilder = () => {
    const builder = {
      from() {
        return builder;
      },
      where() {
        return builder;
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve(queuedCentralResults.shift() ?? []).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return builder;
  };
  return {
    ...schema,
    centralDb: { select: () => makeBuilder() },
  };
});

// provisionTenant's folded-club rejection happens in resolveCentralClub, before
// any tenant-DB read/write — this mock only needs to make the module load.
vi.mock("./index", () => ({ db: {} }));

import { provisionTenant, ProvisionError } from "./provision";
import { isCentralClubProvisionable } from "./central-schema/clubs";

beforeEach(() => {
  queuedCentralResults.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isCentralClubProvisionable", () => {
  it("is true for a club with no activeTo", () => {
    expect(isCentralClubProvisionable({ activeTo: null })).toBe(true);
  });

  it("is false once activeTo is set (folded or renamed/merged)", () => {
    expect(isCentralClubProvisionable({ activeTo: "2019-06-30" })).toBe(false);
  });
});

describe("provisionTenant: folded-club guard", () => {
  it("rejects a club with activeTo set, before touching the tenant DB", async () => {
    queuedCentralResults.push([
      { clubId: 42, name: "Coastal Districts Cricket Club", activeTo: "2019-06-30" },
    ]);

    await expect(
      provisionTenant({ slug: "coastal", centralClubId: 42, mode: "create" }),
    ).rejects.toMatchObject({
      code: "club_folded",
      message: expect.stringContaining("Coastal Districts"),
    });
  });

  it("still throws club_folded when the tenant DB mock has no query methods wired", async () => {
    // Regression guard on the "no tenant-db touch before the guard" ordering:
    // the ./index mock above exports only `db: {}` with no select/insert
    // methods, so any attempt to query it before the guard would throw a
    // TypeError, not a ProvisionError — this proves the guard runs first.
    queuedCentralResults.push([{ clubId: 7, name: "Folded FC", activeTo: "2001-01-01" }]);
    let caught: unknown;
    try {
      await provisionTenant({ slug: "folded", centralClubId: 7, mode: "create" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProvisionError);
    expect((caught as ProvisionError).code).toBe("club_folded");
  });
});
