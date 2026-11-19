import { describe, expect, it } from "vitest";
import type { ShareCardInput } from "@/lib/share-card";
import {
  SlideDownloadError,
  downloadSafeInput,
  fileSlug,
  pickedSlides,
  renderFailure,
  renderSlidesInOrder,
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("renderSlidesInOrder (round 6 retest)", () => {
  it("renders 14 slides two at a time, finishing out of order, saved in slide order", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    const out = await renderSlidesInOrder(
      14,
      async (n) => {
        running++;
        most = Math.max(most, running);
        await wait(Math.random() * 15);
        running--;
        return `slide-${n + 1}`;
      },
      { onSaved: (d) => done.push(d) },
    );
    expect(out).toEqual(Array.from({ length: 14 }, (_, n) => `slide-${n + 1}`));
    expect(most).toBe(2);
    expect(done).toEqual(Array.from({ length: 14 }, (_, n) => n + 1));
  });

  it("tries a slide that failed once more, then carries on", async () => {
    const tries = new Map<number, number>();
    const out = await renderSlidesInOrder(4, async (n) => {
      tries.set(n, (tries.get(n) ?? 0) + 1);
      if (n === 2 && tries.get(n) === 1) throw new Error("A card image could not be loaded.");
      return n;
    });
    expect(out).toEqual([0, 1, 2, 3]);
    expect(tries.get(2)).toBe(2);
  });

  it("a slide that keeps failing stops the download and is named; nothing is returned", async () => {
    const started: number[] = [];
    const run = renderSlidesInOrder(
      14,
      async (n) => {
        started.push(n);
        await wait(2);
        if (n === 5)
          throw Object.assign(new Error("Request failed"), {
            status: 500,
            data: {
              error:
                "Card render failed: An image on this card didn't load: peel-fencing.png (incomplete). Check that photo or logo, then try again.",
            },
          });
        return n;
      },
      { label: (n) => `Slide ${n + 1} (${n === 5 ? "Sponsors" : "Fixture"})` },
    );
    const err = await run.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SlideDownloadError);
    expect((err as Error).message).toBe(
      "Slide 6 (Sponsors) couldn't be saved. An image on this card didn't load: peel-fencing.png (incomplete). Check that photo or logo, then try again.",
    );
    // Slide 6 was tried twice; no slide was started after it failed for good.
    expect(started.filter((n) => n === 5)).toHaveLength(2);
    expect(Math.max(...started)).toBeLessThan(9);
  });

  it("does not retry a request the server refused (signed out, bad input)", async () => {
    let tries = 0;
    await expect(
      renderSlidesInOrder(1, async () => {
        tries++;
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }),
    ).rejects.toThrow("Slide 1 couldn't be saved. Forbidden");
    expect(tries).toBe(1);
  });

  it("reads the server's own words for a failure", () => {
    expect(renderFailure({ data: { error: "Card render failed: The renderer is busy." } })).toBe(
      "The renderer is busy.",
    );
    expect(renderFailure(new Error("Network down"))).toBe("Network down");
  });
});
