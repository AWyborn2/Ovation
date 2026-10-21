/**
 * Figma → template format v2 (ADR-011 §9, T8.3–T8.5): the mapping half of
 * the Figma import. Pure: it takes the frames `loadFigmaFrames` fetched and
 * the font catalogue, and returns a document plus a report.
 *
 * - **Frames → page × size.** A frame named `<page>/<size>` (`card/square`,
 *   `fixture/story`), or sized like a card (1080², 1080×1350, 1080×1920,
 *   1200×630, or the same shape at any scale). Layers are matched across
 *   sizes by their name path; a layer missing from a size isn't on it. A size
 *   with no frame is placed from the nearest imported size, so every size has
 *   a layout (KTD15), and the report says to check it.
 * - **TEXT → text layers:** `{{tokens}}` from the characters (only the page's
 *   own tokens), font, weight, size as % of the width, letter spacing, line
 *   height, UPPER case, alignment, colour, drop shadows. Text with a token
 *   fits its box. Fonts outside the catalogue get the nearest substitute.
 * - **Colours:** a fill or stroke bound to a colour style named
 *   `ovation/accent|gold|panel|panel-2|ink|accent-ink` becomes that token;
 *   any other colour is hex (decision O7: styles, not variables).
 * - **RECTANGLE / ELLIPSE / LINE, and painted frames → shapes:** solid and
 *   gradient fills, corner radius, stroke, drop and inner shadows, opacity,
 *   blend mode.
 *
 * Image fills, vectors, auto layout and `rows:<repeat>` frames are L8-B's
 * (T8.6, T8.7): they're listed in `deferred` and the report, and skipped.
 */
import {
  BLEND_MODES,
  FORMAT_VERSION,
  PAGE_KEYS,
  TEMPLATE_SIZES,
  TEMPLATE_SIZE_ORDER,
  kindHasPage,
  kindPages,
  pageTokenKeys,
  pageTokens,
  placeBoxOnSize,
  primaryPage,
  type BlendMode,
  type LayerBox,
  type PageKey,
  type TemplateBorder,
  type TemplateBoxShadow,
  type TemplateDocumentV2,
  type TemplateFill,
  type TemplateLayerV2,
  type TemplateSize,
  type TemplateStyleV2,
  type TemplateTextShadow,
  type TextFit,
} from "@workspace/scorecard/kind-templates";
import { chooseFont, cssFontFamily, fontIndex, type FontCatalogueEntry } from "./figma-fonts";
import type { FigmaColor, FigmaEffect, FigmaNode, FigmaPaint, FigmaStyleMeta } from "./figma-types";

// ── Results ─────────────────────────────────────────────────────────────────

export type FigmaReportLine = {
  level: "warn" | "info";
  page?: PageKey;
  sizes?: TemplateSize[];
  /** The layer's name path in Figma (`Header/Player`). */
  layer?: string;
  message: string;
};

/** Nodes left for L8-B: exported as SVG, copied as images, or rebuilt as stacks and rows. */
export type FigmaDeferred = {
  nodeId: string;
  page: PageKey;
  size: TemplateSize;
  layer: string;
  what: "vector" | "image" | "rows" | "auto-layout" | "mask";
};

export type FigmaFrameMatch = {
  nodeId: string;
  name: string;
  page: PageKey;
  size: TemplateSize;
  /** How the size was read: the frame's name or its dimensions. */
  by: "name" | "dimensions";
};

export type FigmaImportResult = {
  document: TemplateDocumentV2;
  frames: FigmaFrameMatch[];
  report: FigmaReportLine[];
  deferred: FigmaDeferred[];
  /** Figma fonts outside the catalogue and what they became. */
  fonts: Array<{ from: string; to: string }>;
};

export type FigmaImportInput = {
  kind: string;
  /** Candidate page frames (`loadFigmaFrames`). */
  frames: readonly FigmaNode[];
  /** Style metadata by id, from the nodes response. */
  styles?: Readonly<Record<string, FigmaStyleMeta>>;
  /** The Google Fonts catalogue (`google-fonts-catalogue.json`). */
  fonts: readonly FontCatalogueEntry[];
};

// ── Constants ───────────────────────────────────────────────────────────────

/** Colour style names → tokens (decision O7). `--gold` is the accent. */
export const COLOUR_STYLE_TOKENS: Readonly<Record<string, string>> = {
  "ovation/accent": "var(--gold)",
  "ovation/gold": "var(--gold)",
  "ovation/panel": "var(--panel)",
  "ovation/panel-2": "var(--panel-2)",
  "ovation/ink": "var(--ink)",
  "ovation/accent-ink": "var(--accent-ink)",
};

/** Text with a token fits its box like the converted looks' live text. */
const FIT_MIN_SCALE = 0.6;

const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "INSTANCE"]);
const CONTAINER_TYPES = new Set(["FRAME", "COMPONENT", "INSTANCE", "GROUP", "SECTION"]);
const SHAPE_TYPES = new Set(["RECTANGLE", "ELLIPSE", "LINE"]);
const VECTOR_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "REGULAR_POLYGON", "POLYGON"]);
const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ── Report ──────────────────────────────────────────────────────────────────

type Where = { page?: PageKey; size?: TemplateSize; layer?: string };

/** Report lines, one per (level, page, layer, message), with the sizes it was seen on. */
class Report {
  private readonly lines = new Map<string, FigmaReportLine>();

