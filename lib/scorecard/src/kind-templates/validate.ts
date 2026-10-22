/**
 * Strict validation of a card kind template document (security review,
 * 2026-10-08; format v2, ADR-011 §1, T1.7–T1.8). Documents are authored JSON
 * (an admin's edits, a converted look, an AI draft, a Figma import) that
 * every new draft of the kind copies and that is rendered to HTML on screen
 * and in the server's headless renderer, so only known shapes, finite
 * in-range numbers, bounded strings and the page's own fields are accepted.
 * The renderer also coerces what it prints; this keeps bad documents from
 * being stored at all.
 *
 * - A v1 document (`{ layers }`) is checked exactly as before v2.
 * - A v2 document (`formatVersion: 2`, `pages`) also checks its page keys
 *   against the kind, each page's tokens and repeats, stack groups and their
 *   depth, conditions, text fit, motion, the extended style, vector markup
 *   (`svg.ts`) and the size limits.
 *
 * Used by the API on every save, by the AI designer's retry loop (its
 * messages go back to the model, so they name the page and layer), and by the
 * starter and bundle contract tests.
 */
import { TEMPLATE_SIZE_ORDER } from "./document";
import { kindFields } from "./fields";
import {
  BLEND_MODES,
  BORDER_STYLES,
  COLOUR_TOKENS,
  DERIVED_PALETTES,
  FILTER_PRESETS,
  MAX_CLIP_POINTS,
  FORMAT_VERSION,
  LAYER_KINDS_V2,
  MAX_BLUR_PX,
  MAX_STACK_DEPTH,
  MOTION_EASINGS,
  MOTION_IN_PRESETS,
  MOTION_LOOP_PRESETS,
  OVERLAY_KINDS,
  STACK_ALIGNS,
  STACK_DIRECTIONS,
  STACK_JUSTIFIES,
  type PageKey,
} from "./format";
import { kindHasPage } from "./pages";
import { pageRepeat, pageTokenKeys } from "./page-tokens";
import { isColourTokenName, sanitiseSvg } from "./svg";

/** A v1 document's layer limit (the v1 editor's clipboard reads it too). */
export const MAX_DOCUMENT_LAYERS = 300;
/** A v2 page's layer limit, groups' children included. */
export const MAX_PAGE_LAYERS = 300;
/** A v2 document's layer limit across its pages. */
export const MAX_V2_DOCUMENT_LAYERS = 600;
/** A v2 document's size limit, as JSON. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;

/**
 * The numeric ranges v2 adds, in one place: the validator checks them and
 * the AI's format guide quotes them.
 */
export const V2_RANGES = {
  /** Gradient angle in degrees. */
  angle: [0, 360],
  /** Gradient stop position, percent along the gradient. */
  stopAt: [0, 100],
  /** Radial gradient centre, percent of the box. */
  centre: [0, 100],
  /** Border width, percent of the artboard width. */
  borderWidth: [0, 20],
  /** Shadow offsets and spread, percent of the artboard width. */
  shadowOffset: [-50, 50],
  /** Shadow blur, percent of the artboard width. */
  shadowBlur: [0, 50],
  /** Grayscale amount. */
  grayscale: [0, 1],
  /** Blur filter, pixels at native card size. */
  blurPx: [0, MAX_BLUR_PX],
  /** Brightness filter: 1 is unchanged. */
  brightness: [0, 3],
  /** A clip polygon's points, percent of the layer's box (a little outside allowed). */
  clipPoint: [-100, 200],
  overlayOpacity: [0, 1],
  overlayScale: [0.1, 10],
  /** Line height, a multiple of the font size. */
  lineHeight: [0.5, 3],
  /** Text fit: the smallest share of its designed size text may shrink to. */
  minScale: [0.3, 1],
  /** Stack gap, percent of the artboard width. */
  stackGap: [0, 50],
  motionDelayMs: [0, 10000],
  motionDurationMs: [100, 10000],
  loopPeriodMs: [200, 20000],
  timelineMs: [0, 60000],
} as const satisfies Record<string, readonly [number, number]>;

/** Gradient stops per gradient, and shadows or filters per style. */
export const MIN_GRADIENT_STOPS = 2;
export const MAX_GRADIENT_STOPS = 8;
export const MAX_SHADOWS = 4;
const MAX_CELLS = 24;
const MAX_TEXT = 1000;
const MAX_SHORT = 120;

