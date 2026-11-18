/**
 * An empty slot draws nothing (Ash, dev retest 5, Nov 2026). Every logo,
 * crest, opposition-logo and sponsor slot, in every look, kind, page and
 * size, senior and junior: when the slot has no image, no dark plate or
 * frame is left where it would have been. (A photo slot with no photo draws
 * the look's no-photo design: `junior-photo-slot.test.ts`.)
 *
 * Retest 5 found, on Bold Type: an empty sponsor plate under a Team List
 * slide's footer (set 980), an empty opposition-crest square on a junior
 * Result (and on every row of a junior Match Day day slide, set 981), and
 * three empty plates in a Match Day sponsors slide's footer (set 980).
 *
 * Sweeps every committed bundle, drawn with the fit check's worst-case
 * content (`worstCaseCard`) and every opposition logo and crest left empty
 * (a junior opposition often has none): every page × size × senior and
 * junior (the pages a junior draws) × photo and none (where a page uses one)
 * × no sponsors, one and the most (where a page uses them). It fails on:
 *
 *  - a plate: a drawn shape with a solid fill or a full border, no text or
 *    image of its own, sitting round or under an image slot that wasn't drawn,
 *    with nothing drawn in it;
 *  - a stray plate: a small solid shape with nothing drawn on it at all (a
 *    tile whose logo was taken out of the design);
 *  - a list row's backdrop behind a crest or logo the row doesn't draw.
 *
 * Read from the bundle files on disk, as the other bundle tests are.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JUNIOR_PAGES,
  kindPages,
  normaliseDocument,
  pageSizes,
  pageUsesPhoto,
  pageUsesSponsors,
  placeholderImage,
  templateKindFor,
  worstCaseCard,
  type LayerBox,
  type PageKey,
  type RowsSpec,
  type TemplateDocumentV2,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import {
  BLANK_PACK_ID,
  renderPackCard,
  resolveCardTokens,
  type CardAdjustments,
  type PackCardData,
} from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { resolveGeometry } from "./adjustments";

/**
 * The logo a layer is a slot for: an image bound to one logo, crest or
 * sponsor `{{token}}`. A photo frame with no photo draws the look's no-photo
 * design instead (`junior-photo-slot.test.ts`), so it isn't one here.
 */
function slotOf(l: TemplateLayerV2): string | null {
  if (l.kind !== "image") return null;
  const token = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(String(l.content ?? "").trim())?.[1] ?? "";
  return /logo$|crest$|^(weekend)?sponsor\d+$/i.test(token) ? token : null;
}

/** The list fields that hold a logo or crest (`LOGO_ROW_FIELDS`). */
const LOGO_FIELDS = ["crest", "logo"];

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");

/** A bundle: its document as stored (what the renderer reads) and normalised (to read its layers). */
type Bundle = { look: string; kind: string; raw: unknown; doc: TemplateDocumentV2 };

/** Every bundle of every look, as the template library lists them. */
function bundles(): Bundle[] {
  const out: Bundle[] = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".json") || file === "look.json") continue;
      const kind = file.replace(/\.json$/, "");
      const json = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { document?: unknown };
      const doc = normaliseDocument(json.document, kind) as TemplateDocumentV2;
      if (doc?.pages) out.push({ look, kind, raw: json.document, doc });
    }
  }
  return out;
}

/** Every opposition logo and row crest is empty; every other image is a placeholder. */
const image = (name: string) => (/^opposition/.test(name) ? "" : placeholderImage(name));

type Variant = {
  page: PageKey;
  size: CardSize;
  junior: boolean;
  photo: boolean | undefined;
  sponsors: 0 | 1 | 3;
};

