/**
 * A template's day page in the library previews (detail dialog, thumbnails):
 * it draws with sample rows, for every look's Match Day and Match Summary.
 * Gold Foil's Match Summary detail once crashed here, the day input having no
 * results list for `bindInput` to read.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPackData } from "@/lib/pack-card-data";
import { BLANK_PACK_ID, renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import type { ShareCardInput } from "@/lib/share-card";
import { pageView } from "./previews";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");

/** Every look's template with a day page, for the carousel kinds. */
function dayTemplates(): Array<{ look: string; kind: string; document: unknown }> {
  const out: Array<{ look: string; kind: string; document: unknown }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    if (!existsSync(path.join(BUNDLES, look, "look.json"))) continue;
    for (const kind of ["matchDay", "matchSummary"]) {
      const file = path.join(BUNDLES, look, `${kind}.json`);
      if (!existsSync(file)) continue;
      const { document } = JSON.parse(readFileSync(file, "utf8")) as {
        document: { pages?: Record<string, unknown> };
      };
      if (document.pages?.day) out.push({ look, kind, document });
    }
  }
  return out;
}

const data = buildPackData({
  brand: { name: "Seaview Cricket Club" },
  hashtag: "#gulls",
  sponsors: [],
});
const tokens = resolveCardTokens({ junior: false, data, packId: BLANK_PACK_ID });

describe("a template's day page in the library previews", () => {
  const templates = dayTemplates();

  it("finds the looks' day pages", () => {
    expect(templates.some((t) => t.look === "gold-foil" && t.kind === "matchSummary")).toBe(true);
  });

  for (const { look, kind, document } of templates) {
    it(`${look}/${kind} draws its day page with sample rows`, () => {
      const input = sampleCardInput(kind as ShareCardInput["kind"], "Seaview");
      const view = pageView(document, kind, input, "day");
      const html = renderPackCard(
        view.input,
        "square",
        true,
        tokens,
        false,
        data,
        BLANK_PACK_ID,
        view.document as never,
      );
      expect(html).toContain("Saturday");
    });
  }
});
