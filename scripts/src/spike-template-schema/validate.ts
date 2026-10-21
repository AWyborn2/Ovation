/**
 * Structured-output spike (S.3): a minimal format v2 validator, standing in
 * for L1-B's `validate.ts` v2 (T1.7–T1.9), which hasn't been written yet. It
 * follows v1's rules (known keys only, finite in-range numbers, bounded
 * strings, the card's own fields) and adds v2's: page keys valid for the
 * kind, tokens and repeats valid for the page, stack depth, layer limits and
 * a light SVG allowlist. L1-B's validator is the authority; this only scores
 * the spike's outputs the same way across shapes.
 */
import {
  ALIGNS,
  BLENDS,
  BORDER_STYLES,
  CELL_SHOWS,
  EASINGS,
  FILL_TYPES,
  FILTERS,
  kindPages,
  LAYER_KINDS,
  MAX_DEPTH,
  MAX_DOCUMENT_LAYERS,
  MAX_PAGE_LAYERS,
  MAX_SHORT,
  MAX_SVG_BYTES,
  MAX_TEXT,
  MOTION_IN,
  MOTION_LOOP,
  OVERLAYS,
  pageCatalogue,
  PALETTES,
  RANGES,
  SIZES,
  STACK_ALIGN,
  STACK_DIRECTIONS,
  STACK_JUSTIFY,
  type PageCatalogue,
  type PageKey,
} from "./format";

type Raw = Record<string, unknown>;
type Errors = string[];

const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const UNSAFE = /["<>;{}\\]/;
const ID = /^[\w.-]{1,64}$/;
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
const SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
]);

function keys(errors: Errors, where: string, v: Raw, allowed: readonly string[]): void {
  for (const k of Object.keys(v))
    if (!allowed.includes(k)) errors.push(`${where} has an unknown setting "${k.slice(0, 30)}".`);
}
function numberIn(
  errors: Errors,
  where: string,
  v: unknown,
  [lo, hi]: readonly [number, number],
): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
    errors.push(`${where} must be a number from ${lo} to ${hi}.`);
}
function optNumber(
  errors: Errors,
  where: string,
  v: unknown,
  range: readonly [number, number],
): void {
  if (v !== undefined) numberIn(errors, where, v, range);
}
function text(errors: Errors, where: string, v: unknown, max: number, safe = false): void {
  if (typeof v !== "string" || v.length > max)
    errors.push(`${where} must be text of at most ${max} characters.`);
  else if (safe && UNSAFE.test(v)) errors.push(`${where} contains characters that aren't allowed.`);
}
function oneOf(errors: Errors, where: string, v: unknown, values: readonly unknown[]): void {
  if (!values.includes(v)) errors.push(`${where} must be one of ${values.join(", ")}.`);
}
function flag(errors: Errors, where: string, v: unknown): void {
  if (v !== undefined && typeof v !== "boolean") errors.push(`${where} must be true or false.`);
}

function checkFill(errors: Errors, where: string, v: unknown): void {
  if (!isRaw(v)) return void errors.push(`${where} must be a fill.`);
  keys(errors, where, v, ["type", "color", "angle", "stops"]);
  oneOf(errors, `${where}.type`, v.type, FILL_TYPES);
  if (v.color !== undefined) text(errors, `${where}.color`, v.color, MAX_SHORT, true);
  optNumber(errors, `${where}.angle`, v.angle, RANGES.angle);
  if (v.type === "solid" && v.color === undefined) errors.push(`${where} needs a colour.`);
  if (v.type !== "solid") {
    if (!Array.isArray(v.stops) || v.stops.length < 2 || v.stops.length > 8)
      errors.push(`${where} needs 2 to 8 gradient stops.`);
    else
      v.stops.forEach((s, i) => {
        if (!isRaw(s)) return void errors.push(`${where}.stops[${i}] must be a stop.`);
        keys(errors, `${where}.stops[${i}]`, s, ["color", "at"]);
        text(errors, `${where}.stops[${i}].color`, s.color, MAX_SHORT, true);
        numberIn(errors, `${where}.stops[${i}].at`, s.at, RANGES.stop);
      });
  }
}

