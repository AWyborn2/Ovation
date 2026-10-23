/**
 * Every library element draws when inserted (editable-elements plan, D2–D3):
 * on a neutral v2 template and on a v1 Studio draft, with no look's palette
 * declared, it paints something (subtle pieces included), every palette colour it names
 * is defined, and the draft draws it exactly as the template does.
 *
 * Reads the committed element files from disk (the web app never imports the
 * bundles package).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paintStrength } from "@workspace/scorecard/kind-templates";
import { buildPackData } from "@/lib/pack-card-data";
import { renderFreeLayers } from "@/lib/pack-render/adjustments";
import {
  BLANK_PACK_ID,
  packFieldValues,
  resolveCardTokens,
  type FreeLayer,
} from "@/lib/pack-render";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import type { CardSize } from "@/lib/share-card";
import { bindInput } from "@/lib/pack-render/bind";
import { cardMatchColours } from "@/lib/pack-render/match-vars";
import type { ShareCardInput } from "@/lib/share-card";
import { elementLayers } from "../element-insert";
import { showsMatch } from "../library-elements";

const ELEMENTS = path.resolve(__dirname, "../../../../../../lib/template-bundles/elements");

type Element = { slug: string; tags: string[]; document: { formatVersion: 2; layers: unknown[] } };

const elements: Element[] = readdirSync(ELEMENTS)
  .filter((f) => f.endsWith(".json"))
  .flatMap(
    (f) =>
      (JSON.parse(readFileSync(path.join(ELEMENTS, f), "utf8")) as { elements: Element[] })
        .elements,
  );

// A club whose colours aren't any look's: an element must take them, not need its own.
const data = buildPackData({
  brand: {
    name: "Seaview Cricket Club",
    logoUrl: "https://example.test/seaview-crest.png",
    primaryColour: "#2E7D32",
    backgroundColour: "#F4F1EA",
  },
  hashtag: "#gulls",
  sponsors: [],
});
const tokens = resolveCardTokens({ junior: false, data, packId: BLANK_PACK_ID });
const ctx = { tokens, brand: data.brand, kind: "milestone" };

// A sample card's values, so an element's fields have something to show.
const values = packFieldValues(sampleCardInput("milestone", "Seaview"), data, BLANK_PACK_ID);
const draw = (adj: unknown, size: CardSize) =>
  renderFreeLayers(adj as never, size, {}, values, ctx as never);

// Ovation Match Graphics' elements show a match: they draw on a sample match card,
// its innings, rows, venue and both sides' logos all filled.
const CREST = "https://example.test/crest.png";
const matchInput = {
  ...sampleCardInput("matchSummary", "Seaview"),
  venue: "Seaview Oval",
  date: "17 Oct 2026",
  club: {
    ...(sampleCardInput("matchSummary", "Seaview") as { club: object }).club,
    logoUrl: CREST,
  },
  opposition: {
    ...(sampleCardInput("matchSummary", "Seaview") as { opposition: object }).opposition,
    logoUrl: CREST,
  },
} as ShareCardInput;
const matchBound = bindInput(matchInput, BLANK_PACK_ID);
const matchCtx = {
  ...ctx,
  kind: "matchSummary",
  rows: Object.fromEntries(
    Object.entries(matchBound.rows).map(([k, list]) => [k, list.map((r) => r.values)]),
  ),
  images: { ...matchBound.images, clubLogo: CREST },
  match: cardMatchColours(matchInput, tokens, data.brand),
};
const matchValues = packFieldValues(matchInput, data, BLANK_PACK_ID);
const drawMatch = (adj: unknown, size: CardSize) =>
  renderFreeLayers(adj as never, size, {}, matchValues, matchCtx as never);

describe("every library element, inserted", () => {
  it("finds the committed elements", () => {
    expect(elements.length).toBeGreaterThan(100);
  });

  for (const element of elements) {
    it(`${element.slug} draws on a neutral card`, () => {
      // The capture's sentinel club never shows: its names are fields.
      expect(JSON.stringify(element.document)).not.toMatch(
        /\bSentinel\b|\bQ[A-Z]{2,}\b|\bQ[A-Z] Z[A-Z]\b/,
      );
      for (const size of ["square", "story"] as CardSize[]) {
        const layers: FreeLayer[] = elementLayers(element.document, size);
        expect(layers.length).toBeGreaterThan(0);
        // It draws something: subtle pieces (glass, hairlines) count, nothing doesn't.
        expect(paintStrength(layers)).toBeGreaterThan(0);

        const match = showsMatch(element);
        const page = match ? "result" : "card";
        const render = match ? drawMatch : draw;
        const template = render({ formatVersion: 2, pages: { [page]: { layers } } }, size);
        const draft = render({ layers }, size);
        for (const layer of layers) expect(template).toContain(`data-layer-id="${layer.id}"`);
        // Every palette colour it names is defined, though the card declares no palette.
        const json = JSON.stringify(layers);
        for (const [prefix, probe] of [
          ["--ck-", "--ck-chalk:"],
          ["--dt-", "--dt-"],
          ["--mt-", "--mt-"],
        ] as const) {
          if (json.includes(`var(${prefix}`)) {
            expect(template).toContain(probe);
            expect(draft).toContain(probe);
          }
        }
        // A v1 draft draws the inserted element as a template does.
        expect(draft).toBe(template);
      }
    });
  }
});
