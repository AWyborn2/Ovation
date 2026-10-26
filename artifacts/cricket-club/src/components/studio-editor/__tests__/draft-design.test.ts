/** The full draft editor's helpers (full draft editor plan, stage 1). */
import { describe, expect, it } from "vitest";
import { withRootLayersOnPage } from "@/lib/draft-design";
import { contentLabel } from "../layers-drawer";

describe("withRootLayersOnPage", () => {
  it("moves layers the old editor put at a v2 design's root onto its primary page", () => {
    const doc = {
      formatVersion: 2,
      layers: [{ id: "added" }],
      pages: { fixture: { layers: [{ id: "t1" }] } },
    };
    expect(withRootLayersOnPage(doc, "matchDay")).toEqual({
      formatVersion: 2,
      pages: { fixture: { layers: [{ id: "t1" }, { id: "added" }] } },
    });
  });

  it("leaves a v1 design, or a v2 design with nothing at its root, as it is", () => {
    const v1 = { layers: [{ id: "a" }] };
    expect(withRootLayersOnPage(v1, "player")).toBe(v1);
    const v2 = { formatVersion: 2, pages: { card: { layers: [] } } };
    expect(withRootLayersOnPage(v2, "player")).toBe(v2);
    expect(withRootLayersOnPage(null, "player")).toEqual({});
  });
});

describe("contentLabel", () => {
  it("reads live fields by their label, else by their key", () => {
    expect(contentLabel("{{opposition.name}}", { "opposition.name": "Opposition name" })).toBe(
      "Opposition name",
    );
    expect(contentLabel("{{startTime}} · {{venue}}")).toBe("Start time · Venue");
    expect(contentLabel("SUPPORTED BY")).toBe("SUPPORTED BY");
  });
});
