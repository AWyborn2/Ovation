/**
 * Structured-output spike (S.1): the JSON Schemas the spike sends, their
 * offline statistics, and the converters from each wire encoding back to the
 * format v2 document.
 *
 * Shapes (EM plan, "Spike"):
 * - (a) nested: a group's children inline, unrolled to depth 4 with one
 *   `$defs` entry per level (structured outputs reject recursion).
 * - (b) flat: one list of layers per page, each naming its `parentId`.
 * - (c) no schema: the format rules in the prompt (built in `prompt.ts`).
 *
 * Encodings of (a) and (b):
 * - `faithful`: the schema a generator would write from the TypeScript types,
 *   with optional fields, a layer union (`anyOf`) and keyed records.
 * - `strict`: rewritten for structured outputs' limits (24 optional
 *   parameters, 16 union-typed parameters per request): every property is
 *   required, there are no unions, and anything optional is a list of at most
 *   one entry. Style values travel as `{ prop, value }` pairs.
 */
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
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
  MAX_PAGE_LAYERS,
  MAX_SHORT,
  MAX_SVG_BYTES,
  MAX_TEXT,
  MOTION_IN,
  MOTION_LOOP,
  OVERLAYS,
  PAGE_KEYS,
  pageCatalogue,
  PALETTES,
  RANGES,
  SIZES,
  STACK_ALIGN,
  STACK_DIRECTIONS,
  STACK_JUSTIFY,
  unionCatalogue,
  type LayerV2,
  type PageCatalogue,
  type PageKey,
  type StyleV2,
  type TemplateDocumentV2,
} from "./format";

export type Schema = { [key: string]: unknown };
export type Encoding = "faithful" | "strict";
export type Nesting = "nested" | "flat";
/** A kind's own pages and token enums, or the whole format across kinds. */
export type Scope = string | "whole";

const ID_PATTERN = "^[A-Za-z0-9_.-]{1,64}$";

const num = ([lo, hi]: readonly [number, number], description?: string): Schema => ({
  type: "number",
  minimum: lo,
  maximum: hi,
  ...(description ? { description } : {}),
});
const int = ([lo, hi]: readonly [number, number]): Schema => ({
  type: "integer",
  minimum: lo,
  maximum: hi,
});
const str = (max: number, description?: string): Schema => ({
  type: "string",
  maxLength: max,
  ...(description ? { description } : {}),
});
const bool = (): Schema => ({ type: "boolean" });
const en = (values: readonly string[], description?: string): Schema => ({
  type: "string",
  enum: [...values],
  ...(description ? { description } : {}),
});
const arr = (items: Schema, maxItems?: number): Schema => ({
  type: "array",
  items,
  ...(maxItems ? { maxItems } : {}),
});
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const obj = (props: Record<string, Schema>, required: string[] | "all"): Schema => ({
  type: "object",
  properties: props,
  required: required === "all" ? Object.keys(props) : required,
  additionalProperties: false,
});
/** A list holding at most one entry: an optional value without an optional property. */
const opt = (items: Schema): Schema => ({
  ...arr(items, 1),
  description: "Empty, or exactly one entry.",
});

const COLOR = "A hex colour, rgba(), or a token such as var(--accent), var(--ink), var(--gold).";
const STYLE_PROPS = [
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
  "blend",
  "overlay",
] as const;

/** Page catalogues for a scope: each page of one kind, or one union catalogue. */
function scopePages(scope: Scope): Array<{ page: PageKey | "any"; cat: PageCatalogue }> {
  if (scope === "whole") return [{ page: "any", cat: unionCatalogue() }];
  return kindPages(scope).map((page) => ({ page, cat: pageCatalogue(scope, page) }));
}

const repeatFields = (cat: PageCatalogue) => [...new Set(cat.repeats.flatMap((r) => r.fields))];
const repeatVariants = (cat: PageCatalogue) => [...new Set(cat.repeats.flatMap((r) => r.variants))];

// ── faithful ──────────────────────────────────────────────────────────────

