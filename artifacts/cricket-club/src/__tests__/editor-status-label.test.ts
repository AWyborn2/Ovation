/**
 * The editors' status label (New Studio, Ash's decision, Nov 2026): a hand-made
 * design not yet reviewed reads "Draft, not yet reviewed". A label only.
 */
import { describe, expect, it } from "vitest";
import { editorStatusLabel } from "@/components/social-queue/draft-meta";

describe("editorStatusLabel", () => {
  it("calls a hand-made design awaiting review a draft, with New Studio on", () => {
    expect(editorStatusLabel({ status: "awaiting_review", engine: "adhoc" }, true)).toBe(
      "Draft, not yet reviewed",
    );
    expect(editorStatusLabel({ status: "awaiting_review", engine: "ondemand" }, true)).toBe(
      "Draft, not yet reviewed",
    );
  });

  it("keeps the status's own label otherwise", () => {
    expect(editorStatusLabel({ status: "awaiting_review", engine: "adhoc" }, false)).toBe(
      "Awaiting review",
    );
    expect(editorStatusLabel({ status: "awaiting_review", engine: "matchday" }, true)).toBe(
      "Awaiting review",
    );
    expect(editorStatusLabel({ status: "ready", engine: "adhoc" }, true)).toBe("Ready");
  });
});
