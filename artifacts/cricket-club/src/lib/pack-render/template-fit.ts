/**
 * The template fit check (ADR-011 §4, L2-B, T2.4–T2.5): draw every variant
 * `fitMatrix` lists with worst-case content and report what doesn't fit.
 *
 * Per page and size (pure, `fit-rules.ts`): every core field bound, every
 * list holding at least one row. Per variant, in the DOM:
 *   - live text overflowing after the fit step (`fitLayersInDom`);
 *   - a font that didn't load;
 *   - a layer drawn although every field it shows is hidden;
 *   - list rows at capacity running outside their box;
 *   - a data-bearing layer outside the artboard;
 *   - an image from anywhere but https, an inline image or this site;
 *   - vector markup the sanitiser should have removed.
 *
 * One routine for every caller: the harness `fitCheck` (server fit job, CI
 * bundle check) and the template proofs sheet, each mounting cards its way.
 */
import {
  fitMatrix,
  fitReport,
  fitVariantLabel,
  flattenLayers,
  isSetDocument,
  layerTokens,
  missingCoreFields,
  normaliseDocument,
  pageLayersOnSize,
  pageRepeatCapacities,
  setPageDocument,
  setTypeOfKind,
  templateKindFor,
  tokenHidden,
  worstCaseCard,
  type FitIssue,
  type FitVariant,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateFitReport,
  type TemplateLayerV2,
  type TemplateSize,
  type WorstCaseCard,
} from "@workspace/scorecard/kind-templates";
import { MIN_ROWS_SQUEEZE } from "@workspace/scorecard/kind-templates";
import { ROWS_SQUEEZE_ATTR } from "./adjustments";
import { fitLayersInDom } from "./layer-fit";

/**
 * The smallest a list may draw to show every row: a side of 14 on a box
 * designed for 12 (two columns of 7 on 6) draws at 86%, one for 10 at 71%.
 * Shared with the editor's list settings, which count rows by it.
 */
export { MIN_ROWS_SQUEEZE };

/**
 * The side sizes a Team List is drawn with beyond its box's capacity (ADR-009:
 * up to 14, every player shown): a carousel slide draws a team whole, so a
 * side over capacity must still fit, smaller, with nobody dropped.
 */
export const TEAM_SIDE_SIZES = [12, 13, 14] as const;

/**
 * A worst-case Team List side (`worstCaseCard` with `players` rows) with a
 * captain or keeper mark on every named player ("J. SURNAME (WK)"), the
 * longest name line a list prints. A withheld "Private Player" never has one.
 */
export function withTeamMarks(card: WorstCaseCard): WorstCaseCard {
  const input = card.input as { players?: Array<Record<string, unknown>> };
  if (!Array.isArray(input.players)) return card;
  const players = input.players.map((p, i) =>
    p.firstInitial && !p.role ? { ...p, role: i % 2 === 0 ? "WK" : "C" } : p,
  );
  return { ...card, input: { ...card.input, players } as WorstCaseCard["input"] };
}

/** What a mount hands back: the element the card was drawn in, and fonts that failed. */
export interface FitMountResult {
  root: HTMLElement;
  fontFailures: string[];
}

/** Draw one variant's card with the template on its page, ready to measure. */
export type FitMount = (
  card: WorstCaseCard,
  variant: FitVariant,
  document: unknown,
) => Promise<FitMountResult>;

/** Images a template may show: https, inline images, or this site's own paths. */
const ALLOWED_IMAGE = /^(?:https:\/\/|data:image\/|\/(?!\/))/;
/** An image this faint is a watermark, which may bleed off the card. */
const WATERMARK_OPACITY = 0.3;
/** Markup a sanitised vector never holds. */
const UNSAFE_VECTOR = "script, foreignObject, [href], [xlink\\:href]";

export interface FitDomContext {
  doc: TemplateDocumentV2;
  kind: string;
  page: PageKey;
  size: TemplateSize;
  /** The variant's label, for the issues. */
  variant: string;
  /** The content fields shown (content kinds); null when every field shows. */
  visible: ReadonlySet<string> | null;
}

