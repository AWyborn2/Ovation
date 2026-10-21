/**
 * Fonts for imported text (ADR-011 §9, T8.4). A template may name any family
 * in the committed Google Fonts catalogue; a Figma font outside it gets the
 * nearest substitute, and the import report says which.
 *
 * The catalogue is passed in (`artifacts/cricket-club/src/lib/google-fonts-catalogue.json`,
 * popularity order), so this module stays pure.
 */

export type FontCatalogueEntry = { family: string; category: string; weights: number[] };

export type FontChoice = {
  /** The catalogue family the text uses, and its category. */
  family: string;
  category: string;
  weight: number;
  /** Set when the Figma family isn't in the catalogue. */
  substitutedFrom?: string;
  /** Set when the family lacks the Figma weight. */
  weightFrom?: number;
};

/**
 * Well-known desktop and commercial families → the catalogue family closest
 * in build, metric-compatible where one exists (Arimo for Helvetica/Arial,
 * Tinos for Times, Cousine for Courier). Each entry lists fallbacks in order;
 * the first one in the catalogue wins.
 */
const KNOWN: Record<string, string[]> = {
  helvetica: ["Arimo", "Inter"],
  "helvetica neue": ["Arimo", "Inter"],
  arial: ["Arimo", "Inter"],
  "sf pro": ["Inter"],
  "sf pro display": ["Inter"],
  "sf pro text": ["Inter"],
  "san francisco": ["Inter"],
  "segoe ui": ["Open Sans", "Inter"],
  gotham: ["Montserrat"],
  "proxima nova": ["Montserrat"],
  avenir: ["Nunito Sans", "Nunito"],
  "avenir next": ["Nunito Sans", "Nunito"],
  futura: ["Jost", "Montserrat"],
  "gill sans": ["Lato"],
  din: ["Barlow"],
  "din pro": ["Barlow"],
  "din condensed": ["Barlow Condensed", "Oswald"],
  "din alternate": ["Barlow Semi Condensed", "Barlow"],
  "trade gothic": ["Barlow Condensed", "Oswald"],
  "trade gothic next": ["Barlow Condensed", "Oswald"],
  knockout: ["Anton", "Oswald"],
  druk: ["Anton", "Oswald"],
  "druk wide": ["Archivo Black"],
  impact: ["Anton", "Oswald"],
  bebas: ["Bebas Neue"],
  eurostile: ["Michroma", "Orbitron"],
  times: ["Tinos", "EB Garamond"],
  "times new roman": ["Tinos", "EB Garamond"],
  georgia: ["Gelasio", "EB Garamond"],
  garamond: ["EB Garamond"],
  "adobe garamond": ["EB Garamond"],
  baskerville: ["Libre Baskerville", "EB Garamond"],
  didot: ["Playfair Display"],
  bodoni: ["Bodoni Moda", "Playfair Display"],
  courier: ["Cousine", "Space Mono"],
  "courier new": ["Cousine", "Space Mono"],
  menlo: ["JetBrains Mono", "IBM Plex Mono", "Space Mono"],
  monaco: ["JetBrains Mono", "IBM Plex Mono", "Space Mono"],
  consolas: ["JetBrains Mono", "IBM Plex Mono", "Space Mono"],
  "sf mono": ["JetBrains Mono", "IBM Plex Mono", "Space Mono"],
};

/** By what the name says, when it isn't a known family. */
const BY_NAME: Array<[RegExp, string[]]> = [
  [/mono|code|courier/i, ["JetBrains Mono", "IBM Plex Mono", "Space Mono"]],
  [/condensed|compressed|narrow|cond\b/i, ["Barlow Condensed", "Oswald"]],
  [/script|brush|hand|marker/i, ["Kaushan Script"]],
  [/slab/i, ["Zilla Slab"]],
  [/serif|garamond|caslon|book|roman|text/i, ["EB Garamond", "Playfair Display"]],
  [/black|heavy|poster|display|headline|ultra/i, ["Anton", "Archivo Black"]],
];

const DEFAULT_FAMILIES = ["Inter", "Open Sans"];

const squash = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** A catalogue lookup by family name, ignoring case, spaces and dashes. */
export function fontIndex(
  catalogue: readonly FontCatalogueEntry[],
): Map<string, FontCatalogueEntry> {
  const index = new Map<string, FontCatalogueEntry>();
  for (const entry of catalogue) {
    const key = squash(entry.family);
    if (!index.has(key)) index.set(key, entry);
  }
  return index;
}

/** The weight nearest to `wanted` (ties go to the heavier), as the web font loader picks. */
export function nearestWeight(available: readonly number[], wanted: number): number {
  if (available.length === 0) return wanted;
  return available.reduce((best, w) => {
    const d = Math.abs(w - wanted);
    const bd = Math.abs(best - wanted);
    return d < bd || (d === bd && w > best) ? w : best;
  });
}

/**
 * The catalogue family and weight for a Figma font: the family itself when
 * the catalogue has it (`BebasNeue` finds `Bebas Neue`), else the nearest
 * substitute, with the weight snapped to one the family has.
 */
export function chooseFont(
  index: Map<string, FontCatalogueEntry>,
  family: string,
  weight: number,
): FontChoice {
  const wanted = Number.isFinite(weight) && weight > 0 ? weight : 400;
  const exact = index.get(squash(family));
  const entry = exact ?? substitute(index, family);
  const snapped = nearestWeight(entry.weights, wanted);
  const choice: FontChoice = { family: entry.family, category: entry.category, weight: snapped };
  if (!exact) choice.substitutedFrom = family;
  if (snapped !== wanted) choice.weightFrom = wanted;
  return choice;
}

function substitute(index: Map<string, FontCatalogueEntry>, family: string): FontCatalogueEntry {
  const pick = (names: readonly string[]) => {
    for (const name of names) {
      const hit = index.get(squash(name));
      if (hit) return hit;
    }
    return undefined;
  };
  const name = family.trim().toLowerCase();
  // A known family, also with a weight or style word after it ("Gotham Bold").
  const base = Object.keys(KNOWN)
    .filter((k) => name === k || name.startsWith(`${k} `))
    .sort((a, b) => b.length - a.length)[0];
  if (base) {
    const hit = pick(KNOWN[base]!);
    if (hit) return hit;
  }
  // A catalogue family with a suffix ("Anton SC", "Inter Display").
  const word = name.split(/\s+/)[0] ?? "";
  for (const [key, entry] of index) if (key === squash(word)) return entry;
  for (const [pattern, names] of BY_NAME) {
    if (!pattern.test(family)) continue;
    // "Sans serif" names aren't serif.
    if (names.includes("EB Garamond") && /sans/i.test(family)) continue;
    const hit = pick(names);
    if (hit) return hit;
  }
  const fallback = pick(DEFAULT_FAMILIES);
  if (fallback) return fallback;
  const first = index.values().next().value as FontCatalogueEntry | undefined;
  if (!first) throw new Error("The font catalogue is empty.");
  return first;
}

/** The CSS family value a template stores: `'Family',sans-serif` (or monospace / serif). */
export function cssFontFamily(entry: Pick<FontCatalogueEntry, "family" | "category">): string {
  const category = entry.category.toLowerCase();
  const generic =
    category === "monospace" ? "monospace" : category === "serif" ? "serif" : "sans-serif";
  return `'${entry.family}',${generic}`;
}
