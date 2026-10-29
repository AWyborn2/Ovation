/**
 * Footer hashtags never sit under a sponsor logo (Halls Head, Oct 2026): in
 * every committed bundle template, on every page and size, no sponsor logo
 * slot that can show beside a hashtag overlaps that hashtag's box. A card
 * with all three footer logos once drew the third over `#UpTheHeaders`
 * (`scripts/src/fit-footer-hashtags.ts` moved the hashtags clear).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseDocument } from "./normalise";
import { flattenLayers, type TemplateLayerV2 } from "./format";
import type { LayerBox, TemplateSize } from "./document";

const BUNDLES = path.resolve(__dirname, "../../../template-bundles");
const SPONSOR_IMAGE = /\{\{(?:sponsor\d+|weekendSponsor\d+|playerSponsor\d*Logo)\}\}/;
const HASHTAG_TEXT = /\{\{(?:clubHashtag|hashtags)\}\}/;

const content = (l: TemplateLayerV2) => ("content" in l ? String(l.content ?? "") : "");
const overlap = (a: LayerBox, b: LayerBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** "look/kind page size: logo × hashtag" for every logo over a hashtag in a document. */
function collisions(name: string, document: unknown, kind: string): string[] {
  const doc = normaliseDocument(document, kind);
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    if (!p) continue;
    const layers = flattenLayers(p.layers).filter((l) => !l.hidden);
    const tags = layers.filter((l) => l.kind === "text" && HASHTAG_TEXT.test(content(l)));
    const logos = layers.filter((l) => l.kind === "image" && SPONSOR_IMAGE.test(content(l)));
    for (const tag of tags)
      for (const logo of logos) {
        if (tag.showWhen?.sponsors === false || logo.showWhen?.sponsors === false) continue;
        for (const size of Object.keys(tag.geometry) as TemplateSize[]) {
          if (logo.sizes && !logo.sizes.includes(size)) continue;
          if (tag.sizes && !tag.sizes.includes(size)) continue;
          const a = tag.geometry[size];
          const b = logo.geometry[size];
          if (a && b && overlap(a, b))
            out.push(`${name} ${page} ${size}: ${content(logo)} × ${content(tag)}`);
        }
      }
  }
  return out;
}

function bundleDocuments(): Array<{ name: string; kind: string; document: unknown }> {
  const out: Array<{ name: string; kind: string; document: unknown }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const { document } = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        document: unknown;
      };
      const kind = file.replace(/\.json$/, "");
      out.push({ name: `${look}/${kind}`, kind, document });
    }
  }
  return out;
}

describe("footer hashtags clear of sponsor logos", () => {
  it("no committed bundle draws a sponsor logo over a hashtag, on any page or size", () => {
    const docs = bundleDocuments();
    expect(docs.length).toBeGreaterThan(50);
    expect(docs.flatMap((d) => collisions(d.name, d.document, d.kind))).toEqual([]);
  });

  it("finds a logo over a hashtag", () => {
    const box = (x: number) => ({ x, y: 90, w: 10, h: 4 });
    const document = {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            { id: "l", kind: "image", content: "{{sponsor3}}", geometry: { square: box(53) } },
            { id: "t", kind: "text", content: "{{clubHashtag}}", geometry: { square: box(54) } },
            // A hashtag shown only without sponsors never meets a logo.
            {
              id: "o",
              kind: "text",
              content: "{{hashtags}}",
              showWhen: { sponsors: false },
              geometry: { square: box(54) },
            },
          ],
        },
      },
    };
    expect(collisions("t/card", document, "player")).toEqual([
      "t/card card square: {{sponsor3}} × {{clubHashtag}}",
    ]);
  });
});