  add(level: FigmaReportLine["level"], message: string, where: Where = {}): void {
    const key = [level, where.page ?? "", where.layer ?? "", message].join("\u0000");
    let line = this.lines.get(key);
    if (!line) {
      line = { level, message };
      if (where.page) line.page = where.page;
      if (where.layer) line.layer = where.layer;
      this.lines.set(key, line);
    }
    if (where.size) {
      const sizes = new Set([...(line.sizes ?? []), where.size]);
      line.sizes = TEMPLATE_SIZE_ORDER.filter((s) => sizes.has(s));
    }
  }

  list(): FigmaReportLine[] {
    const all = [...this.lines.values()];
    return [...all.filter((l) => l.level === "warn"), ...all.filter((l) => l.level === "info")];
  }
}

// ── Frames ──────────────────────────────────────────────────────────────────

type MatchedFrame = FigmaFrameMatch & { node: FigmaNode };

/** The size a frame's shape is (any scale, within 1 %), or null. */
export function sizeByDimensions(width: number, height: number): TemplateSize | null {
  if (!(width > 0 && height > 0)) return null;
  const ratio = width / height;
  for (const size of TEMPLATE_SIZE_ORDER) {
    const d = TEMPLATE_SIZES[size];
    if (Math.abs(ratio / (d.w / d.h) - 1) < 0.01) return size;
  }
  return null;
}

const isSize = (s: string): s is TemplateSize => s in TEMPLATE_SIZES;

/** Which page and size each frame is, skipping (and reporting) the ones that aren't. */
function matchFrames(kind: string, frames: readonly FigmaNode[], report: Report): MatchedFrame[] {
  const out: MatchedFrame[] = [];
  const taken = new Map<string, string>();
  const allPages = new Set<string>(PAGE_KEYS);
  for (const frame of frames) {
    const label = `Frame "${frame.name}"`;
    if (!FRAME_TYPES.has(frame.type) || !frame.absoluteBoundingBox) continue;
    if (frame.visible === false) {
      report.add("info", `${label} is hidden in Figma: skipped.`);
      continue;
    }
    const parts = frame.name
      .split("/")
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    const namedPage = parts.find((p) => kindHasPage(kind, p)) as PageKey | undefined;
    const otherPage = parts.find((p) => allPages.has(p) && !kindHasPage(kind, p));
    const namedSize = parts.find(isSize);
    const { width, height } = frame.absoluteBoundingBox;
    const shapeSize = sizeByDimensions(width, height);
    if (otherPage && !namedPage) {
      report.add(
        "warn",
        `${label} names the ${otherPage} page, which ${kind} doesn't have (its pages: ${kindPages(kind).join(", ")}): skipped.`,
      );
      continue;
    }
    const size = namedSize ?? shapeSize;
    if (!size) {
      report.add(
        "info",
        `${label} is skipped: it isn't named <page>/<size> and isn't card-shaped (1080×1080, 1080×1350, 1080×1920 or 1200×630).`,
      );
      continue;
    }
    if (namedSize && shapeSize !== namedSize) {
      report.add(
        "warn",
        `${label} is named ${namedSize} but is ${Math.round(width)}×${Math.round(height)}: its layers are stretched to the ${namedSize} shape.`,
      );
    }
    const page = namedPage ?? primaryPage(kind);
    if (!namedPage && kindPages(kind).length > 1) {
      report.add("info", `${label} names no page: read as the ${page} page.`);
    }
    const key = `${page}/${size}`;
    const other = taken.get(key);
    if (other !== undefined) {
      report.add("warn", `${label} is skipped: "${other}" is already the ${page} page's ${size}.`);
      continue;
    }
    taken.set(key, frame.name);
    out.push({
      nodeId: frame.id,
      name: frame.name,
      page,
      size,
      by: namedSize ? "name" : "dimensions",
      node: frame,
    });
  }
  return out;
}

// ── Mapping one frame ───────────────────────────────────────────────────────

/** `Omit` over each member of a union, so each layer kind keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A layer as one size maps it: everything but its id, sizes and geometry. */
type LayerBody = DistributiveOmit<TemplateLayerV2, "id" | "geometry" | "sizes">;
type Mapped = { path: string; body: LayerBody; box: LayerBox };

type FrameContext = {
  kind: string;
  page: PageKey;
  size: TemplateSize;
  /** The frame's box in Figma's canvas coordinates. */
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  /** Figma px → native card px (a 540-wide square frame is 2). */
  pxScale: number;
  tokens: Map<string, string>;
  styles: Readonly<Record<string, FigmaStyleMeta>>;
  fonts: Map<string, FontCatalogueEntry>;
  fontSubs: Map<string, string>;
  report: Report;
  deferred: FigmaDeferred[];
};

function mapFrame(frame: MatchedFrame, ctx: FrameContext): Mapped[] {
  const out: Mapped[] = [];
  const at: Where = { page: ctx.page, size: ctx.size };
  if (isAutoLayout(frame.node)) {
    ctx.report.add(
      "info",
      `The page frame uses auto layout: its layers are placed where Figma draws them (stacks come with L8-B).`,
      at,
    );
    ctx.deferred.push(deferral(frame.node, "", ctx, "auto-layout"));
  }
  const background = paintedShape(frame.node, "", ctx, { x: 0, y: 0, w: 100, h: 100 });
  if (background)
    out.push({
      path: "",
      body: { ...background, name: "Background" },
      box: { x: 0, y: 0, w: 100, h: 100 },
    });
  walkChildren(frame.node, "", ctx, out, 0);
  return out;
}

