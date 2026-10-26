/**
 * Lazy loader for the Classic Honour Board skin's typefaces: Cinzel for the
 * engraved titles and headings, Cormorant Garamond for the names. Only the
 * honour-board display and the clubroom-TV kiosk need them, so they are not in
 * index.html (they would delay first paint for every public visitor).
 *
 * Idempotent: the stylesheet is appended once. Best-effort: a failed load
 * leaves the skin on its serif fallbacks.
 */
const HONOUR_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap";

export function ensureHonourFontsLoaded(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[href="${HONOUR_FONTS_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = HONOUR_FONTS_HREF;
  document.head.appendChild(link);
}
