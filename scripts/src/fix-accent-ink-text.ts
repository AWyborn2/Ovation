/**
 * Accent ink only on the accent (Halls Head, Oct 2026): `--accent-ink` is the
 * readable colour for type set ON the club's accent (near-black on Halls
 * Head's gold). The converted Clubhouse and Duotone looks set it on text that
 * sits on the dark base (the next home game, the thank-you, round and date
 * headings), so with a light accent that text was near-black on near-black;
 * the pack source draws it white. And the Club Kit sponsors page's hashtag
 * had been widened past its gold plate. This puts each right:
 *
 * - accent-ink text over no filled shape becomes white, as in the source;
 * - accent-ink text on the accent only without the photo (Bold Type's dark
 *   photo corner) keeps it there and gets a white copy shown with the photo;
 * - accent-ink text over a filled shape but wider than it goes back inside it.
 *
 *   cd scripts && npx tsx src/fix-accent-ink-text.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`. The rule is held by
 * `accent-ink.test.ts` in `@workspace/scorecard`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accentInkChip,
  hashtagPastPlate,
  photoStates,
  flattenLayers,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";

/** A plate's padding round its text (Club Kit's hashtag block). */
const PAD_LEFT = 1.6;
const PAD_RIGHT = 0.35;
const round = (n: number) => Math.round(n * 100) / 100;

export function fixAccentInkText(doc: TemplateDocumentV2): number {
  let changed = 0;
  for (const page of Object.values(doc.pages ?? {})) {
    if (!page) continue;
    const layers = flattenLayers(page.layers);
    // `whiteWhenPhoto` null: white whatever the photo, at those sizes.
    const splits: Array<{
      text: TemplateLayerV2;
      sizes: TemplateSize[];
      whiteWhenPhoto: boolean | null;
    }> = [];
    for (const t of layers) {
      if (t.kind !== "text" || !String(t.style?.color ?? "").includes("--accent-ink")) continue;
      if (t.style?.background) continue;
      const states = photoStates(t);
      // Per size: the photo states in which the text is off a chip.
      const offBySize = new Map<TemplateSize, boolean[]>();
      for (const size of Object.keys(t.geometry) as TemplateSize[]) {
        if (t.sizes && !t.sizes.includes(size)) continue;
        const plate = hashtagPastPlate(layers, t, size);
        if (plate) {
          t.geometry[size] = {
            ...t.geometry[size]!,
            x: round(plate.x + PAD_LEFT),
            w: round(plate.w - PAD_LEFT - PAD_RIGHT),
          };
          changed++;
        }
        const off = states.filter((photo) => !accentInkChip(layers, t, size, photo).on);
        if (off.length) offBySize.set(size, off);
      }
      if (offBySize.size === 0) continue;
      const off = [...offBySize];
      const whiteSizes = off.filter(([, o]) => o.length === states.length).map(([size]) => size);
      const allSizes = Object.keys(t.geometry).filter(
        (x) => !t.sizes || t.sizes.includes(x as TemplateSize),
      );
      if (whiteSizes.length === allSizes.length) {
        // Off a chip at every size whatever the photo: white, as in the source.
        t.style = { ...t.style, color: "#FFFFFF" };
      } else {
        if (whiteSizes.length) splits.push({ text: t, sizes: whiteSizes, whiteWhenPhoto: null });
        for (const photo of [true, false]) {
          const sizes = off
            .filter(([, o]) => o.length < states.length && o.includes(photo))
            .map(([size]) => size);
          if (sizes.length) splits.push({ text: t, sizes, whiteWhenPhoto: photo });
        }
      }
      changed++;
    }
    for (const { text, sizes, whiteWhenPhoto } of splits)
      applySplit(page.layers, text, sizes, whiteWhenPhoto);
  }
  return changed;
}

/**
 * At `sizes`, the text on the accent in one photo state only: those sizes
 * move to a copy shown in that state, and a white copy shows in the other.
 * Its other sizes stay as they were.
 */
function applySplit(
  root: TemplateLayerV2[],
  text: TemplateLayerV2,
  sizes: TemplateSize[],
  whiteWhenPhoto: boolean | null,
): void {
  const list = parentList(root, text);
  if (!list) return;
  const all = (text.sizes ?? (Object.keys(text.geometry) as TemplateSize[])).filter(
    (s) => !!text.geometry[s],
  );
  const keep = all.filter((s) => !sizes.includes(s));
  const only = (layer: TemplateLayerV2, which: TemplateSize[]) => ({
    ...layer,
    sizes: which,
    geometry: Object.fromEntries(which.map((s) => [s, layer.geometry[s]!])),
  });
  const at = list.indexOf(text);
  const rest = () => {
    if (keep.length) Object.assign(text, only(text, keep));
    else list.splice(list.indexOf(text), 1);
  };
  if (whiteWhenPhoto === null) {
    const white = {
      ...only(text, sizes),
      id: `${text.id}-white`,
      style: { ...text.style, color: "#FFFFFF" },
    } as TemplateLayerV2;
    list.splice(at + 1, 0, white);
    rest();
    return;
  }
  const suffix = whiteWhenPhoto ? "photo" : "no-photo";
  const onAccent = {
    ...only(text, sizes),
    id: `${text.id}-${suffix}-accent`,
    ...(text.link ? { link: text.link } : {}),
    showWhen: { ...text.showWhen, photo: !whiteWhenPhoto },
  } as TemplateLayerV2;
  const onDark = {
    ...only(text, sizes),
    id: `${text.id}-${suffix}-dark`,
    style: { ...text.style, color: "#FFFFFF" },
    showWhen: { ...text.showWhen, photo: whiteWhenPhoto },
  } as TemplateLayerV2;
  list.splice(at + 1, 0, onAccent, onDark);
  rest();
}

/** The list (a page's layers or a group's children) holding `layer`. */
function parentList(list: TemplateLayerV2[], layer: TemplateLayerV2): TemplateLayerV2[] | null {
  if (list.includes(layer)) return list;
  for (const l of list) {
    if (l.kind !== "group") continue;
    const found = parentList(l.children, layer);
    if (found) return found;
  }
  return null;
}

async function main(argv: readonly string[]): Promise<number> {
  const { summary, failures } = await rewriteBundles(fixAccentInkText, rewriteArgs(argv));
  for (const [look, { files, counted }] of summary)
    if (files) console.log(`[ink] ${look}: ${counted} text layers fixed in ${files} files`);
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