function walkChildren(
  parent: FigmaNode,
  parentPath: string,
  ctx: FrameContext,
  out: Mapped[],
  angle: number,
): void {
  const seen = new Map<string, number>();
  let masked = false;
  for (const child of parent.children ?? []) {
    const n = (seen.get(child.name) ?? 0) + 1;
    seen.set(child.name, n);
    const name = n > 1 ? `${child.name}#${n}` : child.name;
    const path = parentPath ? `${parentPath}/${name}` : name;
    if (child.isMask && child.visible !== false) {
      masked = true;
      ctx.report.add("warn", "Mask: not imported, so the layers above it draw unmasked.", {
        ...where(ctx, path),
      });
      ctx.deferred.push(deferral(child, path, ctx, "mask"));
      continue;
    }
    if (masked && child.visible !== false) {
      ctx.report.add("info", "Masked in Figma: drawn unmasked.", where(ctx, path));
    }
    visit(child, path, ctx, out, angle);
  }
}

function visit(
  node: FigmaNode,
  path: string,
  ctx: FrameContext,
  out: Mapped[],
  parentAngle: number,
): void {
  const at = where(ctx, path);
  if (node.visible === false) {
    ctx.report.add("info", "Hidden in Figma: not imported.", at);
    return;
  }
  const own = transformOf(node);
  if (own.flipped) ctx.report.add("warn", "Flipped in Figma: drawn unflipped.", at);
  // Groups don't have their own coordinate space: their children's transforms already
  // include the group's rotation.
  const angle = parentAngle + own.angle;
  const type = node.type;

  if (type === "TEXT") {
    const box = boxOf(node, ctx, angle, at);
    const body = box && textLayer(node, ctx, box, at);
    if (box && body) out.push({ path, body: { ...body, name: node.name }, box });
    return;
  }
  if (SHAPE_TYPES.has(type)) {
    if (type === "ELLIPSE" && isArc(node)) {
      ctx.report.add("info", "Arc or ring: exported as SVG by the import (L8-B).", at);
      ctx.deferred.push(deferral(node, path, ctx, "vector"));
      return;
    }
    const box = lineAwareBox(node, ctx, angle, at);
    const body = box && shapeLayer(node, path, ctx, box);
    if (box && body) out.push({ path, body: { ...body, name: node.name }, box });
    return;
  }
  if (CONTAINER_TYPES.has(type)) {
    if (/^rows:/i.test(node.name.trim())) {
      ctx.report.add("warn", "A rows frame: imported as a rows layer by L8-B, not here.", at);
      ctx.deferred.push(deferral(node, path, ctx, "rows"));
      return;
    }
    const frameLike = FRAME_TYPES.has(type);
    if (frameLike && isAutoLayout(node)) {
      ctx.report.add(
        "info",
        "Auto layout: its layers are placed where Figma draws them (stacks come with L8-B).",
        at,
      );
      ctx.deferred.push(deferral(node, path, ctx, "auto-layout"));
    }
    if (frameLike) {
      const box = boxOf(node, ctx, angle, at);
      const body = box && paintedShape(node, path, ctx, box);
      if (box && body) out.push({ path, body: { ...body, name: node.name }, box });
      if (node.clipsContent && overflows(node)) {
        ctx.report.add("info", "Clips its content: clipping isn't imported.", at);
      }
    }
    walkChildren(node, path, ctx, out, frameLike ? angle : parentAngle);
    return;
  }
  if (VECTOR_TYPES.has(type)) {
    ctx.report.add("info", "Vector: exported as SVG by the import (L8-B).", at);
    ctx.deferred.push(deferral(node, path, ctx, "vector"));
    return;
  }
  if (type === "SLICE") return;
  ctx.report.add(
    "warn",
    `${type.toLowerCase().replace(/_/g, " ")} layers aren't supported: not imported.`,
    at,
  );
}

function where(ctx: FrameContext, path: string): Where {
  return { page: ctx.page, size: ctx.size, ...(path ? { layer: path } : {}) };
}

function deferral(
  node: FigmaNode,
  path: string,
  ctx: FrameContext,
  what: FigmaDeferred["what"],
): FigmaDeferred {
  return { nodeId: node.id, page: ctx.page, size: ctx.size, layer: path || node.name, what };
}

const isAutoLayout = (node: FigmaNode) =>
  node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";

function isArc(node: FigmaNode): boolean {
  const arc = node.arcData;
  if (!arc) return false;
  const sweep = Math.abs(arc.endingAngle - arc.startingAngle);
  return arc.innerRadius > 0 || Math.abs(sweep - 2 * Math.PI) > 0.001;
}

function overflows(node: FigmaNode): boolean {
  const bb = node.absoluteBoundingBox;
  if (!bb) return false;
  return (node.children ?? []).some((c) => {
    const cb = c.absoluteBoundingBox;
    return (
      !!cb &&
      (cb.x < bb.x - 0.5 ||
        cb.y < bb.y - 0.5 ||
        cb.x + cb.width > bb.x + bb.width + 0.5 ||
        cb.y + cb.height > bb.y + bb.height + 0.5)
    );
  });
}

// ── Geometry ────────────────────────────────────────────────────────────────

/**
 * A node's rotation within its parent, from `relativeTransform`
 * (`[[a, c, tx], [b, d, ty]]`): clockwise degrees, the CSS sense.
 */
export function transformOf(node: FigmaNode): { angle: number; flipped: boolean } {
  const m = node.relativeTransform;
  if (!m || m.length < 2) return { angle: 0, flipped: false };
  const [a = 1, c = 0] = m[0] ?? [];
  const [b = 0, d = 1] = m[1] ?? [];
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  return { angle: Math.abs(angle) < 0.01 ? 0 : angle, flipped: a * d - b * c < 0 };
}

/** Degrees into (-180, 180]. */
const normaliseAngle = (deg: number) => {
  const v = ((deg % 360) + 360) % 360;
  return v > 180 ? v - 360 : v;
};

