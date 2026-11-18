/**
 * Team List looks on every committed bundle, every size (Ash's round 3
 * retest, Nov 2026), read from the bundle files on disk:
 * - a side of 14 (the most a list draws, squeezed to fit its box when it holds
 *   fewer) keeps clear of the photo and the card's other foreground.
 *
 * The bundle fit check measures the same rule on the drawn card in Chrome
 * (`rows-overlap` in `template-fit.ts`); this is its geometry, so a bundle
 * edit that runs a list into its photo fails the web tests too.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  layerTokens,
  rowsColumns,
  type RowsLayerV2,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import { SIZES, type CardSize } from "@/lib/share-card/types";
import { ROWS_PHOTO_CLEARANCE, paintsOver, rectMeetsPolygon } from "./template-fit";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIDE = 14;
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];

type Box = { x: number; y: number; w: number; h: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type Pt = [number, number];

/** Every committed Team List bundle (`teamList`, `teamListRound`): look, kind and document. */
function teamListBundles(): Array<{ name: string; doc: TemplateDocumentV2 }> {
  const out: Array<{ name: string; doc: TemplateDocumentV2 }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!/^teamList\w*\.json$/.test(file)) continue;
      const { document } = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        document: TemplateDocumentV2;
      };
      out.push({ name: `${look}/${file.replace(/\.json$/, "")}`, doc: document });
    }
  }
  return out;
}

/** A layer drawn on `size` with the photo and sponsors on. */
function drawn(l: TemplateLayerV2, size: CardSize): Box | null {
  if (l.hidden || (l.sizes && !l.sizes.includes(size))) return null;
  if (l.showWhen?.photo === false || l.showWhen?.sponsors === false) return null;
  if (l.showWhen?.junior === true) return null;
  return (l.geometry as Partial<Record<CardSize, Box>>)[size] ?? null;
}

const px = (b: Box, size: CardSize): Rect => {
  const { w, h } = SIZES[size];
  return {
    left: (b.x / 100) * w,
    top: (b.y / 100) * h,
    right: ((b.x + b.w) / 100) * w,
    bottom: ((b.y + b.h) / 100) * h,
  };
};

/** Where a side of 14 draws: the box's width, as tall as its longest column (at most the box). */
function rowsExtent(l: RowsLayerV2, box: Box, size: CardSize): Rect {
  const spec = l.rows;
  const perColumn = Math.ceil(SIDE / rowsColumns(spec));
  const rowHeight = Number(spec.rowHeight ?? 7);
  const gap = Number(spec.gap ?? 0);
  const { w, h } = SIZES[size];
  const tall = (((perColumn * rowHeight + (perColumn - 1) * gap) / 100) * w * 100) / h;
  return px({ ...box, h: Math.min(box.h, tall) }, size);
}

/** A layer's painted area in card pixels: its box, cut to its clip polygon. */
function area(l: TemplateLayerV2, r: Rect): Pt[] {
  const poly = (l.style as { clip?: { polygon?: Pt[] } } | undefined)?.clip?.polygon;
  if (!Array.isArray(poly) || poly.length < 3)
    return [
      [r.left, r.top],
      [r.right, r.top],
      [r.right, r.bottom],
      [r.left, r.bottom],
    ];
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  return poly.map(([x, y]) => [r.left + (x / 100) * w, r.top + (y / 100) * h]);
}

const holds = (outer: Rect, inner: Rect) =>
  outer.left <= inner.left + 1 &&
  outer.top <= inner.top + 1 &&
  outer.right >= inner.right - 1 &&
  outer.bottom >= inner.bottom - 1;

