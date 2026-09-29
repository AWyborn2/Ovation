import { describe, expect, it } from "vitest";
import {
  ELEMENTS,
  getElement,
  juniorName,
  parseRows,
  renderElement,
  searchElements,
} from "./registry";
import { renderPackCard, resolveCardTokens } from "../pack-render";
import { buildPackData } from "../pack-card-data";
import { sampleCardInput } from "../sample-card-inputs";
import type { FreeLayer } from "../pack-render";
import type { CardSize } from "../share-card";
import { reorderLayers, removeLayers } from "../../components/studio-editor/document";

/**
 * The Studio element library: every Club Kit piece insertable on any card, in
 * the club's colours, with escaped props and live card data.
 */

const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const BRAND = {
  name: "Demo Cricket Club",
  primaryColour: "#C8102E",
  backgroundColour: "#14213D",
  logoUrl: "https://cdn.example/crest.png",
};

function layer(id: string, props?: Record<string, string>, size: CardSize = "square"): FreeLayer {
  const def = getElement(id)!;
  return {
    id: `l-${id}`,
    kind: "element",
    name: def.label,
    element: { id, props },
    geometry: { [size]: def.defaultBox(size) },
  };
}

function renderOn(packId: string, layers: FreeLayer[], size: CardSize = "square") {
  const data = buildPackData({ brand: BRAND, hashtag: "#DEMOCC", presentingSponsorName: "Acme" });
  const tokens = resolveCardTokens({ theme: null, junior: false, data, packId });
  return renderPackCard(sampleCardInput("matchSummary"), size, true, tokens, false, data, packId, {
    layers,
  });
}

describe("Studio element library", () => {
  it("has unique ids and a sane default box for every format", () => {
    expect(new Set(ELEMENTS.map((e) => e.id)).size).toBe(ELEMENTS.length);
    for (const e of ELEMENTS) {
      for (const size of SIZES) {
        const b = e.defaultBox(size);
        for (const v of [b.x, b.y, b.w, b.h])
          expect(Number.isFinite(v), `${e.id}/${size}`).toBe(true);
        expect(b.w, `${e.id}/${size}`).toBeGreaterThan(0);
        expect(b.x + b.w, `${e.id}/${size}`).toBeLessThanOrEqual(100.01);
        expect(b.y + b.h, `${e.id}/${size}`).toBeLessThanOrEqual(100.01);
      }
    }
  });

  it("renders every element on a blank canvas and on other packs, in club colours", () => {
    for (const packId of ["blank", "sunset-v1", "broadcast-dark-v1", "club-kit-v1"]) {
      for (const e of ELEMENTS) {
        const html = renderOn(packId, [layer(e.id)]);
        const ctx = `${packId}/${e.id}`;
        expect(html, ctx).toContain(`data-element="${e.id}"`);
        expect(html, ctx).toContain("--ck-p:#C8102E");
        expect(html, ctx).not.toContain("NaN");
        expect(html, ctx).not.toContain("undefined");
      }
    }
  });

  it("leaves a card with no element layers byte-identical", () => {
    const plain = renderOn("sunset-v1", []);
    expect(plain).not.toContain("--ck-p:");
  });

  it("follows live card data until a prop is edited", () => {
    const live = renderOn("club-kit-v1", [layer("ck.score-bars")]);
    expect(live).toContain("Sample Club");
    const edited = renderOn("club-kit-v1", [layer("ck.score-bars", { homeName: "Our Side" })]);
    expect(edited).toContain("Our Side");
    expect(renderOn("blank", [layer("ck.hashtag")])).toContain("#DEMOCC");
    expect(renderOn("blank", [layer("ck.sponsor-strip")])).toContain("Acme");
  });

  it("uses the crest when the club has one and its initials otherwise", () => {
    expect(renderOn("blank", [layer("ck.crest")])).toContain("crest.png");
    const data = buildPackData({ brand: { name: "Coastal Districts" } });
    const tokens = resolveCardTokens({ theme: null, junior: false, data, packId: "blank" });
    const html = renderPackCard(
      sampleCardInput("milestone"),
      "square",
      true,
      tokens,
      false,
      data,
      "blank",
      {
        layers: [layer("ck.crest")],
      },
    );
    expect(html).toContain(">CD</div>");
  });

  it("escapes every prop", () => {
    const evil = `</div><script>alert(1)</script>`;
    for (const e of ELEMENTS) {
      const props: Record<string, string> = {};
      for (const p of e.props) props[p.key] = p.kind === "rows" ? `${evil} | ${evil}` : evil;
      const html = renderElement({ id: e.id, props }, { values: {}, rows: {} });
      expect(html, e.id).not.toContain("<script>");
    }
    const img = renderElement(
      { id: "ck.frame-side", props: { photo: `javascript:alert(1)` } },
      { values: {}, rows: {} },
    );
    expect(img).not.toContain("javascript:");
  });

  it("prints only first names and an initial on junior rows", () => {
    expect(juniorName("Riley Thompson")).toBe("Riley T.");
    expect(juniorName("Ava")).toBe("Ava");
    const html = renderElement(
      { id: "ck.junior-rows", props: { rows: "Riley Thompson | Top score | 52*" } },
      { values: {}, rows: {} },
    );
    expect(html).toContain("Riley T.");
    expect(html).not.toContain("Thompson");
  });

  it("parses rows and searches by keyword", () => {
    expect(parseRows("a | b\n\n c|d |e", 5)).toEqual([
      ["a", "b"],
      ["c", "d", "e"],
    ]);
    expect(searchElements("score").map((e) => e.id)).toContain("ck.score-bars");
    expect(searchElements("jumper trim").length).toBeGreaterThan(0);
  });
});

describe("editor document: stacking and the sponsor lock", () => {
  const a = layer("ck.background");
  const b = { ...layer("ck.crest"), id: "b" };
  const c = { ...layer("ck.sponsor-strip"), id: "c" };

  it("reorders layers", () => {
    const doc = { layers: [a, b, c] };
    const ids = (d: { layers?: FreeLayer[] }) => (d.layers ?? []).map((l) => l.id);
    expect(ids(reorderLayers(doc, [a.id], "forward"))).toEqual([b.id, a.id, c.id]);
    expect(ids(reorderLayers(doc, [c.id], "backward"))).toEqual([a.id, c.id, b.id]);
    expect(ids(reorderLayers(doc, [a.id], "front"))).toEqual([b.id, c.id, a.id]);
    expect(ids(reorderLayers(doc, [c.id], "back"))).toEqual([c.id, a.id, b.id]);
  });

  it("keeps a sponsor-strip element while the sponsor lock is on", () => {
    expect(removeLayers({ layers: [c], sponsorLock: true }, ["c"]).layers).toHaveLength(1);
    expect(removeLayers({ layers: [c] }, ["c"]).layers).toHaveLength(0);
  });
});
