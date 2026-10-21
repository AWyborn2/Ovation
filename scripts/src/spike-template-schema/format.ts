/**
 * Structured-output spike (S.1): the template format v2 as the spike drafts
 * it, from ADR-011 §1 and the v1 document in `@workspace/scorecard`. L1-A's
 * `kind-templates/format.ts` (T1.1) and `pages.ts` / the page token
 * catalogues (T1.3, T1.4) replace this file; nothing outside the spike
 * imports it.
 */
import {
  kindFields,
  TEMPLATE_CARD_KINDS,
  TEMPLATE_SIZE_ORDER,
} from "@workspace/scorecard/kind-templates";

export const KINDS: readonly string[] = TEMPLATE_CARD_KINDS;
export const SIZES: readonly string[] = TEMPLATE_SIZE_ORDER;

export const PAGE_KEYS = ["card", "title", "fixture", "day", "sponsors", "result", "team"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

/** Layer kinds the AI may write. `element` needs a library id it can't know, so it's left out. */
export const LAYER_KINDS = [
  "text",
  "shape",
  "image",
  "photo",
  "rows",
  "sticker",
  "medal",
  "group",
  "vector",
] as const;

export const ALIGNS = ["left", "center", "right"] as const;
export const BLENDS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "soft-light",
  "hard-light",
  "color-dodge",
  "color-burn",
  "darken",
  "lighten",
  "luminosity",
] as const;
export const FILTERS = ["duotone", "grayscale", "blur"] as const;
export const OVERLAYS = ["grain", "halftone"] as const;
export const FILL_TYPES = ["solid", "linear", "radial"] as const;
export const BORDER_STYLES = ["solid", "dashed"] as const;
export const MOTION_IN = ["rise", "fade", "pop", "slide", "zoom"] as const;
export const MOTION_LOOP = ["pulse", "shine", "glow"] as const;
export const EASINGS = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"] as const;
export const STACK_DIRECTIONS = ["column", "row"] as const;
export const STACK_ALIGN = ["start", "center", "end", "stretch"] as const;
export const STACK_JUSTIFY = ["start", "center", "end", "space-between"] as const;
export const PALETTES = ["club-kit", "duotone", "foil"] as const;
export const CELL_SHOWS = ["text", "image", "backdrop"] as const;

/** Stack groups nest to this depth: a page's own layers are depth 1. */
export const MAX_DEPTH = 4;
export const MAX_PAGE_LAYERS = 300;
export const MAX_DOCUMENT_LAYERS = 600;
export const MAX_SVG_BYTES = 64 * 1024;

/** Numeric ranges, shared by the schemas (as min/max) and the validator. */
export const RANGES = {
  box: [-200, 300],
  rotate: [-360, 360],
  fontSize: [0.2, 80],
  fontWeight: [100, 1000],
  letterSpacing: [-1, 3],
  radius: [0, 10000],
  opacity: [0, 1],
  angle: [0, 360],
  stop: [0, 100],
  borderWidth: [0, 50],
  shadow: [-100, 100],
  blur: [0, 20],
  delayMs: [0, 10000],
  durationMs: [100, 10000],
  periodMs: [200, 20000],
  minScale: [0.3, 1],
  gap: [0, 50],
  rowHeight: [0.5, 100],
  columns: [1, 6],
  cell: [0, 100],
  timelineMs: [0, 60000],
} as const satisfies Record<string, readonly [number, number]>;

export const MAX_TEXT = 1000;
export const MAX_SHORT = 120;

/**
 * The format v2 document (ADR-011 §1), as the spike reads it. Optional
 * fields are optional here; the structured-output encodings in `shapes.ts`
 * are derived from this.
 */
export type Box = { x: number; y: number; w: number; h: number; rotate?: number };
export type Fill = {
  type: (typeof FILL_TYPES)[number];
  color?: string;
  angle?: number;
  stops?: Array<{ color: string; at: number }>;
};
export type Shadow = { x: number; y: number; blur: number; spread?: number; color: string };
export type StyleV2 = {
  color?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  uppercase?: boolean;
  align?: (typeof ALIGNS)[number];
  radius?: number;
  opacity?: number;
  fill?: Fill;
  textFill?: Fill;
  border?: { width: number; color: string; style?: (typeof BORDER_STYLES)[number] };
  boxShadow?: Shadow;
  textShadow?: Shadow;
  blend?: (typeof BLENDS)[number];
  filter?: { preset: (typeof FILTERS)[number]; dark?: string; light?: string; amount?: number };
  overlay?: (typeof OVERLAYS)[number];
};
export type RowsCellV2 = {
  field: string;
  x: number;
  w: number;
  y?: number;
  h?: number;
  show?: (typeof CELL_SHOWS)[number];
  style?: StyleV2;
};
export type RowsSpecV2 = {
  repeat: string;
  rowHeight: number;
  gap?: number;
  columns?: number;
  columnGap?: number;
  cells: RowsCellV2[];
  variants?: Record<string, Record<string, StyleV2>>;
};
export type LayerV2 = {
  id: string;
  kind: (typeof LAYER_KINDS)[number];
  name?: string;
  hidden?: boolean;
  content?: string;
  bind?: string;
  rows?: RowsSpecV2;
  style?: StyleV2;
  motion?: {
    in?: {
      preset: (typeof MOTION_IN)[number];
      delayMs?: number;
      durationMs?: number;
      easing?: string;
    };
    loop?: { preset: (typeof MOTION_LOOP)[number]; periodMs?: number; delayMs?: number };
  };
  sizes?: string[];
  geometry: Partial<Record<string, Box>>;
  showWhen?: { field?: string; photo?: boolean; sponsors?: boolean; junior?: boolean };
  fit?: { minScale?: number; maxLines?: 1 | 2; ellipsis?: boolean };
  stack?: {
    direction: (typeof STACK_DIRECTIONS)[number];
    gap?: number;
    align?: (typeof STACK_ALIGN)[number];
    justify?: (typeof STACK_JUSTIFY)[number];
  };
  children?: LayerV2[];
  svg?: string;
};
export type TemplateDocumentV2 = {
  formatVersion: 2;
  pages: Partial<Record<PageKey, { layers: LayerV2[] }>>;
  timeline?: { durationMs?: number; holdMs?: number; loop?: boolean };
  palette?: (typeof PALETTES)[number];
  sponsorLock?: boolean;
};

