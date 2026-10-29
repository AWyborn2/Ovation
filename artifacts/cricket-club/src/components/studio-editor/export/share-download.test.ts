import { describe, expect, it } from "vitest";
import type { ShareCardInput } from "@/lib/share-card";
import {
  downloadSafeInput,
  fileSlug,
  pickedSlides,
  slideFilename,
  zipFilename,
} from "./share-download";

describe("Share → Download", () => {
  it("picks all slides, this one, or the ones ticked, in slide order", () => {
    expect(pickedSlides(4, "all", 2, new Set())).toEqual([0, 1, 2, 3]);
    expect(pickedSlides(4, "this", 2, new Set())).toEqual([2]);
    expect(pickedSlides(4, "custom", 0, new Set([3, 1]))).toEqual([1, 3]);
  });

  it("numbers files in slide order and names the zip after the set", () => {
    expect(fileSlug("Match Day: R5")).toBe("match-day-r5");
    expect(slideFilename("Match Day: R5", 0, "png")).toBe("match-day-r5-01.png");
    expect(slideFilename("Match Day: R5", 11, "jpg")).toBe("match-day-r5-12.jpg");
    expect(zipFilename("Match Day: R5")).toBe("match-day-r5.zip");
    expect(fileSlug("!!")).toBe("carousel");
  });

  it("never downloads a junior photo the card would hide", () => {
    const junior = {
      kind: "teamList",
      junior: true,
      photoUrl: "/kid.jpg",
    } as unknown as ShareCardInput;
    expect((downloadSafeInput(junior) as unknown as { photoUrl: unknown }).photoUrl).toBeNull();
    const allowed = { ...junior, juniorPhotoAllowed: true } as unknown as ShareCardInput;
    expect(downloadSafeInput(allowed)).toBe(allowed);
    const senior = { kind: "teamList", photoUrl: "/a.jpg" } as unknown as ShareCardInput;
    expect(downloadSafeInput(senior)).toBe(senior);
  });
});
