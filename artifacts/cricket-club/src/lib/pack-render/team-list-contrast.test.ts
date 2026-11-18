/**
 * Team List names and the grade line readable on what's behind them (Ash's
 * round 3 retest, Nov 2026: Duotone printed its names and "A GRADE — ROUND 6"
 * dark grey on a dark panel). For every committed Team List bundle, size,
 * photo state and senior or junior card (a junior draws the senior layout,
 * its photo approved junior stock or none), with the default club brand, a
 * light club colour and a dark one: the text colour the card resolves (its tokens and palettes, as
 * rendered) against the colour behind the glyphs (the card's ground and every
 * panel, scrim or chip drawn under them, gradients included).
 *
 * WCAG AA: 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold). Text that
 * sits on the photo or a logo has no single colour behind it and isn't
 * measured here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  rowsColumns,
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
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";

const BUNDLES = path.resolve(__dirname, "../../../../../lib/template-bundles");
const SIDE = 14;
const SIZE_KEYS = Object.keys(SIZES) as CardSize[];

type Box = { x: number; y: number; w: number; h: number };
type Pt = [number, number];
type Rgba = [number, number, number, number];

/** WCAG AA for body text, and its floor for large text. */
const AA = 4.5;
const AA_LARGE = 3;

/** The club brands each card is drawn with. */
const BRANDS: Record<string, PackCardData["brand"]> = {
  default: { name: "Halls Head Cricket Club" },
  light: { name: "Sunny Vale CC", primaryColour: "#FFD100", backgroundColour: "#F4F1E6" },
  dark: { name: "Navy Point CC", primaryColour: "#0B1F4B", backgroundColour: "#0B1F4B" },
};

/** Every listed Team List bundle (`teamList`, `teamListRound`). */
function teamListBundles(): Array<{ name: string; doc: TemplateDocumentV2 }> {
  const out: Array<{ name: string; doc: TemplateDocumentV2 }> = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!/^teamList\w*\.json$/.test(file)) continue;
      const bundle = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        listed?: boolean;
        document: TemplateDocumentV2;
      };
      if (bundle.listed === false) continue;
      out.push({ name: `${look}/${file.replace(/\.json$/, "")}`, doc: bundle.document });
    }
  }
  return out;
}

const TEAM: Record<string, unknown> = {
  kind: "teamList",
  grade: "A Grade",
  gradeRound: "A GRADE — ROUND 6",
  competitionLine: "Peel Premier One Day",
  roundLabel: "ROUND 6",
  venueDateTime: "Halls Head Oval • Sat 14 Nov • 12:30 PM",
  players: Array.from({ length: SIDE }, (_, i) => ({
    order: i + 1,
    surname: `PLAYER${i + 1}`,
    firstInitial: "J",
    ...(i === 0 ? { role: "C" } : {}),
  })),
};

/**
 * The card drawn with `brand`, with or without its photo, as a senior or a
 * junior card (a junior's photo is approved junior stock, cleared by the server).
 */
function render(
  doc: TemplateDocumentV2,
  size: CardSize,
  brand: string,
  photo: boolean,
  junior = false,
): string {
  const data: PackCardData = {
    brand: { ...BRANDS[brand], logoUrl: "https://cdn.example.org/crest.png" },
    hashtag: "#HHCC",
    sponsors: [{ name: "Sponsor", logoUrl: "https://cdn.example.org/s.png" }],
    ...(photo ? { photoUrl: "https://cdn.example.org/photo.jpg" } : {}),
  } as PackCardData;
  const tokens = resolveCardTokens({ theme: null, junior, data, packId: BLANK_PACK_ID });
  const input = junior ? { ...TEAM, junior: true, juniorPhotoAllowed: photo } : TEAM;
  return renderPackCard(
    input as unknown as ShareCardInput,
    size,
    true,
    tokens,
    junior,
    data,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
    { page: "team" },
  );
}

/** Split at top-level `sep` (outside parentheses). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

/** The custom properties a drawn card declares: its tokens and the palettes it uses. */
function cardVars(html: string): Map<string, string> {
  const root = window.document.createElement("div");
  root.innerHTML = html;
  const vars = new Map<string, string>();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style]")))
    for (const decl of splitTop(el.getAttribute("style") ?? "", ";")) {
      const m = /^(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (m && !vars.has(m[1]!)) vars.set(m[1]!, m[2]!.trim());
    }
  return vars;
}

