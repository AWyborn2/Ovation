/**
 * Regenerates the Google Fonts catalogue the card template editor's font
 * picker searches (plan 2026-10-07-002, KTD12, U4).
 *
 * Source: Google Fonts' public family metadata, https://fonts.google.com/metadata/fonts
 * (no API key). Output: artifacts/cricket-club/src/lib/google-fonts-catalogue.json,
 * committed. Each entry keeps the family, its category and its upright weights,
 * sorted by popularity so the picker shows common families first.
 *
 *   pnpm --filter @workspace/scripts run build-google-fonts-catalogue
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://fonts.google.com/metadata/fonts";
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../artifacts/cricket-club/src/lib/google-fonts-catalogue.json",
);

type FamilyMetadata = {
  family: string;
  category: string;
  popularity: number;
  fonts: Record<string, unknown>;
  isOpenSource?: boolean;
  isBrandFont?: boolean;
};

export type CatalogueEntry = { family: string; category: string; weights: number[] };

/** Build catalogue entries from the metadata response body. */
export function buildCatalogue(body: string): CatalogueEntry[] {
  const json = JSON.parse(body.replace(/^\)\]\}'\s*/, "")) as {
    familyMetadataList: FamilyMetadata[];
  };
  return (
    json.familyMetadataList
      // Only families anyone may load through the Google Fonts CSS API.
      .filter((f) => f.isOpenSource !== false && !f.isBrandFont)
      .sort((a, b) => a.popularity - b.popularity)
      .map((f) => ({
        family: f.family,
        category: f.category,
        weights: Object.keys(f.fonts)
          .filter((k) => /^\d+$/.test(k))
          .map(Number)
          .sort((a, b) => a - b),
      }))
      .filter((f) => f.weights.length > 0)
  );
}

async function main(): Promise<void> {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Google Fonts metadata request failed: ${res.status}`);
  const catalogue = buildCatalogue(await res.text());
  writeFileSync(OUT, JSON.stringify(catalogue) + "\n");
  console.log(`Wrote ${catalogue.length} families to ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
