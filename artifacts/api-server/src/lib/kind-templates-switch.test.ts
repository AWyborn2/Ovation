import { afterEach, describe, expect, it } from "vitest";
import { kindTemplatesEnabled } from "./kind-templates-switch";

const ORIGINAL = process.env.KIND_TEMPLATES;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.KIND_TEMPLATES;
  else process.env.KIND_TEMPLATES = ORIGINAL;
});

describe("kindTemplatesEnabled (KTD18)", () => {
  it("is off for everyone when unset or empty", () => {
    delete process.env.KIND_TEMPLATES;
    expect(kindTemplatesEnabled(1)).toBe(false);
    process.env.KIND_TEMPLATES = "";
    expect(kindTemplatesEnabled(1)).toBe(false);
  });

  it('is on for every tenant with "all"', () => {
    process.env.KIND_TEMPLATES = "all";
    expect(kindTemplatesEnabled(1)).toBe(true);
    expect(kindTemplatesEnabled(42)).toBe(true);
  });

  it("is on only for listed tenants", () => {
    process.env.KIND_TEMPLATES = "1, 7";
    expect(kindTemplatesEnabled(1)).toBe(true);
    expect(kindTemplatesEnabled(7)).toBe(true);
    expect(kindTemplatesEnabled(2)).toBe(false);
  });

  it("ignores junk entries", () => {
    process.env.KIND_TEMPLATES = "x,,3";
    expect(kindTemplatesEnabled(3)).toBe(true);
    expect(kindTemplatesEnabled(0)).toBe(false);
  });
});

describe("boot check for KIND_TEMPLATES", () => {
  it("accepts every value the switch reads, and rejects junk", async () => {
    const { validateConfigAtBoot } = await import("../config");
    // Only this variable's verdict matters; others may be unset in tests.
    const boots = (v: string) => {
      try {
        validateConfigAtBoot({ ...process.env, KIND_TEMPLATES: v });
        return true;
      } catch (e) {
        return !String((e as Error).message).includes("KIND_TEMPLATES");
      }
    };
    for (const ok of ["all", "1", "1,7", "1, 7", "1, 7,", " 3 "]) expect(boots(ok), ok).toBe(true);
    for (const bad of ["yes", "1;7", "tenant-1"]) expect(boots(bad), bad).toBe(false);
  });
});
