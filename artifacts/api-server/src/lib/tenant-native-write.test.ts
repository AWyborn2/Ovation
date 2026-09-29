import { describe, it, expect, afterEach } from "vitest";
import {
  decideNativeStatsWrite,
  assertNativeStatsWriteTenant,
  NativeStatsUnavailableError,
  NATIVE_STATS_TENANT_ID,
} from "./tenant";

/**
 * The native stats write-fence decision (hybrid-stats plan U2 / KTD10), as a
 * pure unit test: `@workspace/db` connects lazily, and the decision itself
 * never touches the database, so this runs without DATABASE_URL. The route
 * coverage lives in `routes/native-write-isolation.test.ts`.
 */

describe("decideNativeStatsWrite", () => {
  const savedKillSwitch = process.env.CENTRAL_READS;
  afterEach(() => {
    if (savedKillSwitch === undefined) delete process.env.CENTRAL_READS;
    else process.env.CENTRAL_READS = savedKillSwitch;
  });

  it("allows Halls Head (tenant 1) while it reads native", () => {
    expect(() => decideNativeStatsWrite(NATIVE_STATS_TENANT_ID, false)).not.toThrow();
  });

  it("fences Halls Head once it reads central (after cut-over)", () => {
    expect(() => decideNativeStatsWrite(NATIVE_STATS_TENANT_ID, true)).toThrow(
      NativeStatsUnavailableError,
    );
  });

  it("keeps a cut-over Halls Head fenced even with the CENTRAL_READS=0 kill-switch", () => {
    process.env.CENTRAL_READS = "0";
    expect(() => decideNativeStatsWrite(NATIVE_STATS_TENANT_ID, true)).toThrow(
      NativeStatsUnavailableError,
    );
  });

  it("fences every other tenant, however it is configured", () => {
    for (const readsFromCentral of [true, false]) {
      let err: unknown;
      try {
        decideNativeStatsWrite(2, readsFromCentral);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(NativeStatsUnavailableError);
      expect((err as NativeStatsUnavailableError).status).toBe(409);
      expect((err as NativeStatsUnavailableError).tenantId).toBe(2);
      expect((err as Error).message).toMatch(/cannot write the native stats tables/);
    }
  });

  it("refuses a non-Halls-Head tenant id without looking up its config", async () => {
    // No DATABASE_URL is needed: the refusal happens before any tenant lookup.
    await expect(assertNativeStatsWriteTenant(42)).rejects.toBeInstanceOf(
      NativeStatsUnavailableError,
    );
  });

  it("keeps the read-side error message unchanged by default", () => {
    expect(new NativeStatsUnavailableError(3).message).toMatch(/Set reads_from_central = true/);
  });
});