/** What a side of 14 runs into on a bundle's pages, as readable lines. */
function overlaps(name: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    const layers = flattenLayers(p?.layers ?? []);
    for (const [li, list] of layers.entries()) {
      if (list.kind !== "rows" || list.rows?.repeat !== "players") continue;
      for (const size of SIZE_KEYS) {
        const box = drawn(list, size);
        if (!box) continue;
        const rows = rowsExtent(list, box, size);
        const short = Math.min(SIZES[size].w, SIZES[size].h);
        for (const [oi, other] of layers.entries()) {
          const ob = oi === li ? null : drawn(other, size);
          if (!ob || (ob.w >= 90 && ob.h >= 90)) continue;
          const opacity = (other.style as { opacity?: unknown } | undefined)?.opacity;
          if (typeof opacity === "number" && opacity <= 0.3) continue;
          const photo = other.kind === "photo";
          const data =
            layerTokens(other).length > 0 && (other.kind === "image" || other.kind === "text");
          if (!photo && !data) continue;
          // A panel or scrim drawn over the layer but under the list hides it there.
          if (
            oi < li &&
            layers
              .slice(oi + 1, li)
              .some(
                (s) => paintsOver(s) && drawn(s, size) && holds(px(drawn(s, size)!, size), rows),
              )
          )
            continue;
          const pad = photo ? ROWS_PHOTO_CLEARANCE * short : -1;
          const grown = {
            left: rows.left - pad,
            top: rows.top - pad,
            right: rows.right + pad,
            bottom: rows.bottom + pad,
          };
          if (rectMeetsPolygon(grown, area(other, px(ob, size))))
            out.push(`${name} ${page} ${size}: ${list.id} into ${other.id}`);
        }
      }
    }
  }
  return out;
}

