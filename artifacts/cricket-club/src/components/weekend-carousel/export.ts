import { SIZES, type CardSize } from "@/lib/share-card";
import { saveFiles, toFile } from "@/lib/save-files";
import type { WeekendSlide } from "./model";

/**
 * Fail before saving, never deliver a set missing a selected slide. A phone or
 * tablet saves each slide as its own image; a desktop gets one ZIP.
 */
export async function downloadWeekendZip(
  slides: WeekendSlide[],
  size: CardSize,
  render: (slide: WeekendSlide, size: CardSize) => Promise<Blob>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (slides.length < 3) throw new Error("Select at least one fixture before exporting.");
  const files: File[] = [];
  onProgress?.(0, slides.length);
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    try {
      const blob = await render(slide, size);
      if (!blob.size || !blob.type.startsWith("image/png"))
        throw new Error("The renderer did not return a PNG.");
      const name =
        slide.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || slide.id;
      files.push(toFile(blob, `${String(i + 1).padStart(3, "0")}-${name}.png`));
      onProgress?.(i + 1, slides.length);
    } catch (error) {
      throw new Error(
        `Slide ${i + 1} (${slide.label}) could not be exported. Nothing was saved. ${error instanceof Error ? error.message : "Please retry."}`,
      );
    }
  }
  await saveFiles(files, { zipName: `weekend-match-day-${SIZES[size].code}.zip` });
}
