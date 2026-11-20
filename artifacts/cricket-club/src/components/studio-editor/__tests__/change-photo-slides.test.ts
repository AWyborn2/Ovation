/**
 * Change photo (Nov 2026): one slide's own photo in a set draft
 * (`arrangement.ownPhotos`). It draws on that slide only, through the editor's
 * save and reload, and the preview's slide data is exactly what the server's
 * render gets (`applySlidePhoto`, the one rule both use; the server's side is
 * `slide-photos.test.ts` in the API). Junior slides take approved junior stock
 * only.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applySlidePhoto,
  assembleSetDocument,
  mapCarouselSlides,
  slidePhotoFor,
  type SetDocument,
  type SlidePhoto,
} from "@workspace/scorecard/kind-templates";
import { carouselSlideData, readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { setDraftSlides } from "@/lib/set-draft";
import { openSetTemplate, storedSetDocument, withSlidePhotoChoice } from "../set-doc";

const BUNDLES = path.resolve(__dirname, "../../../../../../lib/template-bundles");
const lookSet = (): SetDocument =>
  assembleSetDocument("matchDay", (kind) => {
    try {
      return JSON.parse(readFileSync(path.join(BUNDLES, "club-kit", `${kind}.json`), "utf8"))
        .document;
    } catch {
      return undefined;
    }
  })!.document;

const BRAND = {
  brand: { name: "Our Cricket Club", primaryColour: "#1f6f43", backgroundColour: "#0c2a1b" },
  hashtag: "#OURCC",
};

const slide = (id: string, input: Record<string, unknown>, data = {}, junior = false) => ({
  id,
  label: id,
  junior,
  sponsorsOn: false,
  warnings: [],
  input: junior ? { ...input, junior: true } : input,
  data,
});

const draftWith = (slides: ReturnType<typeof slide>[], adjustments: SetDocument) => ({
  cardInput: {
    kind: "matchDay",
    weekendCarousel: {
      version: 3,
      templateRef: { libraryTemplateId: 1, version: 1 },
      setType: "matchDay",
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size: "square",
      slides,
    },
  },
  adjustments,
});

const AUTO_1 = "/api/storage/objects/library/auto-1";
const AUTO_2 = "/api/storage/objects/library/auto-2";
const STORED = [
  slide("title", {
    kind: "matchDay",
    carouselPage: { page: "title", title: "This weekend", sponsors: [] },
  }),
  slide("fx-1", { kind: "matchDay", grade: "A Grade" }, { ...BRAND, photoUrl: AUTO_1 }),
  slide("fx-2", { kind: "matchDay", grade: "B Grade" }, { ...BRAND, photoUrl: AUTO_2 }),
];

const OWN: SlidePhoto = {
  photoId: 7,
  url: "/api/storage/objects/library/own-7",
  focus: { box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, width: 1600, height: 1200 },
};

const box = { x: 0, y: 0, w: 50, h: 50 };
const shapeLike = (id: string) => ({
  id,
  geometry: { square: box, portrait: box, story: box, landscape: box },
});

/** The set as the editor opens it, a choice made on slide `key`, then stored. */
const edited = (set: SetDocument, key: string, choice: SlidePhoto | null) =>
  storedSetDocument(withSlidePhotoChoice(openSetTemplate(set).doc, key, choice));

