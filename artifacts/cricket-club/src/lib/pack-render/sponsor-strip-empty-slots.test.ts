/**
 * A sponsor strip with fewer sponsors than slots (dev retest 4, set 968): a
 * club with one sponsor saw that logo on a cover with two dark boxes beside
 * it, in the editor and in downloads. The strips frame each `{{sponsorN}}`
 * logo with a box conditioned only on the card having sponsors; an empty
 * slot's logo dropped, its box didn't. The renderer now drops a slot's frame
 * with its slot (`emptySponsorFrames`), so every look is covered at once.
 *
 * Reads the committed bundle files from disk (the web app never imports the
 * bundles package) and checks every look and page with a strip of two or
 * more slots, on every size, with one sponsor.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  layerTokens,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { emptySponsorFrames, sponsorSlotToken } from "./layer-layout";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const LOGO = "https://cdn.example.org/only-sponsor.png";

type Box = { x: number; y: number; w: number; h: number };

const DATA: PackCardData = {
  brand: {
    name: "Halls Head Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#HHCC",
  sponsors: [{ name: "Only Sponsor Co", logoUrl: LOGO }],
};

/** Every look's bundle files, as `[look, kind, document]`. */
function bundles(): [string, string, TemplateDocumentV2][] {
  const out: [string, string, TemplateDocumentV2][] = [];
  for (const look of readdirSync(BUNDLES, { withFileTypes: true })) {
    if (!look.isDirectory() || look.name === "elements" || look.name === "node_modules") continue;
    for (const file of readdirSync(path.join(BUNDLES, look.name))) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const json = JSON.parse(readFileSync(path.join(BUNDLES, look.name, file), "utf8")) as {
        document?: TemplateDocumentV2;
      };
      if (json.document?.pages) out.push([look.name, file.replace(/\.json$/, ""), json.document]);
    }
  }
  return out;
}

const boxOn = (layer: TemplateLayerV2, size: CardSize): Box | null =>
  layer.hidden || (layer.sizes && !layer.sizes.includes(size))
    ? null
    : ((layer.geometry as Partial<Record<CardSize, Box>> | undefined)?.[size] ?? null);

/** Each sibling list of a page: its own layers, then each group's children. */
function siblingLists(layers: readonly TemplateLayerV2[]): TemplateLayerV2[][] {
  const lists = [layers as TemplateLayerV2[]];
  for (const layer of layers)
    if (layer.kind === "group" && Array.isArray(layer.children))
      lists.push(...siblingLists(layer.children as TemplateLayerV2[]));
  return lists;
}

/** The strips to check: look, kind and page with two or more sponsor slots. */
const STRIPS = bundles().flatMap(([look, kind, doc]) =>
  Object.entries(doc.pages)
    .filter(
      ([, page]) => flattenLayers(page?.layers ?? []).filter((l) => sponsorSlotToken(l)).length > 1,
    )
    .map(([page]) => ({ look, kind, page: page as PageKey, doc })),
);

const input = (kind: string, page: PageKey) =>
  (kind === "matchDay" && page === "title"
    ? {
        kind,
        roundLabel: "ROUND 7",
        oppositionName: "",
        homeAway: "HOME",
        venue: "",
        date: "FRI 13 NOV – SUN 22 NOV",
        startTime: "",
        namesResolved: true,
        carouselPage: { page: "title", title: "Match day", fixtureCount: 3, sponsors: [] },
      }
    : sampleCardInput(kind as ShareCardInput["kind"])) as unknown as ShareCardInput;

