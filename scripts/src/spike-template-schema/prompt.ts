/**
 * Structured-output spike (S.3): the prompt every shape gets. The format
 * guide and the kind's catalogue are the same for every shape so that only
 * the output contract differs; each shape adds a short note on its encoding.
 * A stand-in for L7's `prompt.ts` (T7.5).
 */
import { kindPages, pageCatalogue } from "./format";
import type { Encoding, Nesting } from "./shapes";

const FORMAT_GUIDE = `You design social media card templates for Ovation, a white-label cricket club platform. A club's posts (match day, results, milestones, ladders, team lists…) are rendered from your template with the club's own data and colours.

# The template format (v2)

A template is a JSON document:
- formatVersion: 2
- pages: one entry per page of the card kind, each { layers: [...] }. Layers paint back to front.
- palette (optional): "club-kit" | "duotone" | "foil" when the design uses that derived colour set.
- sponsorLock (optional): true keeps the sponsor strip on every post.
- timeline (optional): { durationMs, holdMs, loop } for animated exports.

Every page is drawn at four sizes: square 1080×1080, portrait 1080×1350, story 1080×1920 and landscape 1200×630. A layer has a box per size it's on, in percent of that artboard: x and w of its width, y and h of its height, plus an optional rotate in degrees. Design all four sizes deliberately: the story size has room for more, the landscape size is short.

## Layer fields
- id: unique across the whole document; letters, digits, _ . - only, up to 64 characters.
- kind: text | shape | image | photo | rows | sticker | medal | group | vector.
- name: a short label for the editor.
- hidden: true to keep a layer in the document but not draw it.
- content: for text, the text with {{token}} fields (for example "{{playerName}}"); for image, photo, sticker and medal, a single {{token}} image field or an https address.
- bind: the one field a layer shows, when it shows exactly one.
- geometry: { square, portrait, story, landscape } boxes; sizes (optional) lists the sizes the layer is on when it isn't on all four.
- style: see Style.
- fit (text): { minScale 0.3–1, maxLines 1 | 2, ellipsis } shrinks, wraps, then truncates long text. Use { minScale: 0.6, maxLines: 2, ellipsis: true } for player and team names.
- showWhen: { field } draws the layer only when that field has a value; { photo: true | false } only with or without a photo (use photo: false for no-photo artwork); { sponsors: true | false }; { junior: true | false }.
- motion: { in: { preset rise | fade | pop | slide | zoom, delayMs, durationMs 100–10000, easing linear | ease | ease-in | ease-out | ease-in-out }, loop: { preset pulse | shine | glow, periodMs 200–20000, delayMs } }.

## Layer kinds
- text: content and style. fontSize is in percent of the artboard width (a headline is 8–14, body text 2.5–4).
- shape: a box drawn with background or fill, border and radius.
- image / photo: an image field; photo is the player or team photo. Never show a player photo on a junior card: give photo layers showWhen { junior: false }.
- sticker / medal: decorative image fields.
- rows: a repeating list. rows: { repeat (a list the page has), rowHeight (percent of the artboard width), gap, columns 1–6, columnGap, cells: [{ field (a field of that list), x and w (percent of the layer's width), y and h (percent of the row), show text | image | backdrop, style }], variants: { <row style>: { <field>: style } } }. The layer's box sets how many rows fit; extra rows spill to more slides.
- group: holds other layers in children. With stack: { direction column | row, gap (percent of the artboard width), align start | center | end | stretch, justify start | center | end | space-between }, the children flow inside the group's box: only their w and h count, and a hidden, condition-false or empty child takes no space, so blocks collapse when data is missing. Groups nest: the page's own layers are depth 1, and no layer may sit deeper than depth 4.
- vector: svg holds SVG markup (at most 64 KB) using only svg, g, path, rect, circle, ellipse, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath and mask. No href, scripts, event attributes or url() to anything but #ids.

## Style
color, background (a colour or a CSS gradient), fontFamily, fontSize, fontWeight 100–1000, letterSpacing (em, −1 to 3), uppercase, align left | center | right, radius, opacity 0–1, fill { type solid | linear | radial, color, angle, stops [{ color, at 0–100 }] (2–8 stops) }, textFill (a gradient inside text, for foil numbers), border { width, color, style solid | dashed }, boxShadow and textShadow { x, y, blur, spread, color }, blend (normal, multiply, screen, overlay, soft-light, hard-light, color-dodge, color-burn, darken, lighten, luminosity), filter { preset duotone (dark, light colours) | grayscale | blur (amount 0–20 px) }, overlay grain | halftone.

Colours are a hex, rgba(), or the club's tokens with a fallback: var(--accent,#1E5AA8), var(--accent-ink,#FFFFFF), var(--ink,#101216), var(--panel,#1B2230), var(--gold,#FBAC27). Use the tokens for anything that should follow the club's colours. No colour, font or text value may contain " < > ; { } or a backslash.

## Rules
- Use only the fields, image fields and lists the page lists below; a field the page doesn't have is an error.
- At most 300 layers on a page and 600 in the document.
- Every page of the kind must be designed.`;

/** The guide plus one example document, given to every shape. */
export function formatGuide(): string {
  return `${FORMAT_GUIDE}

## Example (a milestone card, one page)
${JSON.stringify(EXAMPLE)}`;
}