/** The variants a page is swept with. */
function variants(doc: TemplateDocumentV2, kind: string, page: PageKey): Variant[] {
  const out: Variant[] = [];
  const photos = pageUsesPhoto(doc, kind, page) ? [true, false] : [undefined];
  const loads: Array<0 | 1 | 3> = pageUsesSponsors(doc, page) ? [0, 1, 3] : [3];
  const juniors =
    page === "day" ? [true] : JUNIOR_PAGES[kind]?.includes(page) ? [false, true] : [false];
  for (const size of pageSizes(doc, page) as CardSize[])
    for (const junior of juniors)
      for (const photo of page === "day" ? [undefined] : photos)
        for (const sponsors of loads) out.push({ page, size, junior, photo, sponsors });
  return out;
}

function render(
  kind: string,
  doc: unknown,
  v: Variant,
  opts: { contentKind?: string; image?: (name: string) => string } = {},
): string | null {
  let card;
  try {
    card = worstCaseCard(
      kind,
      {
        page: v.page,
        contentKind: opts.contentKind ?? templateKindFor(kind),
        preset: "full",
        ...(v.photo === undefined ? {} : { photo: v.photo }),
        sponsors: v.sponsors === 0 ? "none" : "max",
        junior: v.junior,
      },
      { image: opts.image ?? image },
    );
  } catch {
    return null; // A kind with no worst-case content (not a card kind).
  }
  const data = { ...card.data } as unknown as PackCardData & {
    sponsors: unknown[];
    playerSponsors: unknown[];
  };
  if (v.sponsors === 1) {
    data.sponsors = data.sponsors.slice(0, 1);
    data.playerSponsors = data.playerSponsors.slice(0, 1);
  }
  const tokens = resolveCardTokens({
    theme: null,
    junior: card.junior,
    data,
    packId: BLANK_PACK_ID,
  });
  return renderPackCard(
    card.input as unknown as ShareCardInput,
    v.size,
    card.sponsorsOn,
    tokens,
    card.junior,
    data,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
    { page: v.page },
  );
}

// ── Geometry ────────────────────────────────────────────────────────────────

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const area = (b: LayerBox) => Math.max(0, n(b.w)) * Math.max(0, n(b.h));
function overlap(a: LayerBox, b: LayerBox): number {
  const w = Math.min(n(a.x) + n(a.w), n(b.x) + n(b.w)) - Math.max(n(a.x), n(b.x));
  const h = Math.min(n(a.y) + n(a.h), n(b.y) + n(b.h)) - Math.max(n(a.y), n(b.y));
  return w > 0 && h > 0 ? w * h : 0;
}
/** Whether `outer` holds all of `inner` (to a tenth of a percent). */
const encloses = (outer: LayerBox, inner: LayerBox, tol = 0.1) =>
  n(outer.x) - tol <= n(inner.x) &&
  n(outer.y) - tol <= n(inner.y) &&
  n(outer.x) + n(outer.w) + tol >= n(inner.x) + n(inner.w) &&
  n(outer.y) + n(outer.h) + tol >= n(inner.y) + n(inner.h);
const boxOn = (l: TemplateLayerV2, size: CardSize): LayerBox | null =>
  l.hidden || (l.sizes && !l.sizes.includes(size))
    ? null
    : (resolveGeometry(l.geometry as Partial<Record<CardSize, LayerBox>>, l.editedAt, size)
        ?.value ?? null);

/** Each sibling list of a page: its own layers, then each group's children. */
function siblingLists(layers: readonly TemplateLayerV2[]): TemplateLayerV2[][] {
  const lists = [layers as TemplateLayerV2[]];
  for (const layer of layers)
    if (layer.kind === "group" && Array.isArray(layer.children))
      lists.push(...siblingLists(layer.children as TemplateLayerV2[]));
  return lists;
}

type Style = {
  fill?: unknown;
  opacity?: number;
  border?: { width?: number; sides?: string[] };
};