function faithfulCommonDefs(defs: Record<string, Schema>): void {
  defs.Box = obj(
    {
      x: num(RANGES.box),
      y: num(RANGES.box),
      w: num(RANGES.box),
      h: num(RANGES.box),
      rotate: num(RANGES.rotate),
    },
    ["x", "y", "w", "h"],
  );
  defs.Geometry = obj(Object.fromEntries(SIZES.map((s) => [s, ref("Box")])), []);
  defs.Fill = obj(
    {
      type: en(FILL_TYPES),
      color: str(MAX_SHORT, COLOR),
      angle: num(RANGES.angle),
      stops: arr(obj({ color: str(MAX_SHORT, COLOR), at: num(RANGES.stop) }, "all"), 8),
    },
    ["type"],
  );
  defs.Shadow = obj(
    {
      x: num(RANGES.shadow),
      y: num(RANGES.shadow),
      blur: num(RANGES.shadow),
      spread: num(RANGES.shadow),
      color: str(MAX_SHORT, COLOR),
    },
    ["x", "y", "blur", "color"],
  );
  defs.Style = obj(
    {
      color: str(MAX_SHORT, COLOR),
      background: str(MAX_SHORT, COLOR),
      fontFamily: str(MAX_SHORT),
      fontSize: num(RANGES.fontSize, "Percent of the artboard width."),
      fontWeight: num(RANGES.fontWeight),
      letterSpacing: num(RANGES.letterSpacing, "In em."),
      uppercase: bool(),
      align: en(ALIGNS),
      radius: num(RANGES.radius),
      opacity: num(RANGES.opacity),
      fill: ref("Fill"),
      textFill: ref("Fill"),
      border: obj(
        {
          width: num(RANGES.borderWidth),
          color: str(MAX_SHORT, COLOR),
          style: en(BORDER_STYLES),
        },
        ["width", "color"],
      ),
      boxShadow: ref("Shadow"),
      textShadow: ref("Shadow"),
      blend: en(BLENDS),
      filter: obj(
        {
          preset: en(FILTERS),
          dark: str(MAX_SHORT, COLOR),
          light: str(MAX_SHORT, COLOR),
          amount: num(RANGES.blur),
        },
        ["preset"],
      ),
      overlay: en(OVERLAYS),
    },
    [],
  );
  defs.Motion = obj(
    {
      in: obj(
        {
          preset: en(MOTION_IN),
          delayMs: num(RANGES.delayMs),
          durationMs: num(RANGES.durationMs),
          easing: en(EASINGS),
        },
        ["preset"],
      ),
      loop: obj(
        {
          preset: en(MOTION_LOOP),
          periodMs: num(RANGES.periodMs),
          delayMs: num(RANGES.delayMs),
        },
        ["preset"],
      ),
    },
    [],
  );
  defs.Fit = obj(
    {
      minScale: num(RANGES.minScale),
      maxLines: { type: "integer", enum: [1, 2] },
      ellipsis: bool(),
    },
    [],
  );
  defs.Stack = obj(
    {
      direction: en(STACK_DIRECTIONS),
      gap: num(RANGES.gap),
      align: en(STACK_ALIGN),
      justify: en(STACK_JUSTIFY),
    },
    ["direction"],
  );
}

function faithfulPageDefs(defs: Record<string, Schema>, tag: string, cat: PageCatalogue): void {
  const fields = repeatFields(cat);
  defs[`ShowWhen_${tag}`] = obj(
    { field: en(cat.tokens), photo: bool(), sponsors: bool(), junior: bool() },
    [],
  );
  if (cat.repeats.length === 0) return;
  defs[`Rows_${tag}`] = obj(
    {
      repeat: en(cat.repeats.map((r) => r.key)),
      rowHeight: num(RANGES.rowHeight, "Percent of the artboard width."),
      gap: num(RANGES.gap),
      columns: int(RANGES.columns),
      columnGap: num(RANGES.gap),
      cells: arr(
        obj(
          {
            field: en(fields),
            x: num(RANGES.cell),
            w: num(RANGES.cell),
            y: num(RANGES.cell),
            h: num(RANGES.cell),
            show: en(CELL_SHOWS),
            style: ref("Style"),
          },
          ["field", "x", "w"],
        ),
        24,
      ),
      variants: obj(
        Object.fromEntries(
          repeatVariants(cat).map((v) => [
            v,
            obj(Object.fromEntries(fields.map((f) => [f, ref("Style")])), []),
          ]),
        ),
        [],
      ),
    },
    ["repeat", "rowHeight", "cells"],
  );
}

