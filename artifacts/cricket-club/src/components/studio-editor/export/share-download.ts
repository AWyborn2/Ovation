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
