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
 * Every Duotone kind is held to the same measure for every line of text it
 * draws, not just the names (Ash's round 3 retest, Nov 2026: Duotone's Match
 * Day printed its club, opposition and fixture lines in the dark stage colour
 * on a dark panel): every page, size, photo state and senior or junior card,
 * every text layer and every list cell's first row.
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
  pageForInput,
  rowsColumns,
  slideInputFor,
  type PageKey,
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
import { sampleCardInput } from "@/lib/sample-card-inputs";

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

type Bundle = { name: string; kind: string; doc: TemplateDocumentV2 };

/** Every listed bundle of a look matching `looks`, its file matching `files`. */
function listedBundles(looks: RegExp, files: RegExp): Bundle[] {
  const out: Bundle[] = [];
  for (const look of readdirSync(BUNDLES).sort()) {
    const dir = path.join(BUNDLES, look);
    if (!looks.test(look)) continue;
    if (!statSync(dir).isDirectory() || !existsSync(path.join(dir, "look.json"))) continue;
    for (const file of readdirSync(dir).sort()) {
      if (file === "look.json" || !files.test(file)) continue;
      const bundle = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as {
        listed?: boolean;
        document: TemplateDocumentV2;
      };
      if (bundle.listed === false) continue;
      const kind = file.replace(/\.json$/, "");
      out.push({ name: `${look}/${kind}`, kind, doc: bundle.document });
    }
  }
  return out;
}

/** Every listed Team List bundle (`teamList`, `teamListRound`). */
const teamListBundles = () => listedBundles(/./, /^teamList\w*\.json$/);

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
 * junior card (a junior's photo is approved junior stock, cleared by the
 * server): a Team List's team page, or `page` of a sample card of `kind`.
 */
