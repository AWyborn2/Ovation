/**
 * Footer hashtags clear of the sponsor logos (Halls Head, Oct 2026): in the
 * converted looks the footer's sponsor strip ("PROUDLY SUPPORTED BY" + up to
 * three logos) and the club hashtag are fixed boxes, and the hashtag's box
 * started under the third logo, so a card with three sponsors drew the logo
 * over the hashtag. The pack source lays the footer out as a row (strip left,
 * hashtag right, `skeletonFooter`); this puts each such hashtag back there:
 * its box starts after the last logo in its row and ends at the strip's own
 * margin, right-aligned, and it shrinks (then ends in an ellipsis) to fit.
 * Every size of the layer is moved alike, so the sizes still match.
 *
 *   cd scripts && npx tsx src/fit-footer-hashtags.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`. The rule it restores is
 * held by `footer-hashtag.test.ts` in `@workspace/scorecard`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  flattenLayers,
  isGroupLayer,
  type GroupLayerV2,
  type LayerBox,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";

/** A sponsor logo slot: the footer strip's, a carousel page's, a player sponsor's. */
export const SPONSOR_IMAGE = /\{\{(?:sponsor\d+|weekendSponsor\d+|playerSponsor\d*Logo)\}\}/;
export const HASHTAG_TEXT = /\{\{(?:clubHashtag|hashtags)\}\}/;
/** The strip's label: literal text naming the sponsors' role ("PROUDLY SUPPORTED BY"). */
const STRIP_LABEL = /^[^{}]*\bBY\s*$/i;
/** Space between the last logo and the hashtag, in percent of the artboard width. */
const GAP = 2;
const FIT = { minScale: 0.6, maxLines: 1, ellipsis: true } as const;

const content = (l: TemplateLayerV2) => ("content" in l ? String(l.content ?? "") : "");
const onSize = (l: TemplateLayerV2, size: TemplateSize) => !l.sizes || l.sizes.includes(size);
const sameRow = (a: LayerBox, b: LayerBox) => a.y < b.y + b.h && b.y < a.y + a.h;
const across = (a: LayerBox, b: LayerBox) => a.x < b.x + b.w && b.x < a.x + a.w;
const round = (n: number) => Math.round(n * 100) / 100;

/** Whether a hashtag and a sponsor logo can show on the same card. */
export function canShowTogether(hashtag: TemplateLayerV2, sponsor: TemplateLayerV2): boolean {
  return hashtag.showWhen?.sponsors !== false && sponsor.showWhen?.sponsors !== false;
}

/** Each layer's parent group (none for a page's own layers). */
function parents(layers: readonly TemplateLayerV2[]): Map<TemplateLayerV2, GroupLayerV2> {
  const out = new Map<TemplateLayerV2, GroupLayerV2>();
  const walk = (list: readonly TemplateLayerV2[], parent: GroupLayerV2 | null) => {
    for (const l of list) {
      if (parent) out.set(l, parent);
      if (isGroupLayer(l)) walk(l.children, l);
    }
  };
  walk(layers, null);
  return out;
}

const sameBox = (a: LayerBox | undefined, b: LayerBox) =>
  !!a && [a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h].every((d) => Math.abs(d) < 0.05);

/**
 * Moves every footer hashtag that sits under a sponsor logo; returns how many
 * hashtags moved. A hashtag on a plate (Club Kit's gold block) moves with its
 * plate, and keeps its alignment on it; a plate in a stacked footer row also
 * widens the row's strip to hold its logos, so the row lays them out apart.
 */
export function fitFooterHashtags(doc: TemplateDocumentV2): number {
  let moved = 0;
  for (const page of Object.values(doc.pages ?? {})) {
    if (!page) continue;
    const layers = flattenLayers(page.layers);
    const parentOf = parents(page.layers);
    for (const tag of layers) {
      if (tag.kind !== "text" || !HASHTAG_TEXT.test(content(tag))) continue;
      const logos = layers.filter(
        (l) => l.kind === "image" && SPONSOR_IMAGE.test(content(l)) && canShowTogether(tag, l),
      );
      const sizes = Object.keys(tag.geometry) as TemplateSize[];
      const rowOf = (size: TemplateSize) => {
        const box = tag.geometry[size]!;
        return logos
          .filter((l) => onSize(l, size) && l.geometry[size] && sameRow(l.geometry[size]!, box))
          .map((l) => l.geometry[size]!);
      };
      const overlaps = sizes.some((size) =>
        rowOf(size).some((logo) => across(logo, tag.geometry[size]!)),
      );
      if (!overlaps) continue;
      // A strip footer (a label left of the logos, as the pack's
      // `skeletonFooter`) puts a bare hashtag at the right margin; any other
      // row keeps the hashtag's own alignment and right edge.
      let strip = false;
      let plated = false;
      for (const size of sizes) {
        const box = tag.geometry[size]!;
        const row = rowOf(size);
        if (row.length === 0) continue;
        const first = Math.min(...row.map((r) => r.x));
        const lastRight = Math.max(...row.map((r) => r.x + r.w));
        const start = lastRight + GAP;
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        const plate = layers.find((l) => {
          const g = l.geometry[size];
          return (
            l.kind === "shape" &&
            onSize(l, size) &&
            !!g &&
            g.w < 80 &&
            g.x <= cx &&
            cx <= g.x + g.w &&
            g.y <= cy &&
            cy <= g.y + g.h
          );
        });
        if (plate) {
          plated = true;
          const old = plate.geometry[size]!;
          const right = old.x + old.w;
          plate.geometry[size] = { ...old, x: round(start), w: round(right - start) };
          tag.geometry[size] = {
            ...box,
            x: round(start + (box.x - old.x)),
            w: round(box.x + box.w - (start + (box.x - old.x))),
          };
          // The plate's own group (Club Kit's hashtag block) takes the plate's box.
          const group = parentOf.get(plate);
          if (group && sameBox(group.geometry[size], old)) {
            group.geometry[size] = { ...plate.geometry[size]! };
            const row = parentOf.get(group);
            if (row?.stack?.direction === "row") {
              // The row's other items (the strip) hold their logos.
              for (const item of row.children) {
                const g = item.geometry[size];
                if (item === group || !g || g.x >= start) continue;
                if (g.x + g.w < lastRight)
                  item.geometry[size] = { ...g, w: round(lastRight - g.x) };
              }
            }
          }
          continue;
        }
        const labels = layers.filter(
          (l) =>
            l.kind === "text" &&
            STRIP_LABEL.test(content(l)) &&
            onSize(l, size) &&
            l.geometry[size] &&
            sameRow(l.geometry[size]!, box) &&
            l.geometry[size]!.x < first,
        );
        let right = box.x + box.w;
        if (labels.length) {
          strip = true;
          // The strip starts this far in from the left; the hashtag ends as far in from the right.
          right = Math.min(right, 100 - Math.min(...labels.map((l) => l.geometry[size]!.x)));
        }
        tag.geometry[size] = { ...box, x: round(start), w: round(right - start) };
      }
      if (strip && !plated) tag.style = { ...tag.style, align: "right" };
      tag.fit = { ...FIT, ...tag.fit };
      moved++;
    }
  }
  return moved;
}

async function main(argv: readonly string[]): Promise<number> {
  const { summary, failures } = await rewriteBundles(fitFooterHashtags, rewriteArgs(argv));
  for (const [look, { files, counted }] of summary)
    if (files) console.log(`[footer] ${look}: ${counted} hashtags moved in ${files} files`);
  return failures ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