/** One level's layer union (TypeScript's `TemplateLayer`), as `anyOf` members. */
function faithfulLayerDefs(
  defs: Record<string, Schema>,
  tag: string,
  cat: PageCatalogue,
  level: number,
  nesting: Nesting,
): string {
  const name = nesting === "flat" ? `Layer_${tag}` : `Layer_${tag}_L${level}`;
  const common = (kind: Schema): Record<string, Schema> => ({
    id: { type: "string", pattern: ID_PATTERN },
    kind,
    name: str(MAX_SHORT),
    hidden: bool(),
    style: ref("Style"),
    motion: ref("Motion"),
    sizes: arr(en(SIZES), 4),
    geometry: ref("Geometry"),
    showWhen: ref(`ShowWhen_${tag}`),
    ...(nesting === "flat" ? { parentId: { type: "string", pattern: ID_PATTERN } } : {}),
  });
  const base = ["id", "kind", "geometry"];
  const members: Schema[] = [
    obj(
      {
        ...common({ type: "string", const: "text" }),
        content: str(MAX_TEXT, "Text with {{token}} fields."),
        bind: en(cat.tokens),
        fit: ref("Fit"),
      },
      [...base, "content"],
    ),
    obj(
      {
        ...common(en(["image", "photo", "sticker", "medal"])),
        content: str(MAX_TEXT, "A {{token}} image field or an https address."),
        bind: en(cat.tokens),
      },
      base,
    ),
    obj(common({ type: "string", const: "shape" }), base),
    obj({ ...common({ type: "string", const: "vector" }), svg: str(MAX_SVG_BYTES) }, [
      ...base,
      "svg",
    ]),
  ];
  if (cat.repeats.length > 0)
    members.push(
      obj({ ...common({ type: "string", const: "rows" }), rows: ref(`Rows_${tag}`) }, [
        ...base,
        "rows",
      ]),
    );
  if (nesting === "flat")
    members.push(obj({ ...common({ type: "string", const: "group" }), stack: ref("Stack") }, base));
  else if (level < MAX_DEPTH) {
    const child = faithfulLayerDefs(defs, tag, cat, level + 1, nesting);
    members.push(
      obj(
        {
          ...common({ type: "string", const: "group" }),
          stack: ref("Stack"),
          children: arr(ref(child), MAX_PAGE_LAYERS),
        },
        [...base, "children"],
      ),
    );
  }
  defs[name] = { anyOf: members };
  return name;
}

function faithfulSchema(scope: Scope, nesting: Nesting): Schema {
  const defs: Record<string, Schema> = {};
  faithfulCommonDefs(defs);
  const pages: Record<string, Schema> = {};
  for (const { page, cat } of scopePages(scope)) {
    const tag = page === "any" ? "all" : page;
    faithfulPageDefs(defs, tag, cat);
    const top = faithfulLayerDefs(defs, tag, cat, 1, nesting);
    const pageSchema = obj({ layers: arr(ref(top), MAX_PAGE_LAYERS) }, ["layers"]);
    if (page === "any") for (const key of PAGE_KEYS) pages[key] = pageSchema;
    else pages[page] = pageSchema;
  }
  return {
    type: "object",
    properties: {
      formatVersion: { type: "integer", const: 2 },
      pages: obj(pages, []),
      timeline: obj(
        {
          durationMs: num(RANGES.timelineMs),
          holdMs: num(RANGES.timelineMs),
          loop: bool(),
        },
        [],
      ),
      palette: en(PALETTES),
      sponsorLock: bool(),
    },
    required: ["formatVersion", "pages"],
    additionalProperties: false,
    $defs: defs,
  };
}

// ── strict ────────────────────────────────────────────────────────────────

