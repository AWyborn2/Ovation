import { describe, it, expect } from "vitest";
import { cardBaseFilename } from "./share-card";

/**
 * Phase 4 U1 brand-leak regression: exported card filenames must be derived
 * from the tenant's own brand, never a hardcoded "hhcc-" prefix.
 */
describe("cardBaseFilename: brand-leak regression (Phase 4 U1)", () => {
  const input = {
    kind: "milestone" as const,
    playerName: "Test Player",
    tierLabel: "100 Runs",
    tierIndex: 1,
    milestoneLabel: "100 runs",
    currentValue: 100,
  };

  it("never hardcodes the hhcc- prefix for a non-Halls-Head tenant", () => {
    const filename = cardBaseFilename(input, { name: "Demo Cricket Club", shortName: "DCC" });
    expect(filename).not.toMatch(/^hhcc-/);
    expect(filename.startsWith("dcc-")).toBe(true);
  });

  it("falls back to a generic prefix (never hhcc-) when no brand is available", () => {
    const filename = cardBaseFilename(input, null);
    expect(filename).not.toMatch(/^hhcc-/);
    expect(filename.startsWith("card-")).toBe(true);
  });
});