/** The DOM rules for one drawn variant (everything but overflow and fonts). */
export function checkFitInDom(root: HTMLElement, ctx: FitDomContext): FitIssue[] {
  const issues: FitIssue[] = [];
  const at = { variant: ctx.variant, page: ctx.page, size: ctx.size };
  const layers = new Map(
    flattenLayers(ctx.doc.pages[ctx.page]?.layers ?? []).map((l) => [l.id, l]),
  );
  const card = root.querySelector<HTMLElement>(".pack-card-root") ?? root;
  const art = card.getBoundingClientRect();
  const kind = templateKindFor(ctx.kind);

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-layer-id]"))) {
    const layerId = el.getAttribute("data-layer-id") ?? "";
    const layer = layers.get(layerId);
    if (!layer) continue;
    const tokens = layerTokens(layer);
    if (
      ctx.visible &&
      tokens.length > 0 &&
      tokens.every((t) =>
        tokenHidden(t, { kind, page: ctx.page, has: () => true, visible: ctx.visible }),
      )
    )
      issues.push({ ...at, reason: "hidden-shown", layerId });
    const box = el.getBoundingClientRect();
    // A faint image (a watermark crest at a few percent) may bleed off the card by
    // design; data you read may not.
    const opacity = (layer as { style?: { opacity?: unknown } }).style?.opacity;
    const watermark =
      (layer.kind === "image" || layer.kind === "photo") &&
      typeof opacity === "number" &&
      opacity <= WATERMARK_OPACITY;
    if (
      tokens.length > 0 &&
      !watermark &&
      box.width > 0 &&
      box.height > 0 &&
      (box.left < art.left - 1 ||
        box.top < art.top - 1 ||
        box.right > art.right + 1 ||
        box.bottom > art.bottom + 1)
    )
      issues.push({ ...at, reason: "off-artboard", layerId });
    if (layer.kind === "rows") {
      // A list drawn smaller to show every row (a side over the box's capacity)
      // must stay readable.
      const squeeze = Number(
        el.querySelector(`[${ROWS_SQUEEZE_ATTR}]`)?.getAttribute(ROWS_SQUEEZE_ATTR) ?? 1,
      );
      if (squeeze < MIN_ROWS_SQUEEZE)
        issues.push({
          ...at,
          reason: "rows-squeezed",
          layerId,
          detail: `rows drawn at ${Math.round(squeeze * 100)}% to fit; at least ${Math.round(MIN_ROWS_SQUEEZE * 100)}%`,
        });
      for (const row of Array.from(el.querySelectorAll<HTMLElement>("[data-row-index]"))) {
        const r = row.getBoundingClientRect();
        if (r.height > 0 && (r.bottom > box.bottom + 1 || r.right > box.right + 1)) {
          issues.push({
            ...at,
            reason: "rows-overflow",
            layerId,
            row: Number(row.getAttribute("data-row-index")),
          });
          break;
        }
      }
    }
    if (layer.kind === "vector" && el.querySelector(UNSAFE_VECTOR))
      issues.push({ ...at, reason: "vector-unsafe", layerId });
  }
  // Team List kinds (`teamList`, `teamListRound`): their players list keeps clear of the photo.
  if (/^teamList/.test(ctx.kind)) issues.push(...rowsOverlapIssues(root, art, layers, at));

  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (ALLOWED_IMAGE.test(src)) continue;
    const owner = img.closest("[data-layer-id]");
    issues.push({
      ...at,
      reason: "image-url",
      ...(owner ? { layerId: owner.getAttribute("data-layer-id") ?? undefined } : {}),
      detail: src.slice(0, 80),
    });
  }
  return issues;
}

/**
 * How far a Team List's rows keep from the card photo, as a share of the
 * card's shorter side (32 px on a 1080-wide card). Bold Type's story list once
 * ended 26 px above its photo, and its last names read as running into it.
 */
export const ROWS_PHOTO_CLEARANCE = 0.03;
/** A layer this close to the whole artboard is a background, which a list may sit on. */
const FULL_BLEED = 0.9;

type Pt = [number, number];
type Rect = { left: number; top: number; right: number; bottom: number };

/** A layer's painted area on the page: its box, cut to its clip polygon if it has one. */
function paintedArea(layer: TemplateLayerV2, box: DOMRect): Pt[] {
  const poly = (layer.style as { clip?: { polygon?: Pt[] } } | undefined)?.clip?.polygon;
  const corners: Pt[] = [
    [box.left, box.top],
    [box.right, box.top],
    [box.right, box.bottom],
    [box.left, box.bottom],
  ];
  if (!Array.isArray(poly) || poly.length < 3) return corners;
  return poly.map(([x, y]) => [box.left + (x / 100) * box.width, box.top + (y / 100) * box.height]);
}

function pointInPolygon([px, py]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (o: Pt, p: Pt, q: Pt) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Whether a rectangle and a polygon share any area. */
export function rectMeetsPolygon(r: Rect, poly: Pt[]): boolean {
  if (r.right <= r.left || r.bottom <= r.top || poly.length < 3) return false;
  const corners: Pt[] = [
    [r.left, r.top],
    [r.right, r.top],
    [r.right, r.bottom],
    [r.left, r.bottom],
  ];
  if (poly.some(([x, y]) => x > r.left && x < r.right && y > r.top && y < r.bottom)) return true;
  // A corner just inside the polygon (nudged in, so shared edges don't count).
  const mid: Pt = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
  const nudge = (p: Pt): Pt => [
    p[0] + Math.sign(mid[0] - p[0]) * 0.5,
    p[1] + Math.sign(mid[1] - p[1]) * 0.5,
  ];
  if ([...corners.map(nudge), mid].some((p) => pointInPolygon(p, poly))) return true;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < poly.length; j++)
      if (segmentsCross(corners[i]!, corners[(i + 1) % 4]!, poly[j]!, poly[(j + 1) % poly.length]!))
        return true;
  return false;
}

