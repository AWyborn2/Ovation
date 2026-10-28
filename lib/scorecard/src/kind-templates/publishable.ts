/**
 * What a club's design looks like once it is shared with every club
 * (template library release 2, ADR-012; "Save as element", D4): nothing of
 * the club's own goes with it.
 *
 * - **Images.** The club's crest becomes `{{clubLogo}}` and a sponsor's logo
 *   its sponsor slot (each club sees its own). A token stays a token, and
 *   library and bundled images stay. Any other picture (a photo, an upload)
 *   becomes the card's photo slot.
 * - **Colours** that are the club's accent, panel or ink become those brand
 *   tokens, so the design takes each club's colours.
 * - **Text.** In an element, text becomes its token or "Text". In a template,
 *   text stays as designed: text that is just the club's name becomes
 *   `{{clubName}}`, and text that names the club or a sponsor inside other
 *   words is flagged. Publishing waits until the author makes it a field.
 *
 * The server runs this on the stored design and its result is the one
 * published; the editor runs it to preview what other clubs will see.
 */
import { DERIVED_PALETTE_PREFIX, type DerivedPalette } from "./format";
import { isBundledImage } from "./elements";

/** The club's own identity, to find in a design. */
export type PublishIdentity = {
  /** The club's crest URL. */
  logoUrl: string | null;
  /** The club's names (full and short). */
  clubNames: readonly string[];
  /** Its sponsors' names, in the order the sponsor slots take them. */
  sponsorNames?: readonly string[];
  /** Its sponsors' logo URLs, in the same order. */
  sponsorLogoUrls?: readonly string[];
  /** The club's brand colours by token, e.g. `{ "--gold": "#F5B400" }`. */
  colours: Readonly<Record<string, string>>;
};

/** Something swapped for a data slot or token. */
export type PublishChange = {
  page: string;
  layerId: string;
  what: "clubLogo" | "sponsorLogo" | "photo" | "clubColour" | "clubName";
};

/** Text that still names the club or a sponsor. */
export type PublishFlag = {
  page: string;
  layerId: string;
  kind: "clubName" | "sponsorName";
  /** The name found. */
  text: string;
};

/**
 * Style tags a published template can carry (release 2, ADR-012). Mirrors
 * `TEMPLATE_STYLE_TAGS` in `@workspace/db` and the API's `TemplateStyleTag`.
 */
export const TEMPLATE_STYLE_TAGS = [
  "photo-led",
  "bold-type",
  "minimal",
  "dark",
  "light",
  "retro",
  "broadcast",
  "textured",
] as const;
export type TemplateStyleTag = (typeof TEMPLATE_STYLE_TAGS)[number];

/** Where images may come from in a shared design: the library's store, or bundled art. */
export const LIBRARY_ASSET_PREFIX = "/api/storage/public-objects/library/";

const TOKEN = /\{\{\s*[\w.]+\s*\}\}/;
const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;
/** Sponsor slots a design can name (`IMPLICIT_IMAGE_TOKENS`). */
const SPONSOR_SLOTS = 3;
/** Names shorter than this are too likely to match ordinary words. */
const MIN_NAME = 3;

/** The layer kinds an element can hold (format v2). */
const ELEMENT_KINDS = new Set(["text", "shape", "image", "photo", "rows", "vector", "group"]);