function strictCommonDefs(defs: Record<string, Schema>): void {
  defs.Box = obj(
    {
      size: en(SIZES),
      x: num(RANGES.box, "Left edge, percent of the artboard width."),
      y: num(RANGES.box, "Top edge, percent of the artboard height."),
      w: num(RANGES.box),
      h: num(RANGES.box),
      rotate: num(RANGES.rotate, "Degrees; 0 for none."),
    },
    "all",
  );
  defs.Fill = obj(
    {
      type: en(FILL_TYPES),
      color: str(MAX_SHORT, `For solid fills. ${COLOR} Empty for gradients.`),
      angle: num(RANGES.angle, "Linear gradients; 0 otherwise."),
      stops: arr(obj({ color: str(MAX_SHORT, COLOR), at: num(RANGES.stop) }, "all"), 8),
    },
    "all",
  );
  defs.Shadow = obj(
    {
      x: num(RANGES.shadow),
      y: num(RANGES.shadow),
      blur: num(RANGES.shadow),
      spread: num(RANGES.shadow, "0 for text shadows."),
      color: str(MAX_SHORT, COLOR),
    },
    "all",
  );
  defs.Style = obj(
    {
      props: arr(
        obj(
          {
            prop: en(STYLE_PROPS),
            value: str(
              MAX_SHORT,
              "The value as text: a colour, a number (fontSize in percent of the artboard width, letterSpacing in em, opacity 0-1), true/false for uppercase, left/center/right for align, a blend mode, or grain/halftone for overlay.",
            ),
          },
          "all",
        ),
        STYLE_PROPS.length,
      ),
      fill: opt(ref("Fill")),
      textFill: opt(ref("Fill")),
      border: opt(
        obj(
          {
            width: num(RANGES.borderWidth),
            color: str(MAX_SHORT, COLOR),
            style: en(BORDER_STYLES),
          },
          "all",
        ),
      ),
      boxShadow: opt(ref("Shadow")),
      textShadow: opt(ref("Shadow")),
      filter: opt(
        obj(
          {
            preset: en(FILTERS),
            dark: str(MAX_SHORT, `Duotone only. ${COLOR}`),
            light: str(MAX_SHORT, `Duotone only. ${COLOR}`),
            amount: num(RANGES.blur, "Blur only, in px; 0 otherwise."),
          },
          "all",
        ),
      ),
    },
    "all",
  );
  defs.Motion = obj(
    {
      phase: en(["in", "loop"]),
      preset: en(
        [...MOTION_IN, ...MOTION_LOOP],
        "in: rise/fade/pop/slide/zoom. loop: pulse/shine/glow.",
      ),
      delayMs: num(RANGES.delayMs),
      durationMs: num([0, RANGES.durationMs[1]], "in only; 0 for the default."),
      periodMs: num([0, RANGES.periodMs[1]], "loop only; 0 for the default."),
      easing: en(EASINGS),
    },
    "all",
  );
  defs.Fit = obj(
    {
      minScale: num(RANGES.minScale),
      maxLines: { type: "integer", enum: [1, 2] },
      ellipsis: bool(),
    },
    "all",
  );
  defs.Stack = obj(
    {
      direction: en(STACK_DIRECTIONS),
      gap: num(RANGES.gap, "Percent of the artboard width."),
      align: en(STACK_ALIGN),
      justify: en(STACK_JUSTIFY),
    },
    "all",
  );
}

function strictPageDefs(defs: Record<string, Schema>, tag: string, cat: PageCatalogue): void {
  defs[`ShowWhen_${tag}`] = obj(
    {
      test: en(["field", "photo", "sponsors", "junior"]),
      field: en(["", ...cat.tokens], "For test field: the field that must have a value."),
      value: bool(),
    },
    "all",
  );
  if (cat.repeats.length === 0) return;
  const fields = repeatFields(cat);
  defs[`Rows_${tag}`] = obj(
    {
      repeat: en(cat.repeats.map((r) => r.key)),
      rowHeight: num(RANGES.rowHeight, "Percent of the artboard width."),
      gap: num(RANGES.gap),
      columns: int(RANGES.columns),
      columnGap: num(RANGES.gap),
      cells: arr(
        obj(
          {
            field: en(fields),
            x: num(RANGES.cell, "Percent of the layer width."),
            w: num(RANGES.cell),
            y: num(RANGES.cell, "Percent of the row; 0 for the top."),
            h: num(RANGES.cell, "Percent of the row; 100 for the whole row."),
            show: en(CELL_SHOWS),
            style: ref("Style"),
          },
          "all",
        ),
        24,
      ),
      // An enum can't be empty, so lists with no row styles have no variants.
      ...(repeatVariants(cat).length
        ? {
            variants: arr(
              obj(
                {
                  variant: en(repeatVariants(cat)),
                  field: en(fields),
                  style: ref("Style"),
                },
                "all",
              ),
            ),
          }
        : {}),
    },
    "all",
  );
}

function strictLayerDef(
  defs: Record<string, Schema>,
  tag: string,
  cat: PageCatalogue,
  level: number,
  nesting: Nesting,
): string {
  const name = nesting === "flat" ? `Layer_${tag}` : `Layer_${tag}_L${level}`;
  const canNest = nesting === "nested" && level < MAX_DEPTH;
  const kinds = LAYER_KINDS.filter(
    (k) => (k !== "group" || nesting === "flat" || canNest) && (k !== "rows" || cat.repeats.length),
  );
  const props: Record<string, Schema> = {
    id: { type: "string", pattern: ID_PATTERN },
    ...(nesting === "flat"
      ? {
          parentId: {
            type: "string",
            pattern: "^[A-Za-z0-9_.-]{0,64}$",
            description: "The id of the group this layer sits in; empty at the top of the page.",
          },
        }
      : {}),
    kind: en(kinds),
    name: str(MAX_SHORT),
    hidden: bool(),
    content: str(
      MAX_TEXT,
      "Text with {{token}} fields, or an image's {{token}} or https address; empty otherwise.",
    ),
    bind: en(["", ...cat.tokens], "The field this layer shows; empty for none."),
    boxes: arr(ref("Box"), SIZES.length),
    style: ref("Style"),
    motion: arr(ref("Motion"), 2),
    showWhen: arr(ref(`ShowWhen_${tag}`), 4),
    fit: opt(ref("Fit")),
    stack: opt(ref("Stack")),
    ...(cat.repeats.length ? { rows: opt(ref(`Rows_${tag}`)) } : {}),
    svg: str(MAX_SVG_BYTES, "Vector layers only: sanitised SVG markup. Empty otherwise."),
  };
  if (canNest) {
    const child = strictLayerDef(defs, tag, cat, level + 1, nesting);
    props.children = arr(ref(child), MAX_PAGE_LAYERS);
  }
  defs[name] = obj(props, "all");
  return name;
}

