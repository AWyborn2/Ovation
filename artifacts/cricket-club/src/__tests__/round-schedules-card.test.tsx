/**
 * Round carousel times (balanced card sets U5; Posting Plan R20): the day and
 * time for each round carousel the Posting Plan turns on. Which cards post as
 * a round carousel is chosen on the Posting Plan tab.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SocialSettings } from "@workspace/api-client-react";
import { findPostingStyle, planFromStyle } from "@workspace/scorecard/posting-plan";
import {
  RoundSchedulesCard,
  hourLabel,
  whenLabel,
} from "@/components/social-queue/round-schedules-card";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SCHEDULES = {
  gameDay: { mode: "perFixture", day: 4, hour: 18 },
  teamLists: { mode: "perRound", day: 5, hour: 12 },
  weekendWrap: { mode: "perRound", day: 0, hour: 19 },
};

const settingsFor = (styleId: string) =>
  ({
    roundSchedules: SCHEDULES,
    postingPlan: planFromStyle(findPostingStyle(styleId)!),
  }) as unknown as SocialSettings;

describe("Round carousel times", () => {
  it("labels times in plain words", () => {
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(12)).toBe("12 pm");
    expect(whenLabel({ day: 0, hour: 19 })).toBe("Sunday at 7 pm");
  });

  it("shows a time only for the round carousels the plan turns on", () => {
    renderAt(
      <RoundSchedulesCard settings={settingsFor("round-carousels")} />,
      "/admin/social/cards",
    );
    expect(screen.queryByLabelText("Game day: day")).toBeNull();
    expect(screen.getByLabelText("Team lists: day")).toBeTruthy();
    expect(screen.getByLabelText("Results, ladders and leaderboards: day")).toBeTruthy();
  });

  it("keeps the shared results time when only ladders are a round carousel", () => {
    const s = settingsFor("every-match");
    const plan = s.postingPlan!;
    plan.rows.ladders = { ...plan.rows.ladders, enabled: true };
    renderAt(<RoundSchedulesCard settings={s} />, "/admin/social/cards");
    expect(screen.getByLabelText("Results, ladders and leaderboards: day")).toBeTruthy();
  });

  it("says so when nothing posts as a round carousel", () => {
    renderAt(<RoundSchedulesCard settings={settingsFor("results-only")} />, "/admin/social/cards");
    expect(screen.getByText("No cards post as a round carousel yet.")).toBeTruthy();
  });

  it("saves a new time and keeps each card's mode", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
          bodies.push(JSON.parse(String(init?.body)));
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    renderAt(
      <RoundSchedulesCard settings={settingsFor("round-carousels")} />,
      "/admin/social/cards",
    );
    fireEvent.change(screen.getByLabelText("Team lists: day"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Team lists: time"), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      roundSchedules: { ...SCHEDULES, teamLists: { mode: "perRound", day: 4, hour: 17 } },
    });
  });
});
