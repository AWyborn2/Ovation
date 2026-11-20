import { describe, expect, it } from "vitest";
import {
  applySlidePhoto,
  focusedSlidePhotos,
  isSlidePhoto,
  liveOwnPhotos,
  randomSlidePhoto,
  slidePhotoChoice,
  slidePhotoFor,
  slidePhotos,
  withSlidePhoto,
  type PickablePhoto,
  type SlidePhoto,
} from "./slide-photo";
import { templateDocumentErrors } from "./validate";
import { assembleSetDocument, type SetDocument } from "./set-document";

const photo = (id: number, over: Partial<PickablePhoto> = {}): PickablePhoto => ({
  id,
  url: `/api/storage/objects/library/p${id}`,
  width: 1600,
  height: 1200,
  grade: "A Grade",
  playerIds: [],
  ...over,
});
const stock = (id: number) => photo(id, { grade: null, juniorStock: true });
const choice = (id: number): SlidePhoto => ({ photoId: id, url: photo(id).url });

describe("a slide's own photo in the set design", () => {
  it("is stored per slide, for every size, and leaves the other slides alone", () => {
    const doc = withSlidePhoto({ arrangement: { order: ["a", "b"], removed: [] } }, "a", choice(7));
    expect(slidePhotoFor(doc, "a")).toEqual(choice(7));
    expect(slidePhotoFor(doc, "b")).toBeNull();
    // The order is kept; no size appears anywhere in the choice.
    expect(doc.arrangement).toEqual({
      order: ["a", "b"],
      removed: [],
      ownPhotos: { a: choice(7) },
    });
    const both = withSlidePhoto(doc, "b", choice(8));
    expect(slidePhotos(both)).toEqual({ a: choice(7), b: choice(8) });
  });

  it("goes back to automatic: the entry is cleared, and an arrangement that only held it goes", () => {
    const doc = withSlidePhoto({}, "a", choice(7));
    expect(doc.arrangement?.ownPhotos).toEqual({ a: choice(7) });
    const back = withSlidePhoto(doc, "a", null);
    expect(slidePhotoFor(back, "a")).toBeNull();
    expect(back.arrangement).toBeUndefined();
    // A layout map stays when the photo goes.
    const laid = withSlidePhoto(
      {
        arrangement: { order: [], removed: [], pageFor: { a: "p1" }, ownPhotos: { a: choice(7) } },
      },
      "a",
      null,
    );
    expect(laid.arrangement).toEqual({ order: [], removed: [], pageFor: { a: "p1" } });
  });

  it("is ignored for a deleted slide, and dropped for a slide the set no longer holds", () => {
    const doc = { arrangement: { order: [], removed: ["a"], ownPhotos: { a: choice(7) } } };
    expect(slidePhotoFor(doc, "a")).toBeNull();
    expect(liveOwnPhotos(doc.arrangement, new Set(["b"]))).toEqual({});
    expect(liveOwnPhotos(doc.arrangement, new Set(["a"]))).toEqual({ a: choice(7) });
  });

  it("survives a save and reload (JSON) and passes the set validator", () => {
    const base = assembleSetDocument("matchDay", () => ({
      formatVersion: 2,
      pages: Object.fromEntries(
        ["fixture", "title", "sponsors"].map((p) => [
          p,
          {
            layers: [
              {
                id: `s-${p}`,
                kind: "shape",
                geometry: Object.fromEntries(
                  ["square", "portrait", "story", "landscape"].map((z) => [
                    z,
                    { x: 5, y: 5, w: 90, h: 20 },
                  ]),
                ),
              },
            ],
          },
        ]),
      ),
    }));
    const set = base!.document;
    const withPhoto = withSlidePhoto(set, "detail:senior:A Grade", {
      ...choice(7),
      playerId: 3,
      focus: { box: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, width: 1600, height: 1200 },
    });
    const reloaded = JSON.parse(JSON.stringify(withPhoto)) as SetDocument;
    expect(slidePhotoFor(reloaded, "detail:senior:A Grade")).toEqual(
      slidePhotoFor(withPhoto, "detail:senior:A Grade"),
    );
    expect(templateDocumentErrors(reloaded, "set:matchDay")).toEqual([]);
    const bad = {
      ...reloaded,
      arrangement: { order: [], removed: [], ownPhotos: { x: { url: "/a" } } },
    };
    expect(templateDocumentErrors(bad, "set:matchDay")).toContain(
      "The set's slide photos must each name a library photo.",
    );
  });

  it("checks the choice's shape", () => {
    expect(isSlidePhoto(choice(1))).toBe(true);
    expect(isSlidePhoto({ photoId: 0, url: "/a" })).toBe(false);
    expect(isSlidePhoto({ photoId: 1, url: "/a", extra: true })).toBe(false);
    expect(isSlidePhoto({ photoId: 1, url: "/a", focus: { box: { x: 2 } } })).toBe(false);
  });
});

