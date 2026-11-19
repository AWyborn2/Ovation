/**
 * A single-game Match Day page's titles fit by shrinking, never with "…"
 * (Ash, dev retest 6: a junior game's heading was cramped, and cut with "…"
 * on Club Kit). Its titles are the grade heading (a junior one is the longest,
 * "YEAR 9 BOYS SOUTH WEST GOLD") and each side's name, on every size
 * (`isTitleLayer`).
 *
 * The fit check draws the same pages in Chrome with worst-case content (a
 * longer junior competition than Ash's) and fails a title cut with "…"
 * (`title-ellipsis`, `template-fit.ts`) or one that overflows at its minimum.
 * This is the bundle rule behind it: no title may end in "…", and each
 * shrinks to a sensible minimum (at least 30% of its size, in one or two
 * lines). Read from the bundle files on disk, as the other bundle tests are.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  isTitleLayer,
  normaliseDocument,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");

function matchDayBundles(): Array<{ name: string; doc: TemplateDocumentV2 }> {
  const out: Array<{ name: string; doc: TemplateDocumentV2 }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const file = path.join(BUNDLES, look, "matchDay.json");
    if (!existsSync(file)) continue;
    const { document } = JSON.parse(readFileSync(file, "utf8")) as { document: unknown };
    out.push({
      name: `${look}/matchDay`,
      doc: normaliseDocument(document, "matchDay") as TemplateDocumentV2,
    });
  }
  return out;
}

type Fit = { minScale?: number; maxLines?: number; ellipsis?: boolean };

/** Each title on a bundle's single-game page that may end in "…" or can't shrink. */
function titleProblems(name: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  for (const layer of flattenLayers(doc.pages.fixture?.layers ?? [])) {
    if (!isTitleLayer(layer, "matchDay", "fixture")) continue;
    const fit = (layer as TemplateLayerV2 & { fit?: Fit }).fit;
    if (!fit) continue; // Shrinks and wraps as live text always has: never "…".
    if (fit.ellipsis === true) out.push(`${name} ${layer.id}: ends in "…"`);
    if (typeof fit.minScale === "number" && fit.minScale > 0.6)
      out.push(`${name} ${layer.id}: shrinks only to ${fit.minScale}`);
  }
  return out;
}

describe("Single-game Match Day titles: shrink to fit, never '…'", () => {
  const bundles = matchDayBundles();

  it("reads every look's Match Day", () => {
    expect(bundles.map((b) => b.name)).toEqual(
      expect.arrayContaining(["club-kit/matchDay", "bold-type/matchDay", "duotone/matchDay"]),
    );
  });

  it("knows a title: the grade heading and each side's name, on the fixture page only", () => {
    const text = (content: string, fontSize = 2) =>
      ({ id: "t", kind: "text", content, style: { fontSize } }) as unknown as TemplateLayerV2;
    expect(isTitleLayer(text("{{grade}}"), "matchDay", "fixture")).toBe(true);
    expect(isTitleLayer(text("{{grade}} · {{roundLabel}}"), "matchDay", "fixture")).toBe(true);
    expect(isTitleLayer(text("{{opposition.name}}"), "matchDay", "fixture")).toBe(true);
    expect(isTitleLayer(text("{{clubName}}"), "matchDay", "fixture")).toBe(true);
    expect(isTitleLayer(text("{{venue}}"), "matchDay", "fixture")).toBe(false);
    expect(isTitleLayer(text("{{grade}}"), "matchDay", "day")).toBe(false);
    expect(isTitleLayer(text("{{grade}}"), "teamList", "team")).toBe(false);
  });

  for (const { name, doc } of bundles)
    it(`${name}: every title shrinks to fit and never ends in "…"`, () => {
      expect(titleProblems(name, doc)).toEqual([]);
    });

  it("would catch Club Kit's junior heading as it was (cut with '…')", () => {
    const kit = bundles.find((b) => b.name === "club-kit/matchDay")!;
    const was = structuredClone(kit.doc);
    for (const l of flattenLayers(was.pages.fixture!.layers))
      if (l.id === "fixture-l32")
        (l as TemplateLayerV2 & { fit?: Fit }).fit = {
          minScale: 0.6,
          maxLines: 2,
          ellipsis: true,
        };
    expect(titleProblems("club-kit/matchDay", was)).toEqual([
      'club-kit/matchDay fixture-l32: ends in "…"',
    ]);
  });
});
