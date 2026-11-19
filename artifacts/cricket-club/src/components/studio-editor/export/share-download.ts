/**
 * Share → Download for a carousel set (studio-create-consolidation S5): which
 * slides to save, what the files are called, and what each slide renders with.
 * Pure, so the rules are unit-tested; the panel only wires them up.
 */
import type { ShareCardInput } from "@/lib/share-card";

export type PageChoice = "all" | "this" | "custom";
export type StillFormat = "png" | "jpg";

/** The slide indexes to save, in slide order. */
export function pickedSlides(
  count: number,
  choice: PageChoice,
  current: number,
  custom: ReadonlySet<number>,
): number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  if (choice === "all") return all;
  if (choice === "this") return current >= 0 && current < count ? [current] : [];
  return all.filter((i) => custom.has(i));
}

/** A name for files: lower case, words joined by dashes ("match-day-r5"). */
export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "carousel"
  );
}

/**
 * Each saved file's name: the set's name and the slide's place in the set,
 * two digits ("match-day-r5-01.png"), so the files sort in slide order.
 */
export function slideFilename(setName: string, index: number, format: StillFormat): string {
  return `${fileSlug(setName)}-${String(index + 1).padStart(2, "0")}.${format}`;
}

/** The zip a multi-slide download is saved as, named after the set. */
export const zipFilename = (setName: string) => `${fileSlug(setName)}.zip`;

/**
 * What a slide renders with when it is downloaded. A junior slide shows a photo
 * only with the server's positive consent marker, the same rule the card follows,
 * so a download never carries a child's photo the card would hide (fail-closed).
 */
export function downloadSafeInput(input: ShareCardInput): ShareCardInput {
  const card = input as unknown as Record<string, unknown>;
  if (card.junior !== true || card.juniorPhotoAllowed === true) return input;
  return { ...card, photoUrl: null } as unknown as ShareCardInput;
}

/** What a failed render says: the server's own words when it sent any. */
export function renderFailure(e: unknown): string {
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  const raw =
    typeof data?.error === "string" ? data.error : e instanceof Error ? e.message : String(e);
  return raw.replace(/^Card render failed:\s*/, "").trim() || "It couldn't be drawn.";
}

/** A request the server refused outright (bad input, signed out): trying again won't help. */
const permanent = (e: unknown) => {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

/** A set download that stopped at a slide; the message names it. */
export class SlideDownloadError extends Error {
  constructor(
    /** The slide's place in the download, from 0. */
    readonly index: number,
    readonly label: string,
    detail: string,
  ) {
    super(`${label} couldn't be saved. ${detail}`);
    this.name = "SlideDownloadError";
  }
}

/**
 * Render `count` slides, `concurrency` at a time, results in slide order
 * (round 6 retest). A slide that fails is tried again (`attempts` in all);
 * one that still fails stops the download: no slide after it is started, and
 * the error names the slide, so a set is never saved with a slide missing or
 * drawn without its images. `onSaved` reports progress.
 */
export async function renderSlidesInOrder<T>(
  count: number,
  render: (n: number) => Promise<T>,
  {
    concurrency = 2,
    attempts = 2,
    label = (n: number) => `Slide ${n + 1}`,
    onSaved = () => {},
  }: {
    concurrency?: number;
    attempts?: number;
    label?: (n: number) => string;
    onSaved?: (done: number) => void;
  } = {},
): Promise<T[]> {
  const out: T[] = new Array(count);
  let next = 0;
  let done = 0;
  let failure: SlideDownloadError | null = null;
  const worker = async () => {
    while (next < count && !failure) {
      const n = next++;
      for (let attempt = 1; ; attempt++) {
        try {
          out[n] = await render(n);
          break;
        } catch (e) {
          if (failure) return;
          if (attempt >= attempts || permanent(e)) {
            failure = new SlideDownloadError(n, label(n), renderFailure(e));
            return;
          }
        }
      }
      onSaved(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, count)) }, worker));
  if (failure) throw failure;
  return out;
}