describe("Change photo on one slide of a set", () => {
  it("draws on that slide only; the other slides keep their automatic photos", () => {
    const set = lookSet();
    const doc = edited(set, "fx-1", OWN);
    const draft = draftWith(STORED, doc);
    const slides = setDraftSlides(draft, doc, BRAND);
    const byKey = Object.fromEntries(slides.map((s) => [s.key, s]));
    expect(byKey["fx-1"]!.data.photoUrl).toBe(OWN.url);
    expect(byKey["fx-1"]!.data.photoFocus).toEqual(OWN.focus);
    expect(byKey["fx-2"]!.data.photoUrl).toBe(AUTO_2);
    expect(byKey["title"]!.data.photoUrl).toBeUndefined();
  });

  it("survives save and reload: the stored design (JSON) draws the same", () => {
    const set = lookSet();
    const doc = edited(set, "fx-2", OWN);
    const reloaded = JSON.parse(JSON.stringify(doc)) as SetDocument;
    expect(slidePhotoFor(reloaded, "fx-2")).toEqual(OWN);
    // Reopened in the editor and stored again, unchanged.
    const again = storedSetDocument(openSetTemplate(reloaded).doc);
    expect(again.arrangement?.ownPhotos).toEqual({ "fx-2": OWN });
    const draft = draftWith(STORED, again);
    expect(setDraftSlides(draft, again, BRAND)).toEqual(setDraftSlides(draft, doc, BRAND));
  });

  it("Back to automatic photo draws the slide's own automatic photo again", () => {
    const set = lookSet();
    const doc = edited(set, "fx-1", OWN);
    const back = storedSetDocument(withSlidePhotoChoice(openSetTemplate(doc).doc, "fx-1", null));
    expect(back.arrangement?.ownPhotos).toBeUndefined();
    const draft = draftWith(STORED, back);
    const fx1 = setDraftSlides(draft, back, BRAND).find((s) => s.key === "fx-1")!;
    expect(fx1.data.photoUrl).toBe(AUTO_1);
    expect(setDraftSlides(draft, back, BRAND)).toEqual(setDraftSlides(draft, set, BRAND));
  });

  it("render parity: the preview's slide is the server's render input for it", () => {
    const set = lookSet();
    const doc = edited(set, "fx-1", OWN);
    const draft = draftWith(STORED, doc);
    const preview = setDraftSlides(draft, doc, BRAND);
    // What `renderDraftSlides` hands the renderer for a templated carousel.
    const carousel = readQueuedCarousel(draft.cardInput)!;
    const byId = new Map(carousel.slides.map((s) => [s.id, s]));
    // The game slides (a bookend with no data of its own draws with the club's
    // brand in the preview and the server's brand on post, as before).
    const games = mapCarouselSlides(doc, carousel.slides).slides.filter((s) => s.key !== "title");
    expect(games.map((s) => s.key)).toEqual(["fx-1", "fx-2"]);
    for (const s of games) {
      const stored = byId.get(s.key)!;
      const server = applySlidePhoto(
        { input: s.input, data: carouselSlideData(carousel, stored), junior: stored.junior },
        doc.arrangement?.ownPhotos?.[s.key],
        new Set(),
      );
      const shown = preview.find((p) => p.key === s.key)!;
      expect(shown.data).toEqual(server.data);
      expect(shown.input).toEqual(server.input);
    }
  });

  it("a changed photo keeps the slide's Photo position; Back to automatic keeps it too", () => {
    const set = lookSet();
    const fixture = set.pages.find((p) => p.slot === "fixture")!;
    const photoLayer = { ...shapeLike("pic"), kind: "photo" };
    const withLayer: SetDocument = {
      ...set,
      pages: set.pages.map((p) =>
        p.id === fixture.id ? { ...p, layers: [...p.layers, photoLayer] } : p,
      ) as SetDocument["pages"],
      arrangement: {
        order: [],
        removed: [],
        photoFor: { "fx-1": { pic: { square: { focalX: 0.2, focalY: 0.8, zoom: 1.5 } } } },
      },
    };
    const doc = edited(withLayer, "fx-1", OWN);
    expect(doc.arrangement?.photoFor).toEqual(withLayer.arrangement?.photoFor);
    const draft = draftWith(STORED, doc);
    const fx1 = setDraftSlides(draft, doc, BRAND).find((s) => s.key === "fx-1")!;
    expect(fx1.data.photoUrl).toBe(OWN.url);
    const drawn = fx1.page.layers.find((l) => l.id === "pic") as { photoPosition?: unknown };
    expect(drawn.photoPosition).toEqual({ square: { focalX: 0.2, focalY: 0.8, zoom: 1.5 } });
    const back = storedSetDocument(withSlidePhotoChoice(openSetTemplate(doc).doc, "fx-1", null));
    expect(back.arrangement?.photoFor).toEqual(withLayer.arrangement?.photoFor);
    expect(back.arrangement?.ownPhotos).toBeUndefined();
  });

  it("a junior slide draws its own photo only while it is approved junior stock", () => {
    const set = lookSet();
    const junior = [
      STORED[0]!,
      slide("jr-1", { kind: "matchDay", grade: "Under 13" }, BRAND, true),
    ];
    const doc = edited(set, "jr-1", OWN);
    const draft = draftWith(junior, doc);
    const unknown = setDraftSlides(draft, doc, BRAND).find((s) => s.key === "jr-1")!;
    // Not known as stock (or the list not in yet): no photo, as before.
    expect(unknown.data.photoUrl).toBeUndefined();
    expect(unknown.input).not.toHaveProperty("juniorPhotoAllowed");
    const approved = setDraftSlides(draft, doc, BRAND, { juniorStock: new Set([7]) }).find(
      (s) => s.key === "jr-1",
    )!;
    expect(approved.data.photoUrl).toBe(OWN.url);
    expect(approved.input).toMatchObject({ juniorPhotoAllowed: true, juniorStockPhotoId: 7 });
  });
});
