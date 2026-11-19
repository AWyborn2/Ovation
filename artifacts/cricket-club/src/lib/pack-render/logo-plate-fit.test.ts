/**
 * The plate hugs the logo (Ash's decision, retest 7): a single sponsor logo's
 * light plate takes the logo's drawn box (fitted, contained and centred in its
 * slot) plus the design's padding round the slot, so a wide or tall logo has
 * no light band beside it. Without the logo's natural size the plate keeps its
 * box, as before.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LayerBox, PageKey, TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { huggedPlateBox } from "./layer-layout";
import {
  fitLogoPlates,
  LOGO_PLATE_ATTR,
  LOGO_PLATE_FITTED_ATTR,
  logoPlateAttrs,
  watchLogoPlates,
} from "./logo-plate-fit";

const SQUARE = { w: 1080, h: 1080 };
// A 216 x 108 px slot, with 1% (10.8 px) of plate round it on every side.
const SLOT = { x: 20, y: 80, w: 20, h: 10 };
const PLATE = { x: 19, y: 79, w: 22, h: 12 };

function expectBox(actual: LayerBox, expected: LayerBox) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.w).toBeCloseTo(expected.w, 6);
  expect(actual.h).toBeCloseTo(expected.h, 6);
}

describe("huggedPlateBox", () => {
  it("a wide logo: the plate keeps its width and closes to the logo's height", () => {
    // 4:1 fits the slot's width (216 x 54 px), centred: 27 px clear above and below.
    expectBox(huggedPlateBox(PLATE, SLOT, SQUARE, { w: 400, h: 100 }), {
      x: 19,
      y: 81.5,
      w: 22,
      h: 7,
    });
  });

  it("a tall logo: the plate keeps its height and closes to the logo's width", () => {
    // 1:4 fits the slot's height (27 x 108 px), centred: 94.5 px clear each side.
    expectBox(huggedPlateBox(PLATE, SLOT, SQUARE, { w: 100, h: 400 }), {
      x: 27.75,
      y: 79,
      w: 4.5,
      h: 12,
    });
  });

  it("a square logo in a wide slot: the plate closes in on both sides", () => {
    expectBox(huggedPlateBox(PLATE, SLOT, SQUARE, { w: 500, h: 500 }), {
      x: 24,
      y: 79,
      w: 12,
      h: 12,
    });
  });

  it("a logo the shape of its slot fills it: the plate is the design's", () => {
    const slot = { x: 10, y: 10, w: 10, h: 10 };
    const plate = { x: 9, y: 9, w: 12, h: 12 };
    expectBox(huggedPlateBox(plate, slot, SQUARE, { w: 300, h: 300 }), plate);
  });

  it("without the logo's natural size the plate keeps its box (as before)", () => {
    for (const natural of [null, undefined, { w: 0, h: 0 }, { w: 400, h: Number.NaN }])
      expect(huggedPlateBox(PLATE, SLOT, SQUARE, natural)).toBe(PLATE);
  });

  it("reads the artboard's shape: the same boxes on a story card", () => {
    // On 1080 x 1920 the slot is 216 x 192 px; a square logo is 192 px, 12 px clear each side.
    expectBox(huggedPlateBox(PLATE, SLOT, { w: 1080, h: 1920 }, { w: 64, h: 64 }), {
      x: 19 + (12 / 1080) * 100,
      y: 79,
      w: 2 + (192 / 1080) * 100,
      h: 12,
    });
  });

  it("a plate under the logo (no padding) is the logo's drawn box, never past the plate", () => {
    const plate = { ...SLOT };
    expectBox(huggedPlateBox(plate, SLOT, SQUARE, { w: 400, h: 100 }), {
      x: 20,
      y: 82.5,
      w: 20,
      h: 5,
    });
    // A plate smaller than the slot stays inside its own box.
    const small = { x: 22, y: 81, w: 16, h: 8 };
    expectBox(huggedPlateBox(small, SLOT, SQUARE, { w: 400, h: 100 }), {
      x: 22,
      y: 82.5,
      w: 16,
      h: 5,
    });
  });

  it("keeps the plate's other geometry", () => {
    const out = huggedPlateBox({ ...PLATE, rotate: 0 }, SLOT, SQUARE, { w: 400, h: 100 });
    expect(out.rotate).toBe(0);
  });

  it("hugs the logo's ink when its drawn bounds are known", () => {
    // A 4:1 logo whose ink is its middle half across: 108 x 54 px of ink, centred.
    expectBox(
      huggedPlateBox(PLATE, SLOT, SQUARE, { w: 400, h: 100 }, { x: 0.25, y: 0, w: 0.5, h: 1 }),
      { x: 24, y: 81.5, w: 12, h: 7 },
    );
    // Bounds that aren't a box are ignored.
    expectBox(
      huggedPlateBox(PLATE, SLOT, SQUARE, { w: 400, h: 100 }, { x: 0, y: 0, w: 0, h: 1 }),
      huggedPlateBox(PLATE, SLOT, SQUARE, { w: 400, h: 100 }),
    );
  });
});

/** A loaded image of this natural size (jsdom loads none). */
function loaded(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, "complete", { configurable: true, get: () => true });
  Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => w });
  Object.defineProperty(img, "naturalHeight", { configurable: true, get: () => h });
}

