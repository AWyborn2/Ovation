/**
 * Computed-style parsing for the pack converter (L4-A2): colours, gradients,
 * shadows and lengths as the browser reports them (`rgb(…)`, `px`), turned
 * into the template format's values (hex or `var(--token)`, percent of the
 * artboard width).
 */

/** An RGBA colour, channels 0–255 and alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * `rgb(1, 2, 3)` / `rgba(1, 2, 3, 0.5)` / `color(srgb 0.1 0.2 0.3 / 0.5)` (how
 * Chrome computes `color-mix()`) / `#rrggbb` / `transparent`; null otherwise.
 */
export function parseColour(value: string | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const alphaOf = (a: string | undefined) =>
    a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : +a;
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: alphaOf(m[4]) };
  const srgb =
    /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (srgb)
    return { r: +srgb[1]! * 255, g: +srgb[2]! * 255, b: +srgb[3]! * 255, a: alphaOf(srgb[4]) };
  const h = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (h) {
    let hex = h[1]!;
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  return null;
}

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");

/** `#rrggbb`, or `#rrggbbaa` when not opaque. */
export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
  return c.a >= 0.999 ? base : `${base}${hex2(c.a * 255).toUpperCase()}`;
}

export function sameColour(a: Rgba | null, b: Rgba | null): boolean {
  if (!a || !b) return false;
  return (
    Math.abs(a.r - b.r) <= 1 &&
    Math.abs(a.g - b.g) <= 1 &&
    Math.abs(a.b - b.b) <= 1 &&
    Math.abs(a.a - b.a) <= 0.01
  );
}

/**
 * The token a colour is: one whose resolved value matches the colour in
 * both sentinel palettes. A colour that moves between the palettes but
 * matches no token is reported (`moved` true), so polish can trace it.
 */
export interface ColourMatch {
  value: string;
  token?: string;
  moved: boolean;
  /**
   * A token's colour at partial alpha (the accent at 45 %): v2 colours can't
   * carry alpha on a token, so a layer that paints only this can draw
   * `var(token)` at `alpha` opacity instead of a fixed hex.
   */
  translucent?: { token: string; alpha: number };
}

export interface PaletteColours {
  a: Record<string, string>;
  b: Record<string, string> | null;
}

/** The format's colour for a captured colour in palette A, with its palette-B twin. */
export function tokeniseColour(
  inA: string | undefined,
  inB: string | undefined,
  palette: PaletteColours,
): ColourMatch | null {
  const a = parseColour(inA);
  if (!a || a.a === 0) return null;
  const b = inB === undefined ? null : parseColour(inB);
  const moved = !!b && !sameColour(a, b);
  for (const [token, resolved] of Object.entries(palette.a)) {
    if (!sameColour(a, parseColour(resolved))) continue;
    // With a palette-B capture the token must match there too; without one, A alone decides.
    if (palette.b && b) {
      if (!sameColour(b, parseColour(palette.b[token]))) continue;
    } else if (palette.b) continue;
    return { value: `var(${token})`, token, moved };
  }
  if (a.a < 1) {
    const solid = (c: NonNullable<ReturnType<typeof parseColour>>) => ({ ...c, a: 1 });
    for (const [token, resolved] of Object.entries(palette.a)) {
      if (!sameColour(solid(a), parseColour(resolved))) continue;
      if (palette.b && b) {
        if (!sameColour(solid(b), parseColour(palette.b[token])) || Math.abs(a.a - b.a) > 0.01)
          continue;
      } else if (palette.b) continue;
      return { value: toHex(a), moved, translucent: { token, alpha: Math.round(a.a * 100) / 100 } };
    }
  }
  return { value: toHex(a), moved };
}

/** Split on commas that aren't inside parentheses. */
export function splitTopLevel(value: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === sep && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out.filter(Boolean);
}

const COLOUR_AT_START = /^(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}|transparent)\s*(.*)$/i;

export interface ParsedGradient {
  type: "linear" | "radial";
  angle?: number;
  shape?: "circle" | "ellipse";
  at?: { x: number; y: number };
  stops: Array<{ colour: string; at?: number }>;
}

