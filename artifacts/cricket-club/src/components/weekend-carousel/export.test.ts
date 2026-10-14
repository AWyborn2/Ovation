import { describe, expect, it, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import type { WeekendSlide } from "./model";
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/share-card", () => ({
  downloadBlob: download,
  SIZES: { square: { code: "SQ" } },
}));
import { downloadWeekendZip } from "./export";
const slides = Array.from({ length: 14 }, (_, i) => ({
  id: `${i}`,
  label: i === 0 ? "Title" : i === 13 ? "Sponsors" : `Team ${i}`,
})) as WeekendSlide[];
describe("complete numbered ZIP", () => {
  beforeEach(() => download.mockClear());
  it("includes every PNG in order beyond ten slides", async () => {
    const progress = vi.fn();
    await downloadWeekendZip(
      slides,
      "square",
      async () => new Blob(["png"], { type: "image/png" }),
      progress,
    );
    expect(download).toHaveBeenCalledOnce();
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(download.mock.calls[0][0]);
    });
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toHaveLength(14);
    expect(Object.keys(zip.files)[0]).toBe("001-title.png");
    expect(Object.keys(zip.files).at(-1)).toBe("014-sponsors.png");
    expect(progress).toHaveBeenLastCalledWith(14, 14);
  });
  it("does not download a partial ZIP when a render fails", async () => {
    await expect(
      downloadWeekendZip(slides, "square", async (slide) => {
        if (slide.id === "5") throw new Error("Image failed");
        return new Blob(["png"], { type: "image/png" });
      }),
    ).rejects.toThrow("Slide 6 (Team 5)");
    expect(download).not.toHaveBeenCalled();
  });
  it("rejects empty/wrong-format output and an empty fixture selection", async () => {
    await expect(downloadWeekendZip(slides, "square", async () => new Blob())).rejects.toThrow(
      "did not return a PNG",
    );
    await expect(downloadWeekendZip(slides.slice(0, 2), "square", vi.fn())).rejects.toThrow(
      "Select at least one fixture",
    );
    expect(download).not.toHaveBeenCalled();
  });
});
