import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { resolveClubLook } from "@workspace/scorecard/kiosk-display";
import type { DisplayBoard, HonourBrand } from "../types";
import { KioskPlayer } from "./kiosk-player";
import { buildRotation } from "./rotation";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
});
