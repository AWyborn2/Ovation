/**
 * The renderer on format v2 (ADR-011 §1, T1.6): every document is read
 * through `normaliseDocument`, the requested page is drawn, and the v2-only
 * rules (the drop rule; conditions, stacks, styles and vectors behind their
 * seams) never touch a v1 document.
 */
import { describe, expect, it } from "vitest";
import {
  primaryPage,
  STARTER_IDS,
  starterDocument,
  TEMPLATE_CARD_KINDS,
  TEMPLATE_SIZE_ORDER,
  type PageKey,
  type TemplateCardKind,
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
import { previewSample, stressSample } from "@/lib/kind-templates/samples";
import { isEmptyAdjustments, renderFreeLayers } from "./adjustments";

const DATA: PackCardData = {
  brand: {
    name: "Sample Cricket Club",
    logoUrl: "https://cdn.example.org/crest.png",
    primaryColour: "#1f6f43",
    backgroundColour: "#0c2a1b",
  },
  hashtag: "#SAMPLECC",
  photoUrl: "https://cdn.example.org/photo.jpg",
};

function render(
  input: ShareCardInput,
  doc: CardAdjustments,
  opts: { size?: CardSize; junior?: boolean; animate?: boolean; page?: PageKey } = {},
): string {
  const junior = opts.junior ?? false;
  const tokens = resolveCardTokens({ theme: null, junior, data: DATA, packId: BLANK_PACK_ID });
  return renderPackCard(
    input,
    opts.size ?? "square",
    true,
    tokens,
    junior,
    DATA,
    BLANK_PACK_ID,
    doc,
    { animate: opts.animate, page: opts.page },
  );
}

const box = { square: { x: 10, y: 10, w: 80, h: 10 } };
const text = (id: string, content: string): TemplateLayerV2 => ({
  id,
  kind: "text",
  content,
  geometry: box,
});

const fixture = previewSample("matchDay", "Sample Cricket Club");

/** A v1 document's layers as an explicit v2 document on the same page. */
const asV2 = (doc: { layers: unknown[] }, kind: string): CardAdjustments =>
  ({
    formatVersion: 2,
    pages: { [primaryPage(kind)]: { layers: doc.layers } },
  }) as CardAdjustments;

describe("pages", () => {
  const doc = {
    formatVersion: 2,
    pages: {
      fixture: { layers: [text("on-fixture", "FIXTURE {{grade}}")] },
      title: { layers: [text("on-title", "TITLE PAGE")] },
    },
  } as CardAdjustments;

  it("draws the kind's primary page by default", () => {
    const html = render(fixture, doc);
    expect(html).toContain('data-layer-id="on-fixture"');
    expect(html).not.toContain('data-layer-id="on-title"');
  });

  it("draws the requested page", () => {
    const html = render(fixture, doc, { page: "title" });
    expect(html).toContain('data-layer-id="on-title"');
    expect(html).not.toContain('data-layer-id="on-fixture"');
  });

  it("draws no layers for a page the document hasn't", () => {
    expect(render(fixture, doc, { page: "sponsors" })).not.toContain("data-layer-id");
  });

  it("reads a v1 document as its kind's primary page only", () => {
    const v1 = { layers: [text("v1", "ONE PAGE")] } as CardAdjustments;
    expect(render(fixture, v1)).toContain('data-layer-id="v1"');
    expect(render(fixture, v1, { page: "title" })).not.toContain("data-layer-id");
  });

  it("counts a v2 document with layers as adjustments, and one without as none", () => {
    expect(isEmptyAdjustments(doc)).toBe(false);
    expect(isEmptyAdjustments({ formatVersion: 2, pages: { card: { layers: [] } } })).toBe(true);
    // Pages without the v2 marker are not a v2 document.
    expect(
      isEmptyAdjustments({ pages: { card: { layers: [text("x", "x")] } } } as CardAdjustments),
    ).toBe(true);
  });
});

describe("the drop rule applies to v2 documents only", () => {
  const roundLayer = text("round", "ROUND {{roundLabel}}");
  const noRound = { ...fixture, roundLabel: "" } as ShareCardInput;

  it("drops a v2 layer whose tokens are all empty, literal text and all", () => {
    const v2 = { formatVersion: 2, pages: { fixture: { layers: [roundLayer] } } };
    expect(render(noRound, v2 as CardAdjustments)).not.toContain('data-layer-id="round"');
    expect(render(fixture, v2 as CardAdjustments)).toContain('data-layer-id="round"');
  });

  it("keeps v1's rule: the same layer in a v1 document still draws its literal text", () => {
    const v1 = { layers: [roundLayer] } as CardAdjustments;
    expect(render(noRound, v1)).toContain('data-layer-id="round"');
  });

  it("drops a v2 photo layer on a junior card without the server's marker", () => {
    const v2 = {
      formatVersion: 2,
      pages: { fixture: { layers: [{ id: "pic", kind: "photo", geometry: box }] } },
    } as CardAdjustments;
    expect(render(fixture, v2)).toContain('data-layer-id="pic"');
    expect(render(fixture, v2, { junior: true })).not.toContain("data-layer-id");
  });
});

describe("motion", () => {
  it("draws v1 animation and v2 motion.in identically", () => {
    const v1 = {
      layers: [{ ...text("m", "GO"), animation: { kind: "rise", delayMs: 300 } }],
    } as CardAdjustments;
    const v2 = {
      formatVersion: 2,
      pages: {
        card: {
          layers: [{ ...text("m", "GO"), motion: { in: { preset: "rise", delayMs: 300 } } }],
        },
      },
    } as CardAdjustments;
    const a = renderFreeLayers(v1, "square", { animate: true }, {}, { kind: "player" });
    const b = renderFreeLayers(v2, "square", { animate: true }, {}, { kind: "player" });
    expect(a).toBe(b);
    expect(a).toContain("animation:packLayerRise");
    expect(a).toContain("animation-delay:300ms");
    expect(renderFreeLayers(v2, "square", {}, {}, { kind: "player" })).not.toContain("animation");
  });
});

describe("a starter as an explicit v2 document", () => {
  // The starters' live boxes are all token-only, so the drop rule removes
  // nothing v1's empty-box rule doesn't, and the two read the same on sample,
  // stress (long names, empty optional lines) and junior data. L4-B's starter
  // bundles (T4.11) rely on this.
  it.each(STARTER_IDS)("%s renders as it does in v1, every kind, size and variant", (starter) => {
    for (const kind of TEMPLATE_CARD_KINDS) {
      const stored = starterDocument(starter, kind as TemplateCardKind);
      if (!stored) continue;
      const sample = previewSample(kind as ShareCardInput["kind"], "Sample Cricket Club");
      const stress = stressSample(kind as ShareCardInput["kind"], "Sample Cricket Club");
      for (const [input, junior] of [
        [sample, false],
        [stress, false],
        [sample, true],
      ] as const) {
        for (const size of TEMPLATE_SIZE_ORDER) {
          const v1 = render(input, stored as CardAdjustments, { size, junior });
          const v2 = render(input, asV2(stored, kind), { size, junior });
          expect(
            v2,
            `${starter}/${kind}/${size}/${junior ? "junior" : input === stress ? "stress" : "sample"}`,
          ).toBe(v1);
        }
      }
    }
  });
});

describe("the card's photo on a v2 document", () => {
  const input = {
    kind: "player",
    playerName: "Sam Keeper",
    photoUrl: "https://cdn.example.org/sam.jpg",
  } as ShareCardInput;
  const photo = { id: "pic", kind: "photo", geometry: box } as TemplateLayerV2;
  const noData = { brand: { name: "Sample Cricket Club" } };
  const draw = (doc: CardAdjustments, junior = false) => {
    const tokens = resolveCardTokens({ theme: null, junior, data: noData, packId: BLANK_PACK_ID });
    return renderPackCard(input, "square", true, tokens, junior, noData, BLANK_PACK_ID, doc);
  };

  it("draws the photo the input carries when no photo was picked", () => {
    expect(
      draw({ formatVersion: 2, pages: { card: { layers: [photo] } } } as CardAdjustments),
    ).toContain("sam.jpg");
  });

  it("leaves v1 documents as they were, and junior cards without it", () => {
    expect(draw({ layers: [photo] } as CardAdjustments)).not.toContain("sam.jpg");
    expect(
      draw({ formatVersion: 2, pages: { card: { layers: [photo] } } } as CardAdjustments, true),
    ).not.toContain("sam.jpg");
  });
});

describe("a shape with no fill", () => {
  const input = { kind: "player", playerName: "Sam Keeper" } as ShareCardInput;
  const frame = {
    id: "frame",
    kind: "shape",
    geometry: box,
    style: {
      border: { width: 0.2, color: "var(--gold)" },
      shadow: [{ y: 1, blur: 4, color: "#00000080" }],
    },
  } as unknown as TemplateLayerV2;
  const shapeHtml = (html: string) => {
    const at = html.indexOf('data-layer-id="frame"');
    return html.slice(at, html.indexOf("</div></div>", at));
  };

  it("paints nothing behind a v2 border-only shape (a frame line, not a panel)", () => {
    const html = shapeHtml(
      render(input, { formatVersion: 2, pages: { card: { layers: [frame] } } } as CardAdjustments),
    );
    expect(html).toContain("background:transparent");
    expect(html).not.toContain("fbac27");
  });

  it("keeps v1's accent for a v1 shape that sets nothing", () => {
    const html = shapeHtml(
      render(input, { layers: [{ id: "frame", kind: "shape", geometry: box }] } as CardAdjustments),
    );
    expect(html).toContain("var(--gold,#fbac27)");
  });
});