function strictSchema(scope: Scope, nesting: Nesting): Schema {
  const defs: Record<string, Schema> = {};
  strictCommonDefs(defs);
  const pageEntries = scopePages(scope);
  let pages: Schema;
  if (scope === "whole") {
    const { cat } = pageEntries[0]!;
    strictPageDefs(defs, "all", cat);
    const top = strictLayerDef(defs, "all", cat, 1, nesting);
    pages = arr(
      obj({ page: en(PAGE_KEYS), layers: arr(ref(top), MAX_PAGE_LAYERS) }, "all"),
      PAGE_KEYS.length,
    );
  } else {
    const props: Record<string, Schema> = {};
    for (const { page, cat } of pageEntries) {
      strictPageDefs(defs, page, cat);
      const top = strictLayerDef(defs, page, cat, 1, nesting);
      props[page] = obj({ layers: arr(ref(top), MAX_PAGE_LAYERS) }, "all");
    }
    pages = obj(props, "all");
  }
  return {
    type: "object",
    properties: {
      formatVersion: { type: "integer", const: 2 },
      palette: en(["none", ...PALETTES]),
      sponsorLock: bool(),
      timeline: opt(
        obj(
          {
            durationMs: num(RANGES.timelineMs),
            holdMs: num(RANGES.timelineMs),
            loop: bool(),
          },
          "all",
        ),
      ),
      pages,
    },
    required: ["formatVersion", "palette", "sponsorLock", "timeline", "pages"],
    additionalProperties: false,
    $defs: defs,
  };
}

export function buildSchema(encoding: Encoding, nesting: Nesting, scope: Scope): Schema {
  return encoding === "faithful" ? faithfulSchema(scope, nesting) : strictSchema(scope, nesting);
}

// ── wire form and statistics ─────────────────────────────────────────────

/** Keywords structured outputs don't accept; the spike strips them as the SDK does. */
const UNSUPPORTED = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
  "uniqueItems",
] as const;

/**
 * The schema as sent: unsupported constraints moved into the description, as
 * the SDK's transform does, but `enum`, `const` and `pattern` kept (the SDK's
 * transform moves those into the description too).
 */
export function toWire(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toWire);
  if (typeof schema !== "object" || schema === null) return schema;
  const src = schema as Schema;
  const out: Schema = {};
  const moved: string[] = [];
  for (const [key, value] of Object.entries(src)) {
    if ((UNSUPPORTED as readonly string[]).includes(key))
      moved.push(`${key}: ${JSON.stringify(value)}`);
    else if (key === "minItems" && value !== 0 && value !== 1) moved.push(`minItems: ${value}`);
    else if (key === "properties" || key === "$defs")
      out[key] = Object.fromEntries(
        Object.entries(value as Schema).map(([k, v]) => [k, toWire(v)]),
      );
    else if (key === "enum" || key === "const" || key === "required") out[key] = value;
    else out[key] = toWire(value);
  }
  if (moved.length) {
    const desc = typeof out.description === "string" ? `${out.description}\n\n` : "";
    out.description = `${desc}{${moved.join(", ")}}`;
  }
  return out;
}

export type SchemaStats = {
  bytes: number;
  defs: number;
  refs: number;
  anyOf: number;
  objects: number;
  objectsWithoutAdditionalPropertiesFalse: number;
  properties: number;
  optionalProperties: number;
  unionProperties: number;
  /** `$ref`s that resolve to an `anyOf` definition (the layer union). */
  refsToUnions: number;
  enums: number;
  patterns: number;
  /** Keyword → count the spike moves into descriptions (sent schema). */
  strippedBySpike: Record<string, number>;
  /** Keyword → count the SDK's `transformJSONSchema` would move into descriptions. */
  strippedBySdk: Record<string, number>;
};

