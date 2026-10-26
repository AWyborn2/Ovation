/**
 * Template format v2 (ADR-011 §1): one document format for every template —
 * the starters, Ovation's converted looks, AI drafts, Figma imports and club
 * copies.
 *
 * A v2 document holds pages (a Match Day template has its fixture, title,
 * day and sponsors pages), and its layers can be stack groups, vectors, take
 * show-when conditions, a text fit, a richer style and motion presets. It is
 * a superset of v1: a stored v1 `{ layers }` reads as the kind's primary page
 * (`normalise.ts`), and stored documents are never rewritten.
 *
 * Types and closed lists only. Validation is `validate.ts` (L1-B), rendering
 * is the web renderer (`pack-render`). Every list here is the one the
 * validator, the JSON Schema and the editors read, so a value is added in one
 * place.
 */
import type { LayerBox, RowsSpec, TemplateSize, TemplateTextStyle } from "./document";

/** The format version a v2 document declares. A document without it is v1. */
export const FORMAT_VERSION = 2 as const;

// ── Pages ───────────────────────────────────────────────────────────────────

/**
 * A template's pages. `card` is the single page of most kinds; Match Day has
 * `fixture`, `title`, `day` (the junior day slide) and `sponsors`; Match
 * Summary has `result` and `day`; Team List has `team` (`pages.ts`).
 */
