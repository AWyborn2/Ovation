/**
 * The server names templates with `CARD_KIND_LABELS` (retest 4: never
 * "tradingCard template"); the web's card kind picker and `kindLabel` must
 * read the same names, so the two can't drift.
 */
import { describe, expect, it } from "vitest";
import { CARD_KIND_LABELS } from "@workspace/scorecard/kind-templates";
import { CARD_KIND_OPTIONS } from "@/components/card-kind-picker";
import { kindLabel } from "@/lib/social-studio";

describe("card kind labels", () => {
  it("match the server's for every kind the picker offers", () => {
    for (const { value, label } of CARD_KIND_OPTIONS)
      expect(CARD_KIND_LABELS[value], value).toBe(label);
  });

  it("name the retired kinds the same way", () => {
    for (const kind of ["gradeLeader", "countdown", "tradingCard"])
      expect(kindLabel(kind)).toBe(CARD_KIND_LABELS[kind]);
  });
});