function countKeywords(schema: unknown, into: Record<string, number>, inProps = false): void {
  if (Array.isArray(schema)) return schema.forEach((s) => countKeywords(s, into));
  if (typeof schema !== "object" || schema === null) return;
  for (const [key, value] of Object.entries(schema as Schema)) {
    if (inProps) countKeywords(value, into);
    else {
      into[key] = (into[key] ?? 0) + 1;
      countKeywords(value, into, key === "properties" || key === "$defs");
    }
  }
}

function keywordLoss(before: unknown, after: unknown): Record<string, number> {
  const a: Record<string, number> = {};
  const b: Record<string, number> = {};
  countKeywords(before, a);
  countKeywords(after, b);
  const loss: Record<string, number> = {};
  for (const [k, n] of Object.entries(a)) {
    const lost = n - (b[k] ?? 0);
    if (lost > 0 && k !== "description") loss[k] = lost;
  }
  return loss;
}

export function schemaStats(schema: Schema): SchemaStats {
  const wire = toWire(schema);
  const stats: SchemaStats = {
    bytes: JSON.stringify(wire).length,
    defs: Object.keys((schema.$defs as Schema | undefined) ?? {}).length,
    refs: 0,
    anyOf: 0,
    objects: 0,
    objectsWithoutAdditionalPropertiesFalse: 0,
    properties: 0,
    optionalProperties: 0,
    unionProperties: 0,
    refsToUnions: 0,
    enums: 0,
    patterns: 0,
    strippedBySpike: keywordLoss(schema, wire),
    strippedBySdk: keywordLoss(schema, transformJSONSchema(schema as never)),
  };
  const defs = (schema.$defs as Schema | undefined) ?? {};
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object" || node === null) return;
    const s = node as Schema;
    if (typeof s.$ref === "string") {
      stats.refs++;
      const target = defs[s.$ref.replace("#/$defs/", "")] as Schema | undefined;
      if (target && Array.isArray(target.anyOf)) stats.refsToUnions++;
    }
    if (Array.isArray(s.anyOf)) stats.anyOf++;
    if (Array.isArray(s.enum)) stats.enums++;
    if (typeof s.pattern === "string") stats.patterns++;
    if (s.type === "object") {
      stats.objects++;
      if (s.additionalProperties !== false) stats.objectsWithoutAdditionalPropertiesFalse++;
      const props = (s.properties as Schema | undefined) ?? {};
      const required = new Set((s.required as string[] | undefined) ?? []);
      for (const [key, value] of Object.entries(props)) {
        stats.properties++;
        if (!required.has(key)) stats.optionalProperties++;
        const v = value as Schema;
        if (Array.isArray(v.anyOf) || Array.isArray(v.type)) stats.unionProperties++;
        walk(value);
      }
    }
    for (const [key, value] of Object.entries(s))
      if (key !== "properties" && key !== "enum")
        walk(key === "$defs" ? Object.values(value as Schema) : value);
  };
  walk(schema);
  return stats;
}

// ── wire → format v2 ─────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A converted document, plus anything the encoding itself got wrong. */
export type Converted = { doc: unknown; errors: string[] };

const NUMERIC_PROPS = new Set(["fontSize", "fontWeight", "letterSpacing", "radius", "opacity"]);

function one<T>(errors: string[], where: string, v: unknown, map: (x: Raw) => T): T | undefined {
  const items = list(v);
  if (items.length > 1) errors.push(`${where} must hold at most one entry.`);
  const first = items[0];
  return isRaw(first) ? map(first) : undefined;
}