/** Whether a shape paints its box solidly enough to hide what's under it (a panel, a scrim). */
export function paintsOver(layer: TemplateLayerV2): boolean {
  if (layer.kind !== "shape") return false;
  const style = (layer.style ?? {}) as { fill?: unknown; opacity?: unknown };
  if (typeof style.opacity === "number" && style.opacity < 0.5) return false;
  const fill = style.fill;
  if (fill && typeof fill === "object") return true;
  if (typeof fill !== "string" || !fill.trim() || fill.trim() === "transparent") return false;
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(fill.trim());
  return !alpha || parseInt(alpha[1]!, 16) >= 0x80;
}

const contains = (outer: DOMRect, inner: Rect) =>
  outer.left <= inner.left + 1 &&
  outer.top <= inner.top + 1 &&
  outer.right >= inner.right - 1 &&
  outer.bottom >= inner.bottom - 1;

/**
 * Team List rows clear of the photo and the card's other foreground (Ash's
 * round 3 retest, Nov 2026: Bold Type's story list ran into its photo). Every
 * drawn row of a `players` list, at the size it's drawn (squeezed or not),
 * must keep {@link ROWS_PHOTO_CLEARANCE} from a photo's painted area (its clip
 * polygon, not just its box) and must not touch a logo, sponsor or other
 * image, or a text layer that prints data. A background that bleeds over the
 * whole card, a faint watermark, decoration (shapes, data-free text) and a
 * layer hidden from the row by an opaque panel or scrim drawn between them
 * don't count.
 */
function rowsOverlapIssues(
  root: HTMLElement,
  art: DOMRect,
  layers: Map<string, TemplateLayerV2>,
  at: { variant: string; page: PageKey; size: TemplateSize },
): FitIssue[] {
  const drawn = Array.from(root.querySelectorAll<HTMLElement>("[data-layer-id]"))
    .map((el) => ({ el, layer: layers.get(el.getAttribute("data-layer-id") ?? "") }))
    .filter((d): d is { el: HTMLElement; layer: TemplateLayerV2 } => !!d.layer);
  const short = Math.min(art.width, art.height);
  const issues: FitIssue[] = [];
  for (const [ri, list] of drawn.entries()) {
    if (list.layer.kind !== "rows" || list.layer.rows?.repeat !== "players") continue;
    const rows = Array.from(list.el.querySelectorAll<HTMLElement>("[data-row-index]"))
      .map((row) => ({
        index: Number(row.getAttribute("data-row-index")),
        box: row.getBoundingClientRect(),
      }))
      .filter((r) => r.box.width > 0 && r.box.height > 0);
    for (const [oi, other] of drawn.entries()) {
      if (oi === ri) continue;
      const { layer, el } = other;
      const opacity = (layer.style as { opacity?: unknown } | undefined)?.opacity;
      if (typeof opacity === "number" && opacity <= WATERMARK_OPACITY) continue;
      const data = layerTokens(layer).length > 0;
      const photo = layer.kind === "photo";
      if (!photo && !(data && (layer.kind === "image" || layer.kind === "text"))) continue;
      const box = el.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) continue;
      if (box.width >= art.width * FULL_BLEED && box.height >= art.height * FULL_BLEED) continue;
      const area = paintedArea(layer, box);
      const clearance = photo ? ROWS_PHOTO_CLEARANCE * short : 0;
      // Panels and scrims drawn over this layer but under the list.
      const between =
        oi < ri
          ? drawn
              .slice(oi + 1, ri)
              .filter((d) => paintsOver(d.layer))
              .map((d) => d.el.getBoundingClientRect())
          : [];
      const hit = rows.find((r) => {
        if (between.some((p) => contains(p, r.box))) return false;
        // Shared edges (a list ending where a box starts) are within a pixel.
        const pad = clearance > 0 ? clearance : -1;
        return rectMeetsPolygon(
          {
            left: r.box.left - pad,
            top: r.box.top - pad,
            right: r.box.right + pad,
            bottom: r.box.bottom + pad,
          },
          area,
        );
      });
      if (hit)
        issues.push({
          ...at,
          reason: "rows-overlap",
          layerId: list.layer.id,
          row: hit.index,
          detail: photo
            ? `row ${hit.index + 1} within ${Math.round(clearance)} px of the photo (${layer.id})`
            : `row ${hit.index + 1} runs into ${layer.id}`,
        });
    }
  }
  return issues;
}

