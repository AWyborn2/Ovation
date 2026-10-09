import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardAdjustments } from "@/lib/pack-render";
import {
  documentFontUsage,
  ensureDocumentFonts,
  googleFontsHref,
  nearestWeight,
  planFontRequests,
  primaryFamily,
  type CatalogueEntry,
} from "./document-fonts";

const catalogue: CatalogueEntry[] = [
  { family: "Barlow Condensed", category: "Sans Serif", weights: [400, 600, 800] },
  { family: "Playfair Display", category: "Serif", weights: [400, 700, 900] },
  { family: "Oswald", category: "Sans Serif", weights: [400, 700] },
];

const doc = (styles: Array<{ fontFamily?: string; fontWeight?: number }>): CardAdjustments => ({
  layers: styles.map((style, i) => ({
    id: `l${i}`,
    kind: "text",
    content: "x",
    style,
    geometry: { square: { x: 0, y: 0, w: 10, h: 10 } },
  })),
});

describe("primaryFamily", () => {
  it("reads the first family, unquoted", () => {
    expect(primaryFamily("'Barlow Condensed', sans-serif")).toBe("Barlow Condensed");
    expect(primaryFamily("Playfair Display")).toBe("Playfair Display");
  });

  it("ignores generic families and theme variables", () => {
    expect(primaryFamily("sans-serif")).toBeNull();
    expect(primaryFamily("var(--disp,'Anton'),sans-serif")).toBeNull();
    expect(primaryFamily(undefined)).toBeNull();
  });
});

describe("documentFontUsage", () => {
  it("collects families and weights from text layers and row cells", () => {
    const adj: CardAdjustments = {
      layers: [
        ...doc([{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600 }]).layers!,
        {
          id: "rows",
          kind: "rows",
          geometry: {},
          rows: {
            repeat: "rows",
            rowHeight: 8,
            cells: [
              {
                field: "team",
                x: 0,
                w: 50,
                style: { fontFamily: "Playfair Display", fontWeight: 400 },
              },
            ],
          },
        },
      ],
    };
    const usage = documentFontUsage(adj);
    expect([...usage.keys()].sort()).toEqual(["Barlow Condensed", "Playfair Display"]);
    expect([...usage.get("Barlow Condensed")!]).toEqual([600]);
  });

  it("defaults the weight to 700 and skips hidden layers", () => {
    const adj = doc([{ fontFamily: "Playfair Display" }]);
    adj.layers!.push({
      ...adj.layers![0],
      id: "hidden",
      hidden: true,
      style: { fontFamily: "Barlow Condensed" },
    });
    expect([...documentFontUsage(adj).entries()]).toEqual([["Playfair Display", new Set([700])]]);
  });
});

describe("planning requests", () => {
  it("snaps to the nearest available weight, heavier on ties", () => {
    expect(nearestWeight([400, 600, 800], 700)).toBe(800);
    expect(nearestWeight([400, 700], 500)).toBe(400);
  });

  it("requests only catalogue families the curated loader doesn't already load", () => {
    const usage = documentFontUsage(
      doc([
        { fontFamily: "Barlow Condensed", fontWeight: 700 },
        { fontFamily: "Oswald", fontWeight: 700 },
        { fontFamily: "Not A Real Font", fontWeight: 400 },
      ]),
    );
    expect(planFontRequests(usage, catalogue)).toEqual([
      { family: "Barlow Condensed", weights: [800] },
    ]);
  });

  it("builds a CSS API url with encoded family names", () => {
    expect(googleFontsHref([{ family: "Playfair Display", weights: [400, 900] }])).toBe(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;900&display=block",
    );
  });
});

describe("ensureDocumentFonts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.querySelectorAll("link[data-document-fonts]").forEach((l) => l.remove());
  });

  const stubFonts = (load: (spec: string) => Promise<unknown[]>) => {
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
    // jsdom never fires link load events; resolve them immediately.
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      const out = append(node);
      queueMicrotask(() => (node as HTMLLinkElement).onload?.(new Event("load")));
      return out;
    });
  };

  it("makes no request for a document without catalogue fonts", async () => {
    stubFonts(async () => [{}]);
    expect(await ensureDocumentFonts(doc([{ fontFamily: "Oswald" }]), catalogue)).toEqual([]);
    expect(document.head.querySelector("link[data-document-fonts]")).toBeNull();
  });

  it("loads the stylesheet and reports no failures when faces load", async () => {
    stubFonts(async () => [{}]);
    const failed = await ensureDocumentFonts(
      doc([{ fontFamily: "Playfair Display", fontWeight: 900 }]),
      catalogue,
    );
    expect(failed).toEqual([]);
    expect(
      document.head.querySelector("link[data-document-fonts]")!.getAttribute("href"),
    ).toContain("family=Playfair+Display:wght@900");
  });

  it("reports a family whose face loads empty instead of passing silently", async () => {
    stubFonts(async (spec) => (spec.includes("Playfair") ? [] : [{}]));
    const failed = await ensureDocumentFonts(
      doc([{ fontFamily: "Playfair Display" }, { fontFamily: "Barlow Condensed" }]),
      catalogue,
    );
    expect(failed).toEqual(["Playfair Display"]);
  });
});