describe("Team List rows clear of the photo", () => {
  const bundles = teamListBundles();

  it("reads every committed Team List bundle", () => {
    expect(bundles.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps a side of 14 clear of the photo, logos and data text at every size", () => {
    // Clubhouse's Team List is unlisted (a raw conversion: its list starts at
    // the photo's edge), so it doesn't ship and isn't held to the rule yet.
    const listed = bundles.filter(
      (b) =>
        (
          JSON.parse(readFileSync(path.join(BUNDLES, `${b.name}.json`), "utf8")) as {
            listed?: boolean;
          }
        ).listed !== false,
    );
    expect(listed.flatMap((b) => overlaps(b.name, b.doc))).toEqual([]);
  });

  it("would catch Bold Type's story list as it was (26 px above the photo)", () => {
    const bold = bundles.find((b) => b.name === "bold-type/teamList")!;
    const was = structuredClone(bold.doc);
    for (const l of flattenLayers(was.pages.team!.layers))
      if (l.id === "team-l7-story") (l.geometry as Record<string, Box>).story!.y = 59;
    expect(overlaps("bold-type/teamList", was)).toEqual([
      "bold-type/teamList team story: team-l28 into team-l7-story",
    ]);
  });
});

// ── The round label above the grade heading (Broadcast Dark landscape) ──────

/**
 * The least space between the round label ("ROUND 6") and the grade heading
 * under it ("A GRADE"): 0.75% of the card's shorter side (8 px on a 1080 card,
 * about 5 px on a 630-high landscape one).
 */
const MIN_HEADING_GAP = 0.0075;

type TextStyle = { fontSize?: number; lineHeight?: number };

/**
 * Where a one-line text box's line is drawn, top to bottom in card pixels:
 * its box, or a line taller than its box, centred on it (text is centred
 * vertically in its box and spills both ways).
 */
function lineExtent(l: TemplateLayerV2, b: Box, size: CardSize): [number, number] {
  const { w: W, h: H } = SIZES[size];
  const st = (l.style ?? {}) as TextStyle;
  const line = (Number(st.fontSize ?? 5) / 100) * W * Number(st.lineHeight ?? 1.2);
  const top = (b.y / 100) * H;
  const height = (b.h / 100) * H;
  const tall = Math.max(height, line);
  const mid = top + height / 2;
  return [mid - tall / 2, mid + tall / 2];
}

/** The round label and grade heading of a Team List page on each size, where it has both. */
function headingPairs(doc: TemplateDocumentV2) {
  const layers = flattenLayers(doc.pages.team?.layers ?? []);
  const on = (token: string, size: CardSize) =>
    layers.find(
      (l) =>
        l.kind === "text" &&
        String(l.content ?? "").includes(token) &&
        !l.hidden &&
        (!l.sizes || l.sizes.includes(size)) &&
        (l.geometry as Partial<Record<CardSize, Box>>)[size],
    );
  return SIZE_KEYS.flatMap((size) => {
    const round = on("{{broadcastRoundLabel}}", size);
    const grade = on("{{gradeHeading}}", size);
    return round && grade ? [{ size, round, grade }] : [];
  });
}

describe("Team List round label and grade heading", () => {
  const box = (l: TemplateLayerV2, size: CardSize) => (l.geometry as Record<string, Box>)[size]!;

  it("Broadcast Dark has both at every size", () => {
    const doc = teamListBundles().find((b) => b.name === "broadcast-dark/teamList")!.doc;
    expect(headingPairs(doc).map((p) => p.size)).toEqual(SIZE_KEYS);
  });

  for (const { name, doc } of teamListBundles())
    for (const { size, round, grade } of headingPairs(doc))
      it(`${name} ${size}: "ROUND 6" sits clear above "A GRADE"`, () => {
        const r = box(round, size);
        const g = box(grade, size);
        // The boxes themselves don't overlap, and the round comes first.
        expect(r.y + r.h, `${round.id} ends below ${grade.id} starts`).toBeLessThanOrEqual(g.y);
        // Nor do the lines as drawn, with room between them.
        const [, roundBottom] = lineExtent(round, r, size);
        const [gradeTop] = lineExtent(grade, g, size);
        const { w, h } = SIZES[size];
        expect(gradeTop - roundBottom).toBeGreaterThanOrEqual(MIN_HEADING_GAP * Math.min(w, h));
      });
});

/**
 * Round 3 retest (junior headings): the venue · date · time line sits clear
 * under the grade heading at every size, as drawn. On set 973 the line ran
 * through the heading.
 */
function headingVenuePairs(doc: TemplateDocumentV2) {
  const layers = flattenLayers(doc.pages.team?.layers ?? []);
  const on = (token: string, size: CardSize) =>
    layers.find(
      (l) =>
        l.kind === "text" &&
        String(l.content ?? "").includes(token) &&
        !l.hidden &&
        (!l.sizes || l.sizes.includes(size)) &&
        (l.geometry as Partial<Record<CardSize, Box>>)[size],
    );
  return SIZE_KEYS.flatMap((size) => {
    const grade = on("{{gradeHeading}}", size);
    const venue = on("{{venueDateTime}}", size);
    return grade && venue ? [{ size, grade, venue }] : [];
  });
}

describe("Team List grade heading and venue line", () => {
  const box = (l: TemplateLayerV2, size: CardSize) => (l.geometry as Record<string, Box>)[size]!;

  it("Broadcast Dark has both at every size", () => {
    const doc = teamListBundles().find((b) => b.name === "broadcast-dark/teamList")!.doc;
    expect(headingVenuePairs(doc).map((p) => p.size)).toEqual(SIZE_KEYS);
  });

  for (const { name, doc } of teamListBundles())
    for (const { size, grade, venue } of headingVenuePairs(doc))
      it(`${name} ${size}: the venue line sits clear of the heading`, () => {
        const g = box(grade, size);
        const v = box(venue, size);
        // Only a venue line under the heading, sharing its width, is checked
        // (some looks set it above or beside the heading).
        if (v.y < g.y || v.x >= g.x + g.w || g.x >= v.x + v.w) return;
        const [, headingBottom] = lineExtent(grade, g, size);
        const [venueTop] = lineExtent(venue, v, size);
        const { w, h } = SIZES[size];
        expect(
          venueTop - headingBottom,
          `${venue.id} starts ${Math.round(venueTop - headingBottom)} px after ${grade.id} ends`,
        ).toBeGreaterThanOrEqual(MIN_HEADING_GAP * Math.min(w, h));
      });
});