/** `var(--x, fallback)` replaced by the card's values, all the way down. */
function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  const at = value.indexOf("var(");
  if (at < 0 || depth > 12) return value;
  let i = at + 4;
  for (let level = 1; i < value.length && level > 0; i++) {
    if (value[i] === "(") level++;
    if (value[i] === ")") level--;
  }
  const [name, ...fallback] = splitTop(value.slice(at + 4, i - 1), ",");
  const swap = vars.get(name!) ?? (fallback.length ? fallback.join(",") : "transparent");
  return resolveVars(value.slice(0, at) + swap + value.slice(i), vars, depth + 1);
}

/** A resolved CSS colour (hex, rgb(a), color-mix in srgb) as RGBA; null if unreadable. */
function parseColour(raw: string): Rgba | null {
  const c = raw.trim();
  if (c === "transparent") return [0, 0, 0, 0];
  let m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) {
    let h = m[1]!;
    if (h.length <= 4) h = [...h].map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const p = m[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  m = /^color-mix\(\s*in srgb\s*,([\s\S]+)\)$/i.exec(c);
  if (m) {
    const parts = splitTop(m[1]!, ",").map((part) => {
      const pm = /^([\s\S]+?)\s+([\d.]+)%$/.exec(part);
      return { colour: parseColour(pm ? pm[1]! : part), pct: pm ? Number(pm[2]) : null };
    });
    const [a, b] = parts;
    if (!a?.colour || !b?.colour) return null;
    const t = (a.pct ?? (b.pct !== null ? 100 - b.pct : 50)) / 100;
    return [0, 1, 2, 3].map((k) => a.colour![k]! * t + b.colour![k]! * (1 - t)) as Rgba;
  }
  return null;
}

/** `top` (its alpha scaled by `opacity`) over an opaque `under`. */
const over = (top: Rgba, under: Rgba, opacity = 1): Rgba => {
  const a = top[3] * opacity;
  return [...[0, 1, 2].map((k) => top[k]! * a + under[k]! * (1 - a)), 1] as Rgba;
};

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type GradientFill = {
  type?: string;
  angle?: number;
  shape?: string;
  at?: { x?: number; y?: number };
  stops?: Array<{ color: string; at?: number }>;
};

/** A gradient's colour at (`fx`, `fy`), 0 to 1 across its `w` × `h` px box, as CSS draws it. */
function gradientAt(
  fill: GradientFill,
  fx: number,
  fy: number,
  w: number,
  h: number,
  vars: Map<string, string>,
): Rgba | null {
  const stops = (fill.stops ?? []).map((s, i, all) => ({
    colour: parseColour(resolveVars(s.color, vars)),
    at: typeof s.at === "number" ? s.at / 100 : all.length > 1 ? i / (all.length - 1) : 0,
  }));
  if (stops.length === 0 || stops.some((s) => !s.colour)) return null;
  let t: number;
  if (fill.type === "radial") {
    const cx = ((fill.at?.x ?? 50) / 100) * w;
    const cy = ((fill.at?.y ?? 50) / 100) * h;
    const far = (c: number, size: number) => Math.max(c, size - c);
    const [dx, dy] = [fx * w - cx, fy * h - cy];
    t =
      fill.shape === "circle"
        ? Math.hypot(dx, dy) / Math.hypot(far(cx, w), far(cy, h))
        : Math.hypot(dx / (far(cx, w) * Math.SQRT2), dy / (far(cy, h) * Math.SQRT2));
  } else {
    const rad = ((fill.angle ?? 180) * Math.PI) / 180;
    const [sx, sy] = [Math.sin(rad), -Math.cos(rad)];
    const len = Math.abs(w * sx) + Math.abs(h * sy);
    t = ((fx - 0.5) * w * sx + (fy - 0.5) * h * sy) / len + 0.5;
  }
  t = Math.max(0, Math.min(1, t));
  const next = stops.findIndex((s) => s.at >= t);
  if (next === 0) return stops[0]!.colour;
  if (next < 0) return stops[stops.length - 1]!.colour;
  const [a, b] = [stops[next - 1]!, stops[next]!];
  const k = b.at > a.at ? (t - a.at) / (b.at - a.at) : 1;
  return [0, 1, 2, 3].map((i) => a.colour![i]! + (b.colour![i]! - a.colour![i]!) * k) as Rgba;
}

/**
 * A layer drawn on `size` in this photo state, sponsors on, on a senior or a
 * junior card. Without a photo the photo slot draws nothing: what's behind
 * the text there is the card's own ground and panels.
 */
function drawnBox(l: TemplateLayerV2, size: CardSize, photo: boolean, junior: boolean): Box | null {
  if (l.hidden || (l.sizes && !l.sizes.includes(size))) return null;
  if (typeof l.showWhen?.photo === "boolean" && l.showWhen.photo !== photo) return null;
  if (typeof l.showWhen?.junior === "boolean" && l.showWhen.junior !== junior) return null;
  if (l.showWhen?.sponsors === false) return null;
  if (!photo && l.kind === "photo") return null;
  return (l.geometry as Partial<Record<CardSize, Box>>)[size] ?? null;
}

/** Whether a layer's painted area (its box, cut to its clip polygon) holds a point (card %). */
function coversPoint(l: TemplateLayerV2, b: Box, x: number, y: number): boolean {
  if (!(b.x <= x && x <= b.x + b.w && b.y <= y && y <= b.y + b.h)) return false;
  const poly = (l.style as { clip?: { polygon?: Pt[] } } | undefined)?.clip?.polygon;
  if (!Array.isArray(poly) || poly.length < 3) return true;
  const [px, py] = [((x - b.x) / b.w) * 100, ((y - b.y) / b.h) * 100];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The colour behind a point (card %): the card's ground (`--ink`), then every
 * layer drawn before `upTo` that paints there. Null where the photo or a logo
 * shows through (a scrim over it doesn't make one colour; a solid panel does).
 */
function backgroundAt(
  layers: TemplateLayerV2[],
  upTo: number,
  size: CardSize,
  photo: boolean,
  junior: boolean,
  [x, y]: Pt,
  vars: Map<string, string>,
): Rgba | null {
  const { w: W, h: H } = SIZES[size];
  let bg: Rgba | null = parseColour(resolveVars("var(--ink)", vars));
  for (const l of layers.slice(0, upTo)) {
    const b = drawnBox(l, size, photo, junior);
    if (!b || !coversPoint(l, b, x, y)) continue;
    const style = (l.style ?? {}) as { fill?: unknown; background?: unknown; opacity?: unknown };
    const opacity = typeof style.opacity === "number" ? style.opacity : 1;
    if (l.kind === "photo" || (l.kind === "image" && opacity > 0.3)) {
      bg = null;
      continue;
    }
    const fill = l.kind === "shape" ? style.fill : l.kind === "text" ? style.background : null;
    if (!fill) continue;
    const colour =
      typeof fill === "string"
        ? parseColour(resolveVars(fill, vars))
        : gradientAt(
            fill as GradientFill,
            (x - b.x) / b.w,
            (y - b.y) / b.h,
            (b.w / 100) * W,
            (b.h / 100) * H,
            vars,
          );
    if (!colour) continue;
    if (bg) bg = over(colour, bg, opacity);
    else if (colour[3] * opacity >= 0.99) bg = over(colour, colour);
  }
  return bg;
}

/** The name cells a Team List prints. */
const NAME_FIELDS = ["listName", "surname", "name", "playerName"];

type TextStyle = { color?: string; fontSize?: number; fontWeight?: number; opacity?: number };
type Sample = {
  label: string;
  /** The layer's index in draw order: what's behind it is drawn before it. */
  index: number;
  style: TextStyle;
  opacity: number;
  /** Font size in card pixels, as drawn (a squeezed list's names are smaller). */
  px: number;
  /** Where the glyphs are sure to be, in card percent. */
  points: Pt[];
};

/** The grade line and every name column's first and last name, on `size`. */
function samples(
  layers: TemplateLayerV2[],
  size: CardSize,
  photo: boolean,
  junior: boolean,
): Sample[] {
  const { w: W, h: H } = SIZES[size];
  const out: Sample[] = [];
  for (const [index, l] of layers.entries()) {
    const b = drawnBox(l, size, photo, junior);
    if (!b) continue;
    const opacity = Number((l.style as { opacity?: unknown } | undefined)?.opacity ?? 1);
    if (l.kind === "text" && String(l.content ?? "").includes("{{gradeRound}}")) {
      const st = (l.style ?? {}) as TextStyle & { align?: string };
      const cx =
        st.align === "right" ? b.x + b.w - 1 : st.align === "left" ? b.x + 1 : b.x + b.w / 2;
      out.push({
        label: `${size} ${l.id} grade line`,
        index,
        style: st,
        opacity,
        px: ((st.fontSize ?? 5) / 100) * W,
        points: [[cx, b.y + b.h / 2]],
      });
    }
    if (l.kind === "rows" && l.rows.repeat === "players") {
      const spec = l.rows;
      const cols = rowsColumns(spec);
      const perColumn = Math.ceil(SIDE / cols);
      const rowHeight = Number(spec.rowHeight ?? 7);
      const gap = Number(spec.gap ?? 0);
      const colGap = cols > 1 ? Math.min(50, Math.max(0, Number(spec.columnGap ?? 4))) : 0;
      const colW = (100 - colGap * (cols - 1)) / cols;
      // The renderer's squeeze: a side over the box's capacity draws smaller.
      const needed = ((perColumn * rowHeight + (perColumn - 1) * gap) / 100) * W;
      const boxH = (b.h / 100) * H;
      const squeeze = needed <= boxH + 0.5 ? 1 : boxH / needed;
      for (const cell of spec.cells) {
        if (!NAME_FIELDS.includes(cell.field) || cell.show) continue;
        const st = (cell.style ?? {}) as TextStyle;
        const points: Pt[] = [];
        for (let c = 0; c < cols; c++)
          for (const r of [0, perColumn - 1]) {
            const left = c * (colW + colGap) + ((Number(cell.x ?? 0) + 1) * colW) / 100;
            const mid = (Number(cell.y ?? 0) + Number(cell.h ?? 100) / 2) / 100;
            const top = (r * (rowHeight + gap) + mid * rowHeight) * squeeze * (W / 100);
            points.push([b.x + (left / 100) * b.w, b.y + (top / H) * 100]);
          }
        out.push({
          label: `${size} ${l.id} names`,
          index,
          style: st,
          opacity: opacity * Number(st.opacity ?? 1),
          px: ((st.fontSize ?? 5) / 100) * W * squeeze,
          points,
        });
      }
    }
  }
  return out;
}

/** Every name or grade line below its floor, with its ratio. */
function lowContrast(name: string, doc: TemplateDocumentV2): string[] {
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    const layers = flattenLayers(p?.layers ?? []);
    for (const size of SIZE_KEYS)
      for (const photo of [true, false])
        for (const junior of [false, true])
          for (const brand of Object.keys(BRANDS)) {
            const found = samples(layers, size, photo, junior);
            if (found.length === 0) continue;
            const vars = cardVars(render(doc, size, brand, photo, junior));
            for (const s of found) {
              const fg = parseColour(resolveVars(s.style.color ?? "#000000", vars));
              if (!fg) {
                out.push(`${name} ${page} ${s.label}: unreadable colour ${s.style.color}`);
                continue;
              }
              const large = s.px >= 24 || (s.px >= 18.66 && (s.style.fontWeight ?? 400) >= 700);
              const floor = large ? AA_LARGE : AA;
              for (const pt of s.points) {
                const bg = backgroundAt(layers, s.index, size, photo, junior, pt, vars);
                if (!bg) continue; // on the photo or a logo
                const ratio = contrast(over(fg, bg, s.opacity), bg);
                if (ratio < floor) {
                  out.push(
                    `${name} ${page} ${s.label} (${brand} brand, ${junior ? "junior, " : ""}` +
                      `${photo ? "photo" : "no photo"}): ` +
                      `${ratio.toFixed(2)}:1, needs ${floor}:1`,
                  );
                  break;
                }
              }
            }
          }
  }
  return out;
}

describe("Team List names and grade line contrast", () => {
  const bundles = teamListBundles();

  it("reads every listed Team List bundle", () => {
    expect(bundles.map((b) => b.name)).toContain("duotone/teamList");
    expect(bundles.length).toBeGreaterThanOrEqual(8);
  });

  for (const { name, doc } of bundles)
    it(`${name}: names and grade line clear WCAG AA at every size, for any club colours`, () => {
      expect(lowContrast(name, doc)).toEqual([]);
    });

  it("resolves the card's own tokens, palettes and gradients", () => {
    const vars = new Map([
      ["--ink", "#101216"],
      ["--gold", "#FBAC27"],
      ["--mix", "color-mix(in srgb, var(--gold) 50%, #000000)"],
    ]);
    expect(parseColour(resolveVars("var(--gold)", vars))).toEqual([251, 172, 39, 1]);
    expect(parseColour(resolveVars("var(--nope, #FFFFFF80)", vars))![3]).toBeCloseTo(0.5, 2);
    expect(parseColour(resolveVars("var(--mix)", vars))![0]).toBeCloseTo(125.5, 1);
    const fade = {
      type: "linear",
      angle: 180,
      stops: [{ color: "#000000" }, { color: "#FFFFFF" }],
    };
    expect(gradientAt(fade, 0.5, 0, 100, 100, vars)![0]).toBeCloseTo(0, 6);
    expect(gradientAt(fade, 0.5, 1, 100, 100, vars)![0]).toBeCloseTo(255, 6);
    // Dark grey on near-black, as Duotone's list was: about 1.1:1.
    expect(contrast(parseColour("#101216")!, parseColour("#10151B")!)).toBeLessThan(1.2);
  });
});