function render(kind: string, page: PageKey, doc: TemplateDocumentV2, size: CardSize) {
  const tokens = resolveCardTokens({
    theme: null,
    junior: false,
    data: DATA,
    packId: BLANK_PACK_ID,
  });
  return renderPackCard(
    input(kind, page),
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

const drawn = (html: string, id: string) => html.includes(`data-layer-id="${id}"`);

describe("a sponsor strip with one sponsor", () => {
  it("covers every look with a strip on a cover or title page", () => {
    const covers = new Set(STRIPS.filter((s) => s.page === "title").map((s) => s.look));
    for (const look of [
      "bold-type",
      "broadcast-classic",
      "broadcast-dark",
      "club-kit",
      "club-kit-classic",
      "gold-foil",
      "neon-night",
      "sunset",
    ])
      expect(covers, look).toContain(look);
  });

  for (const { look, kind, page, doc } of STRIPS) {
    it(`${look}/${kind} ${page}: draws one tile and no empty frames`, () => {
      const layers = (doc.pages[page]?.layers ?? []) as TemplateLayerV2[];
      for (const size of SIZES) {
        const html = render(kind, page, doc, size);
        const slots = flattenLayers(layers).filter((l) => sponsorSlotToken(l) && boxOn(l, size));
        if (slots.length === 0) continue;
        // The one sponsor's logo draws once per sponsor1 slot on this size; no other slot draws.
        for (const slot of slots)
          expect(drawn(html, slot.id), `${size} ${slot.id}`).toBe(
            sponsorSlotToken(slot) === "sponsor1",
          );
        // Every frame round an empty slot (sponsor2, sponsor3) is gone; sponsor1's stays.
        for (const list of siblingLists(layers)) {
          const box = (l: TemplateLayerV2) => boxOn(l, size);
          const empty = emptySponsorFrames(list, box, (t) => t === "sponsor1", layerTokens);
          const none = emptySponsorFrames(list, box, () => false, layerTokens);
          for (const frame of empty)
            expect(drawn(html, frame.id), `${size} ${frame.id}`).toBe(false);
          // A frame of the real sponsor's slot is drawn when its own condition holds.
          for (const frame of none)
            if (!empty.has(frame) && !frame.showWhen?.field && !frame.showWhen?.noField)
              expect(drawn(html, frame.id), `${size} ${frame.id} (sponsor1's)`).toBe(true);
        }
      }
    });
  }

  it("club-kit matchDay title: the frames round sponsor 2 and 3 are the ones dropped", () => {
    const doc = STRIPS.find((s) => s.look === "club-kit" && s.kind === "matchDay")!.doc;
    const html = render("matchDay", "title", doc, "square");
    expect(drawn(html, "title-l28")).toBe(true);
    expect(drawn(html, "title-l29")).toBe(true);
    expect(html).toContain(LOGO);
    for (const id of ["title-l30", "title-l31", "title-l32", "title-l33"])
      expect(drawn(html, id), id).toBe(false);
  });
});

describe("emptySponsorFrames", () => {
  const box = (x: number, y: number, w: number, h: number) => ({
    square: { x, y, w, h },
  });
  const tile = (id: string, x: number) =>
    ({ id, kind: "shape", geometry: box(x, 80, 10, 6) }) as unknown as TemplateLayerV2;
  const logo = (id: string, n: number, x: number) =>
    ({
      id,
      kind: "image",
      content: `{{sponsor${n}}}`,
      geometry: box(x + 0.5, 80, 9, 6),
    }) as unknown as TemplateLayerV2;
  const band = {
    id: "band",
    kind: "shape",
    geometry: box(0, 78, 40, 10),
  } as unknown as TemplateLayerV2;
  const label = {
    id: "label",
    kind: "text",
    content: "{{sponsorPresentedBy}}",
    geometry: box(10, 80, 10, 6),
  } as unknown as TemplateLayerV2;
  const layers = [
    band,
    tile("t1", 0),
    logo("l1", 1, 0),
    tile("t2", 12),
    logo("l2", 2, 12),
    tile("t3", 24),
    logo("l3", 3, 24),
    label,
  ];
  const boxOf = (l: TemplateLayerV2) => (l.geometry as { square: Box }).square;

  it("drops only the tiles round empty slots", () => {
    const frames = emptySponsorFrames(layers, boxOf, (t) => t === "sponsor1", layerTokens);
    expect([...frames].map((l) => l.id).sort()).toEqual(["t2", "t3"]);
  });

  it("keeps a band behind every slot and a layer that binds a token", () => {
    const frames = emptySponsorFrames(layers, boxOf, () => false, layerTokens);
    expect([...frames].map((l) => l.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("drops nothing when every slot has a logo", () => {
    expect(emptySponsorFrames(layers, boxOf, () => true, layerTokens).size).toBe(0);
  });
});
