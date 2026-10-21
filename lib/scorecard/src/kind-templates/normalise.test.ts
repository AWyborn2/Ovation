/**
 * Reading stored documents as v2 (T1.2): v1 `{ layers }` is the kind's
 * primary page, `animation` is `motion.in`, and nothing stored is changed.
 */
import { describe, expect, it } from "vitest";
import { TEMPLATE_CARD_KINDS } from "./fields";
import type { TemplateDocumentV2, TemplateLayerV2 } from "./format";
import { documentPageLayers, documentPages, normaliseDocument, normaliseLayer } from "./normalise";
import { primaryPage } from "./pages";
import { STARTER_IDS, starterDocument } from "./starters";

const box = { square: { x: 0, y: 0, w: 50, h: 10 } };

/** The layers a v1 document's primary page holds once read, minus the v1→v2 renames. */
function expectSameLayers(read: TemplateLayerV2[], stored: Array<Record<string, unknown>>) {
  expect(read).toHaveLength(stored.length);
  read.forEach((layer, i) => {
    const { animation, ...rest } = stored[i] as { animation?: { kind: string; delayMs?: number } };
    const { motion, ...readRest } = layer as TemplateLayerV2 & { motion?: unknown };
    expect(readRest).toEqual(rest);
    if (animation && animation.kind !== "none") {
      expect(motion).toEqual({
        in: {
          preset: animation.kind,
          ...(animation.delayMs !== undefined ? { delayMs: animation.delayMs } : {}),
        },
      });
    } else {
      expect(motion).toBeUndefined();
    }
  });
}

describe("v1 documents read as v2", () => {
  it("puts every starter's layers on its kind's primary page", () => {
    for (const starter of STARTER_IDS) {
      for (const kind of TEMPLATE_CARD_KINDS) {
        const stored = starterDocument(starter, kind);
        if (!stored) continue;
        const before = JSON.stringify(stored);
        const doc = normaliseDocument(stored, kind);
        expect(doc.formatVersion).toBe(2);
        expect(doc.sourceFormat).toBe(1);
        expect(documentPages(doc)).toEqual([primaryPage(kind)]);
        expectSameLayers(documentPageLayers(doc, primaryPage(kind)), stored.layers);
        // Never rewritten: the stored object is exactly as it was.
        expect(JSON.stringify(stored)).toBe(before);
      }
    }
  });

  it("reads a pilot-shaped document: animations, the sponsor lock, draft edits ignored", () => {
    const stored = {
      layers: [
        { id: "a", kind: "text", content: "{{clubName}}", geometry: box },
        { id: "b", kind: "shape", geometry: box, animation: { kind: "rise", delayMs: 240 } },
        { id: "c", kind: "text", content: "Hi", geometry: box, animation: { kind: "none" } },
        { id: "d", kind: "sticker", geometry: box, animation: { kind: "pop" } },
      ],
      sponsorLock: true,
      fields: { headline: "Edited" },
      hidden: ["field:clubTagline"],
      images: { photo: "https://cdn.example.org/p.jpg" },
    };
    const frozen = structuredClone(stored);
    const doc = normaliseDocument(stored, "matchDay");
    expect(doc.sponsorLock).toBe(true);
    expect(Object.keys(doc.pages)).toEqual(["fixture"]);
    const layers = documentPageLayers(doc, "fixture");
    expect(layers[0]).toBe(stored.layers[0]); // nothing to read differently: the same object
    expect(layers[1]).toEqual({
      id: "b",
      kind: "shape",
      geometry: box,
      motion: { in: { preset: "rise", delayMs: 240 } },
    });
    expect(layers[2]).toEqual({ id: "c", kind: "text", content: "Hi", geometry: box });
    expect(layers[3]).toMatchObject({ motion: { in: { preset: "pop" } } });
    expect("animation" in layers[3]).toBe(false);
    expect(stored).toEqual(frozen);
  });

  it("uses the kind's primary page", () => {
    const stored = { layers: [{ id: "a", kind: "shape", geometry: box }] };
    expect(Object.keys(normaliseDocument(stored, "matchDay").pages)).toEqual(["fixture"]);
    expect(Object.keys(normaliseDocument(stored, "matchSummary").pages)).toEqual(["result"]);
    expect(Object.keys(normaliseDocument(stored, "results").pages)).toEqual(["result"]);
    expect(Object.keys(normaliseDocument(stored, "teamList").pages)).toEqual(["team"]);
    expect(Object.keys(normaliseDocument(stored, "ladder").pages)).toEqual(["card"]);
  });

  it("reads a missing or malformed document as an empty one", () => {
    for (const bad of [null, undefined, 3, "x", [], { layers: "nope" }, {}]) {
      const doc = normaliseDocument(bad, "player");
      expect(doc.sourceFormat).toBe(1);
      expect(documentPageLayers(doc, "card")).toEqual([]);
    }
  });

  it("treats a document claiming v2 without pages as v1", () => {
    const doc = normaliseDocument({ formatVersion: 2, layers: [] }, "player");
    expect(doc.sourceFormat).toBe(1);
  });
});

describe("v2 documents", () => {
  const v2: TemplateDocumentV2 = {
    formatVersion: 2,
    pages: {
      fixture: { layers: [{ id: "f", kind: "text", content: "{{grade}}", geometry: box }] },
      title: {
        layers: [
          {
            id: "g",
            kind: "group",
            geometry: box,
            stack: { direction: "column", gap: 1 },
            children: [
              {
                id: "g1",
                kind: "text",
                content: "{{weekendTitle}}",
                geometry: box,
                animation: { kind: "fade", delayMs: 100 },
              },
            ],
          },
        ],
      },
    },
    palettes: ["club-kit"],
    timeline: { durationMs: 6000 },
  };

  it("keeps its pages, palettes and timeline, and reads nested animations", () => {
    const frozen = structuredClone(v2);
    const doc = normaliseDocument(v2, "matchDay");
    expect(doc.sourceFormat).toBe(2);
    expect(documentPages(doc)).toEqual(["title", "fixture"]);
    expect(doc.palettes).toEqual(["club-kit"]);
    expect(doc.timeline).toEqual({ durationMs: 6000 });
    const group = documentPageLayers(doc, "title")[0];
    expect(group.kind).toBe("group");
    if (group.kind !== "group") return;
    expect(group.children[0]).toMatchObject({ motion: { in: { preset: "fade", delayMs: 100 } } });
    expect("animation" in group.children[0]).toBe(false);
    expect(v2).toEqual(frozen);
  });

  it("drops unknown pages and reads a page without a list as empty", () => {
    const doc = normaliseDocument(
      { formatVersion: 2, pages: { bogus: { layers: [] }, card: { layers: "x" } } },
      "player",
    );
    expect(documentPages(doc)).toEqual(["card"]);
    expect(documentPageLayers(doc, "card")).toEqual([]);
    expect(documentPageLayers(doc, "title")).toEqual([]);
  });

  it("lets an explicit motion.in win over a stray animation", () => {
    const layer = {
      id: "x",
      kind: "shape",
      geometry: box,
      motion: { in: { preset: "pop" } },
      animation: { kind: "rise" },
    } as TemplateLayerV2;
    expect(normaliseLayer(layer)).toEqual({
      id: "x",
      kind: "shape",
      geometry: box,
      motion: { in: { preset: "pop" } },
    });
  });
});
