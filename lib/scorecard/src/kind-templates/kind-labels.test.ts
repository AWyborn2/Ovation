import { describe, expect, it } from "vitest";
import {
  bundleTemplateName,
  CARD_KIND_LABELS,
  fallbackTemplateName,
  KIND_KEY_IN_NAME,
  kindDisplayLabel,
  templateDisplayName,
} from "./kind-labels";

describe("template kind labels (dev retest 4)", () => {
  it("names a club's first template by its kind's label, not its key", () => {
    expect(fallbackTemplateName("tradingCard")).toBe("Trading Card template");
    expect(fallbackTemplateName("teamOfWeek")).toBe("Team of the Week template");
    expect(fallbackTemplateName("set:teamLists")).toBe("Team lists set template");
  });

  it("falls back to the raw kind only for one nothing names", () => {
    expect(kindDisplayLabel("someFutureKind")).toBe("someFutureKind");
  });

  it("shows a template named from the kind key under its label, and any other name as it is", () => {
    expect(templateDisplayName("tradingCard template", "tradingCard")).toBe(
      "Trading Card template",
    );
    expect(templateDisplayName("Our trading card", "tradingCard")).toBe("Our trading card");
    expect(templateDisplayName("Club Kit Match Day", "matchDay")).toBe("Club Kit Match Day");
    expect(templateDisplayName("Matchday special", "matchDay")).toBe("Matchday special");
  });

  it("reads a stored legacy '<Look> <kind key>' name with the kind's label (retest 5, I)", () => {
    expect(templateDisplayName("Bold Type teamList", "teamList")).toBe("Bold Type Team List");
    expect(templateDisplayName("Broadcast Dark matchSummary", "matchSummary")).toBe(
      "Broadcast Dark Match Summary",
    );
    expect(templateDisplayName("Bold Type teamList (copy)", "teamList")).toBe(
      "Bold Type Team List (copy)",
    );
    // A lower-case key reads as a label only after the look's own name.
    expect(templateDisplayName("Bold Type player", "player", "Bold Type")).toBe("Bold Type Player");
    expect(templateDisplayName("Bold Type players", "player", "Bold Type")).toBe(
      "Bold Type players",
    );
    expect(templateDisplayName("Our player card", "player")).toBe("Our player card");
    // A longer key is never read as a shorter one inside it.
    expect(templateDisplayName("Duotone teamListRound", "teamListRound")).toBe(
      "Duotone Round Team Lists",
    );
    for (const kind of Object.keys(CARD_KIND_LABELS)) {
      for (const name of [`Bold Type ${kind}`, `${kind} template`, `Bold Type ${kind} (copy)`]) {
        const shown = templateDisplayName(name, kind, "Bold Type");
        expect(shown, name).not.toMatch(KIND_KEY_IN_NAME);
        expect(shown, name).toContain(CARD_KIND_LABELS[kind]!);
      }
    }
  });

  it("names a bundle's '<Look> <kind>' template with the kind's label", () => {
    expect(bundleTemplateName("Club Kit tradingCard", "Club Kit", "tradingCard")).toBe(
      "Club Kit Trading Card",
    );
    expect(bundleTemplateName("Bold Type matchDay", "Bold Type", "matchDay")).toBe(
      "Bold Type Match Day",
    );
    expect(bundleTemplateName("Other milestone", "Club Kit", "milestone")).toBe("Other milestone");
    expect(bundleTemplateName("Club Kit match day set", "Club Kit", "set:matchDay")).toBe(
      "Club Kit match day set",
    );
  });
});
