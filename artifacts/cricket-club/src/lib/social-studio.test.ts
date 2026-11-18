import { describe, expect, it } from "vitest";
import { CARD_KINDS } from "@/lib/share-card";
import { kindLabel } from "@/lib/social-studio";
import { templateKindLabel } from "@/components/template-library/previews";

describe("card kind labels (Your designs' Card filter)", () => {
  it("names every card kind, retired ones included, never by its internal name", () => {
    for (const kind of CARD_KINDS) {
      const label = kindLabel(kind);
      expect(label, kind).not.toBe(kind);
      expect(label, kind).toMatch(/^[A-Z]/);
    }
    expect(kindLabel("countdown")).toBe("Countdown");
    expect(kindLabel("tradingCard")).toBe("Trading Card");
    expect(kindLabel("gradeLeader")).toBe("Grade Leader");
    expect(kindLabel("matchDay")).toBe("Match Day");
  });

  it("names a carousel set template's kind as its set, not set:<type>", () => {
    expect(templateKindLabel("set:matchDay")).toMatch(/ set$/);
    expect(templateKindLabel("set:matchDay")).not.toContain(":");
    expect(templateKindLabel("tradingCard")).toBe("Trading Card");
  });
});