const SIDE_ANGLES: Record<string, number> = {
  "to top": 0,
  "to right": 90,
  "to bottom": 180,
  "to left": 270,
  "to top right": 45,
  "to right top": 45,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom left": 225,
  "to left bottom": 225,
  "to top left": 315,
  "to left top": 315,
};

/** A computed `linear-gradient(…)` / `radial-gradient(…)`; null for anything else (url(), repeating, conic). */
export function parseGradient(value: string): ParsedGradient | null {
  const m = /^(linear|radial)-gradient\((.*)\)$/s.exec(value.trim());
  if (!m) return null;
  const parts = splitTopLevel(m[2]!);
  const g: ParsedGradient = { type: m[1] as "linear" | "radial", stops: [] };
  let first = parts[0] ?? "";
  if (!COLOUR_AT_START.test(first)) {
    parts.shift();
    if (g.type === "linear") {
      const deg = /^(-?[\d.]+)deg$/.exec(first);
      if (deg) g.angle = ((+deg[1]! % 360) + 360) % 360;
      else if (SIDE_ANGLES[first] !== undefined) g.angle = SIDE_ANGLES[first];
      else if (/^(-?[\d.]+)turn$/.test(first)) g.angle = (parseFloat(first) * 360) % 360;
    } else {
      if (/circle/.test(first)) g.shape = "circle";
      else if (/ellipse/.test(first)) g.shape = "ellipse";
      const at = /at\s+([\d.]+)%\s+([\d.]+)%/.exec(first);
      if (at) g.at = { x: +at[1]!, y: +at[2]! };
    }
    first = parts[0] ?? "";
  }
  for (const part of parts) {
    const s = COLOUR_AT_START.exec(part);
    if (!s) return null;
    const pos = /(-?[\d.]+)%/.exec(s[2] ?? "");
    g.stops.push({ colour: s[1]!, ...(pos ? { at: +pos[1]! } : {}) });
  }
  return g.stops.length >= 2 ? g : null;
}

/** One box or text shadow: offsets and blur in px, colour as computed. */
export interface ParsedShadow {
  colour: string;
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
}

/** A computed `box-shadow` / `text-shadow` list (`rgba(…) 0px 4px 21px 0px`, `inset` anywhere). */
export function parseShadows(value: string | undefined): ParsedShadow[] {
  if (!value || value === "none") return [];
  return splitTopLevel(value).flatMap((part) => {
    const colour = /(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/i.exec(part)?.[1];
    const lengths = [...part.replace(/(rgba?|color)\([^)]*\)/gi, "").matchAll(/(-?[\d.]+)px/g)].map(
      (m) => +m[1]!,
    );
    if (!colour || lengths.length < 2) return [];
    return [
      {
        colour,
        x: lengths[0]!,
        y: lengths[1]!,
        blur: lengths[2] ?? 0,
        spread: lengths[3] ?? 0,
        inset: /\binset\b/.test(part),
      },
    ];
  });
}

/** A computed `filter` as its functions, in order (`drop-shadow(… rgba(…))` kept whole). */
export function parseFilterFunctions(
  value: string | undefined,
): Array<{ name: string; arg: string }> {
  const out: Array<{ name: string; arg: string }> = [];
  if (!value || value === "none") return out;
  const re = /([a-z-]+)\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < value.length && depth; i++) {
      if (value[i] === "(") depth++;
      else if (value[i] === ")") depth--;
    }
    out.push({ name: m[1]!.toLowerCase(), arg: value.slice(re.lastIndex, i - 1).trim() });
    re.lastIndex = i;
  }
  return out;
}

/** The `drop-shadow()`s of a computed `filter`, as shadows (they have no spread). */
export function parseDropShadows(value: string | undefined): ParsedShadow[] {
  return parseFilterFunctions(value)
    .filter((f) => f.name === "drop-shadow")
    .flatMap((f) => parseShadows(f.arg));
}

