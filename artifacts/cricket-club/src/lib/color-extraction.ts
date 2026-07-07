import { Vibrant } from "node-vibrant/browser";

export interface ExtractedPalette {
  primaryColour: string | null;
  secondaryColour: string | null;
  tertiaryColour: string | null;
}

const NO_COLOURS: ExtractedPalette = {
  primaryColour: null,
  secondaryColour: null,
  tertiaryColour: null,
};

/**
 * Suggest a 3-colour brand palette from an image URL (a local blob: URL from
 * the just-picked file works best -- same-origin, no upload round-trip needed
 * before suggesting colours). Works for raster formats and SVG alike:
 * node-vibrant's browser image loader draws the loaded <img> to its own
 * internal canvas, so no manual rasterization is needed here.
 *
 * Returns all-null (never throws) when extraction fails outright, or when the
 * logo yields no usable swatches at all (a fully flat/monochrome image) --
 * callers should treat all-null as "couldn't detect, ask the admin to pick".
 * A partial result (1-2 distinct swatches) is still returned as-is; the caller
 * decides how to fill any remaining slot.
 */
export async function extractBrandPalette(
  imageUrl: string,
): Promise<ExtractedPalette> {
  let palette;
  try {
    palette = await Vibrant.from(imageUrl).getPalette();
  } catch {
    return NO_COLOURS;
  }

  // Priority order: the most saturated/eye-catching swatches first, since
  // those read best as a brand's primary colour.
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
    primaryColour: distinct[0] ?? null,
    secondaryColour: distinct[1] ?? null,
    tertiaryColour: distinct[2] ?? null,
  };
}
