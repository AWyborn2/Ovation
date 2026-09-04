// Selectable card fonts + the force-load that makes canvas text render in them.
import { ensureCardFontsLoaded } from "../card-fonts";

// Body type for the built-in canvas cards: IBM Plex Sans to match the app and
// the HTML trading card (see the trading-card helpers in draw-primitives.ts).

export const CARD_FONT = "'IBM Plex Sans', sans-serif";

// Selectable card fonts. "sans"/"serif" keep their original stacks (IBM Plex Sans /
// Georgia) so existing cards stay byte-identical; the rest are extra families whose
// Google-Fonts stylesheet is injected on demand (src/lib/card-fonts.ts — it is
// deliberately NOT in index.html so public visitors never fetch it). Because these
// only ever appear in canvas font stacks, the browser never fetches the less-common
// ones on its own (canvas ctx.font does not trigger a load, and
// document.fonts.ready resolves without them) — so ensureCardFonts() explicitly
// injects the stylesheet and loads every family before any canvas text is drawn
// in each render path.
export type CardFontKey =
  | "sans"
  | "serif"
  | "oswald"
  | "cinzel"
  | "garamond"
  | "mono"
  | "inter";

const EXTRA_FONT_STACKS: Record<Exclude<CardFontKey, "sans" | "serif">, string> = {
  oswald: "'Oswald', sans-serif",
  cinzel: "'Cinzel', serif",
  garamond: "'EB Garamond', Georgia, serif",
  mono: "'Space Mono', monospace",
  inter: "'Inter', sans-serif",
};

// The CSS stack for an extra font key, or null for the built-in sans/serif so
// each call site keeps its own original default (IBM Plex Sans for custom text,
// Helvetica for summary slots) and unchanged cards render identically.
export const extraFontStack = (k?: string | null): string | null =>
  k && k in EXTRA_FONT_STACKS
    ? EXTRA_FONT_STACKS[k as keyof typeof EXTRA_FONT_STACKS]
    : null;

// Font choices surfaced in the Social Studio editor's font dropdown.
export const CARD_FONT_OPTIONS: { value: CardFontKey; label: string }[] = [
  { value: "sans", label: "Sans (IBM Plex Sans)" },
  { value: "serif", label: "Serif (Georgia)" },
  { value: "oswald", label: "Oswald" },
  { value: "cinzel", label: "Cinzel" },
  { value: "garamond", label: "Garamond" },
  { value: "mono", label: "Space Mono" },
  { value: "inter", label: "Inter" },
];

// The actual CSS family names behind every selectable card font (Georgia is a
// system serif and needs no fetch, so it is omitted). IBM Plex Sans is the app's
// default sans but we load it here too so a card export never beats the app's
// own lazy fetch of it.
const CARD_FONT_FAMILIES = [
  "IBM Plex Sans",
  "Oswald",
  "Cinzel",
  "EB Garamond",
  "Space Mono",
  "Inter",
  // Pack A ("Broadcast Dark") display + script families so pack cards render
  // their headline type in both the DOM preview and the server-side export.
  "Anton",
  "Bebas Neue",
  "Teko",
  "Archivo Black",
  "Kaushan Script",
];

// Force-load every card font (at light + bold) before drawing. Canvas text does
// not trigger a font fetch and document.fonts.ready only waits on fonts the DOM
// has already requested, so without this the rarer families silently fall back
// to a system font in both the live preview and the exported image. Best-effort:
// failures (e.g. offline) just fall through to document.fonts.ready.
export const ensureCardFonts = async (): Promise<void> => {
  // The decorative families live in an on-demand stylesheet (not index.html);
  // make sure its @font-face rules exist before asking FontFaceSet to load them.
  await ensureCardFontsLoaded();
  const fonts = (document as Document).fonts;
  if (!fonts) return;
  if (typeof fonts.load === "function") {
    try {
      await Promise.all(
        CARD_FONT_FAMILIES.flatMap((f) => [
          fonts.load(`400 32px '${f}'`),
          fonts.load(`700 32px '${f}'`),
        ]),
      );
    } catch {}
  }
  if (fonts.ready) {
    try {
      await fonts.ready;
    } catch {}
  }
};
