/**
 * Social Studio U15 — card adjustments applied over a pack template (KTD12).
 */
import { describe, it, expect } from "vitest";
import { renderPackCard, resolvePackTokens, brandDefaultTokens } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import {
  inheritedFormats,
  isEmptyAdjustments,
  renderFreeLayers,
  resolveGeometry,
  type CardAdjustments,
  type FreeLayer,
} from "./adjustments";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });
const player: ShareCardInput = {
  kind: "player",
  playerName: "Sam Keeper",
  headline: "Player of the round",
  stats: [
    { label: "Runs", value: "104" },
    { label: "Balls", value: "88" },
  ],
  photoUrl: "https://example.test/sam.jpg",
} as ShareCardInput;

const render = (adj?: CardAdjustments | null, size: "square" | "story" | "landscape" = "square") =>
  renderPackCard(player, size, true, tokens, false, null, "broadcast-dark", adj);

const layer = (over: Partial<FreeLayer> = {}): FreeLayer => ({
  id: "l1",
  kind: "text",
  content: "SOLD OUT",
  geometry: { square: { x: 10, y: 20, w: 50, h: 10 } },
  editedAt: { square: 1 },
  ...over,
});

describe("unadjusted cards", () => {
  it("render byte-identically with no, null or empty adjustments", () => {
    const base = renderPackCard(player, "square", true, tokens, false, null, "broadcast-dark");
    expect(render(undefined)).toBe(base);
    expect(render(null)).toBe(base);
    expect(render({})).toBe(base);
    expect(render({ fields: {}, hidden: [], layers: [], photo: {} })).toBe(base);
    expect(isEmptyAdjustments({ layers: [] })).toBe(true);
  });
});

describe("field overrides", () => {
  it("overriding the headline changes only that field", () => {
    const base = render();
    const edited = render({ fields: { headline: "Century maker" } });
    expect(edited).toContain("Century maker");
    expect(edited).not.toContain("Player of the round");
    expect(edited.replace("Century maker", "Player of the round")).toBe(base);
  });

  it("escapes override text", () => {
    expect(render({ fields: { headline: "<b>x</b>" } })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("hidden elements", () => {
  it("hiding the photo slot keeps its box and drops the image", () => {
    const html = render({ hidden: ["slot:photo"] });
    expect(html).toContain('data-hidden-slot="photo"');
    expect(html).not.toContain("sam.jpg");
    // The wrapper stays; only the <img> becomes an invisible box of the same size.
    expect(html.split("<div").length).toBe(render().split("<div").length + 1);
    expect(html.split("<img").length).toBe(render().split("<img").length - 1);
  });

  it("hiding a field keeps its text in place but invisible", () => {
    const html = render({ hidden: ["field:headline"] });
    expect(html).toMatch(
      /data-hidden-field="headline" style="visibility:hidden">Player of the round/,
    );
  });
});

describe("free layers and per-format geometry", () => {
  it("a layer placed in square is inherited by landscape and flagged", () => {
    const adj: CardAdjustments = { layers: [layer()] };
    const html = renderFreeLayers(adj, "landscape");
    expect(html).toContain('data-inherited-from="square"');
    expect(html).toContain("left:10%");
    expect(inheritedFormats(adj, ["square", "landscape"])).toEqual(["landscape"]);
  });

  it("after editing it in landscape, each format keeps its own geometry", () => {
    const adj: CardAdjustments = {
      layers: [
        layer({
          geometry: {
            square: { x: 10, y: 20, w: 50, h: 10 },
            landscape: { x: 60, y: 5, w: 30, h: 12 },
          },
          editedAt: { square: 1, landscape: 2 },
        }),
      ],
    };
    expect(renderFreeLayers(adj, "square")).toContain("left:10%");
    expect(renderFreeLayers(adj, "landscape")).toContain("left:60%");
    expect(renderFreeLayers(adj, "landscape")).not.toContain("data-inherited-from");
    // A third format inherits the most recently edited one (landscape).
    expect(resolveGeometry(adj.layers![0].geometry, adj.layers![0].editedAt, "story")?.from).toBe(
      "landscape",
    );
    expect(inheritedFormats(adj, ["square", "landscape"])).toEqual([]);
  });

  it("layers render above the template inside the card root", () => {
    const html = render({ layers: [layer()] });
    expect(html.indexOf("pack-free-layers")).toBeGreaterThan(html.indexOf("Sam Keeper"));
    expect(html).toContain("SOLD OUT");
    expect(html.endsWith("</div></div>")).toBe(true);
  });

  it("animations are only emitted when asked, with keyframes inlined", () => {
    const adj: CardAdjustments = { layers: [layer({ animation: { kind: "rise", delayMs: 200 } })] };
    expect(renderFreeLayers(adj, "square")).not.toContain("animation:");
    const animated = renderFreeLayers(adj, "square", { animate: true });
    expect(animated).toContain("animation:packLayerRise .7s");
    expect(animated).toContain("animation-delay:200ms");
    expect(animated).toContain("@keyframes packLayerRise");
  });

  it("strips characters that could break out of a layer's style", () => {
    const html = renderFreeLayers(
      { layers: [layer({ style: { color: 'red" onload="x();<b>' } })] },
      "square",
    );
    expect(html).not.toContain('onload="');
    expect(html).not.toContain("<b>");
  });
});

describe("photo transform", () => {
  it("applies per-format focal point and zoom from the adjustments", () => {
    const html = render({ photo: { square: { focalX: 0.2, focalY: 0.3, zoom: 1.5 } } });
    expect(html).toContain("object-position:20% 30%");
    expect(html).toContain("transform:scale(1.500);transform-origin:20% 30%");
  });

  it("an unedited format inherits the edited format's transform", () => {
    const html = render({ photo: { square: { focalX: 0.2, focalY: 0.3, zoom: 1 } } }, "story");
    expect(html).toContain("object-position:20% 30%");
  });
});

describe("harness parity", () => {
  it("the same adjustments always render the same markup", () => {
    const adj: CardAdjustments = {
      fields: { headline: "Century maker" },
      hidden: ["field:playerName"],
      photo: { square: { focalX: 0.4, focalY: 0.4, zoom: 1.2 } },
      layers: [layer()],
    };
    expect(render(structuredClone(adj))).toBe(render(adj));
  });
});
