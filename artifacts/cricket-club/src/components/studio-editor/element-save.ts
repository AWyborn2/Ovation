/**
 * "Save as element" (editable-elements plan, D4): a club's selected layers
 * become a library element every club can use (decision E1), so nothing of
 * the club's own goes with them:
 *
 * - **Images** become placeholders: the club's crest becomes `{{clubLogo}}`
 *   (each club sees its own), a token stays a token, and any other picture
 *   (a photo, a sponsor's art, an upload) becomes the card's photo slot.
 * - **Text** becomes sample or token text: a live field becomes its token,
 *   the club's name becomes `{{clubName}}`, and text with no field in it
 *   becomes "Text".
 * - **Colours** that are the club's accent, panel or ink become those brand
 *   tokens, so the element takes each club's colours.
 * - Layer kinds the library can't hold (medals, stickers, charts, Club Kit
 *   pieces) are left out and named, and hidden layers are dropped.
 *
 * The server checks the result again (layer rules and the asset policy).
 */
import {
  DERIVED_PALETTE_PREFIX,
  elementDocumentErrors,
  type DerivedPalette,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer, PackCardData, PackTokens } from "@/lib/pack-render";
import { shortClubName } from "@/lib/pack-card-data";

/** The layer kinds an element can hold (format v2). */
const PUBLISHABLE = new Set(["text", "shape", "image", "photo", "rows", "vector", "group"]);

/** What only means something on this card or in this editor. */
const DROP_KEYS = [
  "editedAt",
  "locked",
  "hidden",
  "group",
  "playerId",
  "photo",
  "chart",
  "element",
  "sub",
  "bind",
  "sizes",
  "sig",
  "link",
  "name",
] as const;

const TOKEN = /\{\{\s*[\w.]+\s*\}\}/;
const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;

export type ElementSaveContext = {
  /** The club's crest URL, to turn back into `{{clubLogo}}`. */
  logoUrl: string | null;
  /** The club's names (full and short), to turn into `{{clubName}}`. */
  clubNames: string[];
  /** The club's brand colours by token, e.g. `{ "--gold": "#F5B400" }`. */
  colours: Record<string, string>;
};

/** The save context for a card: the club's crest, names and brand colours as drawn. */
export function elementSaveContext(
  data: PackCardData | null | undefined,
  tokens: PackTokens,
): ElementSaveContext {
  const name = data?.brand?.name ?? "";
  return {
    logoUrl: data?.brand?.logoUrl ?? null,
    clubNames: [name, shortClubName(name)].filter(Boolean),
    colours: { "--gold": tokens.accent, "--panel": tokens.panel, "--ink": tokens.ink },
  };
}

export type ElementDraft = {
  document: { formatVersion: 2; layers: unknown[]; palettes?: DerivedPalette[] };
  /** The kinds left out, as the editor names them. */
  skipped: string[];
  /** What the format's rules say is still wrong; empty when it can be saved. */
  errors: string[];
};

const norm = (hex: string) =>
  hex.length === 4
    ? `#${[...hex.slice(1)].map((c) => c + c).join("")}`.toLowerCase()
    : hex.toLowerCase();

/** A string with the club's colours as brand tokens. */
function tokeniseColours(value: string, byHex: Map<string, string>): string {
  return value.replace(HEX, (hex) => {
    const token = byHex.get(norm(hex));
    return token ? `var(${token})` : hex;
  });
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sampleText(layer: FreeLayer, ctx: ElementSaveContext): string {
  if (layer.bind) return `{{${layer.bind}}}`;
  let text = layer.content ?? "";
  for (const name of ctx.clubNames.filter((n) => n.trim().length >= 3)) {
    text = text.replace(new RegExp(escapeRegExp(name.trim()), "gi"), "{{clubName}}");
  }
  return TOKEN.test(text) ? text : "Text";
}

type Layer = FreeLayer & { children?: Layer[]; svg?: string };

function publish(
  layer: Layer,
  id: string,
  ctx: ElementSaveContext,
  byHex: Map<string, string>,
  skipped: string[],
): Record<string, unknown> | null {
  if (layer.hidden) return null;
  if (!PUBLISHABLE.has(layer.kind)) {
    skipped.push(layer.name || layer.kind);
    return null;
  }
  let kind: string = layer.kind;
  let content = layer.content;
  if (layer.kind === "text") content = sampleText(layer, ctx);
  if (layer.kind === "image") {
    if (content && ctx.logoUrl && content === ctx.logoUrl) content = "{{clubLogo}}";
    else if (!content || !TOKEN.test(content)) {
      // Someone's picture: the element keeps a photo slot in its place.
      kind = "photo";
      content = undefined;
    }
  }
  const out: Record<string, unknown> = { ...layer, id, kind };
  for (const key of DROP_KEYS) delete out[key];
  if (content === undefined) delete out.content;
  else out.content = content;
  if (layer.style) out.style = mapStrings(layer.style, (s) => tokeniseColours(s, byHex));
  if (layer.svg) out.svg = tokeniseColours(layer.svg, byHex);
  if (layer.children) {
    out.children = layer.children
      .map((c, i) => publish(c, `${id}-${i + 1}`, ctx, byHex, skipped))
      .filter((c): c is Record<string, unknown> => c !== null);
  }
  return out;
}

/** The element a club's selected layers would publish, and what's left out. */
export function elementFromSelection(layers: FreeLayer[], ctx: ElementSaveContext): ElementDraft {
  const byHex = new Map(
    Object.entries(ctx.colours)
      .filter(([, hex]) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex))
      .map(([token, hex]) => [norm(hex), token]),
  );
  const skipped: string[] = [];
  const out = (layers as Layer[])
    .map((l, i) => publish(l, `e${i + 1}`, ctx, byHex, skipped))
    .filter((l): l is Record<string, unknown> => l !== null);
  const text = JSON.stringify(out);
  const palettes = (Object.entries(DERIVED_PALETTE_PREFIX) as Array<[DerivedPalette, string]>)
    .filter(([, prefix]) => text.includes(`var(${prefix}`))
    .map(([p]) => p);
  const document = {
    formatVersion: 2 as const,
    layers: out,
    ...(palettes.length > 0 ? { palettes } : {}),
  };
  return { document, skipped, errors: elementDocumentErrors(document) };
}
