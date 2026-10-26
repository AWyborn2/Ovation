import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { resolveClubLook } from "@workspace/scorecard/kiosk-display";
import type { DisplayBoard, HonourBrand } from "../types";
import { KioskPlayer } from "./kiosk-player";
import { buildRotation } from "./rotation";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** An Image that loads on the next tick, or fails when its url says "broken". */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(url: string) {
    setTimeout(() => (url.includes("broken") ? this.onerror?.() : this.onload?.()), 0);
  }
}

const brand = { name: "Test Club", monogram: "TC" } as HonourBrand;
const board = (id: string, title: string, cols: string[]): DisplayBoard => ({
  id,
  category: "awards",
  layout: "grid",
  title,
  entries: [],
  grid: {
    rowHeading: "Season",
    columnHeadings: cols,
    rows: [
      { heading: "2024/25", cells: cols.map((c) => ({ entries: [{ text: `${c} winner` }] })) },
    ],
  },
  display: { columns: 1, transition: "scroll", fit: false },
});

describe("KioskPlayer", () => {
  it("plays each column group, then the next board, then wraps", async () => {
    vi.useFakeTimers();
    // 1-second pages and no end hold, so each screen lasts one second.
    const look = resolveClubLook({ kioskLook: { pageSecs: 1, hold: 0, move: "pages" } });
    const boards = [
      board("champions", "Club Champions", ["First Grade", "Second Grade", "Third Grade"]),
      board("officers", "Office Bearers", ["President"]),
    ];
    const items = buildRotation({
      boards,
      settings: {
        kioskSequence: [],
        boardConfigs: { champions: { columnsPerScreen: 2 } },
        kioskSponsorSlideEvery: 3,
        kioskSponsorSlideStyle: "grid",
      },
      look,
      sponsors: [],
      ads: [],
      sponsorSlides: false,
    });
    const onCycle = vi.fn();
    render(
      <KioskPlayer
        items={items}
        brand={brand}
        look={look}
        sponsors={[]}
        onCycle={onCycle}
        reducedMotion
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText("Club Champions")).toBeTruthy();
    expect(screen.getByText("First to Second Grade", { selector: ".hb-sub" })).toBeTruthy();
    expect(screen.getByText("First Grade winner")).toBeTruthy();
    expect(screen.queryByText("Third Grade winner")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByText("Third Grade", { selector: ".hb-sub" })).toBeTruthy();
    expect(screen.getByText("Third Grade winner")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByText("Office Bearers")).toBeTruthy();
    expect(screen.queryByText("Club Champions")).toBeNull();
    expect(onCycle).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByText("Club Champions")).toBeTruthy();
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it("plays a photo slideshow pass, skipping a photo that fails to load", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", FakeImage);
    const look = resolveClubLook({ kioskLook: { pageSecs: 1, hold: 0, move: "pages" } });
    const slideshow = {
      id: "photos:1",
      name: "Clubroom",
      library: "senior" as const,
      source: "all" as const,
      order: "newest" as const,
      perPass: 3,
      secondsPerPhoto: 2,
      captions: true,
    };
    const items = buildRotation({
      boards: [board("officers", "Office Bearers", ["President"])],
      settings: {
        kioskSequence: ["officers", "photos:1", "photos:missing"],
        boardConfigs: {},
        kioskSponsorSlideEvery: 3,
        kioskSponsorSlideStyle: "grid",
      },
      look,
      sponsors: [],
      ads: [],
      slideshows: [slideshow],
      slideshowPhotos: {
        "photos:1": [
          { url: "/a.jpg", width: 4, height: 3, caption: "A Grade · 2025/26" },
          { url: "/broken.jpg", width: 4, height: 3, caption: "Broken" },
          { url: "/c.jpg", width: 4, height: 3, caption: null },
        ],
      },
      sponsorSlides: false,
    });
    // An unknown or empty slideshow is left out of the rotation.
    expect(items.map((i) => i.kind)).toEqual(["board", "photos"]);
    render(<KioskPlayer items={items} brand={brand} look={look} sponsors={[]} reducedMotion />);
    const shown = () =>
      screen
        .queryAllByTestId("kiosk-photo")
        .map((el) => el.querySelector(".hb-photo-slide-img")?.getAttribute("src"));

    // Watch the top screen every 100 ms through one pass and back to the board.
    const seen: string[] = [];
    for (let t = 0; t < 80; t++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      const top = shown().at(-1) ?? (screen.queryByText("Office Bearers") ? "board" : "");
      if (top && seen.at(-1) !== top) seen.push(top);
      if (top === "/a.jpg") expect(screen.getByText("A Grade · 2025/26")).toBeTruthy();
    }
    expect(seen.slice(0, 4)).toEqual(["board", "/a.jpg", "/c.jpg", "board"]);
    expect(screen.queryByText("Broken")).toBeNull();
  });

  it("shows a board over its photo background, kept for every screen of the board", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", FakeImage);
    const look = resolveClubLook({ kioskLook: { pageSecs: 1, hold: 0, move: "pages" } });
    const slideshow = {
      id: "photos:bg",
      name: "Backgrounds",
      library: "senior" as const,
      source: "all" as const,
      order: "newest" as const,
      perPass: 5,
      secondsPerPhoto: 5,
      captions: false,
    };
    const items = buildRotation({
      boards: [
        board("champions", "Club Champions", ["First Grade", "Second Grade", "Third Grade"]),
        board("officers", "Office Bearers", ["President"]),
      ],
      settings: {
        kioskSequence: [],
        boardConfigs: {
          champions: {
            columnsPerScreen: 2,
            photoBackground: { slideshowId: "photos:bg", dim: "light" },
          },
          // A slideshow with no photos leaves the board as it was.
          officers: { photoBackground: { slideshowId: "photos:none" } },
        },
        kioskSponsorSlideEvery: 3,
        kioskSponsorSlideStyle: "grid",
      },
      look,
      sponsors: [],
      ads: [],
      slideshows: [slideshow],
      slideshowPhotos: {
        "photos:bg": [
          { url: "/bg1.jpg", width: 4, height: 3 },
          { url: "/bg2.jpg", width: 4, height: 3 },
        ],
      },
      sponsorSlides: false,
    });
    expect(items.map((i) => (i.kind === "board" ? (i.backdrop?.dim ?? null) : "?"))).toEqual([
      "light",
      null,
    ]);
    render(<KioskPlayer items={items} brand={brand} look={look} sponsors={[]} reducedMotion />);
    const backdrop = () =>
      screen.queryAllByTestId("kiosk-board-photobg").map((el) => el.getAttribute("src"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Club Champions")).toBeTruthy();
    expect(backdrop().at(-1)).toBe("/bg1.jpg");
    expect(document.querySelector(".hb-kp-photobg")?.getAttribute("data-dim")).toBe("light");

    // The second column group keeps the same photo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByText("Third Grade winner")).toBeTruthy();
    expect(backdrop().at(-1)).toBe("/bg1.jpg");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(screen.getByText("Office Bearers")).toBeTruthy();
    expect(backdrop()).toEqual([]);

    // Next time round the board takes the slideshow's next photo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByText("Club Champions")).toBeTruthy();
    expect(backdrop().at(-1)).toBe("/bg2.jpg");
  });
});
