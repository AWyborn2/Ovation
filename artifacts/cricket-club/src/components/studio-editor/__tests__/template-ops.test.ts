/**
 * Card kind templates U8 — template-mode document operations: per-size
 * presence, add to other sizes, remove from a size, text style, field
 * tokens, the key field and the save rule.
 */
import { describe, it, expect } from "vitest";
import type { FreeLayer } from "@/lib/pack-render";
import {
  renderPackCard,
  resolvePackTokens,
  brandDefaultTokens,
  BLANK_PACK_ID,
} from "@/lib/pack-render";
import { buildPackData } from "@/lib/pack-card-data";
import type { EditorDoc } from "../document";
import {
  addToOtherSizes,
  CLUB_LOGO_TOKEN,
  insertToken,
  layersOnSize,
  logoLayer,
  onlyOnSize,
  removeFromSize,
  saveBlockers,
  setTextStyle,
  showsKeyField,
  starterExport,
} from "../template-ops";

const text = (id: string, over: Partial<FreeLayer> = {}): FreeLayer => ({
  id,
  kind: "text",
  content: "Hello",
  geometry: { square: { x: 10, y: 10, w: 40, h: 20 } },
  ...over,
});

describe("template-mode document ops", () => {
  it("a new element lands on the edited size only", () => {
    const l = onlyOnSize(
      text("a", {
        geometry: { square: { x: 1, y: 1, w: 2, h: 2 }, story: { x: 0, y: 0, w: 9, h: 9 } },
      }),
      "square",
    );
    expect(l.sizes).toEqual(["square"]);
    expect(Object.keys(l.geometry)).toEqual(["square"]);
    const doc: EditorDoc = { layers: [l] };
    expect(layersOnSize(doc, "square")).toHaveLength(1);
    expect(layersOnSize(doc, "story")).toHaveLength(0);
  });

  it("add to other sizes puts it everywhere, placed per size (KTD16)", () => {
    const doc: EditorDoc = { layers: [onlyOnSize(text("a"), "square")] };
    const next = addToOtherSizes(doc, ["a"], "square");
    const a = next.layers![0];
    expect(a.sizes).toBeUndefined();
    expect(Object.keys(a.geometry).sort()).toEqual(["landscape", "portrait", "square", "story"]);
    // The same centre on a taller canvas.
    const story = a.geometry.story!;
    expect(story.x + story.w / 2).toBeCloseTo(30);
  });

  it("remove from a size keeps the others, and deletes from the last one", () => {
    const doc = addToOtherSizes({ layers: [onlyOnSize(text("a"), "square")] }, ["a"], "square");
    const off = removeFromSize(doc, ["a"], "story");
    expect(off.layers![0].sizes).toEqual(["square", "portrait", "landscape"]);
    expect(off.layers![0].geometry.story).toBeUndefined();
    const solo: EditorDoc = { layers: [onlyOnSize(text("b"), "square")] };
    expect(removeFromSize(solo, ["b"], "square").layers).toEqual([]);
  });

  it("a locked element isn't removed", () => {
    const doc: EditorDoc = { layers: [text("a", { locked: true })] };
    expect(removeFromSize(doc, ["a"], "square").layers).toHaveLength(1);
  });

  it("merges text style and clears a value set to undefined", () => {
    const doc: EditorDoc = { layers: [text("a", { style: { fontSize: 5, letterSpacing: 0.1 } })] };
    const next = setTextStyle(doc, "a", { fontWeight: 900, letterSpacing: undefined });
    expect(next.layers![0].style).toEqual({ fontSize: 5, fontWeight: 900 });
  });

  it("inserts a field token at the caret, or appends it", () => {
    expect(insertToken("Runs: ", "runs")).toBe("Runs: {{runs}}");
    expect(insertToken("Runs", "runs")).toBe("Runs {{runs}}");
    expect(insertToken("ab", "x", 1)).toBe("a{{x}}b");
  });

  it("knows when the kind's key field is gone", () => {
    expect(showsKeyField({ layers: [text("a", { content: "{{playerName}}" })] }, "century")).toBe(
      true,
    );
    expect(showsKeyField({ layers: [text("a")] }, "century")).toBe(false);
    expect(
      showsKeyField(
        {
          layers: [text("r", { kind: "rows", rows: { repeat: "rows", rowHeight: 7, cells: [] } })],
        },
        "ladder",
      ),
    ).toBe(true);
  });

  it("blocks saving while a size is empty, naming it (KTD15)", () => {
    expect(
      saveBlockers({ layers: [text("a", { sizes: ["square", "portrait", "landscape"] })] }),
    ).toEqual(["Story has no elements. Add at least one before saving."]);
    expect(saveBlockers({ layers: [text("a")] })).toEqual([]);
  });

  it("the club logo resolves from the club's brand, never a fixed URL", () => {
    const layer = logoLayer("square");
    expect(layer.content).toBe(CLUB_LOGO_TOKEN);
    const brand = { name: "Seaview", logoUrl: "https://example.test/seaview.png" };
    const data = buildPackData({ brand, hashtag: "#S", sponsors: [] });
    const tokens = resolvePackTokens({
      brand: brandDefaultTokens(brand),
      theme: null,
      junior: false,
    });
    const html = renderPackCard(
      { kind: "century", playerName: "Sam", runs: 104 } as never,
      "square",
      true,
      tokens,
      false,
      data,
      BLANK_PACK_ID,
      { layers: [layer] },
    );
    expect(html).toContain("https://example.test/seaview.png");
    expect(html).not.toContain("{{clubLogo}}");
  });
});

describe("starterExport (T6.2)", () => {
  it("writes the layers without edit stamps, locks or hidden layers", () => {
    const out = JSON.parse(
      starterExport({
        layers: [text("a", { editedAt: { square: 5 }, locked: true }), text("b", { hidden: true })],
        fields: { x: "y" },
      }),
    );
    expect(out).toEqual({
      layers: [{ id: "a", kind: "text", content: "Hello", geometry: text("a").geometry }],
    });
  });
});