/** What only means something on the card it came from (an element drops more). */
const ELEMENT_DROP_KEYS = [
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
const TEMPLATE_DROP_KEYS = ["editedAt", "playerId"] as const;

const norm = (hex: string) =>
  hex.length === 4
    ? `#${[...hex.slice(1)].map((c) => c + c).join("")}`.toLowerCase()
    : hex.toLowerCase();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A whole-word, case-insensitive matcher for a name. */
const nameMatcher = (name: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name.trim())}(?=$|[^\\p{L}\\p{N}])`, "giu");

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

/** Whether a shared design may keep this image as it is. */
export function isSharedImage(url: string): boolean {
  return TOKEN.test(url) || url.startsWith(LIBRARY_ASSET_PREFIX) || isBundledImage(url);
}

type Layer = Record<string, unknown> & {
  id?: string;
  kind?: string;
  content?: string;
  bind?: string;
  hidden?: boolean;
  name?: string;
  style?: unknown;
  svg?: string;
  children?: Layer[];
};

type Walk = {
  mode: "element" | "template";
  page: string;
  identity: PublishIdentity;
  byHex: Map<string, string>;
  clubNames: string[];
  sponsorNames: string[];
  changes: PublishChange[];
  flags: PublishFlag[];
  skipped: string[];
};

function tokeniseColours(value: string, w: Walk, layerId: string): string {
  return value.replace(HEX, (hex) => {
    const token = w.byHex.get(norm(hex));
    if (!token) return hex;
    if (
      !w.changes.some((c) => c.layerId === layerId && c.what === "clubColour" && c.page === w.page)
    )
      w.changes.push({ page: w.page, layerId, what: "clubColour" });
    return `var(${token})`;
  });
}

/** An element's text: its field's token, the club's name as a token, else "Text". */
function elementText(layer: Layer, w: Walk): string {
  if (layer.bind) return `{{${layer.bind}}}`;
  let text = layer.content ?? "";
  for (const name of w.clubNames) {
    text = text.replace(new RegExp(escapeRegExp(name), "gi"), "{{clubName}}");
  }
  return TOKEN.test(text) ? text : "Text";
}

/** A template's text: as designed, the club's whole name as a token, names inside text flagged. */
function templateText(layer: Layer, id: string, w: Walk): string | undefined {
  const text = layer.content;
  if (typeof text !== "string" || layer.bind) return text;
  const whole = text.trim().toLowerCase();
  if (w.clubNames.some((n) => n.toLowerCase() === whole)) {
    w.changes.push({ page: w.page, layerId: id, what: "clubName" });
    return "{{clubName}}";
  }
  const found = (names: string[], kind: PublishFlag["kind"]) => {
    for (const name of names) {
      if (nameMatcher(name).test(text))
        w.flags.push({ page: w.page, layerId: id, kind, text: name });
    }
  };
  found(w.clubNames, "clubName");
  found(w.sponsorNames, "sponsorName");
  return text;
}

/** An image layer's content once shared, and what it became. */
function sharedImage(
  content: string | undefined,
  id: string,
  w: Walk,
): { kind: string; content?: string } {
  if (content && w.identity.logoUrl && content === w.identity.logoUrl) {
    if (w.mode === "template") w.changes.push({ page: w.page, layerId: id, what: "clubLogo" });
    return { kind: "image", content: "{{clubLogo}}" };
  }
  if (w.mode === "template" && content) {
    const sponsor = (w.identity.sponsorLogoUrls ?? []).indexOf(content);
    if (sponsor >= 0 && sponsor < SPONSOR_SLOTS) {
      w.changes.push({ page: w.page, layerId: id, what: "sponsorLogo" });
      return { kind: "image", content: `{{sponsor${sponsor + 1}}}` };
    }
    if (isSharedImage(content)) return { kind: "image", content };
  } else if (content && TOKEN.test(content)) {
    return { kind: "image", content };
  }
  // Someone's picture: the design keeps a photo slot in its place.
  if (w.mode === "template") w.changes.push({ page: w.page, layerId: id, what: "photo" });
  return { kind: "photo" };
}

function publishLayer(layer: Layer, id: string, w: Walk): Record<string, unknown> | null {
  const element = w.mode === "element";
  if (element && layer.hidden) return null;
  if (element && !ELEMENT_KINDS.has(String(layer.kind))) {
    w.skipped.push(layer.name || String(layer.kind));
    return null;
  }
  let kind = String(layer.kind);
  let content = layer.content;
  if (kind === "text") content = element ? elementText(layer, w) : templateText(layer, id, w);
  if (kind === "image") {
    const shared = sharedImage(content, id, w);
    kind = shared.kind;
    content = shared.content;
  }
  const out: Record<string, unknown> = { ...layer, id, kind };
  for (const key of element ? ELEMENT_DROP_KEYS : TEMPLATE_DROP_KEYS) delete out[key];
  if (content === undefined) delete out.content;
  else out.content = content;
  if (layer.style) out.style = mapStrings(layer.style, (s) => tokeniseColours(s, w, id));
  if (layer.svg) out.svg = tokeniseColours(layer.svg, w, id);
  if (layer.children) {
    out.children = layer.children
      .map((c, i) =>
        publishLayer(c, element ? `${id}-${i + 1}` : String(c.id ?? `${id}-${i + 1}`), w),
      )
      .filter((c): c is Record<string, unknown> => c !== null);
  }
  return out;
}

function walkState(identity: PublishIdentity, mode: Walk["mode"]): Omit<Walk, "page"> {
  const byHex = new Map(
    Object.entries(identity.colours)
      .filter(([, hex]) => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex))
      .map(([token, hex]) => [norm(hex), token]),
  );
  const names = (list: readonly string[] | undefined) => [
    ...new Set((list ?? []).map((n) => n.trim()).filter((n) => n.length >= MIN_NAME)),
  ];
  return {
    mode,
    identity,
    byHex,
    clubNames: names(identity.clubNames),
    sponsorNames: names(identity.sponsorNames),
    changes: [],
    flags: [],
    skipped: [],
  };
}

/** The palettes a document's styles name (`var(--ck-…)`), for its `palettes` list. */
export function palettesUsed(layers: unknown): DerivedPalette[] {
  const text = JSON.stringify(layers);
  return (Object.entries(DERIVED_PALETTE_PREFIX) as Array<[DerivedPalette, string]>)
    .filter(([, prefix]) => text.includes(`var(${prefix}`))
    .map(([p]) => p);
}

/**
 * A club's selected layers as a library element ("Save as element"): ids
 * renumbered, hidden layers and kinds an element can't hold left out (and
 * named), text as tokens or "Text".
 */
export function publishableElementLayers(
  layers: readonly unknown[],
  identity: PublishIdentity,
): { layers: Record<string, unknown>[]; skipped: string[] } {
  const w: Walk = { ...walkState(identity, "element"), page: "element" };
  const out = (layers as Layer[])
    .map((l, i) => publishLayer(l, `e${i + 1}`, w))
    .filter((l): l is Record<string, unknown> => l !== null);
  return { layers: out, skipped: w.skipped };
}

/**
 * A club template as every club would get it: each page's layers (and a v1
 * document's `layers`) shared, with what was swapped and the text still
 * naming the club or a sponsor. The rest of the document is kept as it is.
 */
export function publishableDocument(
  doc: unknown,
  identity: PublishIdentity,
): { document: unknown; changes: PublishChange[]; flags: PublishFlag[] } {
  const state = walkState(identity, "template");
  const changes: PublishChange[] = [];
  const flags: PublishFlag[] = [];
  const shareLayers = (layers: unknown, page: string) => {
    if (!Array.isArray(layers)) return layers;
    const w: Walk = { ...state, page, changes, flags, skipped: [] };
    return (layers as Layer[])
      .map((l, i) => publishLayer(l, String(l.id ?? `l${i + 1}`), w))
      .filter((l): l is Record<string, unknown> => l !== null);
  };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { document: doc, changes, flags };
  }
  const src = doc as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  if (Array.isArray(src.layers)) out.layers = shareLayers(src.layers, "card");
  if (src.pages && typeof src.pages === "object" && !Array.isArray(src.pages)) {
    out.pages = Object.fromEntries(
      Object.entries(src.pages as Record<string, unknown>).map(([key, page]) => {
        if (!page || typeof page !== "object") return [key, page];
        const p = page as Record<string, unknown>;
        const w: Walk = { ...state, page: key, changes, flags, skipped: [] };
        return [
          key,
          {
            ...p,
            ...(p.layers !== undefined ? { layers: shareLayers(p.layers, key) } : {}),
            // A page background in the club's colours takes the brand tokens too.
            ...(p.background !== undefined
              ? { background: mapStrings(p.background, (s) => tokeniseColours(s, w, "background")) }
              : {}),
          },
        ];
      }),
    );
  }
  return { document: out, changes, flags };
}