/** A page's tokens (text and image fields) and repeats. */
export type PageCatalogue = {
  tokens: string[];
  images: string[];
  repeats: Array<{ key: string; fields: string[]; variants: string[] }>;
};

/** The pages each kind's template holds, primary first (ADR-011 §1). */
export function kindPages(kind: string): PageKey[] {
  if (kind === "matchDay") return ["fixture", "title", "day", "sponsors"];
  if (kind === "matchSummary") return ["result", "day"];
  if (kind === "teamList") return ["team"];
  return ["card"];
}

const CLUB = ["clubName", "clubTagline", "clubHashtag", "clubMonogram"];

/**
 * Carousel page catalogues. A stand-in for T1.4, from the tokens the Club
 * Kit bookends and day slides bind today, plus the two new repeats.
 */
const CAROUSEL_PAGES: Record<"title" | "day" | "sponsors", PageCatalogue> = {
  title: {
    tokens: [
      ...CLUB,
      "weekendTitle",
      "roundLabel",
      "date",
      "livestream",
      "nextHomeMatch",
      "nextHomeWhen",
    ],
    images: ["clubLogo", "groundPhoto"],
    repeats: [],
  },
  day: {
    tokens: [...CLUB, "dayHeading", "date"],
    images: ["clubLogo"],
    repeats: [
      {
        key: "dayRows",
        fields: ["grade", "team", "opposition", "oppositionLogoUrl", "ground", "time", "result"],
        variants: ["junior"],
      },
    ],
  },
  sponsors: {
    tokens: [...CLUB, "sponsorThanks", "sponsorSocials", "sponsorCta"],
    images: ["clubLogo"],
    repeats: [{ key: "sponsors", fields: ["name", "logoUrl", "tier"], variants: ["major"] }],
  },
};

export function pageCatalogue(kind: string, page: PageKey): PageCatalogue {
  if (page === "title" || page === "day" || page === "sponsors") {
    // Image fields are tokens too ({{clubLogo}}), as on the primary pages.
    const cat = CAROUSEL_PAGES[page];
    return { ...cat, tokens: [...new Set([...cat.tokens, ...cat.images])] };
  }
  const cat = kindFields(kind);
  const images = ["clubLogo", "groundPhoto", ...(cat?.images.map((i) => i.key) ?? [])];
  return {
    tokens: [...new Set([...(cat?.fields.map((f) => f.key) ?? []), ...images])],
    images: [...new Set(images)],
    repeats:
      cat?.repeats.map((r) => ({
        key: r.key,
        fields: r.fields.map((f) => f.key),
        variants: r.variants,
      })) ?? [],
  };
}

/** Every token, image and repeat across every kind and page (the whole-format schema). */
export function unionCatalogue(): PageCatalogue {
  const tokens = new Set<string>();
  const images = new Set<string>();
  const repeats = new Map<string, { fields: Set<string>; variants: Set<string> }>();
  for (const kind of KINDS)
    for (const page of kindPages(kind)) {
      const cat = pageCatalogue(kind, page);
      cat.tokens.forEach((t) => tokens.add(t));
      cat.images.forEach((t) => images.add(t));
      for (const r of cat.repeats) {
        const entry = repeats.get(r.key) ?? { fields: new Set(), variants: new Set() };
        r.fields.forEach((f) => entry.fields.add(f));
        r.variants.forEach((v) => entry.variants.add(v));
        repeats.set(r.key, entry);
      }
    }
  return {
    tokens: [...tokens].sort(),
    images: [...images].sort(),
    repeats: [...repeats].map(([key, r]) => ({
      key,
      fields: [...r.fields].sort(),
      variants: [...r.variants].sort(),
    })),
  };
}
