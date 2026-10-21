/**
 * The pack converter's capture format (social template library, ADR-011 §5).
 *
 * The converter reads each code-built pack through its RENDERED DOM, never its
 * source: the card render harness mounts a pack card for one input and size
 * and records every element (tag, slot attributes, box, computed styles,
 * pseudo-elements, text runs). This module is the contract between that
 * capture (web app, dev and CI builds only) and the converter scripts that
 * read it (`scripts/src/convert-pack.ts`, then the mapping to template
 * layers). Pure data and types: no DOM, no Node.
 *
 * Three kinds of render make a pack's captures:
 *   - sentinel content in palette A: every text field shows a marker naming
 *     its token (`[[playerName]]`), so text maps back to `{{tokens}}`;
 *   - the same content in palette B: a colour that changes with the palette
 *     is a token, one that doesn't is the pack's own literal;
 *   - worst-case content in palette A: realistic long names and full rows,
 *     for the boxes a layer needs.
 */

/** Bumped when a capture's shape changes, so a reader can refuse an old file. */
export const PACK_CAPTURE_FORMAT = "ovation-pack-capture/1";

export const CAPTURE_SIZES = ["square", "portrait", "story", "landscape"] as const;
export type CaptureSize = (typeof CAPTURE_SIZES)[number];

/** Sentinel markers (text maps to tokens) or worst-case content (boxes). */
export type CaptureContent = "sentinel" | "worst";

/**
 * How much of each element a capture records:
 *   - `full`: everything (the sentinel run in palette A);
 *   - `colours`: boxes plus colour-bearing styles only (palette B);
 *   - `boxes`: boxes and text runs only (worst-case content).
 */
export type CaptureDetail = "full" | "colours" | "boxes";

export type ColourMode = "club" | "pack";

// ---------------------------------------------------------------------------
// Sentinel markers
// ---------------------------------------------------------------------------

/** The text a field shows in a sentinel render: its token key, bracketed. */
export function fieldMarker(key: string): string {
  return `[[${key}]]`;
}

/** Finds field markers in captured text; group 1 is the token key. */
export const FIELD_MARKER_RE = /\[\[([A-Za-z0-9_.]+)\]\]/g;

/** The token keys whose markers appear in `text`, in order, as written there. */
export function markersIn(text: string): string[] {
  return [...text.matchAll(FIELD_MARKER_RE)].map((m) => m[1]!);
}

/**
 * The field a marker found in text names. Matched without case: pack code
 * may re-case a value after binding (Duotone's home/away chip prints
 * `[[homeaway]]`), and two field keys never differ by case alone.
 */
export function markerField(found: string, fields: Iterable<string>): string | undefined {
  const lower = found.toLowerCase();
  for (const key of fields) if (key.toLowerCase() === lower) return key;
  return undefined;
}

// ---------------------------------------------------------------------------
// Sentinel palettes
// ---------------------------------------------------------------------------

/**
 * A sentinel club brand. Both palettes use colours no pack prints as a
 * literal, and they differ in every channel, so a computed colour that is the
 * same in both captures is the pack's own and one that moves is a token. The
 * capture records each render's resolved tokens (`rootVars`), which is what a
 * colour is matched against: derived tokens (`--panel-2`, `--ck-*`, `--dt-*`,
 * colour-mix stages) are only known after the pack resolves them.
 */
export interface SentinelPalette {
  id: "A" | "B";
  label: string;
  brand: {
    primaryColour: string;
    backgroundColour: string;
    juniorsColour: string;
  };
}

export const SENTINEL_PALETTES: readonly SentinelPalette[] = [
  {
    id: "A",
    label: "Sentinel A (crimson on cobalt)",
    brand: { primaryColour: "#D3175A", backgroundColour: "#1F5FB4", juniorsColour: "#0E8C7A" },
  },
  {
    id: "B",
    label: "Sentinel B (lime on plum)",
    brand: { primaryColour: "#7BC943", backgroundColour: "#8A2F9E", juniorsColour: "#C7661B" },
  },
];

export type SentinelPaletteId = SentinelPalette["id"];

// ---------------------------------------------------------------------------
// The capture plan: what a pack can render
// ---------------------------------------------------------------------------

/**
 * One page of one template, as the converter will write it: a pack design for
 * a kind and page, with the branch it renders (preset, photo, sponsors). The
 * plan lists every variant a pack has; each is captured at every size.
 */
