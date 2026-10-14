/**
 * Shrink-to-fit (plan U2, KTD9). jsdom does no layout, so the loop is tested
 * with a fake measurer and the DOM adapter with faked element metrics; the
 * real-browser case is covered by the render-harness smoke test.
 */
import { describe, expect, it } from "vitest";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolvePackTokens,
} from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { CAROUSEL_PACK_IDS } from "@workspace/scorecard/queued-carousel";
import type { FreeLayer } from "./adjustments";
import { FIT_ATTR, fitLayersInDom, fitScales, fitTarget } from "./layer-fit";

/** A target that overflows until its scale drops to `fitsAt`. */
const fake = (fitsAt: number) => {
  let scale = 1;
  return {
    target: {
      base: 10,
      apply: (s: number) => {
        scale = s;
      },
      overflows: () => scale > fitsAt + 1e-9,
    },
    get scale() {
      return scale;
    },
  };
};

describe("fitScales", () => {
  it("steps down from 1 to the floor", () => {
    const scales = fitScales(0.6, 0.1);
    expect(scales[0]).toBe(1);
    expect(scales.at(-1)).toBe(0.6);
    expect(scales).toEqual([1, 0.9, 0.8, 0.7, 0.6]);
  });
});

describe("fitTarget", () => {
  it("leaves text that fits at full size", () => {
    const f = fake(1);
    expect(fitTarget(f.target)).toEqual({ scale: 1, fits: true });
    expect(f.scale).toBe(1);
  });

  it("shrinks overflowing text to the largest size that fits (AE2)", () => {
    const f = fake(0.8);
    expect(fitTarget(f.target)).toEqual({ scale: 0.8, fits: true });
    expect(f.scale).toBe(0.8);
  });

  it("stops at the 60% floor and reports it doesn't fit (AE2)", () => {
    const f = fake(0.3);
    expect(fitTarget(f.target)).toEqual({ scale: 0.6, fits: false });
    expect(f.scale).toBe(0.6);
  });
});

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });

/** Mount card html and fake each fittable element's metrics. */
function mount(html: string, overflowFor: (el: HTMLElement) => boolean): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${FIT_ATTR}]`))) {
    Object.defineProperty(el, "clientWidth", { configurable: true, get: () => 100 });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 20 });
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 20 });
    Object.defineProperty(el, "scrollWidth", {
      configurable: true,
      get: () => (overflowFor(el) ? 200 : 100),
    });
  }
  return root;
}

describe("fitLayersInDom", () => {
  const player = {
    kind: "player",
    playerName: "Christopher Van Der Merwe",
    headline: "",
    stats: [],
  } as unknown as ShareCardInput;
  const nameLayer: FreeLayer = {
    id: "name",
    kind: "text",
    content: "{{playerName}}",
    style: { fontSize: 8 },
    geometry: { square: { x: 0, y: 0, w: 50, h: 10 } },
  };
  const html = renderPackCard(player, "square", true, tokens, false, null, BLANK_PACK_ID, {
    layers: [nameLayer],
  });

  it("marks only live-field text as fittable", () => {
    expect(html).toContain('data-layer-fit="8.00"');
    const typed = renderPackCard(player, "square", true, tokens, false, null, BLANK_PACK_ID, {
      layers: [{ ...nameLayer, content: "TYPED" }],
    });
    expect(typed).not.toContain(FIT_ATTR);
  });

  it("returns no warnings when text fits", () => {
    expect(
      fitLayersInDom(
        mount(html, () => false),
        "square",
      ),
    ).toEqual([]);
  });

  it("shrinks text that fits once smaller, with no warning", () => {
    const scaleOf = (el: HTMLElement) => Number(el.getAttribute("data-fit-scale") ?? "1");
    const root = mount(html, (el) => scaleOf(el) > 0.75);
    expect(fitLayersInDom(root, "square")).toEqual([]);
    expect(root.querySelector<HTMLElement>(`[${FIT_ATTR}]`)!.getAttribute("data-fit-scale")).toBe(
      "0.75",
    );
  });

  it("reports text that never fits, naming the layer and size", () => {
    expect(
      fitLayersInDom(
        mount(html, () => true),
        "square",
      ),
    ).toEqual([{ reason: "overflow", size: "square", layerId: "name" }]);
  });

  it("reports an overflowing list-row cell with its row and field", () => {
    const ladder = {
      kind: "ladder",
      competitionName: "PCA",
      gradeLabel: "A Grade",
      asOfLabel: "Round 5",
      rows: [
        { pos: 1, team: "Rockingham Mandurah Districts", played: 5, won: 4, lost: 1, points: 24 },
        { pos: 2, team: "Halls Head", played: 5, won: 3, lost: 2, points: 18 },
      ],
    } as unknown as ShareCardInput;
    const rows: FreeLayer = {
      id: "table",
      kind: "rows",
      geometry: { square: { x: 0, y: 30, w: 100, h: 50 } },
      rows: {
        repeat: "rows",
        rowHeight: 8,
        cells: [{ field: "team", x: 0, w: 60, style: { fontSize: 4 } }],
      },
    };
    const card = renderPackCard(ladder, "square", true, tokens, false, null, BLANK_PACK_ID, {
      layers: [rows],
    });
    const root = mount(card, (el) => (el.textContent ?? "").length > 20);
    expect(fitLayersInDom(root, "square")).toEqual([
      { reason: "overflow", size: "square", layerId: "table", row: 0, field: "team" },
    ]);
  });

  it.each(
    CAROUSEL_PACK_IDS.flatMap((packId) =>
      (["square", "portrait", "story", "landscape"] as const).map((size) => ({ packId, size })),
    ),
  )(
    "preserves built-in carousel preview typography when exporting $packId $size",
    ({ packId, size }) => {
      const cover: ShareCardInput = {
        kind: "matchDay",
        roundLabel: "ROUND 1",
        oppositionName: "",
        homeAway: "HOME",
        venue: "",
        date: "FRI 9 OCT – SUN 11 OCT",
        startTime: "",
        carouselPage: {
          page: "title",
          title: "TEAM LISTS",
          fixtureCount: 5,
          sponsors: [],
          hasCoverPhoto: true,
        },
      };
      const root = mount(
        renderPackCard(
          cover,
          size,
          false,
          tokens,
          false,
          {
            brand: { name: "HALLS HEAD", tagline: "CRICKET CLUB · EST 1991" },
          },
          packId,
        ),
        () => false,
      );
      expect(root.querySelector('[data-fit="26"]')).not.toBeNull();
      expect(root.querySelector("[data-carousel-cover-label]")).not.toBeNull();
      const preview = root.innerHTML;
      expect(fitLayersInDom(root, size)).toEqual([]);
      expect(root.innerHTML).toBe(preview);
      // Repeated exports must not progressively alter the saved composition.
      expect(fitLayersInDom(root, size)).toEqual([]);
      expect(root.innerHTML).toBe(preview);
    },
  );

  it("fits live layers without changing a built-in element's character-count marker", () => {
    const root = mount(
      `<div data-layer-id="club-element"><div data-fit="26" style="font-size:4.6cqmin">HALLS HEAD</div></div>${html}`,
      () => true,
    );
    const builtIn = root.querySelector<HTMLElement>('[data-fit="26"]')!;
    const before = builtIn.outerHTML;
    expect(fitLayersInDom(root, "square")).toEqual([
      { reason: "overflow", size: "square", layerId: "name" },
    ]);
    expect(builtIn.outerHTML).toBe(before);
    expect(root.querySelector(`[${FIT_ATTR}]`)?.getAttribute("data-fit-scale")).toBe("0.6");
  });
});
