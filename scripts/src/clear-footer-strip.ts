/**
 * Card text clear of the footer's sponsor strip (Halls Head, Oct 2026): in
 * the converted Club Kit cards some text boxes ran down into the footer row
 * ("SUPPORTED BY" + the sponsor logos), so long content printed over it: the
 * landscape player card's "PLAYER SPOTLIGHT" headline sat on the strip, and on
 * square cards the match line, the milestone name and the result lines ran
 * into it. Each such box now ends above the footer's rule:
 *
 * - a box with room above the strip ends there (live text shrinks to fit
 *   its box; a box left about two lines tall may end in an ellipsis);
 * - a box that sat in the footer band moves up to sit just above the rule,
 *   and the text above it gives way;
 * - the landscape player card moves its stats up to make room for the
 *   headline (its name box gives way).
 *
 *   cd scripts && npx tsx src/clear-footer-strip.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`. The rule is held by
 * `footer-hashtag.test.ts` in `@workspace/scorecard`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  flattenLayers,
  type LayerBox,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";

export const STRIP_IMAGE = /\{\{(?:sponsor\d+|weekendSponsor\d+|playerSponsor\d*Logo)\}\}/;
export const STRIP_LABEL = /^[^{}]*\bBY\s*$/i;
const HASHTAG = /\{\{(?:clubHashtag|hashtags)\}\}/;
/** Space between a card's text and the strip: the footer's rule sits in it. */
const CLEAR = 3.6;
/** The least height a box keeps to stay where it is, else it moves up. */
const MIN_ROOM = 2.5;
const GAP = 0.6;

const content = (l: TemplateLayerV2) => ("content" in l ? String(l.content ?? "") : "");
const onSize = (l: TemplateLayerV2, s: TemplateSize) =>
  (!l.sizes || l.sizes.includes(s)) && !!l.geometry[s];
const round = (n: number) => Math.round(n * 100) / 100;
const overlap = (a: LayerBox, b: LayerBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The footer strip's layers: its label and its sponsor logos. */
export function stripLayers(layers: readonly TemplateLayerV2[]): TemplateLayerV2[] {
  return layers.filter(
    (l) =>
      (l.kind === "image" && STRIP_IMAGE.test(content(l))) ||
      (l.kind === "text" && STRIP_LABEL.test(content(l))),
  );
}

/** Card text that may meet the strip: live text, not the strip's own or the hashtag. */
export function cardText(layers: readonly TemplateLayerV2[]): TemplateLayerV2[] {
  return layers.filter(
    (l) =>
      l.kind === "text" &&
      content(l).includes("{{") &&
      !HASHTAG.test(content(l)) &&
      !STRIP_LABEL.test(content(l)) &&
      l.showWhen?.sponsors !== false,
  );
}

/** The landscape player card: stats up, name shorter, headline above the rule. */
function playerLandscape(
  layers: TemplateLayerV2[],
  strip: readonly LayerBox[],
  stripTop: number,
): number {
  const s: TemplateSize = "landscape";
  const headline = layers.find((l) => content(l) === "{{headline}}" && onSize(l, s));
  const name = layers.find((l) => content(l) === "{{playerName}}" && onSize(l, s));
  const h = headline?.geometry[s];
  if (!headline || !h || !name || !strip.some((b) => overlap(h, b))) return 0;
  const bottom = stripTop - CLEAR;
  const headBox = { ...h, y: round(bottom - h.h) };
  // The stats panels and their text sit between the name and the headline.
  const nameBox = name.geometry[s]!;
  const stats = layers.filter((l) => {
    const g = onSize(l, s) ? l.geometry[s] : undefined;
    return !!g && l !== headline && l !== name && g.y >= nameBox.y + nameBox.h - 0.5 && g.y < h.y;
  });
  const statsBottom = Math.max(...stats.map((l) => l.geometry[s]!.y + l.geometry[s]!.h));
  const dy = Math.max(0, statsBottom - (headBox.y - 1.2));
  for (const l of stats) l.geometry[s] = { ...l.geometry[s]!, y: round(l.geometry[s]!.y - dy) };
  const statsTop = Math.min(...stats.map((l) => l.geometry[s]!.y));
  name.geometry[s] = { ...nameBox, h: round(Math.min(nameBox.h, statsTop - 1.2 - nameBox.y)) };
  headline.geometry[s] = headBox;
  return 1;
}

/** A box this short holds about two lines: it may end in an ellipsis rather than overflow. */
const SHORT = 6;
const FIT = { minScale: 0.6, maxLines: 2, ellipsis: true } as const;

/** A short box with no fit rule of its own gets one, so long text ends in "…". */
function fitIfShort(l: TemplateLayerV2, box: LayerBox): void {
  if (l.kind === "text" && !l.fit && box.h < SHORT) l.fit = { ...FIT };
}

export function clearFooterStrip(doc: TemplateDocumentV2, _look: string, kind: string): number {
  let changed = 0;
  for (const page of Object.values(doc.pages ?? {})) {
    if (!page) continue;
    const layers = flattenLayers(page.layers);
    const strip = stripLayers(layers);
    if (strip.length === 0) continue;
    for (const size of ["square", "portrait", "story", "landscape"] as TemplateSize[]) {
      const boxes = strip.filter((l) => onSize(l, size)).map((l) => l.geometry[size]!);
      if (boxes.length === 0) continue;
      const stripTop = Math.min(...boxes.map((b) => b.y));
      if (kind === "player" && size === "landscape") {
        changed += playerLandscape(layers, boxes, stripTop);
      }
      const bottom = stripTop - CLEAR;
      const texts = cardText(layers).filter((l) => onSize(l, size));
      const hits = texts.filter((t) => boxes.some((b) => overlap(t.geometry[size]!, b)));
      // Boxes with room first, so a moved box can then push into them.
      hits.sort((a, b) => a.geometry[size]!.y - b.geometry[size]!.y);
      for (const t of hits) {
        const g = t.geometry[size]!;
        if (g.y <= bottom - MIN_ROOM) {
          t.geometry[size] = { ...g, h: round(bottom - g.y) };
          fitIfShort(t, t.geometry[size]!);
        } else {
          const h = Math.min(g.h, 3.6);
          const moved = { ...g, y: round(bottom - h), h: round(h) };
          t.geometry[size] = moved;
          fitIfShort(t, moved);
          // The text above gives way.
          for (const u of texts) {
            const ug = u.geometry[size]!;
            if (u === t || ug.y >= moved.y || !overlap(ug, moved)) continue;
            u.geometry[size] = { ...ug, h: round(moved.y - GAP - ug.y) };
            fitIfShort(u, u.geometry[size]!);
          }
        }
        changed++;
      }
    }
  }
  return changed;
}

async function main(argv: readonly string[]): Promise<number> {
  const { summary, failures } = await rewriteBundles(clearFooterStrip, rewriteArgs(argv));
  for (const [look, { files, counted }] of summary)
    if (files) console.log(`[strip] ${look}: ${counted} text boxes cleared in ${files} files`);
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
