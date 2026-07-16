import { Vibrant } from "node-vibrant/browser";

export interface ExtractedPalette {
  backgroundColour: string | null;
  primaryColour: string | null;
  juniorsColour: string | null;
}

const NO_COLOURS: ExtractedPalette = {
  backgroundColour: null,
  primaryColour: null,
  juniorsColour: null,
};

/** node-vibrant's browser image loader has no built-in timeout -- a malformed
 * or pathological file can leave its load promise pending forever. Race it
 * against this so a bad upload degrades to "couldn't detect colours" instead
 * of silently hanging the whole branding flow (extraction runs before the
 * actual upload call).
 */
const EXTRACTION_TIMEOUT_MS = 8000;

/**
 * Suggest a 3-colour brand palette from an image URL (a local blob: URL from
 * the just-picked file works best -- same-origin, no upload round-trip needed
 * before suggesting colours). Works for raster formats and SVG alike:
 * node-vibrant's browser image loader draws the loaded <img> to its own
 * internal canvas, so no manual rasterization is needed here.
 *
 * Returns all-null (never throws) when extraction fails outright, times out,
 * or when the logo yields no usable swatches at all (a fully flat/monochrome
 * image) -- callers should treat all-null as "couldn't detect, ask the admin
 * to pick". A partial result (1-2 distinct swatches) is still returned as-is;
 * the caller decides how to fill any remaining slot.
 */
export async function extractBrandPalette(
  imageUrl: string,
): Promise<ExtractedPalette> {
  let palette;
  try {
    palette = await Promise.race([
      Vibrant.from(imageUrl).getPalette(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("colour extraction timed out")), EXTRACTION_TIMEOUT_MS),
      ),
    ]);
  } catch {
    return NO_COLOURS;
  }

  // Priority order: the most saturated/eye-catching swatches first, since
  // those read best as a brand's background colour.
  const candidates = [
    palette.Vibrant,
    palette.DarkVibrant,
    palette.Muted,
    palette.DarkMuted,
    palette.LightVibrant,
    palette.LightMuted,
  ]
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => s.hex);

  const distinct: string[] = [];
  for (const hex of candidates) {
    if (!distinct.includes(hex)) distinct.push(hex);
    if (distinct.length === 3) break;
  }

  return {
    backgroundColour: distinct[0] ?? null,
    primaryColour: distinct[1] ?? null,
    juniorsColour: distinct[2] ?? null,
  };
}
