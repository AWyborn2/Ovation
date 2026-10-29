/**
 * The Match Day sponsors page, tiled (Halls Head, Oct 2026): every look's
 * sponsors page drew its sponsors in twelve fixed slots (three large, nine
 * small) or a plain three-column list, so a club with many sponsors got small
 * tiles and empty space, the "NEXT HOME GAME" heading printed with no game
 * under it, and the footer strip repeated three of the page's own sponsors.
 * This rewrites each look's sponsors page:
 *
 * - the slots (or list) become one `rows` layer with `layout: "tiles"` over
 *   the whole space between the thank-you and the call to action, so 1 to 12
 *   sponsors fill it, majors larger (the carousel puts more on another slide);
 * - with no next home game the grid grows into that space, and the call to
 *   action moves down with it (`showWhen.noField`);
 * - "NEXT HOME GAME" shows only with a game;
 * - the footer's sponsor strip is dropped from this page, and its hashtag
 *   spans the footer, right-aligned.
 *
 *   cd scripts && npx tsx src/tile-sponsors-pages.ts [--look=<slug>[,<slug>]] [--dry-run]
 *
 * Then `node lib/template-bundles/generate-index.mjs`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEMPLATE_SIZES,
  type LayerBox,
  type RowsCell,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import { rewriteArgs, rewriteBundles } from "./lib/bundle-files";

const GRID_SLOT = /^\{\{weekendSponsor\d+\}\}$/;
const STRIP_LABEL = /^[^{}]*\bBY\s*$/i;
const NEXT_HOME_LABEL = /^\s*NEXT HOME GAME\s*$/i;
/** Space (percent of the artboard height) between the grid and the text round it. */
const GAP_Y = 1.6;
/**
 * The tallest a standard tile may be, and the gap between tiles, in percent of
 * the card's width (on landscape the grid's box is the tighter bound anyway).
 */
const MAX_TILE = 14;
const TILE_GAP = 1.6;

type Layer = TemplateLayerV2 & { content?: string; rows?: { repeat: string; cells: RowsCell[] } };
const content = (l: Layer) => String(l.content ?? "");
const onSize = (l: Layer, size: TemplateSize) =>
  (!l.sizes || l.sizes.includes(size)) && !!l.geometry[size];
const round = (n: number) => Math.round(n * 100) / 100;
const bottom = (b: LayerBox) => b.y + b.h;

function isGridLayer(l: Layer): boolean {
  if (l.kind === "rows") return l.rows?.repeat === "sponsors";
  if (l.showWhen?.sponsors === true) return false;
  if (l.kind === "image") return GRID_SLOT.test(content(l));
  return l.kind === "shape" && /^weekendSponsor\d+$/.test(l.showWhen?.field ?? "");
}

function isStripLayer(l: Layer): boolean {
  if (l.kind === "text") return STRIP_LABEL.test(content(l));
  if (l.showWhen?.sponsors !== true) return false;
  return l.kind === "shape" || (l.kind === "image" && GRID_SLOT.test(content(l)));
}

/** The tile cells: the look's own list cells, or its slot's panel and logo inset. */
function tileCells(grid: Layer[]): RowsCell[] {
  const list = grid.find((l) => l.kind === "rows");
  if (list?.rows)
    return list.rows.cells.map((c) => (c.show === "image" ? { ...c, show: "logo" } : c));
  const panel = grid.find((l) => l.kind === "shape");
  const logo = grid.find((l) => l.kind === "image");
  const size = (Object.keys(logo?.geometry ?? {}) as TemplateSize[])[0];
  const p = panel && size ? panel.geometry[size] : undefined;
  const g = logo && size ? logo.geometry[size] : undefined;
  const inset =
    p && g
      ? {
          x: round(((g.x - p.x) / p.w) * 100),
          w: round((g.w / p.w) * 100),
          y: round(((g.y - p.y) / p.h) * 100),
          h: round((g.h / p.h) * 100),
        }
      : { x: 8, w: 84, y: 10, h: 80 };
  const fill = panel?.style?.fill;
  const background = typeof fill === "string" ? fill : "#FFFFFF";
  return [
    {
      field: "logo",
      x: 0,
      w: 100,
      show: "backdrop",
      style: {
        background,
        ...(panel?.style?.radius != null ? { radius: panel.style.radius } : {}),
      },
    },
    { field: "logo", ...inset, show: "logo" },
  ];
}

