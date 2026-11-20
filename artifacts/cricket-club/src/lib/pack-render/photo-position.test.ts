/**
 * Photo position (New Studio): a photo layer's `photoPosition` places the
 * photo in its frame at its own size only; a set slide's own (the set's
 * `arrangement.photoFor`) moves that slide alone, at that size alone, through
 * the same slides and document every renderer draws; and a card without one
 * renders exactly as before.
 */
import { describe, expect, it } from "vitest";
import type { SetDocument, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  brandDefaultTokens,
  renderPackCard,
  resolveCardTokens,
  resolvePackTokens,
  type PackCardData,
} from "@/lib/pack-render";
import { setDraftSlides, slideDocument } from "@/lib/set-draft";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import type { CardAdjustments, FreeLayer } from "./adjustments";

const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });
const URL = "https://example.test/bowler.jpg";
const box = { x: 0, y: 0, w: 100, h: 60 };
const player = { kind: "player", playerName: "Sam Keeper", stats: [] } as unknown as ShareCardInput;

const photoLayer = (over: Partial<FreeLayer> = {}): FreeLayer => ({
  id: "ph",
  kind: "photo",
  geometry: { portrait: box, story: box },
  ...over,
});

const render = (
  adj: CardAdjustments,
  size: CardSize,
  data: Partial<PackCardData> = { photoUrl: URL },
) => renderPackCard(player, size, true, tokens, false, data as never, BLANK_PACK_ID, adj);

const objectPosition = (html: string) => /object-position:([^;"]+)/.exec(html)?.[1] ?? null;

describe("a photo layer's Photo position", () => {
  const POS = { focalX: 0.8, focalY: 0.25, zoom: 1.4 };

  it("places the photo at its size's focal point and zoom", () => {
    const html = render({ layers: [photoLayer({ photoPosition: { portrait: POS } })] }, "portrait");
    expect(html).toContain("object-position:80% 25%");
    expect(html).toContain("scale(1.4)");
  });

  it("never reaches another size: Story draws as it did without one", () => {
    const moved = render({ layers: [photoLayer({ photoPosition: { portrait: POS } })] }, "story");
    expect(moved).toBe(render({ layers: [photoLayer()] }, "story"));
  });

  it("wins over the photo's focus box; without one the focus box crops as before", () => {
    const focus = { box: { x: 0, y: 0, w: 0.2, h: 0.2 }, width: 1000, height: 1000 };
    const data = { photoUrl: URL, photoFocus: focus };
    const plain = render({ layers: [photoLayer()] }, "portrait", data);
    expect(objectPosition(plain)).not.toBe("80% 25%");
    const moved = render(
      { layers: [photoLayer({ photoPosition: { portrait: POS } })] },
      "portrait",
      data,
    );
    expect(objectPosition(moved)).toBe("80% 25%");
  });

  it("zooms within 0.5 to 3", () => {
    const at = (zoom: number) =>
      render(
        {
          layers: [photoLayer({ photoPosition: { portrait: { focalX: 0.5, focalY: 0.5, zoom } } })],
        },
        "portrait",
      );
    expect(at(0.5)).toContain("scale(0.5)");
    expect(at(3)).toContain("scale(3)");
  });

  it("is never drawn on a junior card without the server's marker", () => {
    const html = renderPackCard(
      { ...player, junior: true } as ShareCardInput,
      "portrait",
      true,
      tokens,
      true,
      { photoUrl: URL } as never,
      BLANK_PACK_ID,
      { layers: [photoLayer({ photoPosition: { portrait: POS } })] },
    );
    expect(html).not.toContain("bowler.jpg");
  });
});

describe("a set slide's own Photo position (Round 7 team lists)", () => {
  const PHOTO = { id: "ph", kind: "photo", geometry: { portrait: box, story: box } };
  const NAME = {
    id: "nm",
    kind: "text",
    content: "{{grade}}",
    geometry: { portrait: { x: 0, y: 70, w: 100, h: 10 }, story: { x: 0, y: 70, w: 100, h: 10 } },
  };
  const SET: SetDocument = {
    formatVersion: 2,
    set: "teamLists",
    pages: [
      {
        id: "team",
        role: "repeat",
        slot: "team",
        kind: "teamList",
        page: "team",
        layers: [PHOTO, NAME] as unknown as TemplateLayerV2[],
      },
    ],
  };
  const cardInput = {
    kind: "teamListRound",
    roundLabel: "Round 7",
    date: "Sat 14 Feb",
    teams: ["E Grade", "F Grade", "G Grade"].map((grade) => ({
      grade,
      players: [{ surname: "Smith", order: 1 }],
    })),
  };
  const brand = {
    brand: { name: "Halls Head", primaryColour: "#1f6f43", backgroundColour: "#0c2a1b" },
    photoUrl: URL,
  } as unknown as PackCardData;
  const F = "detail:senior:F Grade";
  const POS = { focalX: 0.9, focalY: 0.3, zoom: 1.2 };

  const drawAll = (doc: SetDocument, size: CardSize) =>
    Object.fromEntries(
      setDraftSlides({ cardInput, adjustments: doc } as never, doc, brand).map((s) => [
        s.key,
        renderPackCard(
          s.input,
          size,
          s.sponsorsOn,
          resolveCardTokens({ junior: s.junior, data: s.data, packId: BLANK_PACK_ID }),
          s.junior,
          s.data,
          BLANK_PACK_ID,
          slideDocument(doc, s),
        ),
      ]),
    );

  it("moves that slide alone, at that size alone", () => {
    const moved: SetDocument = {
      ...SET,
      arrangement: { order: [], removed: [], photoFor: { [F]: { ph: { portrait: POS } } } },
    };
    const before = { portrait: drawAll(SET, "portrait"), story: drawAll(SET, "story") };
    const after = { portrait: drawAll(moved, "portrait"), story: drawAll(moved, "story") };
    const keys = Object.keys(before.portrait);
    expect(keys).toContain(F);
    expect(before.portrait[F]).toContain("bowler.jpg");
    expect(objectPosition(after.portrait[F]!)).toBe("90% 30%");
    expect(after.portrait[F]).toContain("scale(1.2)");
    for (const k of keys) {
      // Story is untouched everywhere, and so is every other Portrait slide.
      expect(after.story[k]).toBe(before.story[k]);
      if (k !== F) expect(after.portrait[k]).toBe(before.portrait[k]);
    }
    expect(after.portrait[F]).not.toBe(before.portrait[F]);
  });
});
