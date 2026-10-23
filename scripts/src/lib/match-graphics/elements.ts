/**
 * The 51 layer components as library elements (plan 2026-10-23, M4).
 *
 * Each look's Summary captures already hold every one of its layer components,
 * marked in the markup (`data-omg`), at square, portrait and landscape. A
 * component's element is the layers the converter mapped from inside its
 * first marker, at each size: native shapes, text and rows, bound to the
 * match's tokens and drawn in the `match` palette, so it inserts in the
 * club's colours with live data. A component that draws one row of a list
 * (a batter row, a scoreboard line) keeps its list's rows layer, cut to one
 * row's height.
 */
import { createHash } from "node:crypto";
import type { CapturedElement, PackCapture } from "@workspace/scorecard/pack-capture";
import {
  elementDocumentErrors,
  type ElementCategory,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import { mapCapture, type MappedLayer } from "../pack-convert/map";
import type { VariantCaptures } from "../pack-convert/convert";
import type { MatchLook } from "./looks";
import { withinLimits } from "./templates";

/** One element as `lib/template-bundles/elements/<look>.json` holds it. */
export type BundleElementOut = {
  slug: string;
  name: string;
  category: ElementCategory;
  tags: string[];
  signature: string;
  document: { formatVersion: 2; layers: TemplateLayerV2[]; palettes?: ["match"] };
};

/** The Elements panel category for a component, by what it is. */
export function categoryOf(name: string): ElementCategory {
  if (/LogoTile|ScoreboardLogo$|Association$/.test(name)) return "crest-frames";
  if (/Stripes|Backdrop|Led$/.test(name)) return "glows";
  if (/ContextStrip/.test(name)) return "rules";
  if (/Panel$|Frame$|Well$|Screen$|Board$|InningsBand$/.test(name)) return "frames";
  if (/Row$|List$|Grid$|Line$|Cell$|InningsBox$|GroundScoreboardInnings$/.test(name))
    return "data-blocks";
  return "bands";
}

/** A component that draws one row of a list: its rows layer is cut to one row. */
const ONE_ROW = /(Batter|Bowler|Player)Row$|ScoreboardLine$|GroundScoreboardCell$/;

/** "BroadcastTitleBar" → "Title bar" (the look is the panel's heading). */
export function elementName(name: string, look: MatchLook): string {
  const prefix = [
    "GroundScoreboard",
    "Scoreboard",
    "Broadcast",
    "Classic",
    "Clean",
    "Panel",
    "T20",
  ].find((p) => name.startsWith(p) && name.length > p.length);
  const words = (prefix ? name.slice(prefix.length) : name).replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const out = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  // The scoreboards share words: say which board.
  return look.slug === "omg-ground-scoreboard" && /^(Header|Result)$/.test(out)
    ? `Board ${out.toLowerCase()}`
    : out;
}

const kebab = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Every element id inside `root` (itself included). */
function subtree(elements: readonly CapturedElement[], root: number): Set<number> {
  const inside = new Set([root]);
  for (const e of elements) if (e.parent !== null && inside.has(e.parent)) inside.add(e.id);
  return inside;
}

/**
 * What a layer shows, without its sizes: copies of one layer on each size
 * share it (landscape's are drawn at 90 %, so their font sizes differ).
 */
function shapeOf(l: MappedLayer["layer"]): string {
  const x = l as Record<string, unknown> & { rows?: { repeat?: string } };
  return JSON.stringify([x.kind, x.content ?? x.bind ?? x.rows?.repeat ?? x.svg ?? ""]);
}

/**
 * Components that hold others (`children`): their element is their own chrome,
 * not what the look puts inside them.
 */
const HOLDER =
  /^(PanelFrame|PanelWell|CleanInningsBand|ScoreboardFrame|ScoreboardScreen|GroundScoreboardBoard)$/;

/** The nearest component marker above an element, by id. */
function markerOf(elements: readonly CapturedElement[], id: number): number | null {
  const byId = new Map(elements.map((e) => [e.id, e]));
  let e = byId.get(id);
  while (e) {
    if (e.data?.omg) return e.id;
    e = e.parent === null ? undefined : byId.get(e.parent);
  }
  return null;
}

/**
 * A component's layers at one size: those mapped from inside its first marker.
 * Rows layers anchor on their first row, which is inside the first marker too.
 */
function componentLayers(capture: PackCapture, mapped: MappedLayer[], name: string): MappedLayer[] {
  const marker = capture.elements.find((e) => e.data?.omg === name);
  if (!marker) return [];
  const inside = subtree(capture.elements, marker.id);
  return mapped.filter(
    (m) =>
      inside.has(m.element) &&
      (!HOLDER.test(name) || markerOf(capture.elements, m.element) === marker.id),
  );
}

/** The look's elements, from its Summary captures. */
export function lookElements(
  look: MatchLook,
  files: VariantCaptures,
): {
  elements: BundleElementOut[];
  empty: string[];
  invalid: Array<{ name: string; errors: string[] }>;
} {
  const sizes = [...new Set(files.captures.map((c) => c.size))] as TemplateSize[];
  const perSize = sizes.map((size) => {
    const a = files.captures.find((c) => c.size === size && c.palette === "A")!.capture;
    const b = files.captures.find((c) => c.size === size && c.palette === "B")?.capture;
    return { size, capture: a, mapped: mapCapture(a, { paletteB: b ?? null }).layers };
  });
  const elements: BundleElementOut[] = [];
  const empty: string[] = [];
  const invalid: Array<{ name: string; errors: string[] }> = [];
  for (const name of look.layers) {
    // Layers by their design, each with a box per size (the nth copy on each size).
    const merged: Array<{
      layer: MappedLayer["layer"];
      geometry: Partial<Record<TemplateSize, MappedLayer["box"]>>;
    }> = [];
    for (const { size, capture, mapped } of perSize) {
      const seen = new Map<string, number>();
      for (const m of componentLayers(capture, mapped, name)) {
        const key = shapeOf(m.layer);
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        let box = m.box;
        if (ONE_ROW.test(name) && m.layer.kind === "rows") {
          const rows = (m.layer as unknown as { rows: { rowHeight: number } }).rows;
          const w = capture.native.w;
          const h = capture.native.h;
          box = { ...box, h: Math.min(box.h, +((rows.rowHeight * w) / h).toFixed(2)) };
        }
        const same = merged.filter((x) => shapeOf(x.layer) === key);
        const twin = same[n];
        if (twin) twin.geometry[size] = box;
        else merged.push({ layer: m.layer, geometry: { [size]: box } });
      }
    }
    if (!merged.length) {
      empty.push(name);
      continue;
    }
    const layers = merged.map(
      (m, i) =>
        ({
          ...m.layer,
          id: `e${i + 1}`,
          geometry: m.geometry,
        }) as TemplateLayerV2,
    );
    withinLimits(layers);
    const document: BundleElementOut["document"] = {
      formatVersion: 2,
      layers,
      ...(JSON.stringify(layers).includes("var(--mt-") ? { palettes: ["match"] as ["match"] } : {}),
    };
    const errors = elementDocumentErrors(document);
    if (errors.length) {
      invalid.push({ name, errors });
      continue;
    }
    const category = categoryOf(name);
    const label = elementName(name, look);
    const signature = createHash("sha256")
      .update(JSON.stringify(layers.map((l) => ({ ...l, id: "", geometry: {} }))))
      .digest("hex")
      .slice(0, 16);
    elements.push({
      slug: `${look.slug}/${category}/${kebab(name.replace(/^(GroundScoreboard|Scoreboard|Broadcast|Classic|Clean|Panel|T20)(?=[A-Z])/, ""))}`,
      name: label,
      category,
      tags: [
        "match graphics",
        look.name.toLowerCase(),
        ...label.toLowerCase().split(/\s+/),
        "match summary",
      ]
        .filter((t, i, all) => t && all.indexOf(t) === i)
        .slice(0, 12),
      signature,
      document,
    });
  }
  return { elements, empty, invalid };
}