/** The page-level rules: core fields bound and lists holding rows, per page × size. */
export function checkFitRules(
  doc: TemplateDocumentV2,
  kind: string,
  variants: FitVariant[],
): FitIssue[] {
  const issues: FitIssue[] = [];
  const seen = new Set<string>();
  for (const v of variants) {
    const key = `${v.page}.${v.size}.${v.contentKind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = { variant: `${v.page}.${v.size}`, page: v.page, size: v.size };
    for (const field of missingCoreFields(doc, kind, v.contentKind, v.page, v.size))
      issues.push({ ...at, reason: "core-missing", field });
    if (v.contentKind !== templateKindFor(kind)) continue; // capacity is the same for Results
    const capacities = pageRepeatCapacities(doc, v.page, v.size);
    for (const layer of pageLayersOnSize(doc, v.page, v.size)) {
      if (layer.kind === "rows" && (capacities[layer.rows?.repeat ?? ""] ?? 0) < 1)
        issues.push({ ...at, reason: "rows-capacity", layerId: layer.id });
    }
  }
  return issues;
}

/**
 * Fit-check a template document of `kind`: every variant drawn through
 * `mount`, in order, with worst-case content and lists filled to capacity.
 */
export async function runTemplateFit(
  document: unknown,
  kind: string,
  mount: FitMount,
  opts: { fonts?: string; onVariant?: (done: number, total: number) => void } = {},
): Promise<TemplateFitReport> {
  if (setTypeOfKind(kind)) return runSetTemplateFit(document, kind, mount, opts);
  const doc = normaliseDocument(document, kind);
  const variants = fitMatrix(doc, kind);
  const issues = checkFitRules(doc, kind, variants);
  // Each variant with its lists at capacity, then (a Team List's team page, at
  // its full preset) with every side of up to 14 its box can't hold as designed.
  const passes = variants.flatMap((v) => {
    const rows = pageRepeatCapacities(doc, v.page, v.size);
    const capacity = rows.players;
    const sides =
      capacity !== undefined &&
      v.contentKind === "teamList" &&
      v.page === "team" &&
      (v.preset ?? "full") === "full"
        ? TEAM_SIDE_SIZES.filter((n) => n > capacity)
        : [];
    return [
      { v, rows, side: null as number | null },
      ...sides.map((n) => ({ v, rows: { ...rows, players: n }, side: n as number | null })),
    ];
  });
  for (const [i, { v, rows, side }] of passes.entries()) {
    const label = side === null ? fitVariantLabel(v) : `${fitVariantLabel(v)}.side${side}`;
    const at = { variant: label, page: v.page, size: v.size };
    const worst = worstCaseCard(kind, v, { rows });
    const card = side === null ? worst : withTeamMarks(worst);
    const { root, fontFailures } = await mount(card, v, document);
    for (const family of fontFailures) issues.push({ ...at, reason: "font", detail: family });
    for (const w of fitLayersInDom(root, v.size))
      issues.push({
        ...at,
        reason: w.reason,
        ...(w.layerId ? { layerId: w.layerId } : {}),
        ...(w.row !== undefined ? { row: w.row } : {}),
        ...(w.field ? { field: w.field } : {}),
        ...(w.detail ? { detail: w.detail } : {}),
      });
    issues.push(
      ...checkFitInDom(root, {
        doc,
        kind,
        page: v.page,
        size: v.size,
        variant: label,
        visible: card.visible ? new Set(card.visible) : null,
      }),
    );
    opts.onVariant?.(i + 1, passes.length);
  }
  return fitReport(kind, passes.length, issues, { fonts: opts.fonts ?? "unknown" });
}

/**
 * A set template's fit check (carousel set editor plan, part 1): every page
 * checked as the one-page kind document it renders as, with that kind's
 * variants. An issue's variant names its page: `<page id>:<variant>`.
 */
async function runSetTemplateFit(
  document: unknown,
  kind: string,
  mount: FitMount,
  opts: { fonts?: string; onVariant?: (done: number, total: number) => void },
): Promise<TemplateFitReport> {
  if (!isSetDocument(document)) throw new Error("Not a set document.");
  const issues: FitIssue[] = [];
  let variants = 0;
  for (const page of document.pages) {
    const report = await runTemplateFit(setPageDocument(document, page), page.kind, mount, {
      fonts: opts.fonts,
    });
    variants += report.variants;
    for (const issue of report.issues)
      issues.push({ ...issue, variant: `${page.id}:${issue.variant}` });
  }
  opts.onVariant?.(variants, variants);
  return fitReport(kind, variants, issues, { fonts: opts.fonts ?? "unknown" });
}