/**
 * A node's box in percent of its frame. A rotated node's bounding box is the
 * rotated shape's, so its untransformed `size` (sent with `geometry=paths`)
 * and the bounding box's centre give the box, plus a rotation.
 */
function boxOf(node: FigmaNode, ctx: FrameContext, angle: number, at: Where): LayerBox | null {
  const bb = node.absoluteBoundingBox;
  if (!bb) return null;
  let w = bb.width;
  let h = bb.height;
  let rotate: number | undefined;
  const turned = Math.abs(normaliseAngle(angle)) >= 0.05;
  if (turned && node.size) {
    w = node.size.x;
    h = node.size.y;
    rotate = r2(normaliseAngle(angle));
  } else if (turned) {
    ctx.report.add(
      "warn",
      "Rotated, but Figma sent no size: drawn upright in its bounding box.",
      at,
    );
  }
  return toBox(bb.x + bb.width / 2, bb.y + bb.height / 2, w, h, ctx, rotate);
}

function toBox(
  cx: number,
  cy: number,
  w: number,
  h: number,
  ctx: FrameContext,
  rotate?: number,
): LayerBox {
  const pct = (v: number) => clamp(r2(v), -200, 300);
  const box: LayerBox = {
    x: pct(((cx - w / 2 - ctx.fx) / ctx.fw) * 100),
    y: pct(((cy - h / 2 - ctx.fy) / ctx.fh) * 100),
    w: clamp(r2((w / ctx.fw) * 100), 0, 300),
    h: clamp(r2((h / ctx.fh) * 100), 0, 300),
  };
  if (rotate) box.rotate = rotate;
  return box;
}

/** A line has no height: its box is as tall as its stroke. */
function lineAwareBox(
  node: FigmaNode,
  ctx: FrameContext,
  angle: number,
  at: Where,
): LayerBox | null {
  if (node.type !== "LINE") return boxOf(node, ctx, angle, at);
  const bb = node.absoluteBoundingBox;
  if (!bb) return null;
  const weight = node.strokeWeight ?? 1;
  const turned = Math.abs(normaliseAngle(angle)) >= 0.05;
  if (turned && node.size)
    return toBox(
      bb.x + bb.width / 2,
      bb.y + bb.height / 2,
      node.size.x,
      weight,
      ctx,
      r2(normaliseAngle(angle)),
    );
  return toBox(
    bb.x + bb.width / 2,
    bb.y + bb.height / 2,
    Math.max(bb.width, weight),
    Math.max(bb.height, weight),
    ctx,
  );
}

/** Percent of the artboard width, from Figma px. */
const widthPct = (px: number, ctx: FrameContext) => r3((px / ctx.fw) * 100);

// ── Colours ─────────────────────────────────────────────────────────────────