describe("drawing a slide with its own photo", () => {
  const senior = {
    input: { kind: "teamList" },
    data: { photoUrl: "/auto.jpg", photoFocus: { box: {}, width: 1, height: 1 }, layerPhotos: {} },
    junior: false,
  };

  it("puts the photo and its framing in the card data, over every photo layer", () => {
    const own = { ...choice(7), focus: { box: { x: 0, y: 0, w: 1, h: 1 }, width: 4, height: 3 } };
    const drawn = applySlidePhoto(senior, own);
    expect(drawn.data).toEqual({ photoUrl: own.url, photoFocus: own.focus });
    expect(drawn.input).toBe(senior.input);
    // No framing: the old photo's box goes, so the new one is centred.
    expect(applySlidePhoto(senior, choice(7)).data).toEqual({ photoUrl: choice(7).url });
    expect(applySlidePhoto(senior, null)).toBe(senior);
  });

  it("a junior slide takes approved junior stock only (fails closed)", () => {
    const junior = { input: { kind: "teamList", junior: true }, data: {}, junior: true };
    // Not known to be stock: the slide draws as before.
    expect(applySlidePhoto(junior, choice(7))).toBe(junior);
    expect(applySlidePhoto(junior, choice(7), new Set([8]))).toBe(junior);
    const drawn = applySlidePhoto(junior, choice(7), new Set([7]));
    expect(drawn.data).toEqual({ photoUrl: choice(7).url });
    expect(drawn.input).toEqual({
      kind: "teamList",
      junior: true,
      juniorPhotoAllowed: true,
      juniorStockPhotoId: 7,
    });
  });
});

describe("picking a photo", () => {
  const library = [
    photo(1),
    photo(2, { focusBox: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 } }),
    photo(3, {
      playerIds: [42],
      playerAreas: [{ playerId: 42, box: { x: 0, y: 0, w: 0.3, h: 0.5 } }],
    }),
    stock(4),
    stock(5),
    photo(6, { grade: null, juniorStock: true, playerIds: [9] }),
  ];

  it("Random draws from the pool and never repeats the current photo", () => {
    for (let r = 0; r < 1; r += 0.05) {
      const next = randomSlidePhoto(library, {
        poolIds: [1, 2, 3],
        junior: false,
        current: { photoId: 2, url: photo(2).url },
        random: () => r,
      });
      expect([1, 3]).toContain(next!.id);
    }
    // Matched by address too (an automatic photo carries no id).
    const byUrl = randomSlidePhoto(library, {
      poolIds: [1, 2],
      junior: false,
      current: { url: photo(1).url },
      random: () => 0,
    });
    expect(byUrl!.id).toBe(2);
    // Pressing again from the new photo draws another.
    const again = randomSlidePhoto(library, {
      poolIds: [1, 2],
      junior: false,
      current: { photoId: byUrl!.id, url: byUrl!.url },
      random: () => 0.99,
    });
    expect(again!.id).toBe(1);
    // Nothing else in the pool: nothing to draw.
    expect(
      randomSlidePhoto(library, { poolIds: [2], junior: false, current: { photoId: 2 } }),
    ).toBe(null);
  });

  it("Random on a junior slide draws approved junior stock only", () => {
    for (let r = 0; r < 1; r += 0.1) {
      const next = randomSlidePhoto(library, {
        // Even if the pool named senior photos, they are never drawn.
        poolIds: [1, 2, 3, 4, 5, 6],
        junior: true,
        current: { photoId: 4 },
        random: () => r,
      });
      expect(next!.id).toBe(5);
    }
    expect(
      randomSlidePhoto(library, { poolIds: [1, 2], junior: true, current: null, random: () => 0 }),
    ).toBeNull();
  });

  it("Focused only: a focus box or a tag box for the slide's players; empty when none", () => {
    expect(focusedSlidePhotos(library, false, []).map((p) => p.id)).toEqual([2]);
    expect(focusedSlidePhotos(library, false, [42]).map((p) => p.id)).toEqual([2, 3]);
    expect(focusedSlidePhotos(library, true, [42])).toEqual([]);
    expect(focusedSlidePhotos([photo(1)], false, [])).toEqual([]);
  });

  it("frames a pick by the slide's player's area, else the photo's focus box", () => {
    expect(slidePhotoChoice(library[2]!, [42])).toEqual({
      photoId: 3,
      url: photo(3).url,
      playerId: 42,
      focus: { box: { x: 0, y: 0, w: 0.3, h: 0.5 }, width: 1600, height: 1200 },
    });
    expect(slidePhotoChoice(library[1]!, [42]).focus?.box).toEqual({
      x: 0.2,
      y: 0.2,
      w: 0.4,
      h: 0.4,
    });
    expect(slidePhotoChoice(library[0]!, [])).toEqual({ photoId: 1, url: photo(1).url });
  });
});
