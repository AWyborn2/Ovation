/**
 * Retest 6, item F: a look's set draws with that look's own pages.
 *
 * Picking Clubhouse for a set gave Duotone's cover, day and sponsors slides:
 * Clubhouse's Match Day bundle had carried Duotone's layers on those pages
 * since it was first committed. Set assembly itself was right (each look's set
 * is made from its own kind bundles), so these tests pin both halves:
 *
 * - every look that has a set: each page of each set is that look's own kind
 *   page, layer for layer, and a junior set's slides draw those same pages;
 * - no look's set pages are another look's (a look's "… Classic" variant,
 *   "the original … layer designs", shares its base look's pages on purpose).
 *
 * Pure: reads the committed bundles, no database.
 */
import { describe, expect, it } from "vitest";
import {
  expandSetSlides,
  type SetDocument,
  type SetItem,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import { TEMPLATE_BUNDLES, type TemplateBundle } from "@workspace/template-bundles";
import { bundleSetTemplates } from "./bundles";

type V2 = { pages: Record<string, { layers: TemplateLayerV2[] } | undefined> };

const kindDoc = (bundle: TemplateBundle, kind: string): V2 | null =>
  (bundle.templates.find((t) => t.kind === kind)?.file.document as V2 | undefined) ?? null;

const withSets = TEMPLATE_BUNDLES.filter((b) => bundleSetTemplates(b).length > 0);

/** A set's items: one per slot, so every page draws at least one slide. */
const ITEMS: SetItem[] = [
  { key: "cover", slot: "cover", input: { kind: "matchDay", date: "SAT 14 DEC" } },
  { key: "f1", slot: "fixture", input: { kind: "matchDay", grade: "Under 13" } },
  { key: "t1", slot: "team", input: { kind: "teamList", grade: "Under 13" } },
  { key: "r1", slot: "result", input: { kind: "matchSummary", grade: "Under 13" } },
  { key: "d1", slot: "day", input: { kind: "matchDay", carouselDay: { heading: "Saturday" } } },
  { key: "sponsors", slot: "sponsors", input: { kind: "matchDay" } },
];

describe("each look's set draws with that look's own pages (retest 6, F)", () => {
  it("every look with a Match Day set is checked, Clubhouse among them", () => {
    expect(withSets.map((b) => b.slug)).toContain("clubhouse");
    expect(withSets.length).toBeGreaterThan(5);
  });

  for (const bundle of withSets)
    for (const set of bundleSetTemplates(bundle)) {
      const doc = set.file.document as SetDocument;
      it(`${bundle.slug} ${set.kind}: every page is ${bundle.look.name}'s own`, () => {
        for (const page of doc.pages) {
          const own = kindDoc(bundle, page.kind)?.pages[page.page]?.layers;
          expect(own, `${page.kind}.${page.page}`).toBeDefined();
          expect(page.layers).toEqual(own);
        }
      });

      for (const junior of [false, true])
        it(`${bundle.slug} ${set.kind}: ${junior ? "a junior" : "a senior"} set's slides draw those pages`, () => {
          const slides = expandSetSlides(doc, ITEMS, { junior });
          expect(slides.length).toBeGreaterThan(0);
          for (const s of slides) {
            const own = kindDoc(bundle, s.page.kind)?.pages[s.page.page]?.layers;
            expect(s.page.layers, `${s.key} on ${s.page.kind}.${s.page.page}`).toEqual(own);
            if (junior) expect(s.input.junior).toBe(true);
          }
        });
    }

  it("Clubhouse's Match Day set holds no Duotone colours", () => {
    const clubhouse = withSets.find((b) => b.slug === "clubhouse")!;
    for (const set of bundleSetTemplates(clubhouse)) {
      const doc = set.file.document as SetDocument;
      expect(JSON.stringify(doc.pages), set.kind).not.toContain("--dt-");
      expect(doc.palettes ?? [], set.kind).not.toContain("duotone");
    }
  });
});

describe("no look's set pages are another look's copy (retest 6, F)", () => {
  /** A value as text with its object keys in order, so equal layers read equal. */
  const stable = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.keys(v)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
            .join(",")}}`
        : JSON.stringify(v);
  /** A layer as drawn: its id, link, name and signature aside. */
  const body = (l: TemplateLayerV2) => {
    const {
      id: _id,
      link: _link,
      name: _name,
      sig: _sig,
      ...rest
    } = l as TemplateLayerV2 & {
      sig?: string;
    };
    return stable(rest);
  };
  /** The share of the smaller page's layers the other page draws identically. */
  const overlap = (a: TemplateLayerV2[], b: TemplateLayerV2[]) => {
    const counts = new Map<string, number>();
    for (const l of b) counts.set(body(l), (counts.get(body(l)) ?? 0) + 1);
    let same = 0;
    for (const l of a) {
      const n = counts.get(body(l)) ?? 0;
      if (n > 0) {
        same++;
        counts.set(body(l), n - 1);
      }
    }
    return same / Math.min(a.length, b.length);
  };
  // "Club Kit Classic" is the original Club Kit layer designs (and Broadcast
  // Classic Broadcast Dark's): a variant shares its base look's set pages.
  const variants = (a: string, b: string) =>
    a.replace(/-classic$/, "") === b.replace(/-classic$/, "") ||
    (a.startsWith("broadcast-") && b.startsWith("broadcast-"));

  const PAGES: Array<[string, string]> = [
    ["matchDay", "title"],
    ["matchDay", "day"],
    ["matchDay", "sponsors"],
    ["matchDay", "fixture"],
    ["matchSummary", "day"],
    ["matchSummary", "result"],
  ];
  for (const [kind, page] of PAGES)
    it(`${kind}.${page}: each look draws its own`, () => {
      const looks = withSets
        .map((b) => ({ slug: b.slug, layers: kindDoc(b, kind)?.pages[page]?.layers }))
        .filter((l): l is { slug: string; layers: TemplateLayerV2[] } => !!l.layers?.length);
      const copies: string[] = [];
      for (const a of looks)
        for (const b of looks) {
          if (a.slug >= b.slug || variants(a.slug, b.slug)) continue;
          const share = overlap(a.layers, b.layers);
          if (share >= 0.5) copies.push(`${a.slug} ~ ${b.slug} (${Math.round(share * 100)}%)`);
        }
      expect(copies).toEqual([]);
    });
});