function strictStyle(errors: string[], where: string, v: unknown): StyleV2 | undefined {
  if (!isRaw(v)) return undefined;
  const style: Record<string, unknown> = {};
  for (const entry of list(v.props)) {
    if (!isRaw(entry) || typeof entry.prop !== "string") continue;
    const value = String(entry.value ?? "");
    if (entry.prop in style) errors.push(`${where} sets ${entry.prop} twice.`);
    if (NUMERIC_PROPS.has(entry.prop)) {
      const n = Number(value);
      if (value.trim() === "" || !Number.isFinite(n))
        errors.push(`${where}.${entry.prop} must be a number.`);
      else style[entry.prop] = n;
    } else if (entry.prop === "uppercase") {
      if (value !== "true" && value !== "false")
        errors.push(`${where}.uppercase must be true or false.`);
      else style.uppercase = value === "true";
    } else style[entry.prop] = value;
  }
  const fillOf = (f: Raw) => {
    const fill: Raw = { type: f.type };
    if (f.color) fill.color = f.color;
    if (f.type === "linear") fill.angle = f.angle;
    if (list(f.stops).length) fill.stops = f.stops;
    return fill;
  };
  const fill = one(errors, `${where}.fill`, v.fill, fillOf);
  if (fill) style.fill = fill;
  const textFill = one(errors, `${where}.textFill`, v.textFill, fillOf);
  if (textFill) style.textFill = textFill;
  const border = one(errors, `${where}.border`, v.border, (b) => b);
  if (border) style.border = border;
  const shadow = (s: Raw) => {
    const out: Raw = { x: s.x, y: s.y, blur: s.blur, color: s.color };
    if (s.spread) out.spread = s.spread;
    return out;
  };
  const boxShadow = one(errors, `${where}.boxShadow`, v.boxShadow, shadow);
  if (boxShadow) style.boxShadow = boxShadow;
  const textShadow = one(errors, `${where}.textShadow`, v.textShadow, shadow);
  if (textShadow) style.textShadow = textShadow;
  const filter = one(errors, `${where}.filter`, v.filter, (f) => {
    const out: Raw = { preset: f.preset };
    if (f.preset === "duotone") Object.assign(out, { dark: f.dark, light: f.light });
    if (f.preset === "blur") out.amount = f.amount;
    return out;
  });
  if (filter) style.filter = filter;
  return Object.keys(style).length ? (style as StyleV2) : undefined;
}

function strictLayer(
  errors: string[],
  v: unknown,
  where: string,
): (LayerV2 & { parentId?: string }) | null {
  if (!isRaw(v)) {
    errors.push(`${where} must be an object.`);
    return null;
  }
  const layer: Raw = { id: v.id, kind: v.kind };
  const at = `${where} (${String(v.id)})`;
  if (v.name) layer.name = v.name;
  if (v.hidden === true) layer.hidden = true;
  if (v.content) layer.content = v.content;
  if (v.bind) layer.bind = v.bind;
  const geometry: Raw = {};
  for (const box of list(v.boxes)) {
    if (!isRaw(box) || typeof box.size !== "string") continue;
    if (box.size in geometry) errors.push(`${at} has two boxes for ${box.size}.`);
    const b: Raw = { x: box.x, y: box.y, w: box.w, h: box.h };
    if (box.rotate) b.rotate = box.rotate;
    geometry[box.size] = b;
  }
  layer.geometry = geometry;
  const sizes = SIZES.filter((s) => s in geometry);
  if (sizes.length < SIZES.length) layer.sizes = sizes;
  const style = strictStyle(errors, `${at}.style`, v.style);
  if (style) layer.style = style;
  const motion: Raw = {};
  for (const m of list(v.motion)) {
    if (!isRaw(m) || (m.phase !== "in" && m.phase !== "loop")) continue;
    if (m.phase in motion) errors.push(`${at} has two ${m.phase} motions.`);
    if (m.phase === "in") {
      const entry: Raw = { preset: m.preset };
      if (m.delayMs) entry.delayMs = m.delayMs;
      if (m.durationMs) entry.durationMs = m.durationMs;
      if (m.easing && m.easing !== "ease") entry.easing = m.easing;
      motion.in = entry;
    } else {
      const entry: Raw = { preset: m.preset };
      if (m.periodMs) entry.periodMs = m.periodMs;
      if (m.delayMs) entry.delayMs = m.delayMs;
      motion.loop = entry;
    }
  }
  if (Object.keys(motion).length) layer.motion = motion;
  const showWhen: Raw = {};
  for (const c of list(v.showWhen)) {
    if (!isRaw(c) || typeof c.test !== "string") continue;
    if (c.test in showWhen) errors.push(`${at} tests ${c.test} twice.`);
    if (c.test === "field") showWhen.field = c.field;
    else showWhen[c.test] = c.value;
  }
  if (Object.keys(showWhen).length) layer.showWhen = showWhen;
  const fit = one(errors, `${at}.fit`, v.fit, (f) => f);
  if (fit) layer.fit = fit;
  const stack = one(errors, `${at}.stack`, v.stack, (s) => s);
  if (stack) layer.stack = stack;
  const rows = one(errors, `${at}.rows`, v.rows, (r) => {
    const out: Raw = { repeat: r.repeat, rowHeight: r.rowHeight };
    if (r.gap) out.gap = r.gap;
    if (r.columns && r.columns !== 1) out.columns = r.columns;
    if (r.columnGap) out.columnGap = r.columnGap;
    out.cells = list(r.cells).map((c, i) => {
      if (!isRaw(c)) return c;
      const cell: Raw = { field: c.field, x: c.x, w: c.w };
      if (c.y) cell.y = c.y;
      if (c.h !== undefined && c.h !== 100) cell.h = c.h;
      if (c.show && c.show !== "text") cell.show = c.show;
      const s = strictStyle(errors, `${at}.rows.cells[${i}].style`, c.style);
      if (s) cell.style = s;
      return cell;
    });
    const variants: Record<string, Record<string, StyleV2>> = {};
    for (const entry of list(r.variants)) {
      if (!isRaw(entry) || typeof entry.variant !== "string" || typeof entry.field !== "string")
        continue;
      const s = strictStyle(errors, `${at}.rows.variants`, entry.style);
      if (s) (variants[entry.variant] ??= {})[entry.field] = s;
    }
    if (Object.keys(variants).length) out.variants = variants;
    return out;
  });
  if (rows) layer.rows = rows;
  if (v.svg) layer.svg = v.svg;
  if (Array.isArray(v.children) && v.children.length) {
    layer.children = v.children
      .map((c, i) => strictLayer(errors, c, `${at}.children[${i}]`))
      .filter((c): c is LayerV2 => c !== null);
  }
  if (typeof v.parentId === "string" && v.parentId) layer.parentId = v.parentId;
  return layer as LayerV2 & { parentId?: string };
}