export interface CaptureVariant {
  /** Stable and file-safe: `<kind>.<page>[.<design>][.<preset>][.no-photo][.no-sponsors]`. */
  id: string;
  /** The template kind (`TEMPLATE_CARD_KINDS`, plus `results` for the Results set). */
  kind: string;
  /** The v2 page key (`card`, `fixture`, `title`, `day`, `sponsors`, `result`, `team`). */
  page: string;
  /** The pack design behind it (`designKey`), or the carousel layout's name. */
  design: string;
  /** One of several designs for its kind, asked for by name (`input.design`). */
  named?: boolean;
  /** A carousel slide (`carouselContent`) rather than the single card. */
  slide: boolean;
  /** A design that is one of several for its kind: its category preset or `cover`. */
  role?: string;
  /** The content preset, for the content kinds (ADR-010). */
  preset?: "minimal" | "standard" | "full";
  /** The card shows a photo (when the design has a photo slot). */
  photo: boolean;
  sponsorsOn: boolean;
  junior: boolean;
  /**
   * The renders this variant needs: the default branch takes all three, a
   * photo or sponsors branch only the full sentinel capture.
   */
  renders: ReadonlyArray<{
    content: CaptureContent;
    palette: SentinelPaletteId;
    detail: CaptureDetail;
  }>;
}

/** What `capture` renders: a card input with its tenant data and flags. */
export interface CaptureRender {
  input: Record<string, unknown>;
  /** `PackCardData`: the sentinel brand, logos, sponsors, photo and colour mode. */
  data: Record<string, unknown>;
  sponsorsOn: boolean;
  junior: boolean;
  /** Replace every non-empty text field with its marker (sentinel content). */
  markFields: boolean;
  detail: CaptureDetail;
}

// ---------------------------------------------------------------------------
// The capture itself
// ---------------------------------------------------------------------------

/** A box in card pixels, relative to the card root's top-left corner. */
export interface CapturedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A run of text directly inside an element, with the box its glyphs cover. */
export interface CapturedText {
  /** The DOM text (before `text-transform`), whitespace collapsed. */
  text: string;
  box: CapturedBox;
  /** Lines the run wraps to. */
  lines: number;
}

export interface CapturedElement {
  /** Pre-order index; the card root is 0. */
  id: number;
  parent: number | null;
  tag: string;
  /** Every `data-*` attribute, `data-` dropped (`slot`, `repeat`, `fit`, `fitRow`, `dropIfField`, …). */
  data?: Record<string, string>;
  /** Class names, when the element has any. */
  className?: string;
  /**
   * Custom properties the element declares inline, as written (`var()` kept):
   * how a pack derives a colour from a token (Gold Foil's foil ramp, `--ck-*`).
   */
  vars?: Record<string, string>;
  /** The visual box (transforms included). */
  box: CapturedBox;
  /** The untransformed CSS size (`offsetWidth` / `offsetHeight`), when it differs from `box`. */
  size?: { w: number; h: number };
  /**
   * Computed styles that matter: a non-inherited property when it differs
   * from the tag's default, an inherited one when it differs from the
   * parent's. Text-bearing elements always carry their full text styles.
   */
  style: Record<string, string>;
  before?: Record<string, string>;
  after?: Record<string, string>;
  text?: CapturedText[];
  /** `<img>` source (long data URLs are shortened). */
  src?: string;
  /** An inline `<svg>`'s markup; its children are not listed separately. */
  svg?: string;
  /** `display: none` or `visibility: hidden`; a `display: none` subtree is not walked. */
  hidden?: "display" | "visibility";
}

export interface PackCapture {
  format: typeof PACK_CAPTURE_FORMAT;
  packId: string;
  size: CaptureSize;
  native: { w: number; h: number };
  colourMode: ColourMode;
  detail: CaptureDetail;
  /** The card root's custom properties as written (`--gold`, `--panel`, `--ink`, `--ck-*`, …). */
  rootVars: Record<string, string>;
  /**
   * The colour each of those resolves to, in the form computed styles use
   * (`rgb(…)`): what a captured colour is compared with to find its token.
   */
  rootColours: Record<string, string>;
  /** The tokens the pack resolved (`accent`, `panel`, `ink`, `textLight`, `displayFont`). */
  tokens: Record<string, string>;
  /** Each text field's bound value, before markers (sample defaults included). */
  fields: Record<string, string>;
  /** The marker each field showed instead (sentinel content only). */
  markers: Record<string, string>;
  /** Bound repeat rows per repeat key, as the template expanded them. */
  rows: Record<string, Array<{ variant?: string; values: Record<string, string> }>>;
  /** Bound image slots (slot key → shortened URL). */
  images: Record<string, string>;
  /** `@keyframes` the card's elements name (`hhPulse`, `hhShine`, …), as CSS text. */
  keyframes: Record<string, string>;
  /** Font families that failed to load (the capture still ran). */
  fontFailures: string[];
  elements: CapturedElement[];
  /** Problems worth a look: images that failed, unsubstituted placeholders. */
  warnings: string[];
  /** Milliseconds the render and the walk took. */
  ms: number;
}
