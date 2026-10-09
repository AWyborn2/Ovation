import { describe, expect, it } from "vitest";
import {
  CLUB_KIT_ONLY_KINDS,
  KIND_FIELDS,
  TEMPLATE_CARD_KINDS,
  kindFields,
  kindHasRepeat,
  kindTokenKeys,
} from "./fields";

describe("kind field catalogue", () => {
  it("covers all 21 card kinds", () => {
    expect(TEMPLATE_CARD_KINDS).toHaveLength(21);
    expect(Object.keys(KIND_FIELDS).sort()).toEqual([...TEMPLATE_CARD_KINDS].sort());
  });

  it("gives every kind at least one text field", () => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      expect(KIND_FIELDS[kind].fields.length, kind).toBeGreaterThan(0);
    }
  });

  it("takes the three Club-Kit-only kinds from Club Kit", () => {
    expect([...CLUB_KIT_ONLY_KINDS].sort()).toEqual([
      "juniorHighlights",
      "roundFixtures",
      "tradingCard",
    ]);
    for (const kind of CLUB_KIT_ONLY_KINDS) expect(KIND_FIELDS[kind].source).toBe("club-kit-v1");
  });

  it("exposes list kinds' repeats with their row fields", () => {
    expect(kindHasRepeat("ladder", "rows")).toBe(true);
    expect(kindFields("ladder")!.repeats[0].fields.map((f) => f.key)).toContain("team");
    expect(kindFields("ladder")!.repeats[0].variants).toContain("club");
    expect(kindHasRepeat("clubLeaderboard", "leaders")).toBe(true);
    expect(kindHasRepeat("weekendWrap", "matches")).toBe(true);
    expect(kindHasRepeat("milestone", "rows")).toBe(false);
  });

  it("returns token keys for a kind and nothing for an unknown kind", () => {
    expect(kindTokenKeys("milestone").has("playerName")).toBe(true);
    expect(kindFields("notAKind")).toBeNull();
    expect(kindTokenKeys("notAKind").size).toBe(0);
  });
});