/** A pure skew transform (`skew(x, y)`) as degrees; null for any other matrix. */
export function pureSkew(m: number[]): { x: number; y: number } | null {
  const [a, b, c, d] = m as [number, number, number, number];
  if (Math.abs(a - 1) > 0.005 || Math.abs(d - 1) > 0.005) return null;
  const deg = (t: number) => r2((Math.atan(t) * 180) / Math.PI);
  const skew = { x: deg(c), y: deg(b) };
  if (!skew.x && !skew.y) return null;
  return Math.abs(skew.x) <= 75 && Math.abs(skew.y) <= 75 ? skew : null;
}

/** A px length as a number; NaN for anything else (`normal`, `auto`, percentages). */
export function px(value: string | undefined): number {
  const m = /^(-?[\d.]+)px$/.exec((value ?? "").trim());
  return m ? +m[1]! : NaN;
}

/** Round to 2 decimal places (percent and em values in a document). */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** A length in px against `size`: `Npx`, `N%`, a bare number, or `calc()` of those added and subtracted. */
function lengthPx(value: string, size: number): number | null {
  const t = value.trim();
  if (/^-?[\d.]+px$/.test(t)) return parseFloat(t);
  if (/^-?[\d.]+%$/.test(t)) return (parseFloat(t) / 100) * size;
  if (/^-?[\d.]+$/.test(t)) return parseFloat(t);
  const calc = /^calc\((.*)\)$/s.exec(t);
  if (!calc) return null;
  const terms = calc[1]!.trim().split(/\s+([+-])\s+/);
  let total = lengthPx(terms[0]!, size);
  for (let i = 1; total !== null && i < terms.length; i += 2) {
    const term = lengthPx(terms[i + 1] ?? "", size);
    total = term === null ? null : terms[i] === "+" ? total + term : total - term;
  }
  return total;
}

/**
 * A CSS `clip-path: polygon(…)` as points in percent of a `w` × `h` box
 * (px, percentages and `calc()` resolved against the box), or null for any
 * other shape or a value it can't read.
 */
export function parseClipPolygon(
  value: string | undefined,
  w: number,
  h: number,
): Array<[number, number]> | null {
  if (!value || !(w > 0) || !(h > 0)) return null;
  const m = /^polygon\((.*)\)$/s.exec(value.trim());
  if (!m) return null;
  const body = m[1]!.trim().replace(/^(?:nonzero|evenodd)\s*,\s*/i, "");
  const out: Array<[number, number]> = [];
  for (const point of splitTopLevel(body)) {
    const coords = splitTopLevel(point, " ");
    if (coords.length !== 2) return null;
    const x = lengthPx(coords[0]!, w);
    const y = lengthPx(coords[1]!, h);
    if (x === null || y === null) return null;
    out.push([r2((x / w) * 100), r2((y / h) * 100)]);
  }
  return out.length >= 3 ? out : null;
}

/** A 2D CSS matrix (`matrix(a, b, c, d, e, f)`), or null for none / 3D. */
export function parseMatrix(value: string | undefined): number[] | null {
  const m = /^matrix\(([^)]*)\)$/.exec((value ?? "").trim());
  if (!m) return null;
  const n = m[1]!.split(",").map((s) => +s.trim());
  return n.length === 6 && n.every(Number.isFinite) ? n : null;
}

/** The rotation of a matrix in degrees when it is a pure rotation (no skew or scale); else null. */
export function pureRotation(m: number[]): number | null {
  const [a, b, c, d] = m as [number, number, number, number];
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  if (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) return null;
  if (Math.abs(a * c + b * d) > 0.01) return null;
  return r2((Math.atan2(b, a) * 180) / Math.PI);
}

/**
 * The corners of a transformed box, in the coordinates of its visual
 * bounding box: an untransformed `w`×`h` box, the matrix, the transform
 * origin. Lets a skewed panel become a polygon.
 */
export function transformedCorners(
  w: number,
  h: number,
  m: number[],
  origin: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const [a, b, c, d] = m as [number, number, number, number];
  const pts = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((p) => {
    const x = p.x - origin.x;
    const y = p.y - origin.y;
    return { x: a * x + c * y + origin.x, y: b * x + d * y + origin.y };
  });
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: r2(p.x - minX), y: r2(p.y - minY) }));
}