function render(
  doc: TemplateDocumentV2,
  size: CardSize,
  brand: string,
  photo: boolean,
  junior = false,
  kind = "teamList",
  page = "team",
): string {
  const data: PackCardData = {
    brand: { ...BRANDS[brand], logoUrl: "https://cdn.example.org/crest.png" },
    hashtag: "#HHCC",
    sponsors: [{ name: "Sponsor", logoUrl: "https://cdn.example.org/s.png" }],
    ...(photo ? { photoUrl: "https://cdn.example.org/photo.jpg" } : {}),
  } as PackCardData;
  const tokens = resolveCardTokens({ theme: null, junior, data, packId: BLANK_PACK_ID });
  const base: object = kind === "teamList" ? TEAM : sampleCardInput(kind as ShareCardInput["kind"]);
  const input = junior ? { ...base, junior: true, juniorPhotoAllowed: photo } : base;
  return renderPackCard(
    input as unknown as ShareCardInput,
    size,
    true,
    tokens,
    junior,
    data,
    BLANK_PACK_ID,
    doc as unknown as CardAdjustments,
    { page: page as PageKey },
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

/** What's behind a point when it is a logo (a crest or sponsor image), not one colour. */
const ON_LOGO = "logo";

/**
 * The colour behind a point (card %): the card's ground (`--ink`), then every
 * layer drawn before `upTo` that paints there. Null where the photo shows
 * through (a scrim over it doesn't make one colour; a solid panel does), and
 * `ON_LOGO` where a logo does (a faint watermark, 30% or less, is ground).
 */
function backgroundAt(
  layers: TemplateLayerV2[],
  upTo: number,
  size: CardSize,
  photo: boolean,
  junior: boolean,
  [x, y]: Pt,
  vars: Map<string, string>,
): Rgba | null | typeof ON_LOGO {
  const { w: W, h: H } = SIZES[size];
  let bg: Rgba | null = parseColour(resolveVars("var(--ink)", vars));
  let logo = false;
  for (const l of layers.slice(0, upTo)) {
    const b = drawnBox(l, size, photo, junior);
    if (!b || !coversPoint(l, b, x, y)) continue;
    const style = (l.style ?? {}) as { fill?: unknown; background?: unknown; opacity?: unknown };
    const opacity = typeof style.opacity === "number" ? style.opacity : 1;
    if (l.kind === "photo" || (l.kind === "image" && opacity > 0.3)) {
      bg = null;
      logo = l.kind === "image";
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
    else if (colour[3] * opacity >= 0.99) {
      bg = over(colour, colour);
      logo = false;
    }
  }
  return bg ?? (logo ? ON_LOGO : null);
}

/** The name cells a Team List prints. */
const NAME_FIELDS = ["listName", "surname", "name", "playerName"];

type TextStyle = {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  opacity?: number;
  align?: string;
  background?: unknown;
  textFill?: unknown;
};
type Sample = {
  label: string;
  /** What's behind it: the layers drawn before this index. */
  index: number;
  style: TextStyle;
  opacity: number;
  /** Font size in card pixels, as drawn (a squeezed list's names are smaller). */
  px: number;
  /** Where the glyphs are sure to be, in card percent. */
  points: Pt[];
  /** A list cell's own row backgrounds (earlier cells' fills) under its glyphs. */
  under?: string[];
};

/** Where a line's glyphs start or centre, by its alignment, across `[x, x + w]`. */
const alignedX = (align: string | undefined, x: number, w: number) =>
  align === "right" ? x + w - 1 : align === "left" ? x + 1 : x + w / 2;

/**
 * Every text layer, and every text cell of a list's first row, on `size`
 * (`every`: the Duotone sweep). A Team List's names are measured as the
 * Team List check does, so they're left out here.
 */
function everyText(
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
    if (l.kind === "text") {
      const st = (l.style ?? {}) as TextStyle;
      const content = String(l.content ?? "");
      if (!content.trim() || typeof st.color !== "string" || st.textFill) continue;
      if (content.includes("{{gradeRound}}")) continue; // measured with the names
      out.push({
        label: `${size} ${l.id} "${String(l.content).slice(0, 24)}"`,
        // Its own background (a chip) is behind its glyphs too.
        index: index + 1,
        style: st,
        opacity,
        px: ((st.fontSize ?? 5) / 100) * W,
        points: [[alignedX(st.align, b.x, b.w), b.y + b.h / 2]],
      });
    }
    if (l.kind === "rows") {
      const spec = l.rows;
      const cols = rowsColumns(spec);
      const colGap = cols > 1 ? Math.min(50, Math.max(0, Number(spec.columnGap ?? 4))) : 0;
      const colW = (100 - colGap * (cols - 1)) / cols;
      const rowHeight = Number(spec.rowHeight ?? 7);
      for (const [ci, cell] of spec.cells.entries()) {
        if (cell.show) continue;
        if (spec.repeat === "players" && NAME_FIELDS.includes(cell.field)) continue;
        const st = (cell.style ?? {}) as TextStyle;
        if (typeof st.color !== "string" || st.textFill) continue;
        const [cx, cw] = [Number(cell.x ?? 0), Number(cell.w ?? 100)];
        const [cy, ch] = [Number(cell.y ?? 0), Number(cell.h ?? 100)];
        const inRow: Pt = [alignedX(st.align, cx, cw), cy + ch / 2];
        // Earlier cells that fill the row under this one (a chip, a band).
        const under = spec.cells
          .slice(0, ci)
          .filter((u) => {
            const s = u.style as TextStyle | undefined;
            if (typeof s?.background !== "string") return false;
            const [ux, uw, uy, uh] = [u.x ?? 0, u.w ?? 100, u.y ?? 0, u.h ?? 100].map(Number);
            return (
              ux! <= inRow[0] && inRow[0] <= ux! + uw! && uy! <= inRow[1] && inRow[1] <= uy! + uh!
            );
          })
          .map((u) => (u.style as TextStyle).background as string);
        const left = (inRow[0] * colW) / 100;
        const top = (inRow[1] / 100) * rowHeight * (W / 100);
        out.push({
          label: `${size} ${l.id} ${cell.field}`,
          index,
          style: st,
          opacity: opacity * Number(st.opacity ?? 1),
          px: ((st.fontSize ?? 5) / 100) * W,
          points: [[b.x + (left / 100) * b.w, b.y + (top / H) * 100]],
          under,
        });
      }
    }
  }
  return out;
}

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
      const st = (l.style ?? {}) as TextStyle;
      out.push({
        label: `${size} ${l.id} grade line`,
        index,
        style: st,
        opacity,
        px: ((st.fontSize ?? 5) / 100) * W,
        points: [[alignedX(st.align, b.x, b.w), b.y + b.h / 2]],
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

/**
 * Every name or grade line below its floor, with its ratio; with `every`, every
 * line of text the card draws (a card of `kind`, each of its pages).
 */
function lowContrast(
  name: string,
  doc: TemplateDocumentV2,
  opts: { kind?: string; every?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const [page, p] of Object.entries(doc.pages ?? {})) {
    const layers = flattenLayers(p?.layers ?? []);
    for (const size of SIZE_KEYS)
      for (const photo of [true, false])
        for (const junior of [false, true])
          for (const brand of Object.keys(BRANDS)) {
            const found = [
              ...samples(layers, size, photo, junior),
              ...(opts.every ? everyText(layers, size, photo, junior) : []),
            ];
            if (found.length === 0) continue;
            const vars = cardVars(render(doc, size, brand, photo, junior, opts.kind, page));
            for (const s of found) {
              const fg = parseColour(resolveVars(s.style.color ?? "#000000", vars));
              if (!fg) {
                out.push(`${name} ${page} ${s.label}: unreadable colour ${s.style.color}`);
                continue;
              }
              const large = s.px >= 24 || (s.px >= 18.66 && (s.style.fontWeight ?? 400) >= 700);
              const floor = large ? AA_LARGE : AA;
              for (const pt of s.points) {
                const behind = backgroundAt(layers, s.index, size, photo, junior, pt, vars);
                // The Duotone sweep: no line of text is drawn over a logo (round 4
                // retest: the Team lists cover's title ran over a second crest, dark
                // on dark, and went unmeasured because a logo has no one colour).
                if (behind === ON_LOGO && opts.every) {
                  out.push(
                    `${name} ${page} ${s.label} (${junior ? "junior, " : ""}` +
                      `${photo ? "photo" : "no photo"}): drawn over a logo`,
                  );
                  break;
                }
                if (!behind || behind === ON_LOGO) continue; // on the photo or a logo
                let bg: Rgba = behind;
                for (const fill of s.under ?? []) {
                  const c = parseColour(resolveVars(fill, vars));
                  if (c) bg = over(c, bg);
                }
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

describe("Duotone text contrast on every kind", () => {
  const bundles = listedBundles(/^duotone$/, /\.json$/);

  it("reads every listed Duotone kind", () => {
    expect(bundles.map((b) => b.kind)).toEqual(
      expect.arrayContaining(["matchDay", "matchSummary", "teamList"]),
    );
  });

  for (const { name, kind, doc } of bundles)
    it(`${name}: every line of text clears WCAG AA on every page and size, for any club colours`, () => {
      expect(lowContrast(name, doc, { kind, every: true })).toEqual([]);
    });

  it("would catch Match Day's fixture as it was (stage-coloured type on an accent-ink panel)", () => {
    const md = bundles.find((b) => b.kind === "matchDay")!;
    const was = structuredClone(md.doc);
    for (const l of flattenLayers(was.pages.fixture!.layers)) {
      const st = l.style as { fill?: unknown; color?: unknown } | undefined;
      if (l.kind === "shape" && st?.fill === "#FFFFFF") st.fill = "var(--accent-ink)";
      if (l.kind === "text" && st?.color === "var(--dt-ink)") st.color = "var(--ink)";
    }
    const found = lowContrast("duotone/matchDay", was, { kind: "matchDay", every: true });
    expect(found.some((f) => f.includes('"{{opposition.name}}" (default brand, photo)'))).toBe(
      true,
    );
  });

  it("covers the Team lists cover: a list set's cover is Match Day's title page", () => {
    // A Team lists carousel's cover is the Match Day bundle's `title` page with
    // the set's title ("Team lists", set-slides.ts), so the sweep above holds it.
    const md = bundles.find((b) => b.kind === "matchDay")!;
    expect(Object.keys(md.doc.pages)).toContain("title");
    const cover = slideInputFor(
      { kind: "matchDay", page: "title", slot: "cover" },
      { kind: "teamListRound", date: "Sat 14 Nov", roundLabel: "ROUND 6" },
    );
    expect(pageForInput(cover as { kind: string })).toBe("title");
    expect(cover).toMatchObject({ carouselPage: { page: "title", title: "Team lists" } });
  });

  it("would catch the Team lists cover as it was (its title over a second club crest)", () => {
    const md = bundles.find((b) => b.kind === "matchDay")!;
    const was = structuredClone(md.doc);
    const title = was.pages.title!;
    const crest = flattenLayers(title.layers).find(
      (l) => l.kind === "image" && l.content === "{{clubLogo}}",
    )!;
    // The stray no-photo crest (title-l13): 6.5% lower than the real one, over the title.
    const stray = structuredClone(crest);
    stray.id = "title-l13";
    stray.showWhen = { photo: false };
    for (const g of Object.values(stray.geometry as Record<string, Box>)) g.y += 6.51;
    title.layers.splice(title.layers.indexOf(crest), 0, stray);
    const found = lowContrast("duotone/matchDay", was, { kind: "matchDay", every: true });
    expect(
      found.some((f) => f.includes('square title-l24 "{{weekendTitle}}" (no photo): drawn over')),
    ).toBe(true);
  });
});