const V1_LAYER_KINDS = new Set([
  "text",
  "shape",
  "image",
  "photo",
  "rows",
  "element",
  "sticker",
  "medal",
]);
const SIZES = new Set<string>(TEMPLATE_SIZE_ORDER);
const ALIGNS = new Set(["left", "center", "right"]);
const ANIMATIONS = new Set(["none", "rise", "fade", "pop"]);
const STYLE_KEYS = new Set([
  "color",
  "background",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "letterSpacing",
  "uppercase",
  "align",
  "radius",
  "opacity",
]);
const V2_STYLE_KEYS = new Set([
  ...STYLE_KEYS,
  "fill",
  "textFill",
  "border",
  "boxShadow",
  "textShadow",
  "blend",
  "filter",
  "overlay",
  "lineHeight",
  "clip",
]);
const LAYER_KEYS = new Set([
  "id",
  "kind",
  "name",
  "hidden",
  "locked",
  "group",
  "content",
  "sub",
  "bind",
  "element",
  "rows",
  "photo",
  "style",
  "animation",
  "sizes",
  "geometry",
  "editedAt",
]);
const V2_LAYER_KEYS = new Set([
  ...LAYER_KEYS,
  "showWhen",
  "fit",
  "motion",
  "stack",
  "children",
  "svg",
]);
/** Characters that could close a style attribute or open markup. */
const UNSAFE = /["<>;{}\\]/;
const ID = /^[\w.-]{1,64}$/;
const KEY = /^\w{1,64}$/;
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const VAR = /^var\(\s*(--[\w-]+)\s*(?:,\s*(#[0-9a-fA-F]{3,8})\s*)?\)$/;

type Errors = string[];

/** What a layer's checks read: its page's fields and lists, and the format's rules. */
type Scope = {
  /** v2 rules (extended style, conditions, motion, groups, vectors). */
  v2: boolean;
  tokens: Set<string>;
  repeat: (key: string) => { label: string; fields: Set<string>; variants: string[] } | null;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function numberIn(
  errors: Errors,
  where: string,
  v: unknown,
  lo: number,
  hi: number,
  whole = false,
): void {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < lo ||
    v > hi ||
    (whole && !Number.isInteger(v))
  ) {
    errors.push(`${where} must be a ${whole ? "whole " : ""}number from ${lo} to ${hi}.`);
  }
}

function inRange(
  errors: Errors,
  where: string,
  v: unknown,
  [lo, hi]: readonly [number, number],
): void {
  if (v !== undefined) numberIn(errors, where, v, lo, hi);
}

function stringOf(errors: Errors, where: string, v: unknown, max: number, safe = false): void {
  if (typeof v !== "string" || v.length > max) {
    errors.push(`${where} must be text of at most ${max} characters.`);
  } else if (safe && UNSAFE.test(v)) {
    errors.push(`${where} contains characters that aren't allowed.`);
  }
}

function oneOf(errors: Errors, where: string, v: unknown, values: readonly unknown[]): void {
  if (!values.includes(v)) errors.push(`${where} must be one of: ${values.join(", ")}.`);
}

function flag(errors: Errors, where: string, v: unknown): void {
  if (v !== undefined && typeof v !== "boolean") errors.push(`${where} must be true or false.`);
}

function knownKeys(errors: Errors, where: string, v: Record<string, unknown>, keys: Set<string>) {
  for (const k of Object.keys(v)) {
    if (!keys.has(k)) errors.push(`${where} has an unknown setting "${k.slice(0, 30)}".`);
  }
}

function sizeRecord(
  errors: Errors,
  where: string,
  v: unknown,
  each: (where: string, value: unknown) => void,
): void {
  if (!isObject(v)) {
    errors.push(`${where} must be an object keyed by card size.`);
    return;
  }
  for (const [size, value] of Object.entries(v)) {
    if (!SIZES.has(size)) errors.push(`${where} has an unknown size "${size.slice(0, 20)}".`);
    else each(`${where}.${size}`, value);
  }
}

/** A v2 colour: a hex, or one of the card's colour tokens as `var(--token)` (with a hex fallback). */
function checkColour(errors: Errors, where: string, v: unknown): void {
  if (typeof v !== "string" || v.length > MAX_SHORT) {
    errors.push(`${where} must be a colour.`);
    return;
  }
  if (HEX.test(v)) return;
  const token = VAR.exec(v)?.[1];
  if (!token) errors.push(`${where} must be a hex colour or var(--token).`);
  else if (!isColourTokenName(token))
    errors.push(
      `${where} names a colour token cards don't have; use ${COLOUR_TOKENS.join(", ")}, --ck-* or --dt-*.`,
    );
}

function checkGradient(errors: Errors, where: string, v: Record<string, unknown>): void {
  if (v.type === "linear") {
    knownKeys(errors, where, v, new Set(["type", "angle", "stops"]));
    inRange(errors, `${where}.angle`, v.angle, V2_RANGES.angle);
  } else if (v.type === "radial") {
    knownKeys(errors, where, v, new Set(["type", "shape", "at", "stops"]));
    if (v.shape !== undefined) oneOf(errors, `${where}.shape`, v.shape, ["circle", "ellipse"]);
    if (v.at !== undefined) {
      if (!isObject(v.at)) errors.push(`${where}.at must be a centre { x, y }.`);
      else {
        knownKeys(errors, `${where}.at`, v.at, new Set(["x", "y"]));
        numberIn(errors, `${where}.at.x`, v.at.x, ...V2_RANGES.centre);
        numberIn(errors, `${where}.at.y`, v.at.y, ...V2_RANGES.centre);
      }
    }
  } else {
    errors.push(`${where}.type must be linear or radial.`);
    return;
  }
  if (
    !Array.isArray(v.stops) ||
    v.stops.length < MIN_GRADIENT_STOPS ||
    v.stops.length > MAX_GRADIENT_STOPS
  ) {
    errors.push(`${where}.stops must be ${MIN_GRADIENT_STOPS} to ${MAX_GRADIENT_STOPS} stops.`);
    return;
  }
  v.stops.forEach((stop, i) => {
    const at = `${where}.stops[${i}]`;
    if (!isObject(stop)) return void errors.push(`${at} must be { color, at }.`);
    knownKeys(errors, at, stop, new Set(["color", "at"]));
    checkColour(errors, `${at}.color`, stop.color);
    inRange(errors, `${at}.at`, stop.at, V2_RANGES.stopAt);
  });
}

/** A fill: a colour, or a linear or radial gradient. */
function checkFill(errors: Errors, where: string, v: unknown): void {
  if (isObject(v)) checkGradient(errors, where, v);
  else checkColour(errors, where, v);
}

function checkShadows(errors: Errors, where: string, v: unknown, box: boolean): void {
  if (!Array.isArray(v) || v.length > MAX_SHADOWS) {
    errors.push(`${where} must be a list of at most ${MAX_SHADOWS} shadows.`);
    return;
  }
  const keys = new Set(
    box ? ["x", "y", "blur", "spread", "color", "inset"] : ["x", "y", "blur", "color"],
  );
  v.forEach((shadow, i) => {
    const at = `${where}[${i}]`;
    if (!isObject(shadow)) return void errors.push(`${at} must be a shadow.`);
    knownKeys(errors, at, shadow, keys);
    numberIn(errors, `${at}.x`, shadow.x, ...V2_RANGES.shadowOffset);
    numberIn(errors, `${at}.y`, shadow.y, ...V2_RANGES.shadowOffset);
    numberIn(errors, `${at}.blur`, shadow.blur, ...V2_RANGES.shadowBlur);
    if (box) {
      inRange(errors, `${at}.spread`, shadow.spread, V2_RANGES.shadowOffset);
      flag(errors, `${at}.inset`, shadow.inset);
    }
    checkColour(errors, `${at}.color`, shadow.color);
  });
}

function checkFilters(errors: Errors, where: string, v: unknown): void {
  if (!Array.isArray(v) || v.length > FILTER_PRESETS.length) {
    errors.push(`${where} must be a list of at most ${FILTER_PRESETS.length} filters.`);
    return;
  }
  const seen = new Set<unknown>();
  v.forEach((filter, i) => {
    const at = `${where}[${i}]`;
    if (!isObject(filter)) return void errors.push(`${at} must be a filter.`);
    if (seen.has(filter.preset)) errors.push(`${at} repeats the ${String(filter.preset)} filter.`);
    seen.add(filter.preset);
    if (filter.preset === "duotone") {
      knownKeys(errors, at, filter, new Set(["preset", "dark", "light"]));
      checkColour(errors, `${at}.dark`, filter.dark);
      checkColour(errors, `${at}.light`, filter.light);
    } else if (filter.preset === "grayscale") {
      knownKeys(errors, at, filter, new Set(["preset", "amount"]));
      inRange(errors, `${at}.amount`, filter.amount, V2_RANGES.grayscale);
    } else if (filter.preset === "blur") {
      knownKeys(errors, at, filter, new Set(["preset", "px"]));
      numberIn(errors, `${at}.px`, filter.px, ...V2_RANGES.blurPx);
    } else if (filter.preset === "brightness") {
      knownKeys(errors, at, filter, new Set(["preset", "amount"]));
      numberIn(errors, `${at}.amount`, filter.amount, ...V2_RANGES.brightness);
    } else oneOf(errors, `${at}.preset`, filter.preset, FILTER_PRESETS);
  });
}

function checkStyle(errors: Errors, where: string, v: unknown, v2 = false): void {
  if (v === undefined) return;
  if (!isObject(v)) {
    errors.push(`${where} must be an object.`);
    return;
  }
  const keys = v2 ? V2_STYLE_KEYS : STYLE_KEYS;
  for (const [k, value] of Object.entries(v)) {
    if (value === undefined) continue;
    const at = `${where}.${k}`;
    if (!keys.has(k)) errors.push(`${where} has an unknown setting "${k.slice(0, 30)}".`);
    else if (k === "color" || k === "background" || k === "fontFamily")
      stringOf(errors, at, value, MAX_SHORT, true);
    else if (k === "align") {
      if (typeof value !== "string" || !ALIGNS.has(value))
        errors.push(`${at} must be left, center or right.`);
    } else if (k === "fontSize") numberIn(errors, at, value, 0.2, 80);
    else if (k === "fontWeight") numberIn(errors, at, value, 100, 1000);
    else if (k === "letterSpacing") numberIn(errors, at, value, -1, 3);
    else if (k === "uppercase") {
      if (typeof value !== "boolean") errors.push(`${at} must be true or false.`);
    } else if (k === "radius") numberIn(errors, at, value, 0, 10000);
    else if (k === "opacity") numberIn(errors, at, value, 0, 1);
    else if (k === "fill" || k === "textFill") checkFill(errors, at, value);
    else if (k === "border") {
      if (!isObject(value)) errors.push(`${at} must be { width, color, style }.`);
      else {
        knownKeys(errors, at, value, new Set(["width", "color", "style"]));
        numberIn(errors, `${at}.width`, value.width, ...V2_RANGES.borderWidth);
        checkColour(errors, `${at}.color`, value.color);
        if (value.style !== undefined) oneOf(errors, `${at}.style`, value.style, BORDER_STYLES);
      }
    } else if (k === "boxShadow") checkShadows(errors, at, value, true);
    else if (k === "textShadow") checkShadows(errors, at, value, false);
    else if (k === "blend") oneOf(errors, at, value, BLEND_MODES);
    else if (k === "filter") checkFilters(errors, at, value);
    else if (k === "overlay") {
      if (!isObject(value)) errors.push(`${at} must be { kind, opacity, scale }.`);
      else {
        knownKeys(errors, at, value, new Set(["kind", "opacity", "scale"]));
        oneOf(errors, `${at}.kind`, value.kind, OVERLAY_KINDS);
        inRange(errors, `${at}.opacity`, value.opacity, V2_RANGES.overlayOpacity);
        inRange(errors, `${at}.scale`, value.scale, V2_RANGES.overlayScale);
      }
    } else if (k === "lineHeight") numberIn(errors, at, value, ...V2_RANGES.lineHeight);
    else if (k === "clip") checkClip(errors, at, value);
  }
}

/** A clip: `{ polygon: [[x, y], …] }`, 3 to MAX_CLIP_POINTS points in percent of the box. */
function checkClip(errors: Errors, where: string, v: unknown): void {
  if (!isObject(v)) return void errors.push(`${where} must be { polygon }.`);
  knownKeys(errors, where, v, new Set(["polygon"]));
  const points = v.polygon;
  if (!Array.isArray(points) || points.length < 3 || points.length > MAX_CLIP_POINTS)
    return void errors.push(`${where}.polygon must be 3 to ${MAX_CLIP_POINTS} points.`);
  points.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2)
      return void errors.push(`${where}.polygon[${i}] must be [x, y].`);
    numberIn(errors, `${where}.polygon[${i}][0]`, p[0], ...V2_RANGES.clipPoint);
    numberIn(errors, `${where}.polygon[${i}][1]`, p[1], ...V2_RANGES.clipPoint);
  });
}

function checkBox(errors: Errors, where: string, v: unknown): void {
  if (!isObject(v)) {
    errors.push(`${where} must be a box.`);
    return;
  }
  for (const k of Object.keys(v)) {
    if (!["x", "y", "w", "h", "rotate"].includes(k))
      errors.push(`${where} has an unknown setting "${k.slice(0, 30)}".`);
  }
  for (const k of ["x", "y", "w", "h"]) numberIn(errors, `${where}.${k}`, v[k], -200, 300);
  if (v.rotate !== undefined) numberIn(errors, `${where}.rotate`, v.rotate, -360, 360);
}

function checkTokens(errors: Errors, where: string, text: string, allowed: Set<string>): void {
  for (const m of text.matchAll(TOKEN)) {
    const key = m[1] ?? "";
    if (!allowed.has(key))
      errors.push(`${where} uses a field this card doesn't have: {{${key.slice(0, 40)}}}.`);
  }
}

function checkRows(errors: Errors, where: string, v: unknown, scope: Scope): void {
  if (!isObject(v)) {
    errors.push(`${where} must describe a list row.`);
    return;
  }
  const repeat = typeof v.repeat === "string" ? scope.repeat(v.repeat) : null;
  if (!repeat) {
    errors.push(`${where}.repeat isn't a list this card has.`);
    return;
  }
  numberIn(errors, `${where}.rowHeight`, v.rowHeight, 0.5, 100);
  if (v.gap !== undefined) numberIn(errors, `${where}.gap`, v.gap, 0, 50);
  if (
    v.columns !== undefined &&
    (!Number.isInteger(v.columns) || (v.columns as number) < 1 || (v.columns as number) > 6)
  )
    errors.push(`${where}.columns must be a whole number from 1 to 6.`);
  if (v.columnGap !== undefined) numberIn(errors, `${where}.columnGap`, v.columnGap, 0, 50);
  if (v.flow !== undefined) {
    if (!scope.v2) errors.push(`${where}.flow is a format v2 option.`);
    else if (v.flow !== "down" && v.flow !== "across")
      errors.push(`${where}.flow must be down or across.`);
  }
  if (!Array.isArray(v.cells) || v.cells.length > MAX_CELLS) {
    errors.push(`${where}.cells must be a list of at most ${MAX_CELLS} cells.`);
  } else {
    v.cells.forEach((cell, i) => {
      const at = `${where}.cells[${i}]`;
      if (!isObject(cell)) {
        errors.push(`${at} must be a cell.`);
        return;
      }
      if (typeof cell.field !== "string" || !repeat.fields.has(cell.field))
        errors.push(`${at}.field isn't a field of ${repeat.label}.`);
      numberIn(errors, `${at}.x`, cell.x, 0, 100);
      numberIn(errors, `${at}.w`, cell.w, 0, 100);
      if (cell.y !== undefined) numberIn(errors, `${at}.y`, cell.y, 0, 100);
      if (cell.h !== undefined) numberIn(errors, `${at}.h`, cell.h, 0, 100);
      if (cell.show !== undefined && !["text", "image", "backdrop"].includes(cell.show as string))
        errors.push(`${at}.show must be text, image or backdrop.`);
      checkStyle(errors, `${at}.style`, cell.style, scope.v2);
    });
  }
  if (v.variants !== undefined) {
    if (!isObject(v.variants)) errors.push(`${where}.variants must be an object.`);
    else
      for (const [variant, cells] of Object.entries(v.variants)) {
        const at = `${where}.variants.${variant.slice(0, 20)}`;
        if (!repeat.variants.includes(variant))
          errors.push(`${at} isn't a row style this list has.`);
        if (!isObject(cells)) {
          errors.push(`${at} must be an object.`);
          continue;
        }
        for (const [field, style] of Object.entries(cells)) {
          if (!repeat.fields.has(field)) errors.push(`${at} styles an unknown field.`);
          checkStyle(errors, `${at}.${field.slice(0, 30)}`, style, scope.v2);
        }
      }
  }
}

/** The checks v1 and v2 layers share (a v1 layer is checked with these alone). */
function checkLayerBody(
  errors: Errors,
  layer: Record<string, unknown>,
  where: string,
  scope: Scope,
): void {
  const allowed = scope.tokens;
  for (const k of ["hidden", "locked"]) {
    if (layer[k] !== undefined && typeof layer[k] !== "boolean")
      errors.push(`${where}.${k} must be true or false.`);
  }
  if (layer.name !== undefined) stringOf(errors, `${where}.name`, layer.name, MAX_SHORT);
  if (layer.group !== undefined && (typeof layer.group !== "string" || !ID.test(layer.group)))
    errors.push(`${where}.group needs a simple id.`);
  if (layer.sub !== undefined) stringOf(errors, `${where}.sub`, layer.sub, MAX_SHORT);
  if (layer.bind !== undefined) {
    if (typeof layer.bind !== "string" || !KEY.test(layer.bind) || !allowed.has(layer.bind))
      errors.push(`${where}.bind isn't a field this card has.`);
  }
  if (layer.content !== undefined) {
    stringOf(errors, `${where}.content`, layer.content, MAX_TEXT);
    if (typeof layer.content === "string") {
      checkTokens(errors, `${where}.content`, layer.content, allowed);
      if (layer.kind === "image") {
        const c = layer.content.trim();
        const token = /^\{\{\s*[\w.]+\s*\}\}$/.test(c);
        if (!token && !/^(https:\/\/|\/)[^\s"'<>]*$/.test(c))
          errors.push(`${where} must use the club logo or an https image address.`);
      }
    }
  }
  if (layer.sizes !== undefined) {
    if (
      !Array.isArray(layer.sizes) ||
      layer.sizes.some((s) => typeof s !== "string" || !SIZES.has(s)) ||
      new Set(layer.sizes).size !== layer.sizes.length
    ) {
      errors.push(`${where}.sizes must list card sizes once each.`);
    }
  }
  sizeRecord(errors, `${where}.geometry`, layer.geometry, (at, box) => checkBox(errors, at, box));
  if (layer.editedAt !== undefined)
    sizeRecord(errors, `${where}.editedAt`, layer.editedAt, (at, t) =>
      numberIn(errors, at, t, 0, 1e14),
    );
  if (layer.photo !== undefined) {
    sizeRecord(errors, `${where}.photo`, layer.photo, (at, p) => {
      if (!isObject(p)) {
        errors.push(`${at} must be a focal point.`);
        return;
      }
      numberIn(errors, `${at}.focalX`, p.focalX, 0, 100);
      numberIn(errors, `${at}.focalY`, p.focalY, 0, 100);
      numberIn(errors, `${at}.zoom`, p.zoom, 0.1, 10);
    });
  }
  checkStyle(errors, `${where}.style`, layer.style, scope.v2);
  if (layer.animation !== undefined) {
    if (
      !isObject(layer.animation) ||
      typeof layer.animation.kind !== "string" ||
      !ANIMATIONS.has(layer.animation.kind)
    )
      errors.push(`${where}.animation isn't a known animation.`);
    else if (layer.animation.delayMs !== undefined)
      numberIn(errors, `${where}.animation.delayMs`, layer.animation.delayMs, 0, 10000);
  }
  if (layer.kind === "rows") checkRows(errors, `${where}.rows`, layer.rows, scope);
  else if (layer.rows !== undefined)
    errors.push(`${where} isn't a list, so it can't have list rows.`);
  if (layer.kind === "element") {
    const el = layer.element;
    if (!isObject(el) || typeof el.id !== "string" || !/^[\w.-]{1,80}$/.test(el.id))
      errors.push(`${where}.element needs a library element id.`);
    else if (el.props !== undefined) {
      if (!isObject(el.props)) errors.push(`${where}.element.props must be an object.`);
      else
        for (const [k, value] of Object.entries(el.props)) {
          if (!KEY.test(k)) errors.push(`${where}.element.props has an unknown setting.`);
          else stringOf(errors, `${where}.element.props.${k}`, value, MAX_TEXT);
        }
    }
  } else if (layer.element !== undefined) errors.push(`${where} isn't a library element.`);
}

function checkLayer(
  errors: Errors,
  layer: unknown,
  i: number,
  kind: string,
  allowed: Set<string>,
): void {
  const where = `Layer ${i + 1}`;
  if (!isObject(layer)) {
    errors.push(`${where} must be an object.`);
    return;
  }
  for (const k of Object.keys(layer)) {
    if (!LAYER_KEYS.has(k)) errors.push(`${where} has an unknown setting "${k.slice(0, 30)}".`);
  }
  if (typeof layer.id !== "string" || !ID.test(layer.id))
    errors.push(`${where} needs a simple id.`);
  if (typeof layer.kind !== "string" || !V1_LAYER_KINDS.has(layer.kind)) {
    errors.push(`${where} is a kind of element templates can't hold.`);
    return;
  }
  checkLayerBody(errors, layer, where, v1Scope(kind, allowed));
}

/** The field keys a kind's text can show, plus the club crest and ground photo. */
function tokenKeys(kind: string): Set<string> {
  const cat = kindFields(kind);
  return new Set([
    "clubLogo",
    "groundPhoto",
    ...(cat?.fields.map((f) => f.key) ?? []),
    ...(cat?.images.map((i) => i.key) ?? []),
  ]);
}

function v1Scope(kind: string, tokens: Set<string>): Scope {
  return {
    v2: false,
    tokens,
    repeat: (key) => {
      const r = kindFields(kind)?.repeats.find((x) => x.key === key);
      return r
        ? { label: r.label, fields: new Set(r.fields.map((f) => f.key)), variants: r.variants }
        : null;
    },
  };
}

function v2Scope(kind: string, page: PageKey): Scope {
  return {
    v2: true,
    tokens: pageTokenKeys(kind, page),
    repeat: (key) => {
      const r = pageRepeat(kind, page, key);
      return r
        ? { label: r.label, fields: new Set(r.fields.map((f) => f.key)), variants: r.variants }
        : null;
    },
  };
}

// ── v2 ──────────────────────────────────────────────────────────────────────

type Walk = { errors: Errors; ids: Set<string>; pageLayers: number };

/** A v2 layer's label in messages: its page and id path, so the editor and the AI can find it. */
const layerLabel = (layer: Record<string, unknown>, fallback: string): string =>
  typeof layer.id === "string" && ID.test(layer.id) ? layer.id : fallback;

function checkMotion(errors: Errors, where: string, v: unknown): void {
  if (!isObject(v)) return void errors.push(`${where} must be { in, loop }.`);
  knownKeys(errors, where, v, new Set(["in", "loop"]));
  if (v.in !== undefined) {
    const at = `${where}.in`;
    if (!isObject(v.in)) errors.push(`${at} must be { preset, delayMs, durationMs, easing }.`);
    else {
      knownKeys(errors, at, v.in, new Set(["preset", "delayMs", "durationMs", "easing"]));
      oneOf(errors, `${at}.preset`, v.in.preset, MOTION_IN_PRESETS);
      inRange(errors, `${at}.delayMs`, v.in.delayMs, V2_RANGES.motionDelayMs);
      inRange(errors, `${at}.durationMs`, v.in.durationMs, V2_RANGES.motionDurationMs);
      if (v.in.easing !== undefined) oneOf(errors, `${at}.easing`, v.in.easing, MOTION_EASINGS);
    }
  }
  if (v.loop !== undefined) {
    const at = `${where}.loop`;
    if (!isObject(v.loop)) errors.push(`${at} must be { preset, periodMs, delayMs }.`);
    else {
      knownKeys(errors, at, v.loop, new Set(["preset", "periodMs", "delayMs"]));
      oneOf(errors, `${at}.preset`, v.loop.preset, MOTION_LOOP_PRESETS);
      inRange(errors, `${at}.periodMs`, v.loop.periodMs, V2_RANGES.loopPeriodMs);
      inRange(errors, `${at}.delayMs`, v.loop.delayMs, V2_RANGES.motionDelayMs);
    }
  }
}

function checkLayerV2(
  w: Walk,
  layer: unknown,
  path: string,
  index: number,
  scope: Scope,
  groupDepth: number,
): void {
  const { errors } = w;
  w.pageLayers++;
  if (!isObject(layer)) {
    errors.push(`${path}/layer ${index + 1} must be an object.`);
    return;
  }
  const where = `${path}/${layerLabel(layer, `layer ${index + 1}`)}`;
  knownKeys(errors, where, layer, V2_LAYER_KEYS);
  if (typeof layer.id !== "string" || !ID.test(layer.id))
    errors.push(`${where} needs a simple id (letters, digits, _ . -).`);
  else if (w.ids.has(layer.id)) errors.push(`${where} repeats the id of another layer.`);
  else w.ids.add(layer.id);
  const kind = layer.kind;
  if (typeof kind !== "string" || !(LAYER_KINDS_V2 as readonly string[]).includes(kind)) {
    errors.push(`${where} is a kind of layer templates can't hold.`);
    return;
  }
  checkLayerBody(errors, layer, where, scope);
  if (layer.showWhen !== undefined) {
    const s = layer.showWhen;
    if (!isObject(s)) errors.push(`${where}.showWhen must be { field, photo, sponsors, junior }.`);
    else {
      knownKeys(errors, `${where}.showWhen`, s, new Set(["field", "photo", "sponsors", "junior"]));
      if (s.field !== undefined && (typeof s.field !== "string" || !scope.tokens.has(s.field)))
        errors.push(`${where}.showWhen.field isn't a field this page has.`);
      for (const k of ["photo", "sponsors", "junior"]) flag(errors, `${where}.showWhen.${k}`, s[k]);
    }
  }
  if (layer.fit !== undefined) {
    const f = layer.fit;
    if (kind !== "text") errors.push(`${where} isn't text, so it can't have a text fit.`);
    else if (!isObject(f)) errors.push(`${where}.fit must be { minScale, maxLines, ellipsis }.`);
    else {
      knownKeys(errors, `${where}.fit`, f, new Set(["minScale", "maxLines", "ellipsis"]));
      inRange(errors, `${where}.fit.minScale`, f.minScale, V2_RANGES.minScale);
      if (f.maxLines !== undefined) oneOf(errors, `${where}.fit.maxLines`, f.maxLines, [1, 2]);
      flag(errors, `${where}.fit.ellipsis`, f.ellipsis);
    }
  }
  if (layer.motion !== undefined) checkMotion(errors, `${where}.motion`, layer.motion);
  if (kind === "vector") {
    const result = sanitiseSvg(layer.svg);
    for (const e of result.errors) errors.push(`${where}.svg: ${e}`);
  } else if (layer.svg !== undefined) errors.push(`${where} isn't a vector, so it can't hold SVG.`);
  if (kind !== "group") {
    if (layer.stack !== undefined) errors.push(`${where} isn't a group, so it can't stack.`);
    if (layer.children !== undefined)
      errors.push(`${where} isn't a group, so it can't hold layers.`);
    return;
  }
  if (groupDepth > MAX_STACK_DEPTH) {
    errors.push(`${where} nests groups deeper than ${MAX_STACK_DEPTH} levels.`);
    return;
  }
  if (layer.stack !== undefined) {
    const s = layer.stack;
    const at = `${where}.stack`;
    if (!isObject(s)) errors.push(`${at} must be { direction, gap, align, justify }.`);
    else {
      knownKeys(errors, at, s, new Set(["direction", "gap", "align", "justify"]));
      oneOf(errors, `${at}.direction`, s.direction, STACK_DIRECTIONS);
      inRange(errors, `${at}.gap`, s.gap, V2_RANGES.stackGap);
      if (s.align !== undefined) oneOf(errors, `${at}.align`, s.align, STACK_ALIGNS);
      if (s.justify !== undefined) oneOf(errors, `${at}.justify`, s.justify, STACK_JUSTIFIES);
    }
  }
  if (!Array.isArray(layer.children)) {
    errors.push(`${where} is a group, so it needs a children list.`);
    return;
  }
  layer.children.forEach((child, i) => checkLayerV2(w, child, where, i, scope, groupDepth + 1));
}

function v2DocumentErrors(doc: Record<string, unknown>, kind: string): string[] {
  const errors: Errors = [];
  knownKeys(
    errors,
    "The template",
    doc,
    new Set(["formatVersion", "pages", "timeline", "palettes", "sponsorLock"]),
  );
  if (doc.formatVersion !== FORMAT_VERSION) errors.push(`formatVersion must be ${FORMAT_VERSION}.`);
  flag(errors, "sponsorLock", doc.sponsorLock);
  if (doc.palettes !== undefined) {
    if (
      !Array.isArray(doc.palettes) ||
      doc.palettes.some((p) => !(DERIVED_PALETTES as readonly unknown[]).includes(p)) ||
      new Set(doc.palettes).size !== doc.palettes.length
    )
      errors.push(`palettes must list ${DERIVED_PALETTES.join(" or ")} once each.`);
  }
  if (doc.timeline !== undefined) {
    if (!isObject(doc.timeline)) errors.push("timeline must be { durationMs, holdMs, loop }.");
    else {
      knownKeys(errors, "timeline", doc.timeline, new Set(["durationMs", "holdMs", "loop"]));
      inRange(errors, "timeline.durationMs", doc.timeline.durationMs, V2_RANGES.timelineMs);
      inRange(errors, "timeline.holdMs", doc.timeline.holdMs, V2_RANGES.timelineMs);
      flag(errors, "timeline.loop", doc.timeline.loop);
    }
  }
  if (!isObject(doc.pages)) return [...errors, "pages must be an object keyed by page."];
  if (JSON.stringify(doc).length > MAX_DOCUMENT_BYTES)
    return [...errors, `A template can be at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`];
  const ids = new Set<string>();
  let total = 0;
  const pages = Object.entries(doc.pages);
  if (pages.length === 0) errors.push("A template needs at least one page.");
  for (const [page, body] of pages) {
    if (!kindHasPage(kind, page)) {
      errors.push(`${page.slice(0, 20)} isn't a page of this card.`);
      continue;
    }
    if (!isObject(body) || !Array.isArray(body.layers)) {
      errors.push(`${page} needs a list of layers.`);
      continue;
    }
    knownKeys(errors, page, body, new Set(["layers"]));
    const w: Walk = { errors, ids, pageLayers: 0 };
    const scope = v2Scope(kind, page);
    body.layers.forEach((layer, i) => checkLayerV2(w, layer, page, i, scope, 1));
    if (w.pageLayers > MAX_PAGE_LAYERS)
      errors.push(
        `${page} has ${w.pageLayers} layers; a page can hold at most ${MAX_PAGE_LAYERS}.`,
      );
    total += w.pageLayers;
  }
  if (total > MAX_V2_DOCUMENT_LAYERS)
    errors.push(
      `A template can hold at most ${MAX_V2_DOCUMENT_LAYERS} layers; this one has ${total}.`,
    );
  return errors;
}

/** Whether a stored document claims format v2 (and so is checked by v2's rules). */
const claimsV2 = (doc: Record<string, unknown>) => "formatVersion" in doc || "pages" in doc;

/**
 * Every problem with a template document for `kind`, in plain language;
 * empty when it is valid. (Empty sizes are checked separately, KTD15.)
 */
export function templateDocumentErrors(doc: unknown, kind: string): string[] {
  if (isObject(doc) && claimsV2(doc)) return v2DocumentErrors(doc, kind);
  const errors: Errors = [];
  if (!isObject(doc) || !Array.isArray(doc.layers)) return ["A template needs a list of layers."];
  for (const k of Object.keys(doc)) {
    if (k !== "layers") errors.push(`A template can't hold "${k.slice(0, 30)}".`);
  }
  if (doc.layers.length > MAX_DOCUMENT_LAYERS) {
    errors.push(`A template can hold at most ${MAX_DOCUMENT_LAYERS} elements.`);
    return errors;
  }
  const allowed = tokenKeys(kind);
  const ids = new Set<string>();
  doc.layers.forEach((layer, i) => {
    checkLayer(errors, layer, i, kind, allowed);
    const id = isObject(layer) ? layer.id : undefined;
    if (typeof id === "string") {
      if (ids.has(id)) errors.push(`Layer ${i + 1} repeats the id of another layer.`);
      ids.add(id);
    }
  });
  return errors;
}