function checkShadow(errors: Errors, where: string, v: unknown): void {
  if (!isRaw(v)) return void errors.push(`${where} must be a shadow.`);
  keys(errors, where, v, ["x", "y", "blur", "spread", "color"]);
  for (const k of ["x", "y", "blur"]) numberIn(errors, `${where}.${k}`, v[k], RANGES.shadow);
  optNumber(errors, `${where}.spread`, v.spread, RANGES.shadow);
  text(errors, `${where}.color`, v.color, MAX_SHORT, true);
}

function checkStyle(errors: Errors, where: string, v: unknown): void {
  if (v === undefined) return;
  if (!isRaw(v)) return void errors.push(`${where} must be an object.`);
  keys(errors, where, v, [
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
    "fill",
    "textFill",
    "border",
    "boxShadow",
    "textShadow",
    "blend",
    "filter",
    "overlay",
  ]);
  for (const k of ["color", "background", "fontFamily"])
    if (v[k] !== undefined) text(errors, `${where}.${k}`, v[k], MAX_SHORT, true);
  optNumber(errors, `${where}.fontSize`, v.fontSize, RANGES.fontSize);
  optNumber(errors, `${where}.fontWeight`, v.fontWeight, RANGES.fontWeight);
  optNumber(errors, `${where}.letterSpacing`, v.letterSpacing, RANGES.letterSpacing);
  optNumber(errors, `${where}.radius`, v.radius, RANGES.radius);
  optNumber(errors, `${where}.opacity`, v.opacity, RANGES.opacity);
  flag(errors, `${where}.uppercase`, v.uppercase);
  if (v.align !== undefined) oneOf(errors, `${where}.align`, v.align, ALIGNS);
  if (v.blend !== undefined) oneOf(errors, `${where}.blend`, v.blend, BLENDS);
  if (v.overlay !== undefined) oneOf(errors, `${where}.overlay`, v.overlay, OVERLAYS);
  if (v.fill !== undefined) checkFill(errors, `${where}.fill`, v.fill);
  if (v.textFill !== undefined) checkFill(errors, `${where}.textFill`, v.textFill);
  if (v.boxShadow !== undefined) checkShadow(errors, `${where}.boxShadow`, v.boxShadow);
  if (v.textShadow !== undefined) checkShadow(errors, `${where}.textShadow`, v.textShadow);
  if (v.border !== undefined) {
    const b = v.border;
    if (!isRaw(b)) errors.push(`${where}.border must be a border.`);
    else {
      keys(errors, `${where}.border`, b, ["width", "color", "style"]);
      numberIn(errors, `${where}.border.width`, b.width, RANGES.borderWidth);
      text(errors, `${where}.border.color`, b.color, MAX_SHORT, true);
      if (b.style !== undefined) oneOf(errors, `${where}.border.style`, b.style, BORDER_STYLES);
    }
  }
  if (v.filter !== undefined) {
    const f = v.filter;
    if (!isRaw(f)) errors.push(`${where}.filter must be a filter.`);
    else {
      keys(errors, `${where}.filter`, f, ["preset", "dark", "light", "amount"]);
      oneOf(errors, `${where}.filter.preset`, f.preset, FILTERS);
      for (const k of ["dark", "light"])
        if (f[k] !== undefined) text(errors, `${where}.filter.${k}`, f[k], MAX_SHORT, true);
      optNumber(errors, `${where}.filter.amount`, f.amount, RANGES.blur);
    }
  }
}

function checkBox(errors: Errors, where: string, v: unknown): void {
  if (!isRaw(v)) return void errors.push(`${where} must be a box.`);
  keys(errors, where, v, ["x", "y", "w", "h", "rotate"]);
  for (const k of ["x", "y", "w", "h"]) numberIn(errors, `${where}.${k}`, v[k], RANGES.box);
  optNumber(errors, `${where}.rotate`, v.rotate, RANGES.rotate);
}

