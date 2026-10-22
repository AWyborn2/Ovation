/**
 * Library elements (editable-elements plan, Stream D): reusable decorations
 * shared by every club, in the shared `library_elements` table.
 *
 * An element's document is a fragment of format v2 layers, not a template:
 * `{ formatVersion: 2, layers, palettes? }`. Its layers keep the geometry they
 * had on the card they came from, per size, so a frame or a band lands where
 * it was designed to sit. Inserting copies them into the card as native layers
 * (E2); nothing links back to the element afterwards. `elementDocumentErrors`
 * (validate.ts) checks a fragment.
 */
import type { DerivedPalette, TemplateLayerV2 } from "./format";

/** The Elements panel's categories, in the panel's order. */
export const ELEMENT_CATEGORIES = [
  "frames",
  "bands",
  "badges",
  "rules",
  "glows",
  "crest-frames",
  "sponsor-strips",
  "data-blocks",
] as const;
export type ElementCategory = (typeof ELEMENT_CATEGORIES)[number];

export const ELEMENT_CATEGORY_LABELS: Record<ElementCategory, string> = {
  frames: "Frames",
  bands: "Bands and slashes",
  badges: "Badges and chips",
  rules: "Rules and dividers",
  glows: "Glows and textures",
  "crest-frames": "Crest frames",
  "sponsor-strips": "Sponsor strips",
  "data-blocks": "Data blocks",
};

export const isElementCategory = (v: unknown): v is ElementCategory =>
  (ELEMENT_CATEGORIES as readonly unknown[]).includes(v);

/** A library element's layers: a fragment of a v2 page. */
export type ElementDocument = {
  formatVersion: 2;
  layers: TemplateLayerV2[];
  /** The derived palettes the layers' colours use, as on a template. */
  palettes?: DerivedPalette[];
};

/** At most this many layers (children included) in one element. */
export const MAX_ELEMENT_LAYERS = 120;

/** An element's name and tags are short labels. */
export const MAX_ELEMENT_NAME = 60;
export const MAX_ELEMENT_TAGS = 12;
export const MAX_ELEMENT_TAG = 24;
