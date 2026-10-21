/**
 * Convert one pack's captures into template documents (L4-A2): for each
 * template kind, every page the pack draws, mapped (`map.ts`) and merged
 * across sizes, presets and branches (`merge.ts`). Pure over the capture
 * files; the driver (`convert-pack.ts`) adds the fit and pixel-diff results.
 */

import {
  isGroupLayer,
  kindPages,
  pageTokenKeys,
  pageTokens,
  templateKindFor,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import {
  markersIn,
  type CaptureVariant,
  type PackCapture,
} from "@workspace/scorecard/pack-capture";
import { mapCapture, type MapResult, type PolishItem } from "./map";
import { mergePage, SIZES, type SizeMaps } from "./merge";

/** A variant file as `convert-pack.ts` writes it. */
export interface VariantCaptures {
  variant: CaptureVariant;
  captures: Array<{
    size: TemplateSize;
    content: "sentinel" | "worst";
    palette: "A" | "B";
    detail: "full" | "colours" | "boxes";
    render: unknown;
    capture: PackCapture;
  }>;
}

/** What a page was converted from, and what it couldn't take. */
export interface PageReport {
  kind: string;
  page: PageKey;
  /** The variant group the page came from (`fixture.slide`, `card.runs`). */
  source: string;
  /** Other groups for the page that weren't used (single vs slide, other designs). */
  alternatives: string[];
  sizes: TemplateSize[];
  layers: Record<string, number>;
  stacks: number;
  /** Tokens on the page that aren't in its catalogue (they won't bind). */
  unknownTokens: string[];
  polish: string[];
  untokenised: string[];
  motion: Record<string, string>;
  /** The base render per size, for the driver's fit and pixel-diff passes. */
  renders: Partial<Record<TemplateSize, unknown>>;
}

export interface KindConversion {
  kind: string;
  document: TemplateDocumentV2;
  pages: PageReport[];
}

/**
 * Pack fields that are a page token under another name: Match Day's title and
 * sponsors pages print the dates as `{{date}}`, which format v2 calls `dateRange`.
 */
const TOKEN_ALIASES: Partial<Record<string, Partial<Record<PageKey, Record<string, string>>>>> = {
  matchDay: { title: { date: "dateRange" }, sponsors: { date: "dateRange" } },
};

const aliasesFor = (kind: string, page: PageKey) => TOKEN_ALIASES[kind]?.[page] ?? {};

const groupKey = (v: CaptureVariant) =>
  [v.slide ? "slide" : "", v.role ?? "", v.named ? v.design : ""].filter(Boolean).join(".") ||
  "single";

/** How well a group's markers fit the page's catalogue: covered tokens, minus stray ones. */
function coverage(
  variants: VariantCaptures[],
  kind: string,
  page: PageKey,
): { score: number; unknown: string[] } {
  const known = pageTokenKeys(kind, page);
  const aliases = aliasesFor(kind, page);
  const repeatFields = new Set(
    (pageTokens(kind, page)?.repeats ?? []).flatMap((r) => [r.key, ...r.fields.map((f) => f.key)]),
  );
  const seen = new Set<string>();
  for (const v of variants)
    for (const c of v.captures)
      if (c.content === "sentinel" && c.detail === "full")
        for (const el of c.capture.elements)
          for (const run of el.text ?? []) for (const m of markersIn(run.text)) seen.add(m);
  const lower = new Map([...known].map((k) => [k.toLowerCase(), k]));
  let hits = 0;
  const unknown: string[] = [];
  for (const m of seen) {
    if (lower.has(m.toLowerCase()) || aliases[m]) hits++;
    else if (/^day\d+\.|^weekendSponsor/.test(m) || repeatFields.has(m)) hits++;
    else unknown.push(m);
  }
  return { score: hits - 2 * unknown.length, unknown: unknown.sort() };
}

const pick = (
  v: VariantCaptures | undefined,
  size: TemplateSize,
  want: { content: "sentinel" | "worst"; palette: "A" | "B" },
) =>
  v?.captures.find(
    (c) => c.size === size && c.content === want.content && c.palette === want.palette,
  );

/** Convert one template kind of a pack. Null when the pack draws none of its pages. */
/** Below this share of text elements twinned, a worst-case capture is another design. */
const GEOMETRY_COVERAGE = 0.6;

export function convertKind(packFiles: VariantCaptures[], kind: string): KindConversion | null {
  const templateKind = templateKindFor(kind);
  const pages: PageReport[] = [];
  const document: TemplateDocumentV2 = { formatVersion: 2, pages: {} };
  for (const page of kindPages(templateKind)) {
    // Variants of this kind and page (the Results set is compared, not converted).
    const candidates = packFiles.filter(
      (f) =>
        templateKindFor(f.variant.kind) === templateKind &&
        f.variant.kind !== "results" &&
        f.variant.page === page,
    );
    if (!candidates.length) continue;
    const groups = new Map<string, VariantCaptures[]>();
    for (const f of candidates) {
      if (f.variant.role === "cover") continue;
      const key = groupKey(f.variant);
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    // Ties keep the pack's own order: its default design (and the Runs preset) first.
    const ranked = [...groups.entries()]
      .map(([key, files]) => ({ key, files, ...coverage(files, templateKind, page) }))
      .sort((a, b) => b.score - a.score);
    const chosen = ranked[0];
    if (!chosen) continue;
    const files = chosen.files;
    const find = (pred: (v: CaptureVariant) => boolean) => files.find((f) => pred(f.variant));
    const full = find((v) => (v.preset === "full" || !v.preset) && v.photo && v.sponsorsOn);
    const standard = find((v) => (v.preset === "standard" || !v.preset) && v.photo && v.sponsorsOn);
    const minimal = find((v) => v.preset === "minimal" && v.photo && v.sponsorsOn);
    const noPhoto = find((v) => (v.preset === "standard" || !v.preset) && !v.photo);
    const noSponsors = find((v) => (v.preset === "standard" || !v.preset) && !v.sponsorsOn);
    const base = full ?? standard;
    if (!base) continue;

    const maps: SizeMaps[] = [];
    const polish: PolishItem[] = [];
    const untokenised = new Set<string>();
    const motion: Record<string, string> = {};
    const renders: PageReport["renders"] = {};
    for (const size of SIZES) {
      const a = pick(base, size, { content: "sentinel", palette: "A" });
      if (!a) continue;
      const baseB = pick(base, size, { content: "sentinel", palette: "B" });
      const aliases = aliasesFor(templateKind, page);
      // Boxes from the worst-case render of the same variant and size.
      const worstCap = pick(base, size, { content: "worst", palette: "A" });
      let mapped = mapCapture(a.capture, {
        paletteB: baseB?.capture,
        aliases,
        geometry: worstCap?.capture ?? null,
      });
      // A worst case that draws another design (its content flips the pack's layout) has
      // no boxes for this one: the sentinel render's boxes are used instead.
      const otherDesign = (mapped.geometryCoverage ?? 1) < GEOMETRY_COVERAGE;
      if (otherDesign) {
        mapped = mapCapture(a.capture, { paletteB: baseB?.capture, aliases });
        mapped.polish.push({
          element: -1,
          what: "the worst-case render draws another design: boxes sized from the sentinel render",
        });
      }
      // Colour checks need the aligned palette-B twin, captured at the standard preset.
      const stdA = pick(standard, size, { content: "sentinel", palette: "A" });
      const stdB = pick(standard, size, { content: "sentinel", palette: "B" });
      const checked: MapResult | null =
        stdA && stdB ? mapCapture(stdA.capture, { paletteB: stdB.capture, aliases }) : null;
      for (const p of mapped.polish) polish.push(p);
      for (const u of checked?.untokenised ?? mapped.untokenised) untokenised.add(u);
      Object.assign(motion, mapped.motion);
      const pair = (on: VariantCaptures | undefined, off: VariantCaptures | undefined) => {
        const onCap = pick(on, size, { content: "sentinel", palette: "A" });
        const offCap = pick(off, size, { content: "sentinel", palette: "A" });
        return onCap && offCap
          ? {
              on: mapCapture(onCap.capture, { aliases }),
              off: mapCapture(offCap.capture, { aliases }),
            }
          : undefined;
      };
      const minA = pick(minimal, size, { content: "sentinel", palette: "A" });
      maps.push({
        size,
        base: mapped,
        baseCapture: a.capture,
        ...(minA ? { minimal: mapCapture(minA.capture, { aliases }) } : {}),
        ...(noPhoto ? { photo: pair(standard, noPhoto) } : {}),
        ...(noSponsors ? { sponsors: pair(standard, noSponsors) } : {}),
      });
      renders[size] = (!otherDesign && worstCap ? worstCap : a).render;
    }
    if (!maps.length) continue;
    const merged = mergePage(maps, `${page}-`);
    const kept = withinCatalogue(merged.layers, templateKind, page);
    document.pages[page] = { layers: kept.layers };
    for (const d of kept.dropped) polish.push({ element: -1, what: d });
    pages.push({
      kind: templateKind,
      page,
      source: `${page}.${chosen.key}`,
      alternatives: ranked.slice(1).map((r) => `${page}.${r.key}`),
      sizes: maps.map((m) => m.size),
      layers: countKinds(merged.layers),
      stacks: merged.stacks,
      unknownTokens: chosen.unknown,
      polish: dedupe(polish.map((p) => p.what)),
      untokenised: [...untokenised],
      motion,
      renders,
    });
  }
  if (!pages.length) return null;
  const json = JSON.stringify(document);
  const palettes = [
    ...(json.includes("var(--ck-") ? (["club-kit"] as const) : []),
    ...(json.includes("var(--dt-") ? (["duotone"] as const) : []),
  ];
  if (palettes.length) document.palettes = [...palettes];
  return { kind: templateKind, document, pages };
}

function countKinds(layers: TemplateLayerV2[]): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (list: TemplateLayerV2[]) => {
    for (const l of list) {
      out[l.kind] = (out[l.kind] ?? 0) + 1;
      if (isGroupLayer(l)) walk(l.children);
    }
  };
  walk(layers);
  return out;
}

/** The same message once, with a count when it repeats. */
function dedupe(items: string[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) {
    const key = i.replace(/element \d+/g, "element").replace(/\(element \d+\)/g, "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => (n > 1 ? `${k} (×${n})` : k));
}

/**
 * Layers whose tokens the page's catalogue has: a layer binding a token the
 * page can't bind (a single card's sponsor strip, `{{sponsor1}}`, outside the
 * kinds whose catalogue lists sponsors) is dropped and reported, so every
 * converted document validates.
 */
export function withinCatalogue(
  layers: TemplateLayerV2[],
  kind: string,
  page: PageKey,
): { layers: TemplateLayerV2[]; dropped: string[] } {
  const known = pageTokenKeys(kind, page);
  const catalogue = pageTokens(kind, page)?.repeats ?? [];
  const repeats = new Map(catalogue.map((r) => [r.key, new Set(r.fields.map((f) => f.key))]));
  const variants = new Map(catalogue.map((r) => [r.key, new Set(r.variants)]));
  const dropped: string[] = [];
  /** A rows layer without the row styles its repeat doesn't have (a leaderboard's `top` row). */
  const knownVariants = (l: TemplateLayerV2): TemplateLayerV2 => {
    if (l.kind !== "rows" || !l.rows.variants) return l;
    const allowed = variants.get(l.rows.repeat) ?? new Set<string>();
    const keep = Object.entries(l.rows.variants).filter(([v]) => allowed.has(v));
    const gone = Object.keys(l.rows.variants).filter((v) => !allowed.has(v));
    if (!gone.length) return l;
    dropped.push(
      `rows ${l.rows.repeat}: row style ${gone.join(", ")} dropped (not a style this list has)`,
    );
    const rows = { ...l.rows };
    if (keep.length) rows.variants = Object.fromEntries(keep);
    else delete rows.variants;
    return { ...l, rows };
  };
  const keep = (l: TemplateLayerV2): boolean => {
    if (l.kind === "rows") {
      const fields = repeats.get(l.rows.repeat);
      const bad = fields
        ? l.rows.cells.filter((c) => !fields.has(c.field)).map((c) => c.field)
        : [l.rows.repeat];
      if (bad.length)
        dropped.push(
          `rows ${l.rows.repeat} dropped: ${[...new Set(bad)].join(", ")} not in the page's catalogue`,
        );
      return bad.length === 0;
    }
    const content = l.kind === "text" || l.kind === "image" ? (l.content ?? "") : "";
    const unknown = [...content.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)]
      .map((m) => m[1]!)
      .filter((t) => !known.has(t));
    if (unknown.length)
      dropped.push(`${l.kind} {{${unknown.join("}}, {{")}}} dropped: not in the page's catalogue`);
    return unknown.length === 0;
  };
  const walk = (list: TemplateLayerV2[]): TemplateLayerV2[] =>
    list
      .filter(keep)
      .map((l) => (isGroupLayer(l) ? { ...l, children: walk(l.children) } : knownVariants(l)));
  return { layers: walk(layers), dropped };
}

/** Tokens of the top-performers block, which the Results projection drops. */
const PERFORMERS = /performers|batters|bowlers|\btop/i;

/**
 * Whether the pack draws the Results set's result slide as its Match Summary
 * result page, apart from the performers block (architect §1: if not,
 * `results` becomes a kind of its own). Compared at story size, standard preset.
 */
export function compareResults(
  files: VariantCaptures[],
): { same: boolean; differences: string[] } | null {
  const at = (pred: (v: CaptureVariant) => boolean) =>
    files
      .find((f) => pred(f.variant))
      ?.captures.find((c) => c.size === "story" && c.content === "sentinel" && c.palette === "A");
  const results = at(
    (v) =>
      v.kind === "results" &&
      v.page === "result" &&
      v.preset === "standard" &&
      v.photo &&
      v.sponsorsOn,
  );
  const summary = at(
    (v) =>
      v.kind === "matchSummary" &&
      v.page === "result" &&
      !v.slide &&
      v.preset === "standard" &&
      v.photo &&
      v.sponsorsOn,
  );
  if (!results || !summary) return null;
  const sigs = (cap: PackCapture) =>
    new Set(
      mapCapture(cap)
        .layers.filter((l) => l.sig.startsWith("text:") && !PERFORMERS.test(l.sig))
        .map((l) => l.sig.replace(/#\d+$/, "")),
    );
  const a = sigs(results.capture);
  const b = sigs(summary.capture);
  const differences = [
    ...[...a].filter((s) => !b.has(s)).map((s) => `only in the Results set: ${s.slice(5)}`),
    ...[...b].filter((s) => !a.has(s)).map((s) => `only on the Match Summary card: ${s.slice(5)}`),
  ];
  return { same: differences.length === 0, differences };
}

/** The template kinds a pack's captures cover. */
export function packKinds(files: VariantCaptures[]): string[] {
  return [...new Set(files.map((f) => templateKindFor(f.variant.kind)))].sort();
}