/** Rebuild a flat page's tree from `parentId`, reporting broken links. */
function nestFlat(
  errors: string[],
  page: string,
  flat: Array<LayerV2 & { parentId?: string }>,
): LayerV2[] {
  const byId = new Map<string, LayerV2 & { parentId?: string }>();
  for (const layer of flat) if (typeof layer.id === "string") byId.set(layer.id, layer);
  const roots: LayerV2[] = [];
  let dropped = 0;
  for (const layer of flat) {
    const parentId = layer.parentId;
    delete layer.parentId;
    if (!parentId) {
      roots.push(layer);
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent || parent.kind !== "group") {
      dropped++;
      errors.push(
        parent
          ? `Page ${page}: ${layer.id}'s parent ${parentId} isn't a group.`
          : `Page ${page}: ${layer.id} names a parent that doesn't exist (${parentId}).`,
      );
    } else (parent.children ??= []).push(layer);
  }
  // A cycle leaves its layers unreachable from the roots.
  const seen = new Set<LayerV2>();
  const visit = (l: LayerV2) => {
    if (seen.has(l)) return;
    seen.add(l);
    l.children?.forEach(visit);
  };
  roots.forEach(visit);
  if (seen.size + dropped < flat.length)
    errors.push(`Page ${page}: some layers form a parent cycle.`);
  return roots;
}

/** A strict-encoded document (nested or flat) as a format v2 document. */
export function fromStrict(wire: unknown, nesting: Nesting): Converted {
  const errors: string[] = [];
  if (!isRaw(wire)) return { doc: wire, errors: ["The document must be an object."] };
  const doc: Raw = { formatVersion: wire.formatVersion };
  if (wire.palette && wire.palette !== "none") doc.palette = wire.palette;
  if (wire.sponsorLock === true) doc.sponsorLock = true;
  const timeline = one(errors, "timeline", wire.timeline, (t) => t);
  if (timeline) doc.timeline = timeline;
  const entries: Array<[string, unknown]> = Array.isArray(wire.pages)
    ? wire.pages.map((p) => [isRaw(p) ? String(p.page) : "?", isRaw(p) ? p.layers : undefined])
    : isRaw(wire.pages)
      ? Object.entries(wire.pages).map(([k, p]) => [k, isRaw(p) ? p.layers : undefined])
      : [];
  const pages: Raw = {};
  for (const [page, layers] of entries) {
    if (page in pages) errors.push(`Page ${page} appears twice.`);
    const converted = list(layers)
      .map((l, i) => strictLayer(errors, l, `Page ${page} layer ${i + 1}`))
      .filter((l): l is LayerV2 & { parentId?: string } => l !== null);
    pages[page] = { layers: nesting === "flat" ? nestFlat(errors, page, converted) : converted };
  }
  doc.pages = pages;
  return { doc: doc as TemplateDocumentV2, errors };
}

/** A faithful-encoded flat document: the same layers, nested by `parentId`. */
export function fromFaithful(wire: unknown, nesting: Nesting): Converted {
  const errors: string[] = [];
  if (nesting === "nested" || !isRaw(wire) || !isRaw(wire.pages)) return { doc: wire, errors };
  for (const [page, p] of Object.entries(wire.pages))
    if (isRaw(p) && Array.isArray(p.layers))
      p.layers = nestFlat(errors, page, p.layers as Array<LayerV2 & { parentId?: string }>);
  return { doc: wire, errors };
}