/** `#rrggbb`, or `#rrggbbaa` when not opaque. */
export function figmaHex(color: FigmaColor | undefined, opacity = 1): string {
  const c = color ?? { r: 0, g: 0, b: 0, a: 1 };
  const byte = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  const alpha = clamp((c.a ?? 1) * opacity, 0, 1);
  const hex = `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
  return alpha >= 0.999 ? hex : `${hex}${byte(alpha)}`;
}

/** The token for a colour style name, ignoring case and spaces (`Ovation / Panel`). */
export function colourStyleToken(name: string): string | undefined {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "-");
  return COLOUR_STYLE_TOKENS[key];
}

/** The token a node's fill or stroke style names, reporting `ovation/*` names it doesn't know. */
function styledToken(
  node: FigmaNode,
  which: "fill" | "stroke",
  ctx: FrameContext,
  at: Where,
): string | undefined {
  const id = node.styles?.[which] ?? node.styles?.[`${which}s`];
  const name = id ? ctx.styles[id]?.name : undefined;
  if (!name) return undefined;
  const token = colourStyleToken(name);
  if (!token && /^\s*ovation\s*\//i.test(name)) {
    ctx.report.add(
      "warn",
      `Colour style "${name}" isn't one of ${Object.keys(COLOUR_STYLE_TOKENS).join(", ")}: its colour is used as is.`,
      at,
    );
  }
  return token;
}

/** The top visible paint (Figma lists paints bottom to top). */
function topPaint(
  paints: readonly FigmaPaint[] | undefined,
  what: string,
  ctx: FrameContext,
  at: Where,
): FigmaPaint | undefined {
  const visible = (paints ?? []).filter((p) => p.visible !== false && (p.opacity ?? 1) > 0);
  if (visible.length > 1)
    ctx.report.add("info", `${visible.length} ${what}s: only the top one is imported.`, at);
  const top = visible[visible.length - 1];
  if (top?.blendMode && top.blendMode !== "NORMAL" && top.blendMode !== "PASS_THROUGH")
    ctx.report.add(
      "info",
      `The ${what}'s blend mode (${top.blendMode.toLowerCase()}) isn't imported.`,
      at,
    );
  return top;
}

type PaintResult = { fill?: TemplateFill; color?: string; image?: boolean; opacity?: number };

/**
 * A paint as a template fill. A style token can't carry alpha, so a token
 * with a translucent paint keeps the token and moves the alpha to the layer.
 */
function paintFill(
  paint: FigmaPaint,
  token: string | undefined,
  w: number,
  h: number,
  ctx: FrameContext,
  at: Where,
): PaintResult {
  const opacity = paint.opacity ?? 1;
  switch (paint.type) {
    case "SOLID": {
      if (token) {
        const alpha = (paint.color?.a ?? 1) * opacity;
        if (alpha < 0.999) {
          ctx.report.add(
            "info",
            "A translucent token colour: its opacity is applied to the whole layer.",
            at,
          );
          return { color: token, opacity: alpha };
        }
        return { color: token };
      }
      return { color: figmaHex(paint.color, opacity) };
    }
    case "GRADIENT_LINEAR":
      return { fill: linearGradient(paint, w, h) };
    case "GRADIENT_RADIAL":
      return { fill: radialGradient(paint) };
    case "GRADIENT_ANGULAR":
    case "GRADIENT_DIAMOND":
      ctx.report.add(
        "warn",
        `${paint.type === "GRADIENT_ANGULAR" ? "Angular" : "Diamond"} gradient: drawn as a linear one.`,
        at,
      );
      return { fill: linearGradient(paint, w, h) };
    case "IMAGE":
      return { image: true };
    default:
      ctx.report.add(
        "warn",
        `${paint.type.toLowerCase()} fills aren't supported: not imported.`,
        at,
      );
      return {};
  }
}

const stopsOf = (paint: FigmaPaint) =>
  (paint.gradientStops ?? []).map((s) => ({
    color: figmaHex(s.color, paint.opacity ?? 1),
    t: s.position,
  }));

/**
 * A linear gradient from Figma's handles (unit box, y down). The CSS angle
 * points along the handles; each stop lands where its point projects onto
 * the CSS gradient line, so a gradient drawn across part of the box keeps
 * its stops where Figma draws them.
 */
export function linearGradient(paint: FigmaPaint, w: number, h: number): TemplateFill {
  const [p0, p1] = paint.gradientHandlePositions ?? [];
  const stops = stopsOf(paint);
  if (!p0 || !p1 || !(w > 0 && h > 0))
    return {
      type: "linear",
      angle: 180,
      stops: stops.map((s) => ({ color: s.color, at: r2(s.t * 100) })),
    };
  const dx = (p1.x - p0.x) * w;
  const dy = (p1.y - p0.y) * h;
  const angle = ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360;
  const rad = (angle * Math.PI) / 180;
  const dir = { x: Math.sin(rad), y: -Math.cos(rad) };
  const length = Math.abs(w * dir.x) + Math.abs(h * dir.y);
  return {
    type: "linear",
    angle: r2(angle) % 360,
    stops: stops.map((s) => {
      const px = p0.x * w + s.t * dx - w / 2;
      const py = p0.y * h + s.t * dy - h / 2;
      const along = length > 0 ? ((px * dir.x + py * dir.y) / length) * 100 + 50 : s.t * 100;
      return { color: s.color, at: clamp(r2(along), 0, 100) };
    }),
  };
}

/** A radial gradient centred on Figma's first handle. */
export function radialGradient(paint: FigmaPaint): TemplateFill {
  const [p0] = paint.gradientHandlePositions ?? [];
  return {
    type: "radial",
    ...(p0 ? { at: { x: clamp(r2(p0.x * 100), 0, 100), y: clamp(r2(p0.y * 100), 0, 100) } } : {}),
    stops: stopsOf(paint).map((s) => ({ color: s.color, at: clamp(r2(s.t * 100), 0, 100) })),
  };
}

// ── Effects ─────────────────────────────────────────────────────────────────

function boxShadows(
  effects: readonly FigmaEffect[] | undefined,
  ctx: FrameContext,
  at: Where,
): TemplateBoxShadow[] {
  const out: TemplateBoxShadow[] = [];
  for (const e of effects ?? []) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
      const shadow: TemplateBoxShadow = {
        x: clamp(widthPct(e.offset?.x ?? 0, ctx), -50, 50),
        y: clamp(widthPct(e.offset?.y ?? 0, ctx), -50, 50),
        blur: clamp(widthPct(e.radius ?? 0, ctx), 0, 50),
        color: figmaHex(e.color),
      };
      if (e.spread) shadow.spread = clamp(widthPct(e.spread, ctx), -50, 50);
      if (e.type === "INNER_SHADOW") shadow.inset = true;
      out.push(shadow);
    } else reportEffect(e, ctx, at);
  }
  return out;
}

function textShadows(
  effects: readonly FigmaEffect[] | undefined,
  ctx: FrameContext,
  at: Where,
): TemplateTextShadow[] {
  const out: TemplateTextShadow[] = [];
  for (const e of effects ?? []) {
    if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW") {
      if (e.spread) ctx.report.add("info", "Text shadow spread isn't imported.", at);
      out.push({
        x: clamp(widthPct(e.offset?.x ?? 0, ctx), -50, 50),
        y: clamp(widthPct(e.offset?.y ?? 0, ctx), -50, 50),
        blur: clamp(widthPct(e.radius ?? 0, ctx), 0, 50),
        color: figmaHex(e.color),
      });
    } else if (e.type === "INNER_SHADOW") {
      ctx.report.add("warn", "Inner shadow on text isn't supported: not imported.", at);
    } else reportEffect(e, ctx, at);
  }
  return out;
}

function reportEffect(e: FigmaEffect, ctx: FrameContext, at: Where): void {
  const name =
    e.type === "LAYER_BLUR"
      ? "Layer blur"
      : e.type === "BACKGROUND_BLUR"
        ? "Background blur"
        : e.type.toLowerCase();
  ctx.report.add("warn", `${name} isn't supported: not imported.`, at);
}

