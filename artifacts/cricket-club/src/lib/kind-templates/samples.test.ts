import { describe, expect, it } from "vitest";
import { CARD_KINDS, type ShareCardInput } from "@/lib/share-card";
import { previewSample, STRESS_NAME, STRESS_ROWS, stressSample } from "./samples";

describe("template preview samples (KTD17)", () => {
  it("has a preview sample for every kind", () => {
    for (const kind of CARD_KINDS) expect(previewSample(kind).kind).toBe(kind);
  });

  it("stresses names", () => {
    const s = stressSample("milestone") as Extract<ShareCardInput, { kind: "milestone" }>;
    expect(s.playerName).toBe(STRESS_NAME);
    expect(STRESS_NAME.length).toBeGreaterThan(25);
  });

  it("empties optional lines", () => {
    const s = stressSample("milestone") as Extract<ShareCardInput, { kind: "milestone" }>;
    expect(s.headline).toBe("");
  });

  it("grows a list kind to nine rows with renumbered positions", () => {
    const s = stressSample("ladder") as Extract<ShareCardInput, { kind: "ladder" }>;
    expect(s.rows).toHaveLength(STRESS_ROWS);
    expect(s.rows.map((r) => r.pos)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.rows.filter((r) => r.isClub).length).toBeLessThanOrEqual(1);
  });

  it("never mutates the shared sample", () => {
    const before = JSON.stringify(previewSample("ladder"));
    stressSample("ladder");
    expect(JSON.stringify(previewSample("ladder"))).toBe(before);
  });
});
