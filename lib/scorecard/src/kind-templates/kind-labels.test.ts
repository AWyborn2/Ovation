import { describe, expect, it } from "vitest";
import {
  bundleTemplateName,
  fallbackTemplateName,
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