/** A node's blend mode, when CSS has it. */
function blendOf(node: FigmaNode, ctx: FrameContext, at: Where): BlendMode | undefined {
  const mode = node.blendMode;
  if (!mode || mode === "PASS_THROUGH" || mode === "NORMAL") return undefined;
  const css = mode.toLowerCase().replace(/_/g, "-");
  if ((BLEND_MODES as readonly string[]).includes(css)) return css as BlendMode;
  ctx.report.add("warn", `Blend mode ${css} isn't supported: drawn normally.`, at);
  return undefined;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

/** A painted frame (its fill, stroke or shadow) as a shape, or null when it paints nothing. */
function paintedShape(
  node: FigmaNode,
  path: string,
  ctx: FrameContext,
  box: LayerBox,
): LayerBody | null {
  const paints = (node.fills ?? []).some((p) => p.visible !== false && (p.opacity ?? 1) > 0);
  const strokes =
    (node.strokes ?? []).some((p) => p.visible !== false) && (node.strokeWeight ?? 0) > 0;
  const effects = (node.effects ?? []).some((e) => e.visible !== false);
  if (!paints && !strokes && !effects) return null;
  return shapeLayer(node, path, ctx, box);
}

function shapeLayer(
  node: FigmaNode,
  path: string,
  ctx: FrameContext,
  box: LayerBox,
): LayerBody | null {
  const at = where(ctx, path);
  const style: TemplateStyleV2 = {};
  let opacity = node.opacity ?? 1;
  const w = (box.w / 100) * ctx.fw;
  const h = (box.h / 100) * ctx.fh;

  if (node.type === "LINE") {
    // A line paints its stroke: the shape's fill.
    const stroke = topPaint(node.strokes, "stroke", ctx, at);
    if (!stroke) return null;
    const res = paintFill(stroke, styledToken(node, "stroke", ctx, at), w, h, ctx, at);
    if (res.color) style.fill = res.color;
    else if (res.fill) style.fill = res.fill;
    if (res.opacity !== undefined) opacity *= res.opacity;
  } else {
    const fill = topPaint(node.fills, "fill", ctx, at);
    if (fill) {
      const res = paintFill(fill, styledToken(node, "fill", ctx, at), w, h, ctx, at);
      if (res.image) {
        ctx.report.add("info", "Image fill: imported as a slot or library image by L8-B.", at);
        ctx.deferred.push(deferral(node, path, ctx, "image"));
        return null;
      }
      if (res.color) style.fill = res.color;
      else if (res.fill) style.fill = res.fill;
      if (res.opacity !== undefined) opacity *= res.opacity;
    }
    const border = borderOf(node, ctx, at);
    if (border) style.border = border;
  }

  const radius = radiusOf(node, ctx, at);
  if (radius) style.radius = radius;
  const shadows = boxShadows(node.effects, ctx, at);
  if (shadows.length) style.boxShadow = shadows;
  if (opacity < 0.999) style.opacity = r2(opacity);
  const blend = blendOf(node, ctx, at);
  if (blend) style.blend = blend;
  if (!style.fill && !style.border && !style.boxShadow) return null;
  return { kind: "shape", style };
}

function borderOf(node: FigmaNode, ctx: FrameContext, at: Where): TemplateBorder | undefined {
  const stroke = topPaint(node.strokes, "stroke", ctx, at);
  const weights = node.individualStrokeWeights;
  const weight = weights
    ? Math.max(weights.top, weights.right, weights.bottom, weights.left)
    : (node.strokeWeight ?? 0);
  if (!stroke || !(weight > 0)) return undefined;
  if (weights && new Set([weights.top, weights.right, weights.bottom, weights.left]).size > 1)
    ctx.report.add("info", "Uneven stroke widths: the heaviest is used on every side.", at);
  let color: string;
  if (stroke.type === "SOLID") {
    const token = styledToken(node, "stroke", ctx, at);
    const alpha = (stroke.color?.a ?? 1) * (stroke.opacity ?? 1);
    if (token && alpha < 0.999)
      ctx.report.add("info", "A translucent token stroke: drawn opaque to keep the token.", at);
    color = token ?? figmaHex(stroke.color, stroke.opacity ?? 1);
  } else {
    ctx.report.add("warn", "A gradient or image stroke: drawn in its first colour.", at);
    color = figmaHex(stroke.gradientStops?.[0]?.color, stroke.opacity ?? 1);
  }
  if (node.strokeAlign && node.strokeAlign !== "INSIDE")
    ctx.report.add(
      "info",
      `${node.strokeAlign === "OUTSIDE" ? "Outside" : "Centre"} stroke: drawn inside the box.`,
      at,
    );
  const border: TemplateBorder = { width: clamp(widthPct(weight, ctx), 0, 20), color };
  if (node.strokeDashes?.length) border.style = "dashed";
  return border;
}

/** Corner radius in native card pixels (an ellipse is fully round). */
function radiusOf(node: FigmaNode, ctx: FrameContext, at: Where): number | undefined {
  if (node.type === "ELLIPSE") {
    const bb = node.size ?? {
      x: node.absoluteBoundingBox?.width ?? 0,
      y: node.absoluteBoundingBox?.height ?? 0,
    };
    if (Math.abs(bb.x - bb.y) > 0.5)
      ctx.report.add("info", "An oval: drawn as a rounded rectangle (pill).", at);
    return clamp(Math.round((Math.max(bb.x, bb.y) / 2) * ctx.pxScale), 0, 10000);
  }
  const corners = node.rectangleCornerRadii;
  let px = node.cornerRadius ?? 0;
  if (corners && corners.length === 4) {
    px = Math.max(...corners);
    if (new Set(corners).size > 1)
      ctx.report.add("info", "Uneven corner radii: the largest is used on every corner.", at);
  }
  return px > 0 ? clamp(Math.round(px * ctx.pxScale), 0, 10000) : undefined;
}

// ── Text ────────────────────────────────────────────────────────────────────

const ALIGN: Record<string, "left" | "center" | "right"> = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
  JUSTIFIED: "left",
};