export const PAGE_KEYS = ["card", "title", "fixture", "day", "sponsors", "result", "team"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

// ── Colours, fills and effects ──────────────────────────────────────────────

/**
 * The colour tokens a document may name as `var(--token)`: the card's own
 * palette (`--gold` is the accent), and the derived palettes Club Kit
 * (`--ck-*`), Duotone (`--dt-*`) and the match palette (`--mt-*`) emit. A colour is a hex or one of these.
 */
export const COLOUR_TOKENS = ["--gold", "--panel", "--panel-2", "--ink", "--accent-ink"] as const;
export type ColourToken = (typeof COLOUR_TOKENS)[number];

/** Derived palettes a document can use; the renderer emits a palette's variables when used. */
export const DERIVED_PALETTES = ["club-kit", "duotone", "match"] as const;
export type DerivedPalette = (typeof DERIVED_PALETTES)[number];

/** The variable prefix each derived palette emits (`var(--ck-stage)`, `var(--dt-p)`). */
export const DERIVED_PALETTE_PREFIX: Record<DerivedPalette, string> = {
  "club-kit": "--ck-",
  duotone: "--dt-",
  // Both teams' colours on a match card (`match-palette.ts`).
  match: "--mt-",
};

/** A colour: `#rgb`, `#rrggbb`, `#rrggbbaa`, or `var(--token)`. */
export type TemplateColour = string;

/** A gradient stop: a colour at a position (0–100 % along the gradient). */
export type GradientStop = { color: TemplateColour; at?: number };

export type LinearGradient = {
  type: "linear";
  /** Degrees, CSS convention (0 = to top, 90 = to right). Default 180. */
  angle?: number;
  stops: GradientStop[];
};

export type RadialGradient = {
  type: "radial";
  shape?: "circle" | "ellipse";
  /** Centre, in percent of the box. Default 50 %, 50 %. */
  at?: { x: number; y: number };
  stops: GradientStop[];
};

export type TemplateGradient = LinearGradient | RadialGradient;

/** A fill: a solid colour or a gradient. */
export type TemplateFill = TemplateColour | TemplateGradient;

export const BORDER_STYLES = ["solid", "dashed", "dotted"] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

export const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

/**
 * A border; width in percent of the artboard width, so it scales like text.
 * `sides` draws it on those sides only (a dashed rule above a footer);
 * absent means all four.
 */
export type TemplateBorder = {
  width: number;
  color: TemplateColour;
  style?: BorderStyle;
  sides?: BorderSide[];
};

/** A box shadow; offsets, blur and spread in percent of the artboard width. */
export type TemplateBoxShadow = {
  x: number;
  y: number;
  blur: number;
  spread?: number;
  color: TemplateColour;
  inset?: boolean;
};

/** A text shadow (glows, drop shadows); lengths in percent of the artboard width. */
export type TemplateTextShadow = { x: number; y: number; blur: number; color: TemplateColour };

/**
 * A drop shadow that follows what the layer draws (a clipped band, an SVG, a
 * logo's outline), not its box: Neon Night's and Sunset's glows. Lengths in
 * percent of the artboard width.
 */
export type TemplateDropShadow = { x: number; y: number; blur: number; color: TemplateColour };

/**
 * An outline round the text's glyphs; width in percent of the artboard width.
 * Outlined text with no fill (Bold Type's watermark numbers) sets
 * `color: "transparent"`.
 */
export type TemplateTextStroke = { width: number; color: TemplateColour };

/** A slant, in degrees along each axis (CSS `skew()`): Broadcast's slashes. */
export type TemplateSkew = { x?: number; y?: number };

/** The blend modes a layer may use (a closed list: CSS `mix-blend-mode`). */
export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** The most a blur filter may blur, in pixels at native card size. */
export const MAX_BLUR_PX = 20;

/**
 * Photo filter presets. `duotone` maps the photo onto two colours (Duotone's
 * finish, built from the club's colours when they are tokens); `grayscale`
 * takes an amount from 0 to 1; `blur` at most `MAX_BLUR_PX`.
 */
export type TemplateFilter =
  | { preset: "duotone"; dark: TemplateColour; light: TemplateColour }
  | { preset: "grayscale"; amount?: number }
  | { preset: "blur"; px: number }
  | { preset: "brightness"; amount: number };
export const FILTER_PRESETS = ["duotone", "grayscale", "blur", "brightness"] as const;

/**
 * A layer's clip: the polygon its box is cut to, as points in percent of the
 * box (CSS `clip-path: polygon()`): angled bands and cut corners.
 */
export type TemplateClip = { polygon: Array<[number, number]> };
/** The most points a clip polygon may have. */
export const MAX_CLIP_POINTS = 32;

/** A texture drawn over a layer: film grain or a halftone screen. */
export type TemplateOverlay = { kind: "grain" | "halftone"; opacity?: number; scale?: number };
export const OVERLAY_KINDS = ["grain", "halftone"] as const;

/**
 * A v2 layer's style: v1's text style (colour, font, size, alignment,
 * radius, opacity, a solid `background`) plus fills, borders, shadows,
 * blending and photo filters. `fill` wins over `background` when both are set.
 */
export type TemplateStyleV2 = TemplateTextStyle & {
  /** The box's fill: solid or a gradient. */
  fill?: TemplateFill;
  /** Text painted with a fill (background-clip: text), as the foil numbers are. */
  textFill?: TemplateFill;
  border?: TemplateBorder;
  boxShadow?: TemplateBoxShadow[];
  textShadow?: TemplateTextShadow[];
  blend?: BlendMode;
  /** Photo and image layers only. */
  filter?: TemplateFilter[];
  overlay?: TemplateOverlay;
  /** Line height, as a multiple of the font size (v1 text is 1.05). */
  lineHeight?: number;
  /** The polygon the layer's box is cut to. */
  clip?: TemplateClip;
  /** Text layers: an outline round the glyphs. */
  textStroke?: TemplateTextStroke;
  /** The layer slanted about its centre (after its rotation). */
  skew?: TemplateSkew;
  /** Blurs what's behind the layer (frosted glass), in pixels at native card size. */
  backdropBlur?: number;
  /** Shadows that follow what the layer draws, clip included. */
  dropShadow?: TemplateDropShadow[];
  /** Text in the family's italic (the scoreboards' type). */
  italic?: boolean;
  /**
   * Text set wider or narrower (CSS `font-stretch`), in percent of the
   * family's normal width: Archivo at 125%. A family without a width axis
   * draws at its normal width.
   */
  stretch?: number;
};

/**
 * The style settings only format v2 holds (v1's are `TemplateTextStyle`'s):
 * the validator accepts them on v2 layers only, and the editor stores a
 * document that uses any of them as v2.
 */
export const V2_STYLE_KEYS = [
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
  "textStroke",
  "skew",
  "backdropBlur",
  "dropShadow",
  "italic",
  "stretch",
] as const satisfies ReadonlyArray<keyof TemplateStyleV2>;

// ── Layout, conditions and fit ──────────────────────────────────────────────

/** How deep stack groups may nest. */
export const MAX_STACK_DEPTH = 4;

export const STACK_DIRECTIONS = ["column", "row"] as const;
export const STACK_ALIGNS = ["start", "center", "end", "stretch"] as const;
export const STACK_JUSTIFIES = [
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
] as const;

/**
 * A group's stack: its children laid out in a column or a row inside the
 * group's box (CSS flex), so a hidden, condition-false or empty child takes
 * no space. Children keep only their width and height.
 */
export type StackSpec = {
  direction: (typeof STACK_DIRECTIONS)[number];
  /** Gap between children, in percent of the artboard width. */
  gap?: number;
  /** Cross-axis alignment. Default `start`. */
  align?: (typeof STACK_ALIGNS)[number];
  /** Main-axis distribution. Default `start`. */
  justify?: (typeof STACK_JUSTIFIES)[number];
};

/**
 * When a layer shows. Every condition set must hold.
 *
 * - `field`: a page token (`roundLabel`, `opposition.logo`) is visible and has
 *   a value: the club's content choices show it and the card has it.
 * - `photo`: the card has (true) or lacks (false) its photo; `photo: false`
 *   is the "or no photo" alternative (Duotone's logo art).
 * - `sponsors`: the card has (true) or lacks (false) sponsor logos.
 * - `junior`: a junior (true) or senior (false) card.
 *
 * Conditions are read after the render path's junior and private-player
 * rules, so a condition never reveals what the render path withholds.
 */
export type ShowWhen = { field?: string; photo?: boolean; sponsors?: boolean; junior?: boolean };

/**
 * How live text fits its box: shrink to `minScale` of its designed size
 * (default `MIN_TEXT_FIT`), then wrap to `maxLines`, then end in an ellipsis
 * when `ellipsis` is set; text that still overflows is a layout warning.
 */
export type TextFit = { minScale?: number; maxLines?: 1 | 2; ellipsis?: boolean };

// ── Motion ──────────────────────────────────────────────────────────────────

/** Entrance presets (v1's `animation` kinds). */
export const MOTION_IN_PRESETS = ["rise", "fade", "pop"] as const;
export type MotionInPreset = (typeof MOTION_IN_PRESETS)[number];

/** Looping presets: `pulse` is the LIVE dot (`hhPulse`), `shine` the foil sweep (`hhShine`). */
export const MOTION_LOOP_PRESETS = ["pulse", "shine"] as const;
export type MotionLoopPreset = (typeof MOTION_LOOP_PRESETS)[number];

export const MOTION_EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;
export type MotionEasing = (typeof MOTION_EASINGS)[number];

/**
 * A layer's motion. R3 adds `out` and keyframe tracks as new optional
 * fields, so no document migrates.
 */
export type LayerMotion = {
  in?: { preset: MotionInPreset; delayMs?: number; durationMs?: number; easing?: MotionEasing };
  loop?: { preset: MotionLoopPreset; periodMs?: number; delayMs?: number };
};

/** v1's entrance animation; `normalise()` reads it as `motion.in`. */
export type LegacyLayerAnimation = { kind: "none" | MotionInPreset; delayMs?: number };

/** The document's clip timing. Optional in R1; R3's editor fills it. */
export type TemplateTimeline = { durationMs?: number; holdMs?: number; loop?: boolean };

// ── Layers ──────────────────────────────────────────────────────────────────

/** A photo's focal point (percent) and zoom, per size. */
export type TemplatePhotoAdjust = { focalX: number; focalY: number; zoom: number };

/** What every v2 layer has. */
export type LayerCommon = {
  id: string;
  /** Display name in the editor's layers drawer. */
  name?: string;
  /** Hidden layers stay in the document but don't render. */
  hidden?: boolean;
  /** Locked layers can't be selected on the canvas or deleted. */
  locked?: boolean;
  /** Layers sharing this id select and move together in the editor (not a stack). */
  group?: string;
  /**
   * Layers sharing a link are one element drawn per size, each on its own
   * sizes with that size's font size, corners or clip (a converted pack's
   * copies): the editor applies an edit made to one to the others.
   */
  link?: string;
  /**
   * The element's design signature (`layerSignature`): the same piece of a
   * design, on any page, kind or look, has the same one. Bundles carry it
   * so the element library finds each distinct decoration once.
   */
  sig?: string;
  /** The sizes this layer is on; absent means every size. */
  sizes?: TemplateSize[];
  /**
   * Per-size boxes in percent of the artboard, for every layer, nested or
   * not: moving a layer into or out of a group never moves it.
   */
  geometry: Partial<Record<TemplateSize, LayerBox>>;
  /** When each size's box was last edited (ms since epoch). */
  editedAt?: Partial<Record<TemplateSize, number>>;
  style?: TemplateStyleV2;
  showWhen?: ShowWhen;
  motion?: LayerMotion;
  /** v1 only; `normalise()` reads it as `motion.in`. */
  animation?: LegacyLayerAnimation;
};

/** Text: literal text with `{{token}}`s, or one live field (`bind`). */
export type TextLayerV2 = LayerCommon & {
  kind: "text";
  content?: string;
  bind?: string;
  fit?: TextFit;
};

/** A box painted with its style (fill, border, shadow). */
export type ShapeLayerV2 = LayerCommon & { kind: "shape" };

/** An image: a `{{token}}` (club logo, ground photo, a crest) or an https / library URL. */
export type ImageLayerV2 = LayerCommon & { kind: "image"; content?: string };

/** The card's photo; never drawn on a junior card without the server's marker. */
export type PhotoLayerV2 = LayerCommon & {
  kind: "photo";
  photo?: Partial<Record<TemplateSize, TemplatePhotoAdjust>>;
};

/** One styled row per data row of a repeat (`rows`, `players`, `dayRows`, `sponsors`…). */
export type RowsLayerV2 = LayerCommon & { kind: "rows"; rows: RowsSpec };

/** A Studio library element (`lib/studio-elements`). */
export type ElementLayerV2 = LayerCommon & {
  kind: "element";
  element: { id: string; props?: Record<string, string> };
};

export type StickerLayerV2 = LayerCommon & { kind: "sticker"; content?: string };

export type MedalLayerV2 = LayerCommon & { kind: "medal"; content?: string; sub?: string };

/** Sanitised SVG markup (`svg` root); fills and strokes may be colour tokens. */
export type VectorLayerV2 = LayerCommon & { kind: "vector"; svg: string };

/**
 * A group of layers, drawn in its children's order. With `stack`, the
 * children are laid out inside the group's box; without it, each child sits
 * at its own box. Groups nest to `MAX_STACK_DEPTH`.
 */
export type GroupLayerV2 = LayerCommon & {
  kind: "group";
  stack?: StackSpec;
  children: TemplateLayerV2[];
};

export type TemplateLayerV2 =
  | TextLayerV2
  | ShapeLayerV2
  | ImageLayerV2
  | PhotoLayerV2
  | RowsLayerV2
  | ElementLayerV2
  | StickerLayerV2
  | MedalLayerV2
  | VectorLayerV2
  | GroupLayerV2;

export type TemplateLayerKindV2 = TemplateLayerV2["kind"];

/** Every layer kind a v2 document may hold. */
export const LAYER_KINDS_V2: readonly TemplateLayerKindV2[] = [
  "text",
  "shape",
  "image",
  "photo",
  "rows",
  "element",
  "sticker",
  "medal",
  "vector",
  "group",
];

// ── Documents ───────────────────────────────────────────────────────────────

/** One page: its layers, back to front. */
/**
 * One page of a template: its layers, and the colour behind them (a hex, or a
 * card colour token such as `var(--gold)`). Without one the page sits on the
 * club's stage colour, as every page did before page colours.
 */
export type TemplatePage = { layers: TemplateLayerV2[]; background?: string };

/** A template document, format v2. */
export type TemplateDocumentV2 = {
  formatVersion: typeof FORMAT_VERSION;
  pages: Partial<Record<PageKey, TemplatePage>>;
  timeline?: TemplateTimeline;
  /** Derived palettes the document declares (it may also just use their variables). */
  palettes?: DerivedPalette[];
  /** Keep the sponsor strip on the card: its slots can't be hidden while on. */
  sponsorLock?: boolean;
};

/** A stored v1 document: one page of layers (the pilot's templates, the starters). */
export type TemplateDocumentV1 = {
  layers?: Array<{ id: string; kind: string } & Record<string, unknown>>;
  sponsorLock?: boolean;
};

/** Whether a stored document is format v2 (declares `formatVersion: 2` and has pages). */
export function isDocumentV2(doc: unknown): doc is TemplateDocumentV2 {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return false;
  const d = doc as { formatVersion?: unknown; pages?: unknown };
  return (
    d.formatVersion === FORMAT_VERSION &&
    typeof d.pages === "object" &&
    d.pages !== null &&
    !Array.isArray(d.pages)
  );
}

/** Whether a layer is a group (has children). */
export function isGroupLayer(layer: { kind: string }): layer is GroupLayerV2 {
  return layer.kind === "group";
}

/** Every layer of a list, groups' children included, depth first in document order. */
export function flattenLayers(layers: readonly TemplateLayerV2[]): TemplateLayerV2[] {
  const out: TemplateLayerV2[] = [];
  const walk = (list: readonly TemplateLayerV2[]) => {
    for (const layer of list) {
      out.push(layer);
      if (isGroupLayer(layer) && Array.isArray(layer.children)) walk(layer.children);
    }
  };
  walk(layers);
  return out;
}
