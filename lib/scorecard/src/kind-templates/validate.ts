/**
 * Strict validation of a card kind template document (security review,
 * 2026-10-08). Documents are admin-authored JSON that every new draft of the
 * kind copies and that is rendered to HTML on screen and in the server's
 * headless renderer, so only known shapes, finite in-range numbers, bounded
 * strings and the kind's own fields are accepted. The renderer also coerces
 * what it prints; this keeps bad documents from being stored at all.
 *
 * Used by the API on every save and by the starter contract test.
 */
import { TEMPLATE_SIZE_ORDER } from "./document";
import { kindFields } from "./fields";

export const MAX_DOCUMENT_LAYERS = 300;
const MAX_CELLS = 16;
const MAX_TEXT = 1000;
const MAX_SHORT = 120;

const LAYER_KINDS = new Set([
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
/** Characters that could close a style attribute or open markup. */
const UNSAFE = /["<>;{}\\]/;
const ID = /^[\w.-]{1,64}$/;
const KEY = /^\w{1,64}$/;
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

type Errors = string[];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function numberIn(errors: Errors, where: string, v: unknown, lo: number, hi: number): void {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
    errors.push(`${where} must be a number from ${lo} to ${hi}.`);
  }
}

function stringOf(errors: Errors, where: string, v: unknown, max: number, safe = false): void {
  if (typeof v !== "string" || v.length > max) {
    errors.push(`${where} must be text of at most ${max} characters.`);
  } else if (safe && UNSAFE.test(v)) {
    errors.push(`${where} contains characters that aren't allowed.`);
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

function checkStyle(errors: Errors, where: string, v: unknown): void {
  if (v === undefined) return;
  if (!isObject(v)) {
    errors.push(`${where} must be an object.`);
    return;
  }
  for (const [k, value] of Object.entries(v)) {
    if (value === undefined) continue;
    const at = `${where}.${k}`;
    if (!STYLE_KEYS.has(k)) errors.push(`${where} has an unknown setting "${k.slice(0, 30)}".`);
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
  }
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

/** The field keys a kind's text can show, plus the club crest. */
function tokenKeys(kind: string): Set<string> {
  const cat = kindFields(kind);
  return new Set([
    "clubLogo",
    ...(cat?.fields.map((f) => f.key) ?? []),
    ...(cat?.images.map((i) => i.key) ?? []),
  ]);
}

function checkTokens(errors: Errors, where: string, text: string, allowed: Set<string>): void {
  for (const m of text.matchAll(TOKEN)) {
    const key = m[1] ?? "";
    if (!allowed.has(key))
      errors.push(`${where} uses a field this card doesn't have: {{${key.slice(0, 40)}}}.`);
  }
}

function checkRows(errors: Errors, where: string, v: unknown, kind: string): void {
  if (!isObject(v)) {
    errors.push(`${where} must describe a list row.`);
    return;
  }
  const repeat = kindFields(kind)?.repeats.find((r) => r.key === v.repeat);
  if (!repeat) {
    errors.push(`${where}.repeat isn't a list this card has.`);
    return;
  }
  numberIn(errors, `${where}.rowHeight`, v.rowHeight, 0.5, 100);
  if (v.gap !== undefined) numberIn(errors, `${where}.gap`, v.gap, 0, 50);
  const fields = new Set(repeat.fields.map((f) => f.key));
  if (!Array.isArray(v.cells) || v.cells.length > MAX_CELLS) {
    errors.push(`${where}.cells must be a list of at most ${MAX_CELLS} cells.`);
  } else {
    v.cells.forEach((cell, i) => {
      const at = `${where}.cells[${i}]`;
      if (!isObject(cell)) {
        errors.push(`${at} must be a cell.`);
        return;
      }
      if (typeof cell.field !== "string" || !fields.has(cell.field))
        errors.push(`${at}.field isn't a field of ${repeat.label}.`);
      numberIn(errors, `${at}.x`, cell.x, 0, 100);
      numberIn(errors, `${at}.w`, cell.w, 0, 100);
      checkStyle(errors, `${at}.style`, cell.style);
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
          if (!fields.has(field)) errors.push(`${at} styles an unknown field.`);
          checkStyle(errors, `${at}.${field.slice(0, 30)}`, style);
        }
      }
  }
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
  if (typeof layer.kind !== "string" || !LAYER_KINDS.has(layer.kind)) {
    errors.push(`${where} is a kind of element templates can't hold.`);
    return;
  }
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
  checkStyle(errors, `${where}.style`, layer.style);
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
  if (layer.kind === "rows") checkRows(errors, `${where}.rows`, layer.rows, kind);
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

/**
 * Every problem with a template document for `kind`, in plain language;
 * empty when it is valid. (Empty sizes are checked separately, KTD15.)
 */
export function templateDocumentErrors(doc: unknown, kind: string): string[] {
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