function textLayer(node: FigmaNode, ctx: FrameContext, box: LayerBox, at: Where): LayerBody | null {
  const chars = node.characters ?? "";
  if (!chars.trim()) return null;
  const unknown: string[] = [];
  const content = chars.replace(TOKEN_RE, (_m, raw: string) => {
    const key = ctx.tokens.get(raw.toLowerCase());
    if (!key) unknown.push(raw);
    return `{{${key ?? raw}}}`;
  });
  if (unknown.length) {
    ctx.report.add(
      "warn",
      `Uses ${unknown.map((t) => `{{${t}}}`).join(", ")}, which the ${ctx.page} page of ${ctx.kind} doesn't have: not imported.`,
      at,
    );
    return null;
  }

  const ts = node.style ?? {};
  const style: TemplateStyleV2 = {};
  const fontPx = ts.fontSize ?? 16;

  const font = chooseFont(ctx.fonts, ts.fontFamily ?? "Inter", ts.fontWeight ?? 400);
  style.fontFamily = cssFontFamily(font);
  style.fontWeight = clamp(font.weight, 100, 1000);
  if (font.substitutedFrom) {
    ctx.fontSubs.set(font.substitutedFrom, font.family);
    ctx.report.add(
      "warn",
      `Font "${font.substitutedFrom}" isn't in the Google Fonts catalogue: "${font.family}" is used instead.`,
    );
  }
  if (font.weightFrom !== undefined) {
    ctx.report.add(
      "info",
      `"${font.family}" has no weight ${font.weightFrom}: ${font.weight} is used.`,
      at,
    );
  }
  style.fontSize = clamp(r2((fontPx / ctx.fw) * 100), 0.2, 80);
  if (ts.letterSpacing) style.letterSpacing = clamp(r3(ts.letterSpacing / fontPx), -1, 3);
  if (ts.lineHeightPx && ts.lineHeightUnit !== "INTRINSIC_%")
    style.lineHeight = clamp(r2(ts.lineHeightPx / fontPx), 0.5, 3);
  if (ts.textCase === "UPPER") style.uppercase = true;
  else if (ts.textCase && ts.textCase !== "ORIGINAL")
    ctx.report.add(
      "info",
      `Text case ${ts.textCase.toLowerCase().replace(/_/g, " ")} isn't imported (only upper case is).`,
      at,
    );
  if (ts.textAlignHorizontal) {
    style.align = ALIGN[ts.textAlignHorizontal] ?? "left";
    if (ts.textAlignHorizontal === "JUSTIFIED")
      ctx.report.add("info", "Justified text: aligned left.", at);
  }
  if (ts.italic) ctx.report.add("warn", "Italic isn't supported: drawn upright.", at);
  if (ts.textDecoration && ts.textDecoration !== "NONE")
    ctx.report.add(
      "info",
      `${ts.textDecoration === "UNDERLINE" ? "Underline" : "Strikethrough"} isn't imported.`,
      at,
    );
  if (node.characterStyleOverrides?.some((s) => s !== 0))
    ctx.report.add("warn", "Mixed text styles: the layer's base style is used throughout.", at);

  let opacity = node.opacity ?? 1;
  const paint = topPaint(node.fills, "fill", ctx, at);
  if (paint) {
    const w = (box.w / 100) * ctx.fw;
    const h = (box.h / 100) * ctx.fh;
    const res = paintFill(paint, styledToken(node, "fill", ctx, at), w, h, ctx, at);
    if (res.color) style.color = res.color;
    else if (res.fill) style.textFill = res.fill;
    else if (res.image)
      ctx.report.add("warn", "Image-filled text isn't supported: drawn in the default colour.", at);
    if (res.opacity !== undefined) opacity *= res.opacity;
  }
  const shadows = textShadows(node.effects, ctx, at);
  if (shadows.length) style.textShadow = shadows;
  if (opacity < 0.999) style.opacity = r2(opacity);
  const blend = blendOf(node, ctx, at);
  if (blend) style.blend = blend;

  if (!content.includes("{{")) return { kind: "text", content, style };
  // Live text fits its box: two lines when the box has room for them.
  const linePx =
    ts.lineHeightPx && ts.lineHeightUnit !== "INTRINSIC_%" ? ts.lineHeightPx : fontPx * 1.2;
  const boxPx = (box.h / 100) * ctx.fh;
  const fit: TextFit = {
    minScale: FIT_MIN_SCALE,
    maxLines: boxPx >= linePx * 1.8 ? 2 : 1,
    ellipsis: true,
  };
  if (ts.textAutoResize === "WIDTH_AND_HEIGHT")
    ctx.report.add(
      "warn",
      "Auto-width text with a token: its box is only as wide as the token's name. Give it a fixed width that fits real names.",
      at,
    );
  return { kind: "text", content, style, fit };
}

// ── Merging sizes ───────────────────────────────────────────────────────────

/**
 * One order for every size's paths, each size's own order kept: a path only
 * one size has goes just before the next path it shares with the others, or
 * after the last one it shares.
 */
export function mergeOrder(lists: readonly (readonly string[])[]): string[] {
  const merged: string[] = [];
  for (const list of lists) {
    let after = -1;
    list.forEach((path, i) => {
      const at = merged.indexOf(path);
      if (at >= 0) {
        after = Math.max(after, at);
        return;
      }
      let pos = after + 1;
      for (const next of list.slice(i + 1)) {
        const k = merged.indexOf(next);
        if (k < 0) continue;
        if (k > after) pos = k;
        break;
      }
      merged.splice(pos, 0, path);
      after = pos;
    });
  }
  return merged;
}

