import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** FIFO of result sets the mocked centralDb.select() query resolves to. */
const queuedCentralResults: unknown[][] = [];
/** FIFO of result sets the mocked tenant db.select() query resolves to. */
const queuedTenantResults: unknown[][] = [];

function makeSelectBuilder(queue: unknown[][]) {
  const builder = {
    from() {
      return builder;
    },
    where() {
      return builder;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(queue.shift() ?? []).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock("./central", async () => {
  const schema = await vi.importActual("./central-schema");
  return {
    ...schema,
    centralDb: { select: () => makeSelectBuilder(queuedCentralResults) },
  };
});

// provisionTenant's folded-club and exclusion checks happen in resolveCentralClub,
// before any tenant-DB write — only `select` needs mocking for those guards.
vi.mock("./index", () => ({
  db: { select: () => makeSelectBuilder(queuedTenantResults) },
}));

import { provisionTenant, ProvisionError } from "./provision";
import { isCentralClubProvisionable } from "./central-schema/clubs";

beforeEach(() => {
  queuedCentralResults.length = 0;
  queuedTenantResults.length = 0;
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

  it("rejects before ever consulting the exclusion table", async () => {
    // Regression guard on check ordering: the folded-club check runs before
    // the exclusion-table lookup, so a folded club's queued tenant-db result
    // (left empty here) is never consumed -- if the ordering flipped, this
    // test's assertions below would still pass since both throw ProvisionError,
    // so the real proof is queuedTenantResults staying untouched (asserted below).
    queuedCentralResults.push([{ clubId: 7, name: "Folded FC", activeTo: "2001-01-01" }]);
    const sentinel = [{ visibility: "everywhere" }];
    queuedTenantResults.push(sentinel);

    let caught: unknown;
    try {
      await provisionTenant({ slug: "folded", centralClubId: 7, mode: "create" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProvisionError);
    expect((caught as ProvisionError).code).toBe("club_folded");
    // The exclusion-table select was never issued -- the sentinel is still queued.
    expect(queuedTenantResults).toEqual([sentinel]);
  });
});

describe("provisionTenant: exclusion guard", () => {
  const club = { clubId: 55, name: "Curtin Victoria Park Cricket Club", activeTo: null };

  it("self-serve context rejects an 'everywhere' exclusion", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "everywhere" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create", context: "self-serve" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("self-serve context rejects a 'self_serve_only' exclusion", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "self_serve_only" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create", context: "self-serve" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("concierge context rejects an 'everywhere' exclusion", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "everywhere" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create", context: "concierge" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("concierge context allows a 'self_serve_only' exclusion through to the tenant insert", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "self_serve_only" }]);
    // resolveCentralClub resolves successfully past the guard; the call then
    // reaches the real tenant-insert path, which this mock deliberately leaves
    // unstubbed (db.insert is undefined). The resulting TypeError -- not a
    // club_excluded ProvisionError -- is the proof the guard let it through.
    let caught: unknown;
    try {
      await provisionTenant({
        slug: "curtin",
        centralClubId: 55,
        mode: "create",
        context: "concierge",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(ProvisionError);
  });

  it("defaults to the restrictive 'self-serve' context when none is passed", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "self_serve_only" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("provisions normally when the club has no exclusion row (regression guard)", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([]); // no exclusion row found
    let caught: unknown;
    try {
      await provisionTenant({
        slug: "curtin",
        centralClubId: 55,
        mode: "create",
        context: "self-serve",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(ProvisionError);
  });
});
