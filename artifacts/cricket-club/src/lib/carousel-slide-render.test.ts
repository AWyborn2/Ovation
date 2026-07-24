import { describe, it, expect } from "vitest";
import type { CardLayoutLayer } from "@workspace/api-client-react";
import { slideRendersViaPack } from "./carousel-slide-render";
import { packSupportsKind } from "./pack-render";

/**
 * C2 — carousel slides render through the selected pack.
 *
 * These tests pin the render-path decision each carousel slide takes: a
 * pack-supported kind flows through the Broadcast Dark pack (matching the
 * single-card modal, so it gets the tenant logo + sponsors), while a kind the
 * pack can't render — or a slide the admin has given a custom layout — stays on
 * the legacy canvas renderer.
 */

// The three kinds the carousel's own source pickers can produce (Match, Player,
// Grade leader). All are covered by the pack, so every default carousel slide
// routes through it.
const CAROUSEL_KINDS = ["matchSummary", "player", "gradeLeader"] as const;

// A minimal saved layout layer — its mere presence marks the slide as
// admin-customised (a canvas-only feature the pack can't reproduce).
const SOME_LAYOUT: CardLayoutLayer[] = [
  { id: "scorecard", kind: "element", x: 0.1 } as unknown as CardLayoutLayer,
];

describe("slideRendersViaPack", () => {
  it("routes a supported kind with no custom layout through the pack", () => {
    for (const kind of CAROUSEL_KINDS) {
      expect(packSupportsKind(kind)).toBe(true); // guard the fixture
      expect(slideRendersViaPack(kind)).toBe(true);
      expect(slideRendersViaPack(kind, [])).toBe(true);
      expect(slideRendersViaPack(kind, null)).toBe(true);
    }
  });

  it("keeps a supported kind on the canvas when it has a custom layout", () => {
    // Honours per-slide layout: the admin's layer edits win over pack routing.
    for (const kind of CAROUSEL_KINDS) {
      expect(slideRendersViaPack(kind, SOME_LAYOUT)).toBe(false);
    }
  });

  it("keeps an unsupported kind on the canvas", () => {
    expect(packSupportsKind("totallyUnknownKind")).toBe(false); // guard
    expect(slideRendersViaPack("totallyUnknownKind")).toBe(false);
    expect(slideRendersViaPack("totallyUnknownKind", [])).toBe(false);
  });

  it("matches the single-card modal's pack predicate for layout-free slides", () => {
    // The modal treats a card as a pack card iff `packSupportsKind(kind)` (no BYO
    // template). A carousel slide with no custom layout must make the identical
    // decision, so both paths export the same design — this is the export parity
    // guarantee with the single-card path.
    for (const kind of [...CAROUSEL_KINDS, "premiership", "ladder", "teamList"]) {
      expect(slideRendersViaPack(kind)).toBe(packSupportsKind(kind));
    }
  });
});