/**
 * Looks whose sponsors column is boxed in by their artwork (Bold Type's dark
 * corner panel): the grid keeps the old grid's column and doesn't grow into
 * the next home game's space.
 */
const BOXED_IN = new Set(["bold-type"]);

/** The shape behind a text layer on `size` (a call to action's pill), if any. */
function plateOf(layers: readonly Layer[], text: Layer, size: TemplateSize): Layer | undefined {
  const b = text.geometry[size];
  if (!b) return undefined;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return layers.find((l) => {
    const g = l.kind === "shape" && onSize(l, size) ? l.geometry[size] : undefined;
    // A pill hugs its text: a panel holding the whole column isn't one.
    return (
      !!g &&
      g.w < 80 &&
      g.h <= b.h * 3 &&
      g.x <= cx &&
      cx <= g.x + g.w &&
      g.y <= cy &&
      cy <= g.y + g.h
    );
  });
}

export function tileSponsorsPage(doc: TemplateDocumentV2, look: string, kind: string): number {
  const page = doc.pages?.sponsors;
  if (kind !== "matchDay" || !page) return 0;
  const layers = page.layers as Layer[];
  const grid = layers.filter(isGridLayer);
  if (grid.length === 0) return 0;
  const strip = layers.filter(isStripLayer);
  const kept = layers.filter((l) => !grid.includes(l) && !strip.includes(l));
  const find = (re: RegExp) => kept.filter((l) => l.kind === "text" && re.test(content(l)));
  const ctas = find(/\{\{sponsorCta\}\}/);
  const homeLabels = find(NEXT_HOME_LABEL);
  const homeBlock = find(/\{\{nextHome(?:Match|When)\}\}/);
  const columnText = find(/\{\{(?:sponsorThanks|sponsorCta|nextHomeMatch|sponsorSocials)\}\}/);

  const short: Partial<Record<TemplateSize, LayerBox>> = {};
  const tall: Partial<Record<TemplateSize, LayerBox>> = {};
  const ctaTall = new Map<Layer, Partial<Record<TemplateSize, LayerBox>>>();
  for (const size of Object.keys(TEMPLATE_SIZES) as TemplateSize[]) {
    const old = grid.filter((l) => onSize(l, size)).map((l) => l.geometry[size]!);
    if (old.length === 0) continue;
    const top0 = Math.min(...old.map((b) => b.y));
    const bottom0 = Math.max(...old.map(bottom));
    // The nearest text above the old grid (the thank-you, the dates).
    const above = kept
      .filter((l) => l.kind === "text" && onSize(l, size))
      .map((l) => l.geometry[size]!)
      .filter((b) => bottom(b) <= top0 + 0.5);
    const top = (above.length ? Math.max(...above.map(bottom)) : top0) + GAP_Y;
    const cta = ctas.find((l) => onSize(l, size));
    const ctaBox = cta?.geometry[size];
    const shortBottom = (ctaBox && ctaBox.y >= bottom0 - 0.5 ? ctaBox.y : bottom0 + GAP_Y) - GAP_Y;
    // Without a game, the call to action takes the game's last line and the grid the rest.
    const block = homeBlock.filter((l) => onSize(l, size)).map((l) => l.geometry[size]!);
    const blockBottom = block.length ? Math.max(...block.map(bottom)) : null;
    let tallBottom = shortBottom;
    const boxed = BOXED_IN.has(look);
    if (boxed) {
      // The grid stays as it was laid out.
    } else if (cta && ctaBox && blockBottom != null && blockBottom > bottom(ctaBox)) {
      const plate = plateOf(kept, cta, size);
      const plateBox = plate?.geometry[size];
      // The call to action (and its pill) ends where the game's last line did.
      const lowest = plateBox ? Math.max(bottom(plateBox), bottom(ctaBox)) : bottom(ctaBox);
      const dy = Math.max(0, blockBottom - lowest);
      const shift = (b: LayerBox) => ({ ...b, y: round(b.y + dy) });
      ctaTall.set(cta, { ...ctaTall.get(cta), [size]: shift(ctaBox) });
      if (plate && plateBox) ctaTall.set(plate, { ...ctaTall.get(plate), [size]: shift(plateBox) });
      tallBottom = Math.min(ctaBox.y, plateBox?.y ?? ctaBox.y) + dy - GAP_Y;
    } else if (!cta && blockBottom != null) tallBottom = blockBottom;
    const across = (boxed ? ctas.concat(find(/\{\{sponsorThanks\}\}/)) : columnText)
      .filter((l) => onSize(l, size))
      .map((l) => l.geometry[size]!)
      .concat(old);
    // Halfway from the old grid's column out to the text column: wider tiles,
    // still inside the look's own panel.
    const gridLeft = Math.min(...old.map((b) => b.x));
    const gridRight = Math.max(...old.map((b) => b.x + b.w));
    const colLeft = Math.max(3, Math.min(...across.map((b) => b.x)));
    const colRight = Math.min(97, Math.max(...across.map((b) => b.x + b.w)));
    const left = Math.min(gridLeft, (gridLeft + colLeft) / 2);
    const right = Math.max(gridRight, (gridRight + colRight) / 2);
    const box = (b: number) => ({
      x: round(left),
      y: round(top),
      w: round(right - left),
      h: round(b - top),
    });
    short[size] = box(shortBottom);
    tall[size] = box(Math.max(shortBottom, tallBottom));
  }

  const rows = {
    repeat: "sponsors",
    layout: "tiles" as const,
    rowHeight: MAX_TILE,
    gap: TILE_GAP,
    cells: tileCells(grid),
  };
  const tiles = (id: string, geometry: Partial<Record<TemplateSize, LayerBox>>, showWhen: object) =>
    ({
      id,
      kind: "rows",
      name: "Sponsor logos",
      geometry,
      rows,
      ...(Object.keys(showWhen).length ? { showWhen } : {}),
    }) as unknown as Layer;

  const out: Layer[] = [];
  let placed = false;
  for (const l of layers) {
    if (strip.includes(l)) continue;
    if (grid.includes(l)) {
      if (!placed) {
        if (BOXED_IN.has(look)) out.push(tiles("sponsors-tiles", short, {}));
        else {
          out.push(tiles("sponsors-tiles", short, { field: "nextHomeMatch" }));
          out.push(tiles("sponsors-tiles-tall", tall, { noField: "nextHomeMatch" }));
        }
        placed = true;
      }
      continue;
    }
    if (homeLabels.includes(l)) {
      out.push({ ...l, showWhen: { ...l.showWhen, field: "nextHomeMatch" } });
      continue;
    }
    const moved = ctaTall.get(l);
    if (moved) {
      // With a game, as it was; without one, lower (sizes with no game block keep their place).
      out.push({ ...l, showWhen: { ...l.showWhen, field: "nextHomeMatch" } });
      out.push({
        ...l,
        id: `${l.id}-tall`,
        ...(l.link ? { link: `${l.link}-tall` } : {}),
        geometry: { ...l.geometry, ...moved },
        showWhen: { ...l.showWhen, noField: "nextHomeMatch" },
      });
      continue;
    }
    if (l.kind === "text" && /\{\{(?:clubHashtag|hashtags)\}\}/.test(content(l)) && strip.length) {
      // The footer is the hashtag alone now: across it, right-aligned.
      const geometry = { ...l.geometry };
      for (const [s, b] of Object.entries(geometry) as Array<[TemplateSize, LayerBox]>) {
        const margin = Math.max(0, 100 - (b.x + b.w));
        geometry[s] = { ...b, x: round(margin), w: round(100 - 2 * margin) };
      }
      out.push({ ...l, geometry, style: { ...l.style, align: "right" } });
      continue;
    }
    out.push(l);
  }
  page.layers = out;
  return 1;
}

async function main(argv: readonly string[]): Promise<number> {
  const { summary, failures } = await rewriteBundles(tileSponsorsPage, rewriteArgs(argv));
  for (const [look, { files }] of summary)
    if (files) console.log(`[sponsors] ${look}: sponsors page tiled`);
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
