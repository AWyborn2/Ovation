import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATES } from "./social-cards";

describe("social-cards: DEFAULT_TEMPLATES brand-leak regression (Phase 4 U1)", () => {
  it("seeds no tenant-specific club nickname into a fresh tenant's default caption templates", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.template).not.toContain("Hammers");
      expect(t.template).not.toContain("Halls Head");
      expect(t.template).not.toContain("HHCC");
    }
  });
});
