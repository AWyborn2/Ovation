/**
 * Lazy loader for the decorative Google-Fonts families used ONLY by the Social
 * Studio's selectable card fonts (canvas share-card exports) — see
 * CARD_FONT_OPTIONS in src/lib/share-card.ts. They used to be a render-blocking
 * stylesheet in index.html; now the <link> is injected on demand so public
 * visitors never download them.
 *
 * Idempotent: the stylesheet is appended once and every caller shares the same
 * promise. Best-effort: a failed load resolves anyway (canvas text falls back
 * to a system family rather than blocking a card export forever).
 */
const CARD_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&family=Roboto+Condensed:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap";

let cardFontsPromise: Promise<void> | null = null;

export function ensureCardFontsLoaded(): Promise<void> {
  if (cardFontsPromise) return cardFontsPromise;
  if (typeof document === "undefined") return Promise.resolve();
  cardFontsPromise = new Promise<void>((resolve) => {
    // Already present (e.g. injected by another bundle or a hard-coded page).
    if (document.querySelector(`link[href="${CARD_FONTS_HREF}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CARD_FONTS_HREF;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return cardFontsPromise;
}

/** Test-only: reset the memoised promise between test cases. */
export function __resetCardFontsForTests(): void {
  cardFontsPromise = null;
}
