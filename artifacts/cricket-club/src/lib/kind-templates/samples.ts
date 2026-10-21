/**
 * Preview data for the template editor (plan KTD17, U3): the kind's sample
 * card, and a "stress test" variant that shows overflow and spill before a
 * template is saved — long names, emptied optional lines, and nine-row lists.
 * List rows without a photo (Team of the Week's players) get the stand-in
 * photo, so a list's photo cell shows where it sits while designing.
 */
import type { ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { PREVIEW_PHOTO } from "./use-template-data";

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

/** List rows that carry an empty photo get the stand-in one (a new object; the sample is shared). */
function withRowPhotos(input: ShareCardInput): ShareCardInput {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (Array.isArray(v) && v.some((r) => isRecord(r) && "photoUrl" in r && !r.photoUrl)) {
      changed = true;
      out[k] = v.map((r) =>
        isRecord(r) && "photoUrl" in r && !r.photoUrl ? { ...r, photoUrl: PREVIEW_PHOTO } : r,
      );
    } else out[k] = v;
  }
  return changed ? (out as ShareCardInput) : input;
}

/** The sample card for a kind, speaking as the club when a name is given. */
export function previewSample(
  kind: ShareCardInput["kind"],
  clubName?: string | null,
): ShareCardInput {
  return withRowPhotos(sampleCardInput(kind, clubName));
}

/** The kind's sample with long names, empty optional lines and nine-row lists. */
export function stressSample(
  kind: ShareCardInput["kind"],
  clubName?: string | null,
): ShareCardInput {
  return withRowPhotos(
    stress(structuredClone(sampleCardInput(kind, clubName)), null) as ShareCardInput,
  );
}