/** A shape that reads as a box: a solid fill, or a border on three or four sides. */
function plateLike(l: TemplateLayerV2): boolean {
  if (l.kind !== "shape") return false;
  const s = (l.style ?? {}) as Style;
  if (n(s.opacity ?? 1) < 0.15) return false;
  const fill =
    typeof s.fill === "string" &&
    !/^(transparent|none)$/i.test(s.fill.trim()) &&
    !/^#(?:[0-9a-f]{6}00|[0-9a-f]{3}0)$/i.test(s.fill.trim());
  const border = n(s.border?.width) > 0 && (!s.border?.sides || s.border.sides.length >= 3);
  return fill || border;
}

/** A small upright box shape on the card: the size and shape of a logo tile. */
function strayTile(l: TemplateLayerV2, b: LayerBox): boolean {
  const s = (l.style ?? {}) as { clip?: unknown; skew?: unknown };
  if (s.clip || s.skew || n(b.rotate)) return false;
  const [x, y, w, h] = [n(b.x), n(b.y), n(b.w), n(b.h)];
  if (x < 0 || y < 0 || x + w > 100 || y + h > 100) return false;
  return w * h <= 600 && Math.min(w, h) >= 2 && Math.max(w, h) <= 4 * Math.min(w, h);
}

/** A layer designed for the empty slot: a no-photo panel or a stand-in. */
const designed = (l: TemplateLayerV2) =>
  l.showWhen?.photo === false || typeof l.showWhen?.noField === "string";

const CONTENT = new Set(["text", "image", "photo", "rows", "group"]);

/** Empty plates and stray plates on one drawn variant. */
function emptyPlates(doc: TemplateDocumentV2, v: Variant, html: string): string[] {
  const drawn = new Set([...html.matchAll(/data-layer-id="([^"]+)"/g)].map((m) => m[1]!));
  const out: string[] = [];
  for (const list of siblingLists(doc.pages[v.page]?.layers ?? [])) {
    const on = list
      .map((layer) => ({ layer, box: boxOn(layer, v.size) }))
      .filter((e): e is { layer: TemplateLayerV2; box: LayerBox } => !!e.box && area(e.box) > 0);
    const emptySlots = on.filter((e) => slotOf(e.layer) && !drawn.has(e.layer.id));
    for (const plate of on) {
      if (!drawn.has(plate.layer.id) || !plateLike(plate.layer) || designed(plate.layer)) continue;
      const a = area(plate.box);
      // A plate under a drawn logo, smaller than or offset from the logo's
      // box: the logo is fitted in its box, so the plate's edge shows beside
      // it (card 978). A plate backs its logo's whole box, or frames it.
      const peeks = on.find(
        (s) =>
          slotOf(s.layer) &&
          drawn.has(s.layer.id) &&
          // Not a faint watermark crest across the card.
          n((s.layer.style as Style | undefined)?.opacity ?? 1) > 0.3 &&
          area(s.box) <= 4 * a &&
          overlap(plate.box, s.box) >= 0.6 * a &&
          !encloses(plate.box, s.box),
      );
      if (peeks) out.push(`${plate.layer.id} (plate edge shows beside ${peeks.layer.id})`);
      // Anything drawn that sits in the plate (its label, a logo, a stand-in).
      const holdsContent = on.some(
        (o) =>
          o !== plate &&
          drawn.has(o.layer.id) &&
          (CONTENT.has(o.layer.kind) || designed(o.layer)) &&
          overlap(plate.box, o.box) >= 0.5 * area(o.box),
      );
      if (holdsContent) continue;
      // Round the slot or under it: the two about the same size (within four
      // times), and most of the smaller on the larger.
      const round = emptySlots.find(
        (s) =>
          a <= 4 * area(s.box) &&
          area(s.box) <= 4 * a &&
          overlap(plate.box, s.box) >= 0.5 * Math.min(a, area(s.box)),
      );
      if (round) {
        out.push(`${plate.layer.id} (empty ${slotOf(round.layer)} slot ${round.layer.id})`);
        continue;
      }
      // A small upright tile on the card with nothing in the design on it at
      // all: its logo was taken out. (A slanted stripe, a star or a corner
      // mark, clipped, skewed, rotated or bleeding off the card, is decoration,
      // as is a tile joined to shapes of about its size: a motif, a tape.)
      if (strayTile(plate.layer, plate.box)) {
        const touched = on.some(
          (o) =>
            o !== plate &&
            (overlap(plate.box, o.box) >= 0.5 * area(o.box) ||
              (o.layer.kind === "shape" && area(o.box) <= 4 * a && overlap(plate.box, o.box) > 0) ||
              (["image", "photo", "rows"].includes(o.layer.kind) &&
                area(o.box) <= 4 * a &&
                overlap(plate.box, o.box) >= 0.5 * a)),
        );
        if (!touched) out.push(`${plate.layer.id} (stray plate, nothing on it)`);
      }
    }
  }
  return out;
}

/** Row backdrops behind a crest, logo or photo the row doesn't draw. */
function emptyRowBackdrops(doc: TemplateDocumentV2, html: string): string[] {
  if (!html.includes("data-row-cell")) return [];
  const out: string[] = [];
  const layers = new Map<string, TemplateLayerV2>();
  for (const list of siblingLists(
    doc.pages ? Object.values(doc.pages).flatMap((p) => p?.layers ?? []) : [],
  ))
    for (const l of list) layers.set(l.id, l);
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-layer-id]"))) {
    const spec = (layers.get(el.getAttribute("data-layer-id") ?? "") as { rows?: RowsSpec })?.rows;
    if (!spec?.cells) continue;
    const imageFields = new Set(
      spec.cells
        .filter((c) => (c.show === "image" || c.show === "logo") && LOGO_FIELDS.includes(c.field))
        .map((c) => c.field),
    );
    for (const row of Array.from(el.querySelectorAll<HTMLElement>("[data-row-index]")))
      for (const cell of Array.from(
        row.querySelectorAll<HTMLElement>(":scope > [data-row-cell]"),
      )) {
        const field = cell.getAttribute("data-row-cell") ?? "";
        if (!imageFields.has(field) || cell.children.length > 0) continue;
        if (!/background/.test(cell.getAttribute("style") ?? "")) continue;
        const image = row.querySelector(`[data-row-cell="${field}"] img`);
        if (!image)
          out.push(
            `${el.getAttribute("data-layer-id")} row ${row.getAttribute("data-row-index")} ${field} backdrop`,
          );
      }
  }
  return [...new Set(out)];
}