function mountPlate(frame = { x: 0, y: 0, w: 100, h: 100 }) {
  const root = document.createElement("div");
  root.innerHTML =
    `<div data-layer-id="plate"${logoPlateAttrs(PLATE, SLOT, frame, SQUARE, "logo")} style="position:absolute;left:19%;top:79%;width:22%;height:12%"><div></div></div>` +
    `<div data-layer-id="logo" style="position:absolute"><img src="https://cdn.example.org/l.png" alt="" /></div>`;
  const plate = root.querySelector<HTMLElement>('[data-layer-id="plate"]')!;
  const img = root.querySelector("img")!;
  return { root, plate, img };
}

describe("fitLogoPlates", () => {
  it("sizes a marked plate to its loaded logo", () => {
    const { root, plate, img } = mountPlate();
    loaded(img, 400, 100);
    expect(fitLogoPlates(root)).toBe(1);
    expect(plate.style.left).toBe("19%");
    expect(plate.style.top).toBe("81.5%");
    expect(plate.style.width).toBe("22%");
    expect(plate.style.height).toBe("7%");
    expect(plate.hasAttribute(LOGO_PLATE_FITTED_ATTR)).toBe(true);
  });

  it("keeps the design's plate while the logo hasn't loaded", () => {
    const { root, plate } = mountPlate();
    expect(fitLogoPlates(root)).toBe(0);
    expect([plate.style.left, plate.style.top, plate.style.width, plate.style.height]).toEqual([
      "19%",
      "79%",
      "22%",
      "12%",
    ]);
    expect(plate.hasAttribute(LOGO_PLATE_FITTED_ATTR)).toBe(false);
  });

  it("places a plate in a group's box relative to that box", () => {
    const { root, plate, img } = mountPlate({ x: 10, y: 70, w: 40, h: 20 });
    loaded(img, 100, 400);
    fitLogoPlates(root);
    // Artboard 27.75..32.25 across, 79..91 down, in a group at 10,70 sized 40 x 20.
    expect(plate.style.left).toBe("44.375%");
    expect(plate.style.top).toBe("45%");
    expect(plate.style.width).toBe("11.25%");
    expect(plate.style.height).toBe("60%");
  });

  it("runs again from the design's box, and refits when the logo loads", () => {
    const { root, plate, img } = mountPlate();
    const stop = watchLogoPlates(root);
    expect(plate.style.height).toBe("12%");
    loaded(img, 400, 100);
    img.dispatchEvent(new Event("load"));
    expect(plate.style.height).toBe("7%");
    fitLogoPlates(root);
    expect(plate.style.height).toBe("7%");
    stop();
  });
});

// The looks' own plates, through the real renderer.
const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const LOGO = "https://cdn.example.org/only-sponsor.png";
const DATA: PackCardData = {
  brand: {
    name: "Test Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#TCC",
  sponsors: [{ name: "Only Sponsor Co", logoUrl: LOGO }],
};

function bundleDocs(): { look: string; kind: string; doc: TemplateDocumentV2 }[] {
  const out: { look: string; kind: string; doc: TemplateDocumentV2 }[] = [];
  for (const look of readdirSync(BUNDLES, { withFileTypes: true })) {
    if (!look.isDirectory() || look.name === "elements" || look.name === "node_modules") continue;
    for (const file of readdirSync(path.join(BUNDLES, look.name))) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const json = JSON.parse(readFileSync(path.join(BUNDLES, look.name, file), "utf8")) as {
        document?: TemplateDocumentV2;
      };
      if (json.document?.pages)
        out.push({ look: look.name, kind: file.replace(/\.json$/, ""), doc: json.document });
    }
  }
  return out;
}

function renderDoc(kind: string, page: PageKey, doc: TemplateDocumentV2, size: CardSize) {
  const tokens = resolveCardTokens({
    theme: null,
    junior: false,
    data: DATA,
    packId: BLANK_PACK_ID,
  });
  return renderPackCard(
    sampleCardInput(kind as ShareCardInput["kind"]) as unknown as ShareCardInput,
    size,
    true,
    tokens,
    false,
    DATA,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
    { page },
  );
}

describe("the looks' single sponsor plates", () => {
  it("are marked by the renderer and hug a wide logo once it loads", () => {
    let marked = 0;
    let narrowed = 0;
    for (const { kind, doc } of bundleDocs()) {
      for (const page of Object.keys(doc.pages) as PageKey[]) {
        let html: string;
        try {
          html = renderDoc(kind, page, doc, "square");
        } catch {
          continue;
        }
        if (!html.includes(LOGO_PLATE_ATTR)) continue;
        const root = document.createElement("div");
        root.innerHTML = html;
        const plates = Array.from(root.querySelectorAll<HTMLElement>(`[${LOGO_PLATE_ATTR}]`));
        for (const plate of plates) {
          marked++;
          const slotId = plate.getAttribute(LOGO_PLATE_ATTR)!;
          const logo = Array.from(plate.parentElement!.children).find(
            (el) => el.getAttribute("data-layer-id") === slotId,
          );
          const img = logo?.querySelector("img");
          expect(img?.getAttribute("src"), `${kind} ${page}`).toBe(LOGO);
          const before = parseFloat(plate.style.height) * parseFloat(plate.style.width);
          // A very wide logo: the plate closes to it top and bottom.
          loaded(img!, 2000, 100);
          fitLogoPlates(root);
          expect(plate.hasAttribute(LOGO_PLATE_FITTED_ATTR)).toBe(true);
          const after = parseFloat(plate.style.height) * parseFloat(plate.style.width);
          expect(after).toBeLessThanOrEqual(before + 1e-6);
          if (after < before - 1e-6) narrowed++;
        }
      }
    }
    // Every look's lone sponsor tile on the accent ink is one of these.
    expect(marked).toBeGreaterThan(0);
    expect(narrowed).toBe(marked);
  }, 300_000);
});
