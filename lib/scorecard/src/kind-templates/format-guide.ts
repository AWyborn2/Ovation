/**
 * The template format, written for the AI designer's prompt (ADR-011 §8;
 * T1.11 as the structured-output spike decided, docs/plans/2026-10-21-
 * template-schema-spike.md).
 *
 * Structured outputs can't take the format's schema, so the model reads the
 * rules as prose and `validate.ts` checks what it writes. Every closed list
 * and limit here is read from `format.ts`, `validate.ts` and `svg.ts`, so the
 * rules the model reads are the rules it is checked against; a test fails if
 * one goes missing. The kind's pages and fields come from `page-tokens.ts`.
 *
 * Pure text: L7's prompt (`api-server/src/lib/template-ai/prompt.ts`) puts
 * `templateFormatGuide()` in its cached system block and `pageCatalogueGuide`
 * in the kind's block.
 */
import { TEMPLATE_SIZES, TEMPLATE_SIZE_ORDER } from "./document";
import {
  BLEND_MODES,
  BORDER_STYLES,
  COLOUR_TOKENS,
  DERIVED_PALETTE_PREFIX,
  DERIVED_PALETTES,
  FILTER_PRESETS,
  FORMAT_VERSION,
  LAYER_KINDS_V2,
  MAX_CLIP_POINTS,
  MAX_STACK_DEPTH,
  MOTION_EASINGS,
  MOTION_IN_PRESETS,
  MOTION_LOOP_PRESETS,
  OVERLAY_KINDS,
  STACK_ALIGNS,
  STACK_DIRECTIONS,
  STACK_JUSTIFIES,
} from "./format";
import { kindPages } from "./pages";
import { IMPLICIT_IMAGE_TOKENS, pageTokens } from "./page-tokens";
import { MAX_SVG_BYTES, SVG_ELEMENTS } from "./svg";
import {
  MAX_GRADIENT_STOPS,
  MAX_PAGE_LAYERS,
  MAX_SHADOWS,
  MAX_V2_DOCUMENT_LAYERS,
  MIN_GRADIENT_STOPS,
  V2_RANGES,
} from "./validate";

const list = (values: readonly (string | number)[]) => values.join(" | ");
const range = ([lo, hi]: readonly [number, number]) => `${lo}–${hi}`;
const r = V2_RANGES;