const label = (b: Bundle, v: Variant) =>
  [
    `${b.look}/${b.kind}`,
    v.page,
    v.size,
    v.junior ? "junior" : "senior",
    v.photo === undefined ? "" : v.photo ? "photo" : "no-photo",
    `sponsors-${v.sponsors}`,
  ]
    .filter(Boolean)
    .join(" ");

/** Every empty-slot failure across the committed bundles. */
export function sweepEmptySlots(list: Bundle[]): { failures: string[]; drawn: number } {
  const failures: string[] = [];
  let count = 0;
  for (const b of list) {
    const kind = templateKindFor(b.kind);
    for (const page of kindPages(kind)) {
      if (!b.doc.pages[page]) continue;
      for (const v of variants(b.doc, kind, page)) {
        const html = render(b.kind, b.raw, v);
        if (html === null) continue;
        count += 1;
        for (const f of [...emptyPlates(b.doc, v, html), ...emptyRowBackdrops(b.doc, html)])
          failures.push(`${label(b, v)}: ${f}`);
      }
    }
  }
  return { failures, drawn: count };
}

// ── A Result names the opposition ───────────────────────────────────────────

/** Tokens that print the opposition's name: its name, bar name or short name. */
const OPPOSITION_NAME = /\{\{\s*opposition\.(name|barName|short)\s*\}\}/;
/** `innings1.team` and `innings2.team` print each side in batting order: both together name the opposition. */
const INNINGS_TEAM = [
  /\{\{\s*innings1\.(team|short)\s*\}\}/,
  /\{\{\s*innings2\.(team|short)\s*\}\}/,
];