const EXAMPLE = {
  formatVersion: 2,
  pages: {
    card: {
      layers: [
        {
          id: "stage",
          kind: "shape",
          name: "Stage",
          style: { background: "var(--ink,#101216)" },
          geometry: {
            square: { x: 0, y: 0, w: 100, h: 100 },
            portrait: { x: 0, y: 0, w: 100, h: 100 },
            story: { x: 0, y: 0, w: 100, h: 100 },
            landscape: { x: 0, y: 0, w: 100, h: 100 },
          },
        },
        {
          id: "photo",
          kind: "photo",
          content: "{{photo}}",
          showWhen: { photo: true, junior: false },
          geometry: {
            square: { x: 40, y: 0, w: 60, h: 100 },
            portrait: { x: 40, y: 0, w: 60, h: 100 },
            story: { x: 0, y: 0, w: 100, h: 60 },
            landscape: { x: 55, y: 0, w: 45, h: 100 },
          },
        },
        {
          id: "name-block",
          kind: "group",
          name: "Name block",
          stack: { direction: "column", gap: 1, align: "start", justify: "end" },
          geometry: {
            square: { x: 6, y: 60, w: 50, h: 32 },
            portrait: { x: 6, y: 62, w: 50, h: 30 },
            story: { x: 6, y: 64, w: 88, h: 28 },
            landscape: { x: 5, y: 45, w: 48, h: 45 },
          },
          children: [
            {
              id: "tier",
              kind: "text",
              content: "{{tierLabel}}",
              showWhen: { field: "tierLabel" },
              style: {
                color: "var(--gold,#FBAC27)",
                fontSize: 3,
                fontWeight: 700,
                uppercase: true,
              },
              geometry: {
                square: { x: 0, y: 0, w: 100, h: 5 },
                portrait: { x: 0, y: 0, w: 100, h: 4 },
                story: { x: 0, y: 0, w: 100, h: 3 },
                landscape: { x: 0, y: 0, w: 100, h: 8 },
              },
            },
            {
              id: "player-name",
              kind: "text",
              content: "{{playerName}}",
              fit: { minScale: 0.6, maxLines: 2, ellipsis: true },
              style: { color: "#FFFFFF", fontSize: 9, fontWeight: 800, uppercase: true },
              geometry: {
                square: { x: 0, y: 0, w: 100, h: 20 },
                portrait: { x: 0, y: 0, w: 100, h: 16 },
                story: { x: 0, y: 0, w: 100, h: 12 },
                landscape: { x: 0, y: 0, w: 100, h: 30 },
              },
            },
          ],
        },
      ],
    },
  },
};

/** The kind's pages, with each page's fields, image fields and lists. */
export function kindCatalogueText(kind: string): string {
  const lines = [`# Card kind: ${kind}`, `Pages, primary first: ${kindPages(kind).join(", ")}.`];
  for (const page of kindPages(kind)) {
    const cat = pageCatalogue(kind, page);
    const textTokens = cat.tokens.filter((t) => !cat.images.includes(t));
    lines.push(
      ``,
      `## Page ${page}`,
      `Text fields: ${textTokens.join(", ") || "none"}.`,
      `Image fields: ${cat.images.join(", ") || "none"}.`,
    );
    for (const r of cat.repeats)
      lines.push(
        `List ${r.key}: fields ${r.fields.join(", ")}; row styles ${r.variants.join(", ") || "none"}.`,
      );
    if (cat.repeats.length === 0) lines.push("Lists: none.");
  }
  return lines.join("\n");
}

/** What each shape is told about its output, after the shared guide. */
export function outputNote(shape: "a" | "b" | "c", encoding: Encoding | null): string {
  if (shape === "c")
    return `# Output\nReturn only the template as one JSON document in the format above: no prose, no code fences. Leave out optional fields you don't use.`;
  const nesting: Nesting = shape === "a" ? "nested" : "flat";
  const tree =
    nesting === "nested"
      ? "A group's layers go in its children list (depth 4 at most)."
      : "Each page's layers are one flat list in painting order. A layer inside a group names that group's id in parentId (empty for the page's own layers); a group's layers follow it in the list. Groups still nest at most four levels deep.";
  if (encoding === "faithful")
    return `# Output\nYour reply is constrained to the format's JSON Schema. ${tree}`;
  return `# Output\nYour reply is constrained to a strict JSON encoding of the format (the example above shows the plain format), in which every property is always present:
- Optional values are lists holding at most one entry, empty when unused (fit, stack, rows, timeline, and style's fill, textFill, border, boxShadow, textShadow and filter).
- Text and choice fields that don't apply are empty strings: content, bind, svg, and a showWhen test's field. palette is "none" when unused.
- boxes replaces geometry and sizes: one { size, x, y, w, h, rotate } entry per size the layer is on.
- style.props holds the scalar style settings as { prop, value } pairs, values written as text ("7.5", "true", "var(--gold,#FBAC27)").
- motion holds at most one entry per phase (in, loop); presets must suit their phase.
- showWhen holds tests: { test: "field", field } or { test: "photo" | "sponsors" | "junior", value }.
- rows.variants is a list of { variant, field, style }.
- ${tree}`;
}

export function userTurn(kind: string, brief: string): string {
  return `Design a ${kind} template.\n\nBrief: ${brief}\n\nDesign every page of the kind (${kindPages(kind).join(", ")}) at all four sizes.`;
}

export function retryTurn(errors: string[]): string {
  const shown = errors.slice(0, 40);
  const more = errors.length > shown.length ? `\n…and ${errors.length - shown.length} more.` : "";
  return `The template has these problems:\n${shown.map((e) => `- ${e}`).join("\n")}${more}\n\nReturn the whole corrected template.`;
}
