/**
 * The Ovation platform (apex/marketing) origin, used for cross-tenant links
 * such as the club switcher's "Switch club" → club directory. Configurable per
 * deployment via VITE_PLATFORM_URL; defaults to the production apex.
 */
export function platformUrl(path = ""): string {
  const base = (import.meta.env.VITE_PLATFORM_URL as string | undefined) || "https://ovationcc.app";
  return `${base.replace(/\/$/, "")}${path}`;
}