function checkTokens(errors: Errors, where: string, s: string, cat: PageCatalogue): void {
  for (const m of s.matchAll(TOKEN)) {
    const key = m[1] ?? "";
    if (!cat.tokens.includes(key))
      errors.push(`${where} uses a field this page doesn't have: {{${key.slice(0, 40)}}}.`);
  }
}

function checkRows(errors: Errors, where: string, v: unknown, cat: PageCatalogue): void {
  if (!isRaw(v)) return void errors.push(`${where} must describe a list row.`);
  keys(errors, where, v, [
    "repeat",
    "rowHeight",
    "gap",
    "columns",
    "columnGap",
    "cells",
    "variants",
  ]);
  const repeat = cat.repeats.find((r) => r.key === v.repeat);
  if (!repeat) return void errors.push(`${where}.repeat isn't a list this page has.`);
  numberIn(errors, `${where}.rowHeight`, v.rowHeight, RANGES.rowHeight);
  optNumber(errors, `${where}.gap`, v.gap, RANGES.gap);
  optNumber(errors, `${where}.columnGap`, v.columnGap, RANGES.gap);
  if (
    v.columns !== undefined &&
    (!Number.isInteger(v.columns) || (v.columns as number) < 1 || (v.columns as number) > 6)
  )
    errors.push(`${where}.columns must be a whole number from 1 to 6.`);
  if (!Array.isArray(v.cells) || v.cells.length === 0 || v.cells.length > 24)
    errors.push(`${where}.cells must be a list of 1 to 24 cells.`);
  else
    v.cells.forEach((cell, i) => {
      const at = `${where}.cells[${i}]`;
      if (!isRaw(cell)) return void errors.push(`${at} must be a cell.`);
      keys(errors, at, cell, ["field", "x", "w", "y", "h", "show", "style"]);
      if (typeof cell.field !== "string" || !repeat.fields.includes(cell.field))
        errors.push(`${at}.field isn't a field of ${repeat.key}.`);
      numberIn(errors, `${at}.x`, cell.x, RANGES.cell);
      numberIn(errors, `${at}.w`, cell.w, RANGES.cell);
      optNumber(errors, `${at}.y`, cell.y, RANGES.cell);
      optNumber(errors, `${at}.h`, cell.h, RANGES.cell);
      if (cell.show !== undefined) oneOf(errors, `${at}.show`, cell.show, CELL_SHOWS);
      checkStyle(errors, `${at}.style`, cell.style);
    });
  if (v.variants !== undefined) {
    if (!isRaw(v.variants)) return void errors.push(`${where}.variants must be an object.`);
    for (const [variant, cells] of Object.entries(v.variants)) {
      const at = `${where}.variants.${variant.slice(0, 20)}`;
      if (!repeat.variants.includes(variant)) errors.push(`${at} isn't a row style this list has.`);
      if (!isRaw(cells)) {
        errors.push(`${at} must be an object.`);
        continue;
      }
      for (const [field, style] of Object.entries(cells)) {
        if (!repeat.fields.includes(field)) errors.push(`${at} styles an unknown field.`);
        checkStyle(errors, `${at}.${field.slice(0, 30)}`, style);
      }
    }
  }
}

