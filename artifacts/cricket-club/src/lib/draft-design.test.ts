/**
 * Round 3 retest follow-up: the card editor opens a century design in its
 * innings' wording, so a junior 52 shows "FIFTY" on the canvas as it does in
 * previews and posts.
 */
import { describe, expect, it } from "vitest";
import type { ShareCardInput } from "@/lib/share-card";
import { draftEditorDocument } from "./draft-design";

const design = {
  formatVersion: 2,
  pages: { card: { layers: [{ id: "t", kind: "text", content: "CENTURY" }] } },
};
const text = (doc: unknown) =>
  (doc as { pages: { card: { layers: Array<{ content: string }> } } }).pages.card.layers[0]!
    .content;

describe("draftEditorDocument", () => {
  it("opens a 50 to 99 century card reading FIFTY", () => {
    const input = { kind: "century", runs: 52 } as unknown as ShareCardInput;
    expect(text(draftEditorDocument(design, input))).toBe("FIFTY");
  });

  it("leaves a real century, and any other card, as designed", () => {
    expect(text(draftEditorDocument(design, { kind: "century", runs: 104 } as never))).toBe(
      "CENTURY",
    );
    expect(text(draftEditorDocument(design, { kind: "milestone" } as never))).toBe("CENTURY");
  });
});
