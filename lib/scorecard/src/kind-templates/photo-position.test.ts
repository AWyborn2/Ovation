/**
 * Photo position (New Studio): a set slide's own position for a photo layer
 * reaches only that slide's page, at only the sizes it was set for, on both
 * ways a set's slides are drawn; and the validator keeps it in range.
 */
import { describe, expect, it } from "vitest";
import { planCardSet, type SetInput } from "../card-sets";
import { slidePhotoPage, withPhotoPositions, type SetDocument } from "./set-document";
import { expandSetSlides, mapCarouselSlides, setSlideRender, type SetItem } from "./set-slides";
import { templateDocumentErrors } from "./validate";
import type { TemplateLayerV2 } from "./format";

const box = { x: 0, y: 0, w: 100, h: 60 };
const PHOTO = {
  id: "ph",
  kind: "photo",
  geometry: { portrait: box, story: box },
} as TemplateLayerV2;
const TEXT = {
  id: "tx",
  kind: "text",
  content: "Hi",
  geometry: { portrait: box, story: box },
} as TemplateLayerV2;

const SET: SetDocument = {
  formatVersion: 2,
  set: "teamLists",
  pages: [
    {
      id: "cover",
      role: "fixed",
      slot: "cover",
      kind: "teamListRound",
      page: "card",
      layers: [TEXT],
    },
    {
      id: "team",
      role: "repeat",
      slot: "team",
      kind: "teamList",
      page: "team",
      layers: [PHOTO, TEXT],
    },
  ],
};

const round: SetInput = {
  kind: "teamListRound",
  roundLabel: "Round 7",
  date: "Sat 14 Feb",
  teams: ["E Grade", "F Grade", "G Grade"].map((grade) => ({
    grade,
    players: [{ surname: "Smith", order: 1 }],
  })),
};
const items: SetItem[] = planCardSet(round).map((s) => ({
  key: s.key,
  slot: s.role === "cover" ? "cover" : "team",
  input: s.input as Record<string, unknown>,
}));

const POS = { focalX: 0.2, focalY: 0.4, zoom: 1.3 };
const F = "detail:senior:F Grade";
const photoOf = (layers: readonly TemplateLayerV2[]) =>
  layers.find((l) => l.id === "ph") as { photoPosition?: unknown } | undefined;

describe("a set slide's own Photo position", () => {
  const doc: SetDocument = {
    ...SET,
    arrangement: { order: [], removed: [], photoFor: { [F]: { ph: { portrait: POS } } } },
  };

  it("moves only that slide's photo, at only its size (expandSetSlides)", () => {
    const slides = expandSetSlides(doc, items);
    const f = slides.find((s) => s.key === F)!;
    expect(photoOf(f.page.layers)?.photoPosition).toEqual({ portrait: POS });
    for (const s of slides.filter((x) => x.key !== F && x.page.id === "team"))
      expect(photoOf(s.page.layers)?.photoPosition).toBeUndefined();
    // The page itself is untouched, and so is every other layer.
    expect(SET.pages[1]!.layers).toEqual([PHOTO, TEXT]);
    expect(f.page.layers[1]).toBe(TEXT);
    // What renders the slide carries it.
    const { document } = setSlideRender(doc, f);
    expect(photoOf(document.pages.team!.layers)?.photoPosition).toEqual({ portrait: POS });
  });

  it("does the same for a queued carousel's stored slides (mapCarouselSlides)", () => {
    const stored = items.map((i) => ({ id: i.key, input: i.input }));
    const { slides } = mapCarouselSlides(doc, stored);
    expect(photoOf(slides.find((s) => s.key === F)!.page.layers)?.photoPosition).toEqual({
      portrait: POS,
    });
    expect(
      photoOf(slides.find((s) => s.key === "detail:senior:E Grade")!.page.layers)?.photoPosition,
    ).toBeUndefined();
  });

  it("leaves a set without any exactly as it was", () => {
    const page = SET.pages[1]!;
    expect(slidePhotoPage(SET, F, page)).toBe(page);
    expect(expandSetSlides(SET, items)).toEqual(
      expandSetSlides({ ...SET, arrangement: { order: [], removed: [] } }, items),
    );
  });

  it("reaches a photo layer inside a group, over the layer's own at that size", () => {
    const group = {
      id: "g",
      kind: "group",
      geometry: { portrait: box },
      children: [{ ...PHOTO, photoPosition: { story: POS, portrait: POS } }],
    } as unknown as TemplateLayerV2;
    const next = { focalX: 1, focalY: 0, zoom: 2 };
    const [out] = withPhotoPositions([group], { ph: { portrait: next } }) as unknown as Array<{
      children: Array<{ photoPosition: unknown }>;
    }>;
    expect(out!.children[0]!.photoPosition).toEqual({ story: POS, portrait: next });
  });
});

describe("validating a Photo position", () => {
  const card = (photoPosition: unknown) => ({
    formatVersion: 2,
    pages: { card: { layers: [{ ...PHOTO, photoPosition }] } },
  });

  it("takes a focal point 0–1 and a zoom 0.5–3 per size", () => {
    expect(templateDocumentErrors(card({ portrait: POS }), "player")).toEqual([]);
    expect(
      templateDocumentErrors(card({ story: { focalX: 0, focalY: 1, zoom: 0.5 } }), "player"),
    ).toEqual([]);
  });

  it("refuses one out of range, of an unknown size, or with other settings", () => {
    for (const bad of [
      { portrait: { focalX: 1.5, focalY: 0.5, zoom: 1 } },
      { portrait: { focalX: 0.5, focalY: 0.5, zoom: 4 } },
      { tall: POS },
      { portrait: { ...POS, rotate: 4 } },
    ])
      expect(templateDocumentErrors(card(bad), "player").length).toBeGreaterThan(0);
  });

  it("refuses one on a layer that isn't a photo", () => {
    const doc = {
      formatVersion: 2,
      pages: { card: { layers: [{ ...TEXT, photoPosition: { portrait: POS } }] } },
    };
    expect(templateDocumentErrors(doc, "player").join(" ")).toMatch(/isn't a photo/);
  });

  it("takes a set's photoFor, and refuses a bad one", () => {
    const ok = {
      ...SET,
      arrangement: { order: [], removed: [], photoFor: { [F]: { ph: { portrait: POS } } } },
    };
    expect(templateDocumentErrors(ok, "set:teamLists")).toEqual([]);
    const bad = {
      ...SET,
      arrangement: { order: [], removed: [], photoFor: { [F]: { ph: { portrait: { zoom: 9 } } } } },
    };
    expect(templateDocumentErrors(bad, "set:teamLists").length).toBeGreaterThan(0);
  });
});
