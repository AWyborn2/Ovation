/**
 * Simple SVGs as native shapes (editable-elements plan, C1): a drawing of one
 * rect, polygon, line, circle or straight path becomes a shape layer, cut to
 * its outline with `clip`, so the editor moves, resizes and recolours it like
 * any box. Anything else stays a vector, and `explicitColours` gives each
 * drawn element its own colour so it can be recoloured on its own.
 */
import {
  MAX_CLIP_POINTS,
  parseSvg,
  serialiseSvg,
  type SvgNode,
  type TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** A native shape for a drawing: its box in percent of the vector's box, and its style. */
export type SvgShape = { box: Box; style: TemplateStyleV2 };

const r2 = (v: number) => Math.round(v * 100) / 100;

const DRAWN = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
/** Paint SVG inherits from a wrapper (`opacity` isn't inherited: it multiplies). */
const INHERITED = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity"];
/** Attributes a wrapper (`svg`, `g`) may carry for its drawing to stay simple. */
const WRAPPER = new Set([
  "xmlns",
  "version",
  "id",
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "opacity",
  "shape-rendering",
  ...INHERITED,
]);
/** Attributes that keep a drawn element a vector. */
const COMPLEX = ["transform", "clip-path", "mask", "stroke-dasharray", "vector-effect"];

const attr = (n: SvgNode, k: string) => n.attrs.find(([a]) => a === k)?.[1];
const numAttr = (n: SvgNode, k: string, fallback = 0) => {
  const v = parseFloat(attr(n, k) ?? "");
  return Number.isFinite(v) ? v : fallback;
};

/** The viewBox → box mapping: `none` stretches, the default `xMidYMid meet` fits and centres. */
function viewport(root: SvgNode, px: { w: number; h: number }): ((p: Pt) => Pt) | null {
  const vb = (attr(root, "viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [minX, minY, vw, vh] =
    vb.length === 4 && vb.every(Number.isFinite)
      ? (vb as [number, number, number, number])
      : [0, 0, numAttr(root, "width", px.w), numAttr(root, "height", px.h)];
  if (!(vw > 0 && vh > 0)) return null;
  const aspect = (attr(root, "preserveAspectRatio") ?? "xMidYMid meet").trim();
  if (aspect === "none") {
    const sx = px.w / vw;
    const sy = px.h / vh;
    return (p) => ({ x: (p.x - minX) * sx, y: (p.y - minY) * sy });
  }
  if (aspect !== "xMidYMid meet" && aspect !== "xMidYMid") return null;
  const s = Math.min(px.w / vw, px.h / vh);
  const tx = (px.w - vw * s) / 2;
  const ty = (px.h - vh * s) / 2;
  return (p) => ({ x: (p.x - minX) * s + tx, y: (p.y - minY) * s + ty });
}

/** The points of a path made of straight segments only, in one subpath; null otherwise. */
export function straightPath(d: string): Pt[] | null {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return null;
  const pts: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let cmd = "";
  let closed = false;
  let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (closed) return null; // a second subpath
    const rel = cmd === cmd.toLowerCase();
    const at = (x: number, y: number): Pt => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case "M":
        if (pts.length) return null; // a second subpath
        cur = at(next(), next());
        pts.push(cur);
        cmd = rel ? "l" : "L"; // more pairs after M are line-tos
        break;
      case "L":
        cur = at(next(), next());
        pts.push(cur);
        break;
      case "H": {
        const x = next();
        cur = { x: rel ? cur.x + x : x, y: cur.y };
        pts.push(cur);
        break;
      }
      case "V": {
        const y = next();
        cur = { x: cur.x, y: rel ? cur.y + y : y };
        pts.push(cur);
        break;
      }
      case "Z":
        closed = true;
        break;
      default:
        return null; // a curve or an arc
    }
    if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  }
  // The closing point repeats the first.
  const [first, last] = [pts[0], pts[pts.length - 1]];
  if (pts.length > 1 && first && last && first.x === last.x && first.y === last.y) pts.pop();
  return pts;
}

const parsePoints = (raw: string | undefined): Pt[] => {
  const n = (raw ?? "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i]!, y: n[i + 1]! });
  return out.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ? out : [];
};

/** A filled outline in box px as a shape: its bounding box and, unless it is that box, a clip. */
function polygonShape(pts: Pt[], px: { w: number; h: number }, style: TemplateStyleV2) {
  if (pts.length < 3 || pts.length > MAX_CLIP_POINTS) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  if (!(bw > 0.01 && bh > 0.01)) return null;
  const clip = pts.map((p) => [r2(((p.x - bx) / bw) * 100), r2(((p.y - by) / bh) * 100)]);
  const isBox =
    clip.length === 4 && clip.every(([x, y]) => (x === 0 || x === 100) && (y === 0 || y === 100));
  return {
    box: {
      x: r2((bx / px.w) * 100),
      y: r2((by / px.h) * 100),
      w: r2((bw / px.w) * 100),
      h: r2((bh / px.h) * 100),
    },
    style: { ...style, ...(isBox ? {} : { clip: { polygon: clip as Array<[number, number]> } }) },
  };
}

/**
 * A drawing as a native shape, or null when it isn't one simple element:
 * `px` is the vector's box in px, `W` the artboard width in px (border
 * widths are percent of it).
 */
export function svgToShape(svg: string, px: { w: number; h: number }, W: number): SvgShape | null {
  const root = parseSvg(svg);
  if (!root || root.name !== "svg" || !(px.w > 0 && px.h > 0)) return null;
  const map = viewport(root, px);
  if (!map) return null;
  // Down single-child wrappers to the one drawn element, collecting what it inherits.
  const paint = new Map<string, string>();
  let opacity = 1;
  let node: SvgNode = root;
  for (;;) {
    if (node.attrs.some(([k]) => !WRAPPER.has(k))) return null;
    for (const k of INHERITED) {
      const v = attr(node, k);
      if (v !== undefined) paint.set(k, v);
    }
    opacity *= numAttr(node, "opacity", 1);
    if (node.children.length !== 1) return null;
    const child: SvgNode = node.children[0]!;
    if (child.name === "g") {
      node = child;
      continue;
    }
    node = child;
    break;
  }
  if (!DRAWN.has(node.name) || node.children.length || COMPLEX.some((k) => attr(node, k)))
    return null;
  for (const k of INHERITED) {
    const v = attr(node, k);
    if (v !== undefined) paint.set(k, v);
  }
  opacity *= numAttr(node, "opacity", 1);
  const fill = (paint.get("fill") ?? "#000000").trim();
  const stroke = (paint.get("stroke") ?? "none").trim();
  if (/url\(/.test(fill) || /url\(/.test(stroke)) return null;
  const fillOpacity = parseFloat(paint.get("fill-opacity") ?? "1");
  const strokeOpacity = parseFloat(paint.get("stroke-opacity") ?? "1");
  const filled = fill !== "none" && fillOpacity > 0;
  const stroked = stroke !== "none" && numAttr(node, "stroke-width", 1) > 0;
  const solid = (colour: string, alpha: number): TemplateStyleV2 => {
    const a = r2(opacity * (Number.isFinite(alpha) ? alpha : 1));
    return { fill: colour, ...(a < 1 ? { opacity: a } : {}) };
  };

  switch (node.name) {
    case "polygon":
    case "polyline":
    case "path": {
      if (stroked || !filled) return null;
      const pts =
        node.name === "path"
          ? straightPath(attr(node, "d") ?? "")
          : parsePoints(attr(node, "points"));
      return pts ? polygonShape(pts.map(map), px, solid(fill, fillOpacity)) : null;
    }
    case "line": {
      if (!stroked) return null;
      const a = { x: numAttr(node, "x1"), y: numAttr(node, "y1") };
      const b = { x: numAttr(node, "x2"), y: numAttr(node, "y2") };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > 0)) return null;
      // The stroke's outline, in the drawing's units, then mapped (exact for any scale).
      const half = numAttr(node, "stroke-width", 1) / 2;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const cap = attr(node, "stroke-linecap") === "square" ? half : 0;
      const [s, e] = [
        { x: a.x - ux * cap, y: a.y - uy * cap },
        { x: b.x + ux * cap, y: b.y + uy * cap },
      ];
      const n = { x: -uy * half, y: ux * half };
      const outline = [
        { x: s.x + n.x, y: s.y + n.y },
        { x: e.x + n.x, y: e.y + n.y },
        { x: e.x - n.x, y: e.y - n.y },
        { x: s.x - n.x, y: s.y - n.y },
      ];
      return polygonShape(outline.map(map), px, solid(stroke, strokeOpacity));
    }
    case "rect": {
      if (!filled && !stroked) return null;
      if (filled && stroked && fillOpacity < 1) return null;
      const tl = map({ x: numAttr(node, "x"), y: numAttr(node, "y") });
      const br = map({
        x: numAttr(node, "x") + numAttr(node, "width"),
        y: numAttr(node, "y") + numAttr(node, "height"),
      });
      const corner = map({
        x: numAttr(node, "rx", numAttr(node, "ry")),
        y: numAttr(node, "ry", numAttr(node, "rx")),
      });
      const origin = map({ x: 0, y: 0 });
      const [rx, ry] = [corner.x - origin.x, corner.y - origin.y];
      if (Math.abs(rx - ry) > 0.5) return null;
      // A stroke is centred on the edge; a border sits inside the box.
      const sw = stroked
        ? numAttr(node, "stroke-width", 1) * ((br.x - tl.x) / (numAttr(node, "width") || 1))
        : 0;
      const box = { x: tl.x - sw / 2, y: tl.y - sw / 2, w: br.x - tl.x + sw, h: br.y - tl.y + sw };
      if (!(box.w > 0 && box.h > 0)) return null;
      const style: TemplateStyleV2 = filled ? solid(fill, fillOpacity) : { fill: "#00000000" };
      if (!filled && opacity < 1) style.opacity = r2(opacity);
      if (rx > 0) style.radius = r2(rx + sw / 2);
      if (stroked) style.border = { width: r2((sw / W) * 100), color: stroke };
      if (stroked && strokeOpacity < 1) return null;
      return {
        box: {
          x: r2((box.x / px.w) * 100),
          y: r2((box.y / px.h) * 100),
          w: r2((box.w / px.w) * 100),
          h: r2((box.h / px.h) * 100),
        },
        style,
      };
    }
    case "circle":
    case "ellipse": {
      if (stroked || !filled) return null;
      const c = map({ x: numAttr(node, "cx"), y: numAttr(node, "cy") });
      const r = node.name === "circle" ? numAttr(node, "r") : undefined;
      const edge = map({
        x: numAttr(node, "cx") + (r ?? numAttr(node, "rx")),
        y: numAttr(node, "cy") + (r ?? numAttr(node, "ry")),
      });
      const [rx, ry] = [edge.x - c.x, edge.y - c.y];
      if (!(rx > 0 && ry > 0)) return null;
      const box = { x: c.x - rx, y: c.y - ry, w: 2 * rx, h: 2 * ry };
      const style = solid(fill, fillOpacity);
      // Round as drawn: a circle is a fully rounded box; an ellipse, its outline as a clip.
      if (Math.abs(rx - ry) <= Math.max(0.5, 0.01 * rx)) style.radius = 10000;
      else {
        const pts = Array.from({ length: MAX_CLIP_POINTS }, (_, i) => {
          const t = (i / MAX_CLIP_POINTS) * 2 * Math.PI;
          return { x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) };
        });
        return polygonShape(pts, px, style);
      }
      return {
        box: {
          x: r2((box.x / px.w) * 100),
          y: r2((box.y / px.h) * 100),
          w: r2((box.w / px.w) * 100),
          h: r2((box.h / px.h) * 100),
        },
        style,
      };
    }
    default:
      return null;
  }
}

/**
 * A vector's markup with every drawn element carrying its own fill (and its
 * stroke, when it has one), taken from the wrappers it inherited them from,
 * so each element's colour can be changed on its own. Unparseable markup is
 * returned as it is.
 */
export function explicitColours(svg: string): string {
  const root = parseSvg(svg);
  if (!root) return svg;
  const walk = (node: SvgNode, inherited: Map<string, string>): void => {
    const own = new Map(inherited);
    for (const k of ["fill", "stroke"]) {
      const v = attr(node, k);
      if (v !== undefined) own.set(k, v);
    }
    if (DRAWN.has(node.name)) {
      // A line has no fill to set.
      if (node.name !== "line" && attr(node, "fill") === undefined)
        node.attrs.push(["fill", own.get("fill") ?? "#000000"]);
      if (attr(node, "stroke") === undefined && own.has("stroke"))
        node.attrs.push(["stroke", own.get("stroke")!]);
      return;
    }
    if (node.name !== "svg" && node.name !== "g") return; // defs, gradients, clip paths: as they are
    for (const child of node.children) walk(child, own);
    // Every drawn element now says its own colours: a wrapper's are dead.
    node.attrs = node.attrs.filter(([k]) => k !== "fill" && k !== "stroke");
  };
  walk(root, new Map());
  return serialiseSvg(root);
}