/** The format's rules, for the AI's system prompt. */
export function templateFormatGuide(): string {
  const sizes = TEMPLATE_SIZE_ORDER.map(
    (s) => `${s} ${TEMPLATE_SIZES[s].w}×${TEMPLATE_SIZES[s].h}`,
  ).join(", ");
  const palettes = DERIVED_PALETTES.map((p) => `${p} (var(${DERIVED_PALETTE_PREFIX[p]}*))`).join(
    ", ",
  );
  return `# The template format (v${FORMAT_VERSION})

A template is one JSON document:
- formatVersion: ${FORMAT_VERSION}
- pages: an object with one entry per page of the card kind, each { layers: [...] }. Layers paint back to front.
- palettes (optional): the derived colour sets the design uses: ${list(DERIVED_PALETTES)}.
- sponsorLock (optional): true keeps the sponsor strip on every post.
- timeline (optional): { durationMs, holdMs, loop } for animated exports (ms ${range(r.timelineMs)}).

Every page is drawn at four sizes: ${sizes}. A layer has a box per size it's on, in percent of that artboard: { x, y, w, h, rotate? } (x and w of its width, y and h of its height, rotate in degrees). geometry holds the boxes keyed by size; sizes (optional) lists the sizes a layer is on when it isn't on all four. Design every size deliberately: the story size has room for more, the landscape size is short.

## Layers
Every layer has: id (unique in the document; letters, digits, _ . - only, up to 64 characters), kind, geometry, and optionally name, hidden, sizes, style, showWhen, motion.
Kinds: ${list(LAYER_KINDS_V2)}.
- text: content is the text with {{token}} fields ("{{playerName}}"), or bind names the one field it shows. fit (text only): { minScale ${range(r.minScale)}, maxLines 1 | 2, ellipsis } shrinks, then wraps, then truncates long text; use { "minScale": 0.6, "maxLines": 2, "ellipsis": true } for names.
- shape: a box drawn by its style (fill, border, radius, shadow).
- image, sticker, medal: content is one {{token}} image field or an https address.
- photo: the card's photo. Never on a junior card: give it showWhen { "junior": false }.
- rows: a repeating list: rows { repeat (a list the page has), rowHeight (percent of the artboard width), gap, columns 1–6, columnGap, flow down | across (how rows fill the columns; across reads like a grid of tiles), cells: [{ field (a field of that list), x, w (percent of the layer's width), y, h (percent of the row), show text | image | backdrop, style }], variants: { <row style>: { <field>: style } } }. The layer's box sets how many rows fit. A text cell shrinks to 60% of its size, then ends in "…" after the last whole word that fits; size a cell so at least its first word fits at 60%.
- element: a Studio library element { id, props }. Don't use it: you can't know the library's ids.
- vector: svg holds SVG markup (at most ${MAX_SVG_BYTES / 1024} KB) using only ${list(SVG_ELEMENTS)}. Presentation attributes only: no style, class, href, scripts, event attributes, text, entities or url() to anything but #ids in the same SVG. fill and stroke may be colour tokens.
- group: holds layers in children. With stack { direction ${list(STACK_DIRECTIONS)}, gap (percent of the artboard width, ${range(r.stackGap)}), align ${list(STACK_ALIGNS)}, justify ${list(STACK_JUSTIFIES)} } the children flow inside the group's box: only their w and h count, and a hidden, condition-false or empty child takes no space, so a block closes up when data is missing. Without stack each child sits at its own box. A layer only draws on the sizes its groups are on. Groups nest at most ${MAX_STACK_DEPTH} deep (a group on the page is depth 1).

showWhen: { field } draws the layer only when that field of the page has a value; { photo: true | false } only with or without the card's photo (photo: false is the no-photo artwork); { sponsors: true | false }; { junior: true | false }. Every condition given must hold.
motion: { in: { preset ${list(MOTION_IN_PRESETS)}, delayMs ${range(r.motionDelayMs)}, durationMs ${range(r.motionDurationMs)}, easing ${list(MOTION_EASINGS)} }, loop: { preset ${list(MOTION_LOOP_PRESETS)}, periodMs ${range(r.loopPeriodMs)}, delayMs } }. pulse is the LIVE dot's beat; shine sweeps light across foil.

## Style
- color, background, fontFamily: text of at most 120 characters with none of " < > ; { } or a backslash.
- fontSize (percent of the artboard width: headlines 8–14, body 2.5–4) 0.2–80, fontWeight 100–1000, letterSpacing (em) −1–3, uppercase true | false, align left | center | right, radius, opacity 0–1, lineHeight (a multiple of the font size) ${range(r.lineHeight)}.
- fill (wins over background) and textFill (paints the text itself, as foil numbers are): a colour, or a gradient: { type: "linear", angle ${range(r.angle)}, stops } or { type: "radial", shape circle | ellipse, at { x, y } (percent of the box), stops }, with ${MIN_GRADIENT_STOPS}–${MAX_GRADIENT_STOPS} stops { color, at ${range(r.stopAt)} }.
- border: { width (percent of the artboard width, ${range(r.borderWidth)}), color, style ${list(BORDER_STYLES)} }.
- boxShadow: up to ${MAX_SHADOWS} of { x, y, blur, spread, color, inset }; textShadow: up to ${MAX_SHADOWS} of { x, y, blur, color }. Offsets and spread ${range(r.shadowOffset)} and blur ${range(r.shadowBlur)}, in percent of the artboard width.
- blend: ${list(BLEND_MODES)}.
- filter (photos and images): a list of { preset: "duotone", dark, light }, { preset: "grayscale", amount ${range(r.grayscale)} }, { preset: "blur", px ${range(r.blurPx)} }, { preset: "brightness", amount ${range(r.brightness)} (1 is unchanged) }; presets ${list(FILTER_PRESETS)}, each at most once.
- overlay: { kind ${list(OVERLAY_KINDS)}, opacity ${range(r.overlayOpacity)}, scale ${range(r.overlayScale)} }.
- clip: { polygon: [[x, y], …] }, 3 to ${MAX_CLIP_POINTS} points in percent of the layer's box (${range(r.clipPoint)}), cutting the box to that shape: angled bands, cut corners.

Colours in fill, textFill, border, shadows and filters are a hex (#rgb, #rgba, #rrggbb or #rrggbbaa) or one of the club's colour tokens as var(--token), optionally with a hex fallback (var(--gold, #FBAC27)): ${list(COLOUR_TOKENS)}, or the derived palettes ${palettes}. Use the tokens for anything that should follow the club's colours: --gold is the club's accent.

## Rules
- Use only the fields, image fields and lists the page lists; ${list(IMPLICIT_IMAGE_TOKENS)} are on every page.
- At most ${MAX_PAGE_LAYERS} layers on a page and ${MAX_V2_DOCUMENT_LAYERS} in the document, groups' children included.
- Design every page of the kind.`;
}

/** A kind's pages and what each can show, for the kind's block of the prompt. */
export function pageCatalogueGuide(kind: string): string {
  const pages = kindPages(kind);
  const lines = [`# Card kind: ${kind}`, `Pages, primary first: ${pages.join(", ")}.`];
  for (const page of pages) {
    const cat = pageTokens(kind, page);
    lines.push("", `## Page ${page}`);
    if (!cat) continue;
    lines.push(
      `Text fields: ${cat.fields.map((f) => `${f.key} (${f.label})`).join(", ") || "none"}.`,
    );
    const images = [...IMPLICIT_IMAGE_TOKENS, ...cat.images.map((i) => i.key)];
    lines.push(`Image fields: ${[...new Set(images)].join(", ")}.`);
    for (const rep of cat.repeats)
      lines.push(
        `List ${rep.key} (${rep.label}): fields ${rep.fields.map((f) => f.key).join(", ")}; row styles ${rep.variants.join(", ") || "none"}.`,
      );
    if (cat.repeats.length === 0) lines.push("Lists: none.");
  }
  return lines.join("\n");
}