/** A text layer's tokens: its content, or the field it binds. */
function textOf(l: TemplateLayerV2): string {
  if (l.kind !== "text") return "";
  const bind = (l as { bind?: string }).bind;
  return `${String(l.content ?? "")}${bind ? ` {{${bind}}}` : ""}`;
}

/**
 * Each Result variant whose drawn layers don't name the opposition: every
 * look's Result page × size × senior and junior × the opposition's crest and
 * none (a junior opposition often has none, or has it withheld) × Match
 * Summary and Results content × photo and none. The crest never stands in for
 * the name.
 */
export function resultsMissingOppositionName(list: Bundle[]): string[] {
  const out: string[] = [];
  for (const b of list) {
    if (templateKindFor(b.kind) !== "matchSummary" || !b.doc.pages.result) continue;
    const layers = siblingLists(b.doc.pages.result.layers ?? []).flat();
    const photos = pageUsesPhoto(b.doc, "matchSummary", "result") ? [true, false] : [undefined];
    for (const size of pageSizes(b.doc, "result") as CardSize[])
      for (const junior of [false, true])
        for (const crest of [true, false])
          for (const contentKind of ["matchSummary", "results"])
            for (const photo of photos) {
              const v: Variant = { page: "result", size, junior, photo, sponsors: 3 };
              const html = render(b.kind, b.raw, v, {
                contentKind,
                image: crest ? (name) => placeholderImage(name) : image,
              });
              if (html === null) continue;
              const drawn = new Set(
                [...html.matchAll(/data-layer-id="([^"]+)"/g)].map((m) => m[1]!),
              );
              const on = layers.filter((l) => drawn.has(l.id)).map(textOf);
              const named =
                on.some((t) => OPPOSITION_NAME.test(t)) ||
                INNINGS_TEAM.every((re) => on.some((t) => re.test(t)));
              if (!named)
                out.push(
                  [
                    `${b.look}/${b.kind} result ${size}`,
                    junior ? "junior" : "senior",
                    crest ? "crest" : "no crest",
                    contentKind,
                    photo === undefined ? "" : photo ? "photo" : "no photo",
                  ]
                    .filter(Boolean)
                    .join(" "),
                );
            }
  }
  return out;
}

describe("An empty slot draws nothing", () => {
  const all = bundles();

  it("reads every look's bundles", () => {
    const looks = new Set(all.map((b) => b.look));
    for (const look of ["bold-type", "broadcast-dark", "duotone", "club-kit", "sunset"])
      expect(looks, look).toContain(look);
    expect(all.length).toBeGreaterThanOrEqual(150);
  });

  it("no empty plate, stray plate or row backdrop on any look, kind, page, size or variant", () => {
    const { failures, drawn } = sweepEmptySlots(all);
    expect(drawn).toBeGreaterThan(2000);
    // One line per bundle, page and failure (sizes and variants folded), for a readable report.
    const folded = [
      ...new Set(
        failures.map((f) => f.replace(/ (square|portrait|story|landscape) .*?: /, " … : ")),
      ),
    ];
    expect(folded).toEqual([]);
  }, 600_000);

  it("every look's Result names the opposition on every size, crest or not (set 980)", () => {
    // A crest stood in for the name: a junior opposition with no crest went
    // unnamed (Bold Type, then Gold Foil, Neon Night, Sunset, Broadcast Dark,
    // Club Kit and Duotone's story). An opponent is always named.
    const looks = new Set(
      all.filter((b) => templateKindFor(b.kind) === "matchSummary").map((b) => b.look),
    );
    expect(looks.size).toBeGreaterThanOrEqual(15);
    expect(resultsMissingOppositionName(all)).toEqual([]);
  }, 300_000);
});
