/**
 * New Studio's look step: a results, match summary or team list carousel picks its own
 * "What these cards show" (Minimal / Standard / Full), for that carousel only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  presetFields,
  resolveVisibleFields,
  type ContentOverride,
} from "@workspace/scorecard/card-content";
import { SetKindContentPanel } from "./weekend-carousel";
import type { WeekendCarouselState } from "./use-weekend-carousel";

afterEach(cleanup);

function state(
  contentKind: "teamList" | "results" | "matchSummary" | null,
  kindOverride: ContentOverride = {},
) {
  const club = { preset: "standard" as const, fields: {}, juniorConsolidateByDay: true };
  const setKindOverride = vi.fn();
  const s = {
    contentKind,
    kindClubContent: contentKind ? club : null,
    kindOverride,
    setKindOverride,
    kindVisibleFields: contentKind
      ? resolveVisibleFields(contentKind, club, kindOverride)
      : undefined,
    busy: false,
  } as unknown as WeekendCarouselState;
  return { s, setKindOverride };
}

describe("A carousel's own What these cards show", () => {
  it("picks a preset for this carousel only", () => {
    const { s, setKindOverride } = state("teamList");
    render(<SetKindContentPanel s={s} />);
    expect(screen.getByTestId("set-content-panel")).toHaveTextContent("Club setting (Standard)");
    fireEvent.click(screen.getByTestId("set-content-preset-minimal"));
    expect(setKindOverride).toHaveBeenCalledWith({ preset: "minimal" });
  });

  it("shows the carousel's choice and goes back to the club setting", () => {
    const { s, setKindOverride } = state("results", { preset: "full" });
    render(<SetKindContentPanel s={s} />);
    expect(screen.getByTestId("set-content-panel")).toHaveTextContent("Changed for this carousel");
    expect(s.kindVisibleFields).toEqual(presetFields("results", "full"));
    fireEvent.click(screen.getByTestId("set-content-reset"));
    expect(setKindOverride).toHaveBeenCalledWith({});
  });

  it("isn't shown for a Match Day set (it has its own panel)", () => {
    const { s } = state(null);
    render(<SetKindContentPanel s={s} />);
    expect(screen.queryByTestId("set-content-panel")).toBeNull();
  });
});
