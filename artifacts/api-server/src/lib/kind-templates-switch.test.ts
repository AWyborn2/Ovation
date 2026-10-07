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