/** The imported size whose shape is closest to `size`'s. */
function nearestSize(size: TemplateSize, from: readonly TemplateSize[]): TemplateSize {
  const ratio = (s: TemplateSize) => TEMPLATE_SIZES[s].w / TEMPLATE_SIZES[s].h;
  return [...from].sort(
    (a, b) =>
      Math.abs(Math.log(ratio(a) / ratio(size))) - Math.abs(Math.log(ratio(b) / ratio(size))),
  )[0]!;
}

type PageLayer = TemplateLayerV2 & { sizes: TemplateSize[] };

function mergePage(
  page: PageKey,
  perSize: Map<TemplateSize, Mapped[]>,
  report: Report,
): TemplateLayerV2[] {
  const imported = TEMPLATE_SIZE_ORDER.filter((s) => perSize.has(s));
  const order = mergeOrder(imported.map((s) => perSize.get(s)!.map((m) => m.path)));
  const bySize = new Map(
    imported.map((s) => [s, new Map(perSize.get(s)!.map((m) => [m.path, m]))]),
  );
  const layers: PageLayer[] = [];
  let n = 0;
  for (const path of order) {
    // One layer per distinct body: a style that differs between sizes splits the layer.
    const groups = new Map<
      string,
      { body: LayerBody; sizes: TemplateSize[]; boxes: Map<TemplateSize, LayerBox> }
    >();
    for (const size of imported) {
      const mapped = bySize.get(size)!.get(path);
      if (!mapped) continue;
      const sig = JSON.stringify(mapped.body);
      const group = groups.get(sig) ?? {
        body: mapped.body,
        sizes: [] as TemplateSize[],
        boxes: new Map<TemplateSize, LayerBox>(),
      };
      group.sizes.push(size);
      group.boxes.set(size, mapped.box);
      groups.set(sig, group);
    }
    for (const group of groups.values()) {
      n += 1;
      const geometry: Partial<Record<TemplateSize, LayerBox>> = {};
      for (const [size, box] of group.boxes) geometry[size] = box;
      layers.push({
        id: `${page}-f${n}`,
        ...group.body,
        geometry,
        sizes: group.sizes,
      } as PageLayer);
    }
  }

  // A size with no frame is placed from the nearest imported one (KTD16), so it isn't empty.
  for (const size of TEMPLATE_SIZE_ORDER) {
    if (perSize.has(size)) continue;
    const from = nearestSize(size, imported);
    report.add(
      "warn",
      `No ${size} frame: the ${size} layout is placed from ${from}. Check it, or add a ${page}/${size} frame.`,
      { page },
    );
    for (const layer of layers) {
      const box = layer.geometry[from];
      if (!box || !layer.sizes.includes(from)) continue;
      const placed = placeBoxOnSize(box, from, size);
      layer.geometry[size] = {
        ...placed,
        x: r2(placed.x),
        y: r2(placed.y),
        w: r2(placed.w),
        h: r2(placed.h),
      };
      layer.sizes.push(size);
    }
  }

  return layers.map((layer) => {
    const sizes = TEMPLATE_SIZE_ORDER.filter((s) => layer.sizes.includes(s));
    const out: TemplateLayerV2 = { ...layer };
    if (sizes.length === TEMPLATE_SIZE_ORDER.length) delete out.sizes;
    else out.sizes = sizes;
    return out;
  });
}

// ── Entry ───────────────────────────────────────────────────────────────────

/** A Figma import as a v2 document for `kind`, with its report. */
export function figmaToTemplate(input: FigmaImportInput): FigmaImportResult {
  const { kind } = input;
  if (!pageTokens(kind, primaryPage(kind))) throw new Error(`Unknown card kind "${kind}".`);
  const report = new Report();
  const deferred: FigmaDeferred[] = [];
  const fonts = fontIndex(input.fonts);
  const fontSubs = new Map<string, string>();
  const matches = matchFrames(kind, input.frames, report);
  const document: TemplateDocumentV2 = { formatVersion: FORMAT_VERSION, pages: {} };

  if (matches.length === 0) {
    report.add(
      "warn",
      `No frame to import. Name each frame <page>/<size> (for ${kind}: ${kindPages(kind)
        .map((p) => `${p}/square`)
        .join(", ")}…), or size it like a card.`,
    );
  }

  for (const page of kindPages(kind)) {
    const frames = matches.filter((m) => m.page === page);
    if (frames.length === 0) {
      if (matches.length)
        report.add("warn", `No frames for the ${page} page: it isn't imported.`, { page });
      continue;
    }
    const tokens = new Map([...pageTokenKeys(kind, page)].map((k) => [k.toLowerCase(), k]));
    const perSize = new Map<TemplateSize, Mapped[]>();
    for (const frame of frames) {
      const bb = frame.node.absoluteBoundingBox!;
      perSize.set(
        frame.size,
        mapFrame(frame, {
          kind,
          page,
          size: frame.size,
          fx: bb.x,
          fy: bb.y,
          fw: bb.width,
          fh: bb.height,
          pxScale: TEMPLATE_SIZES[frame.size].w / bb.width,
          tokens,
          styles: input.styles ?? {},
          fonts,
          fontSubs,
          report,
          deferred,
        }),
      );
    }
    document.pages[page] = { layers: mergePage(page, perSize, report) };
  }

  return {
    document,
    frames: matches.map((m) => ({
      nodeId: m.nodeId,
      name: m.name,
      page: m.page,
      size: m.size,
      by: m.by,
    })),
    report: report.list(),
    deferred,
    fonts: [...fontSubs].map(([from, to]) => ({ from, to })),
  };
}
