/**
 * Preview data for the template editor (plan KTD17, U3): the kind's sample
 * card, and a "stress test" variant that shows overflow and spill before a
 * template is saved — long names, emptied optional lines, and nine-row lists.
 */
import type { ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";

/** A name long enough to overflow most name boxes. */
export const STRESS_NAME = "Christopher Van Der Merwe-Abercrombie";
/** How many rows a stressed list carries. */
export const STRESS_ROWS = 9;

const NAME_KEY = /(?:^|[a-z])(?:name|Name|team|Team|opponent|Opponent)$|^name$|^team$/;
/** Optional one-line extras a template must cope with being empty. */
const OPTIONAL_KEYS = new Set(["headline", "subline", "tagline", "sponsorPresentedBy", "note"]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function stress(value: unknown, key: string | null): unknown {
  if (Array.isArray(value)) {
    const items = value.map((v) => stress(v, null));
    // Lists of rows (objects) grow to STRESS_ROWS; plain arrays keep their length.
    if (items.length > 0 && items.every(isRecord) && items.length < STRESS_ROWS) {
      const grown = [...items];
      for (let i = items.length; i < STRESS_ROWS; i += 1) {
        const copy = structuredClone(items[i % items.length]) as Record<string, unknown>;
        if (typeof copy.pos === "number") copy.pos = i + 1;
        if ("isClub" in copy) copy.isClub = false;
        grown.push(copy);
      }
      return grown;
    }
    return items;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stress(v, k);
    return out;
  }
  if (typeof value === "string" && key) {
    if (OPTIONAL_KEYS.has(key)) return "";
    if (NAME_KEY.test(key)) return STRESS_NAME;
  }
  return value;
}

/** The sample card for a kind, speaking as the club when a name is given. */
export function previewSample(
  kind: ShareCardInput["kind"],
  clubName?: string | null,
): ShareCardInput {
  return sampleCardInput(kind, clubName);
}

/** The kind's sample with long names, empty optional lines and nine-row lists. */
export function stressSample(
  kind: ShareCardInput["kind"],
  clubName?: string | null,
): ShareCardInput {
  return stress(structuredClone(sampleCardInput(kind, clubName)), null) as ShareCardInput;
}
