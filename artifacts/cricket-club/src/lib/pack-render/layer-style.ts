/**
 * Layer styles beyond v1 (ADR-011 §1 Styles, L1-D T1.18–T1.21): fills and
 * gradients, text fills, borders, shadows, blend modes, photo filters,
 * grain and halftone overlays, and the derived palettes a document uses.
 *
 * The renderer calls these for v2 documents only (`paletteVars` excepted,
 * whose Club Kit rule every document already follows), so v1 documents
 * render as they always have. Every value is read defensively: a colour is a
 * hex, a colour token (`var(--gold)`, `var(--ck-stage)`, `var(--dt-p)`),
 * `rgb()`/`hsl()` or `transparent`; anything else is left out.
 */
import {
  BLEND_MODES,
  MAX_BLUR_PX,
  type LayerMotion,
  type NormalisedDocument,
  type TemplateFill,
  type TemplateFilter,
  type TemplateLayerV2,
  type TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";
import {
  clubKitPaletteFor,
  clubKitVars,
  clubStageVars,
  type ClubKitPalette,
} from "./club-kit-vars";
import {
  duotoneFilterId,
  duotoneFilterSvg,
  duotonePaletteFor,
  duotoneVars,
  type DuotonePalette,
} from "./duotone-vars";
import type { PackCardData, PackTokens } from "./types";

// ── Values ──────────────────────────────────────────────────────────────────

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** A length in percent of the artboard width, as CSS. */
const cqw = (v: unknown, lo = -50, hi = 50) => `${+clamp(num(v), lo, hi).toFixed(3)}cqw`;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TOKEN = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(#[0-9a-f]{3,8})\s*)?\)$/i;
const FUNC = /^(?:rgba?|hsla?)\(\s*[0-9.,%\s/deg+-]+\)$/i;

/** A colour safe to place in a style attribute, or null. */
export function cssColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const c = value.trim();
  if (HEX.test(c) || TOKEN.test(c) || FUNC.test(c)) return c;
  if (c === "transparent" || c === "currentColor") return c;
  return null;
}

/** A fill as a CSS background value: a colour, or a linear or radial gradient. */
export function fillCss(fill: TemplateFill | undefined): string | null {
  if (fill === undefined || fill === null) return null;
  if (typeof fill === "string") return cssColour(fill);
  if (typeof fill !== "object" || !Array.isArray(fill.stops)) return null;
  const stops = fill.stops
    .map((s) => {
      const colour = cssColour(s?.color);
      if (!colour) return null;
      return s.at === undefined ? colour : `${colour} ${+clamp(num(s.at), 0, 100).toFixed(2)}%`;
    })
    .filter((s): s is string => s !== null);
  if (stops.length === 0) return null;
  if (stops.length === 1) stops.push(stops[0]!);
  if (fill.type === "radial") {
    const shape = fill.shape === "circle" ? "circle" : "ellipse";
    const x = +clamp(num(fill.at?.x, 50), 0, 100).toFixed(2);
    const y = +clamp(num(fill.at?.y, 50), 0, 100).toFixed(2);
    return `radial-gradient(${shape} at ${x}% ${y}%, ${stops.join(", ")})`;
  }
  if (fill.type === "linear")
    return `linear-gradient(${+clamp(num(fill.angle, 180), -360, 360).toFixed(2)}deg, ${stops.join(", ")})`;
  return null;
}

// ── Token colours (filters need real colours) ───────────────────────────────

/** Turns a colour token into the colour it stands for on this card. */
export type ColourResolver = (value: string) => string | null;

const declarations = (vars: string): Record<string, string> =>
  Object.fromEntries(
    vars
      .split(";")
      .map((d) => d.split(":"))
      .filter((p) => p.length >= 2)
      .map(([k, ...v]) => [k!.trim(), v.join(":").trim()]),
  );

/** The card's colours by token, for what can't use `var()` (an SVG filter's table). */
export function colourResolver(
  tokens: PackTokens | undefined,
  brand: PackCardData["brand"] | null | undefined,
): ColourResolver {
  let table: Record<string, string> | null = null;
  const lookup = () => {
    if (table) return table;
    table = {};
    if (tokens) {
      table["--gold"] = tokens.accent;
      table["--panel"] = tokens.panel;
      table["--ink"] = tokens.ink;
      Object.assign(table, declarations(clubKitVars(clubKitPaletteFor(tokens, brand))));
      Object.assign(table, declarations(duotoneVars(duotonePaletteFor(tokens, brand))));
    }
    return table;
  };
  return (value) => {
    const c = value.trim();
    if (HEX.test(c)) return c;
    const m = TOKEN.exec(c);
    if (!m) return null;
    const v = lookup()[m[1]!] ?? m[2] ?? null;
    return v && HEX.test(v) ? v : null;
  };
}

// ── Filters ─────────────────────────────────────────────────────────────────

const channel = (hex: string, shift: number) => {
  const full =
    hex.length === 4 || hex.length === 5
      ? `#${[...hex.slice(1, 4)].map((ch) => ch + ch).join("")}`
      : hex.slice(0, 7);
  return String(+(((parseInt(full.slice(1), 16) >> shift) & 0xff) / 255).toFixed(4));
};

/** A two-colour gradient map as an inline SVG filter (shadows → dark, highlights → light). */
function duotoneMapSvg(id: string, dark: string, light: string): string {
  const table = (shift: number) => `${channel(dark, shift)} ${channel(light, shift)}`;
  return (
    `<svg aria-hidden="true" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">` +
    `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">` +
    `<feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>` +
    `<feComponentTransfer>` +
    `<feFuncR type="table" tableValues="${table(16)}"/>` +
    `<feFuncG type="table" tableValues="${table(8)}"/>` +
    `<feFuncB type="table" tableValues="${table(0)}"/>` +
    `</feComponentTransfer></filter></svg>`
  );
}

/** What a style needs from the card: its colours, and where to put SVG filter definitions. */
export interface StyleContext {
  colours: ColourResolver;
  /** The Duotone palette, for a filter that asks for exactly the Duotone pack's gradient map. */
  duotone?: () => DuotonePalette;
  /** SVG definitions the overlay must carry, by id (filled as layers ask for them). */
  defs: Map<string, string>;
}

/**
 * A filter list as CSS. `duotone` from the Duotone palette's own ink and
 * primary (`var(--dt-ink)`, `var(--dt-p)`) is the Duotone pack's three-stop
 * gradient map exactly; any other pair is a two-colour map.
 */
function filterCss(filters: TemplateFilter[] | undefined, ctx: StyleContext): string | null {
  if (!Array.isArray(filters)) return null;
  const parts: string[] = [];
  for (const f of filters) {
    if (!f || typeof f !== "object") continue;
    if (f.preset === "grayscale")
      parts.push(`grayscale(${+clamp(num(f.amount, 1), 0, 1).toFixed(3)})`);
    else if (f.preset === "blur")
      parts.push(`blur(${+clamp(num(f.px), 0, MAX_BLUR_PX).toFixed(2)}px)`);
    else if (f.preset === "duotone") {
      const packMap =
        ctx.duotone &&
        /^var\(\s*--dt-ink\s*\)$/.test(String(f.dark).trim()) &&
        /^var\(\s*--dt-p\s*\)$/.test(String(f.light).trim());
      if (packMap) {
        const palette = ctx.duotone!();
        const id = duotoneFilterId(palette);
        ctx.defs.set(id, duotoneFilterSvg(palette));
        parts.push(`url(#${id})`);
        continue;
      }
      const dark = ctx.colours(String(f.dark ?? ""));
      const light = ctx.colours(String(f.light ?? ""));
      if (!dark || !light) continue;
      const id = `tpl-duo-${dark.slice(1).toLowerCase()}-${light.slice(1).toLowerCase()}`;
      ctx.defs.set(id, duotoneMapSvg(id, dark, light));
      parts.push(`url(#${id})`);
    }
  }
  return parts.length ? parts.join(" ") : null;
}

// ── Box and text ────────────────────────────────────────────────────────────

const BLENDS = new Set<string>(BLEND_MODES);
const BORDER_STYLES = new Set(["solid", "dashed", "dotted"]);

function shadowCss(list: TemplateStyleV2["boxShadow"]): string | null {
  if (!Array.isArray(list)) return null;
  const parts = list
    .map((s) => {
      const colour = cssColour(s?.color);
      if (!colour) return null;
      return [
        s.inset ? "inset" : "",
        cqw(s.x),
        cqw(s.y),
        cqw(s.blur, 0, 50),
        s.spread === undefined ? "" : cqw(s.spread),
        colour,
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter((s): s is string => s !== null);
  return parts.length ? parts.join(", ") : null;
}

function textShadowCss(list: TemplateStyleV2["textShadow"]): string | null {
  if (!Array.isArray(list)) return null;
  const parts = list
    .map((s) => {
      const colour = cssColour(s?.color);
      return colour ? `${cqw(s.x)} ${cqw(s.y)} ${cqw(s.blur, 0, 50)} ${colour}` : null;
    })
    .filter((s): s is string => s !== null);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Declarations a v2 layer's style adds to its box: the fill (shapes paint it
 * on their own element), border, shadows, blend mode and photo filters, with
 * the layer's radius so they follow its corners.
 */
export function layerBoxCss(layer: TemplateLayerV2, ctx: StyleContext): string[] {
  const s = layer.style;
  if (!s || typeof s !== "object") return [];
  const out: string[] = [];
  const fill = layer.kind === "shape" ? null : fillCss(s.fill);
  if (fill) out.push(`background:${fill}`);
  if (s.border && typeof s.border === "object") {
    const colour = cssColour(s.border.color);
    const style = BORDER_STYLES.has(String(s.border.style)) ? s.border.style : "solid";
    if (colour)
      out.push(`border:${cqw(s.border.width, 0, 20)} ${style} ${colour}`, "box-sizing:border-box");
  }
  const shadow = shadowCss(s.boxShadow);
  if (shadow) out.push(`box-shadow:${shadow}`);
  if ((fill || s.border || shadow) && s.radius != null && layer.kind !== "text")
    out.push(`border-radius:${num(s.radius)}px`);
  if (typeof s.blend === "string" && BLENDS.has(s.blend) && s.blend !== "normal")
    out.push(`mix-blend-mode:${s.blend}`);
  const filter = filterCss(s.filter, ctx);
  if (filter) out.push(`filter:${filter}`);
  return out;
}

/** A v2 shape's paint: its fill, else v1's background (null keeps the v1 rule). */
export function shapeFillCss(style: TemplateStyleV2 | undefined): string | null {
  return fillCss(style?.fill);
}

/**
 * Declarations a v2 text style adds after v1's text CSS: a text fill (the
 * gradient clipped to the glyphs, as foil numbers are), text shadows and the
 * line height. A shine loop sweeps the text fill, so the fill is drawn taller
 * than the text and the sweep runs here, on the text itself.
 */
export function textStyleCss(
  style: TemplateStyleV2 | undefined,
  motion?: LayerMotion,
  animate = false,
): string[] {
  if (!style || typeof style !== "object") return [];
  const out: string[] = [];
  const textFill = fillCss(style.textFill);
  const shine = motion?.loop?.preset === "shine";
  if (textFill) {
    out.push(
      `background:${textFill}`,
      `background-size:100% ${shine ? 220 : 100}%`,
      "-webkit-background-clip:text",
      "background-clip:text",
      "color:transparent",
      "-webkit-text-fill-color:transparent",
    );
    if (shine && animate) out.push(...shineCss(motion!));
  }
  const shadow = textShadowCss(style.textShadow);
  if (shadow) out.push(`text-shadow:${shadow}`);
  if (style.lineHeight != null)
    out.push(`line-height:${+clamp(num(style.lineHeight, 1.05), 0.5, 3).toFixed(3)}`);
  return out;
}

/** The shine loop (Gold Foil's `hhShine`), on the element with the text fill. */
function shineCss(motion: LayerMotion): string[] {
  const period = clamp(num(motion.loop?.periodMs, 5500), 200, 60000);
  const delay = clamp(num(motion.loop?.delayMs), 0, 60000);
  return [
    `animation:packLoopShine ${+(period / 1000).toFixed(3)}s ease-in-out infinite`,
    ...(delay ? [`animation-delay:${delay}ms`] : []),
  ];
}

// ── Overlays ────────────────────────────────────────────────────────────────

const GRAIN =
  "url(data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0"/></filter><rect width="200" height="200" filter="url(#n)"/></svg>',
  ).replace(/[()'!*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`) +
  ")";

/** A grain or halftone texture over the layer, or "". */
export function overlayHtml(style: TemplateStyleV2 | undefined): string {
  const o = style?.overlay;
  if (!o || typeof o !== "object") return "";
  const opacity = +clamp(num(o.opacity, 0.35), 0, 1).toFixed(3);
  const scale = clamp(num(o.scale, o.kind === "halftone" ? 1.2 : 20), 0.2, 100);
  const texture =
    o.kind === "grain"
      ? `background-image:${GRAIN};background-size:${+scale.toFixed(2)}cqw`
      : o.kind === "halftone"
        ? `background-image:radial-gradient(circle, rgba(0,0,0,.6) 32%, transparent 34%);background-size:${+scale.toFixed(2)}cqw ${+scale.toFixed(2)}cqw`
        : "";
  if (!texture) return "";
  return `<div data-overlay="${o.kind}" style="position:absolute;inset:0;pointer-events:none;opacity:${opacity};mix-blend-mode:multiply;${texture}"></div>`;
}

// ── Derived palettes ────────────────────────────────────────────────────────

/** The palette a template overlay carries: Club Kit's, plus the club stage. */
const templatePaletteVars = (p: ClubKitPalette) => `${clubKitVars(p)};${clubStageVars(p)}`;

/**
 * Derived-palette variables for the free-layer overlay, as `;name:value…`
 * (empty when none is used). Library elements read the Club Kit palette, so
 * an overlay with an element gets it, as does one whose styles name it
 * (`var(--ck-stage)`) or, in v2, declares it. A v2 document that declares or
 * uses the Duotone palette (`var(--dt-p)`) gets `--dt-*`.
 */
export function paletteVars(
  doc: NormalisedDocument,
  layers: readonly TemplateLayerV2[],
  ctx: { tokens?: PackTokens; brand?: PackCardData["brand"] | null },
): string {
  if (!ctx.tokens) return "";
  const json = JSON.stringify(layers);
  const declared = doc.sourceFormat === 2 && Array.isArray(doc.palettes) ? doc.palettes : [];
  const usesClubKit =
    layers.some((l) => l.kind === "element" && !l.hidden) ||
    json.includes("var(--ck-") ||
    declared.includes("club-kit");
  const usesDuotone =
    doc.sourceFormat === 2 && (json.includes("var(--dt-") || declared.includes("duotone"));
  return [
    usesClubKit ? `;${templatePaletteVars(clubKitPaletteFor(ctx.tokens, ctx.brand))}` : "",
    usesDuotone ? `;${duotoneVars(duotonePaletteFor(ctx.tokens, ctx.brand))}` : "",
  ].join("");
}