function checkSvg(errors: Errors, where: string, v: unknown): void {
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_SVG_BYTES)
    return void errors.push(`${where} must be SVG markup of at most ${MAX_SVG_BYTES} bytes.`);
  if (!/^\s*<svg[\s>]/i.test(v)) errors.push(`${where} must start with <svg>.`);
  if (/href|<script|foreignObject|url\(\s*['"]?(?!#)|\bon\w+\s*=/i.test(v))
    errors.push(`${where} uses something SVG layers can't hold (links, scripts or external urls).`);
  for (const m of v.matchAll(/<\s*([a-zA-Z][\w-]*)/g)) {
    const tag = (m[1] ?? "").toLowerCase();
    if (!SVG_ELEMENTS.has(tag))
      errors.push(`${where} uses an SVG element that isn't allowed: <${tag.slice(0, 20)}>.`);
  }
}

type Walk = {
  errors: Errors;
  cat: PageCatalogue;
  ids: Set<string>;
  count: number;
  maxDepth: number;
};

/** `inGroup` is the sizes the layer's group is on: a layer is only drawn where its group is. */
function checkLayer(
  w: Walk,
  layer: unknown,
  where: string,
  depth: number,
  inGroup: readonly string[] = SIZES,
): void {
  const { errors, cat } = w;
  w.count++;
  w.maxDepth = Math.max(w.maxDepth, depth);
  if (!isRaw(layer)) return void errors.push(`${where} must be an object.`);
  keys(errors, where, layer, [
    "id",
    "kind",
    "name",
    "hidden",
    "content",
    "bind",
    "rows",
    "style",
    "motion",
    "sizes",
    "geometry",
    "showWhen",
    "fit",
    "stack",
    "children",
    "svg",
  ]);
  if (typeof layer.id !== "string" || !ID.test(layer.id))
    errors.push(`${where} needs a simple id.`);
  else if (w.ids.has(layer.id)) errors.push(`${where} repeats the id ${layer.id}.`);
  else w.ids.add(layer.id);
  const kind = layer.kind;
  if (typeof kind !== "string" || !(LAYER_KINDS as readonly string[]).includes(kind))
    return void errors.push(`${where} is a kind of element templates can't hold.`);
  if (layer.name !== undefined) text(errors, `${where}.name`, layer.name, MAX_SHORT);
  flag(errors, `${where}.hidden`, layer.hidden);
  if (
    layer.bind !== undefined &&
    (typeof layer.bind !== "string" || !cat.tokens.includes(layer.bind))
  )
    errors.push(`${where}.bind isn't a field this page has.`);
  if (layer.content !== undefined) {
    text(errors, `${where}.content`, layer.content, MAX_TEXT);
    if (typeof layer.content === "string") {
      checkTokens(errors, `${where}.content`, layer.content, cat);
      if (["image", "photo", "sticker", "medal"].includes(kind)) {
        const c = layer.content.trim();
        if (!/^\{\{\s*[\w.]+\s*\}\}$/.test(c) && !/^https:\/\/[^\s"'<>]*$/.test(c))
          errors.push(`${where} must use an image field or an https image address.`);
      }
    }
  }
  if (kind === "text" && typeof layer.content !== "string" && layer.bind === undefined)
    errors.push(`${where} is a text layer with no text.`);
  if (layer.sizes !== undefined) {
    if (
      !Array.isArray(layer.sizes) ||
      layer.sizes.some((s) => typeof s !== "string" || !SIZES.includes(s)) ||
      new Set(layer.sizes).size !== layer.sizes.length
    )
      errors.push(`${where}.sizes must list card sizes once each.`);
  }
  if (!isRaw(layer.geometry))
    errors.push(`${where}.geometry must be an object keyed by card size.`);
  else {
    for (const [size, box] of Object.entries(layer.geometry)) {
      if (!SIZES.includes(size)) errors.push(`${where}.geometry has an unknown size.`);
      else checkBox(errors, `${where}.geometry.${size}`, box);
    }
    const own = Array.isArray(layer.sizes) ? (layer.sizes as string[]) : SIZES;
    const on = own.filter((s) => inGroup.includes(s));
    for (const size of on)
      if (!(size in layer.geometry)) errors.push(`${where} is on ${size} but has no box there.`);
  }
  checkStyle(errors, `${where}.style`, layer.style);
  if (layer.motion !== undefined) {
    const m = layer.motion;
    if (!isRaw(m)) errors.push(`${where}.motion must be an object.`);
    else {
      keys(errors, `${where}.motion`, m, ["in", "loop"]);
      if (m.in !== undefined) {
        if (!isRaw(m.in)) errors.push(`${where}.motion.in must be an object.`);
        else {
          keys(errors, `${where}.motion.in`, m.in, ["preset", "delayMs", "durationMs", "easing"]);
          oneOf(errors, `${where}.motion.in.preset`, m.in.preset, MOTION_IN);
          optNumber(errors, `${where}.motion.in.delayMs`, m.in.delayMs, RANGES.delayMs);
          optNumber(errors, `${where}.motion.in.durationMs`, m.in.durationMs, RANGES.durationMs);
          if (m.in.easing !== undefined)
            oneOf(errors, `${where}.motion.in.easing`, m.in.easing, EASINGS);
        }
      }
      if (m.loop !== undefined) {
        if (!isRaw(m.loop)) errors.push(`${where}.motion.loop must be an object.`);
        else {
          keys(errors, `${where}.motion.loop`, m.loop, ["preset", "periodMs", "delayMs"]);
          oneOf(errors, `${where}.motion.loop.preset`, m.loop.preset, MOTION_LOOP);
          optNumber(errors, `${where}.motion.loop.periodMs`, m.loop.periodMs, RANGES.periodMs);
          optNumber(errors, `${where}.motion.loop.delayMs`, m.loop.delayMs, RANGES.delayMs);
        }
      }
    }
  }
  if (layer.showWhen !== undefined) {
    const s = layer.showWhen;
    if (!isRaw(s)) errors.push(`${where}.showWhen must be an object.`);
    else {
      keys(errors, `${where}.showWhen`, s, ["field", "photo", "sponsors", "junior"]);
      if (s.field !== undefined && (typeof s.field !== "string" || !cat.tokens.includes(s.field)))
        errors.push(`${where}.showWhen.field isn't a field this page has.`);
      for (const k of ["photo", "sponsors", "junior"]) flag(errors, `${where}.showWhen.${k}`, s[k]);
    }
  }
  if (layer.fit !== undefined) {
    const f = layer.fit;
    if (!isRaw(f)) errors.push(`${where}.fit must be an object.`);
    else {
      keys(errors, `${where}.fit`, f, ["minScale", "maxLines", "ellipsis"]);
      optNumber(errors, `${where}.fit.minScale`, f.minScale, RANGES.minScale);
      if (f.maxLines !== undefined) oneOf(errors, `${where}.fit.maxLines`, f.maxLines, [1, 2]);
      flag(errors, `${where}.fit.ellipsis`, f.ellipsis);
    }
  }
  if (kind === "rows") checkRows(errors, `${where}.rows`, layer.rows, cat);
  else if (layer.rows !== undefined)
    errors.push(`${where} isn't a list, so it can't have list rows.`);
  if (kind === "vector") checkSvg(errors, `${where}.svg`, layer.svg);
  else if (layer.svg !== undefined) errors.push(`${where} isn't a vector, so it can't hold SVG.`);
  if (kind === "group") {
    if (layer.stack !== undefined) {
      const s = layer.stack;
      if (!isRaw(s)) errors.push(`${where}.stack must be an object.`);
      else {
        keys(errors, `${where}.stack`, s, ["direction", "gap", "align", "justify"]);
        oneOf(errors, `${where}.stack.direction`, s.direction, STACK_DIRECTIONS);
        optNumber(errors, `${where}.stack.gap`, s.gap, RANGES.gap);
        if (s.align !== undefined) oneOf(errors, `${where}.stack.align`, s.align, STACK_ALIGN);
        if (s.justify !== undefined)
          oneOf(errors, `${where}.stack.justify`, s.justify, STACK_JUSTIFY);
      }
    }
    if (!Array.isArray(layer.children) || layer.children.length === 0)
      errors.push(`${where} is a group with no layers in it.`);
    else if (depth >= MAX_DEPTH) errors.push(`${where} nests deeper than ${MAX_DEPTH} levels.`);
    else {
      const own = Array.isArray(layer.sizes) ? (layer.sizes as string[]) : SIZES;
      const on = own.filter((s) => inGroup.includes(s));
      layer.children.forEach((c, i) => checkLayer(w, c, `${where}.children[${i}]`, depth + 1, on));
    }
  } else {
    if (layer.stack !== undefined) errors.push(`${where} isn't a group, so it can't stack.`);
    if (layer.children !== undefined)
      errors.push(`${where} isn't a group, so it can't hold layers.`);
  }
}

export type Verdict = {
  errors: string[];
  layers: number;
  maxDepth: number;
  pages: string[];
  stacks: number;
};

/** Every problem with a format v2 document for `kind`; empty when it is valid. */
export function validateV2(doc: unknown, kind: string): Verdict {
  const verdict: Verdict = { errors: [], layers: 0, maxDepth: 0, pages: [], stacks: 0 };
  const errors = verdict.errors;
  if (!isRaw(doc)) return { ...verdict, errors: ["A template must be an object."] };
  keys(errors, "The template", doc, [
    "formatVersion",
    "pages",
    "timeline",
    "palette",
    "sponsorLock",
  ]);
  if (doc.formatVersion !== 2) errors.push("formatVersion must be 2.");
  if (doc.palette !== undefined) oneOf(errors, "palette", doc.palette, PALETTES);
  flag(errors, "sponsorLock", doc.sponsorLock);
  if (doc.timeline !== undefined) {
    if (!isRaw(doc.timeline)) errors.push("timeline must be an object.");
    else {
      keys(errors, "timeline", doc.timeline, ["durationMs", "holdMs", "loop"]);
      optNumber(errors, "timeline.durationMs", doc.timeline.durationMs, RANGES.timelineMs);
      optNumber(errors, "timeline.holdMs", doc.timeline.holdMs, RANGES.timelineMs);
      flag(errors, "timeline.loop", doc.timeline.loop);
    }
  }
  if (!isRaw(doc.pages)) return { ...verdict, errors: [...errors, "pages must be an object."] };
  const allowed = kindPages(kind);
  const ids = new Set<string>();
  for (const [page, body] of Object.entries(doc.pages)) {
    verdict.pages.push(page);
    if (!(allowed as string[]).includes(page)) {
      errors.push(`Page ${page.slice(0, 20)} isn't a page of ${kind}.`);
      continue;
    }
    if (!isRaw(body) || !Array.isArray(body.layers)) {
      errors.push(`Page ${page} needs a list of layers.`);
      continue;
    }
    keys(errors, `Page ${page}`, body, ["layers"]);
    const w: Walk = {
      errors,
      cat: pageCatalogue(kind, page as PageKey),
      ids,
      count: 0,
      maxDepth: 0,
    };
    body.layers.forEach((l, i) => checkLayer(w, l, `Page ${page} layer ${i + 1}`, 1));
    if (w.count > MAX_PAGE_LAYERS)
      errors.push(`Page ${page} has more than ${MAX_PAGE_LAYERS} layers.`);
    if (w.count === 0) errors.push(`Page ${page} has no layers.`);
    verdict.layers += w.count;
    verdict.maxDepth = Math.max(verdict.maxDepth, w.maxDepth);
  }
  if (!verdict.pages.includes(allowed[0]!)) errors.push(`The template has no ${allowed[0]} page.`);
  if (verdict.layers > MAX_DOCUMENT_LAYERS)
    errors.push(`A template can hold at most ${MAX_DOCUMENT_LAYERS} layers.`);
  if (JSON.stringify(doc).length > 1_000_000) errors.push("A template can be at most 1 MB.");
  const countStacks = (layers: unknown): number =>
    Array.isArray(layers)
      ? layers.reduce<number>(
          (n, l) =>
            n +
            (isRaw(l) && l.kind === "group" && isRaw(l.stack) ? 1 : 0) +
            (isRaw(l) ? countStacks(l.children) : 0),
          0,
        )
      : 0;
  for (const body of Object.values(doc.pages))
    if (isRaw(body)) verdict.stacks += countStacks(body.layers);
  return verdict;
}
