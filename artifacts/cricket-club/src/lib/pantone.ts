import PANTONE_MAP from "pantone-colors";

/**
 * Normalise a Pantone code entered by the user (e.g. "PANTONE 485 C",
 * "485 C", "  485c  ") → the bare numeric key the mapping uses (e.g. "485").
 * Strips the "PANTONE" prefix, any trailing letter suffix (C / U / M / CP),
 * and surrounding whitespace.
 */
function normalise(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/^PANTONE\s+/, "")
    .replace(/\s*[A-Z]{1,2}$/, "")
    .trim();
}

/**
 * Look up the hex value for a Pantone colour code.
 *
 * Accepts codes in any of the common formats used in brand guidelines:
 *   - `"485"`          → bare number
 *   - `"485 C"`        → coated suffix
 *   - `"PANTONE 485 C"` → full designation
 *
 * Returns the `#rrggbb` hex string, or `null` when the code is not found in
 * the bundled dataset (907 Pantone colours from the community open mapping).
 */
export function lookupPantone(code: string): string | null {
  if (!code.trim()) return null;
  const key = normalise(code);
  const hex = (PANTONE_MAP as Record<string, string>)[key];
  return hex ?? null;
}
