/**
 * Balanced card sets U5 — the Round cards settings: per-match or whole-round
 * drafting for game day and team lists, and the weekend wrap's day and time.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SocialSettings } from "@workspace/api-client-react";
import {
  RoundSchedulesCard,
  describeSchedule,
  hourLabel,
} from "@/components/social-queue/round-schedules-card";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SETTINGS = {
  familyConfig: {
    results: { enabled: true, grades: {} },
    achievements: { enabled: false, grades: {} },
    roundup: { enabled: true, grades: {} },
    matchday: { enabled: true, grades: {} },
  },
  roundSchedules: {
    gameDay: { mode: "perFixture", day: 4, hour: 18 },
    teamLists: { mode: "perFixture", day: 5, hour: 12 },
    weekendWrap: { mode: "off", day: 0, hour: 19 },
  },
} as unknown as SocialSettings;

describe("Round cards settings", () => {
  it("describes each schedule in plain words", () => {
    expect(hourLabel(0)).toBe("12 am");
    expect(hourLabel(12)).toBe("12 pm");
    expect(hourLabel(18)).toBe("6 pm");
    expect(describeSchedule("gameDay", { mode: "perRound", day: 4, hour: 18 })).toBe(
      "The whole round as one set, every Thursday at 6 pm.",
    );
    expect(describeSchedule("weekendWrap", { mode: "off", day: 0, hour: 19 })).toBe(
      "Not drafted automatically.",
    );
  });

  it("switching game day to whole round asks for a day and time, and saves the schedule", async () => {
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
    renderAt(<RoundSchedulesCard settings={SETTINGS} />, "/admin/social/cards");
    expect(screen.queryByLabelText("Game day: day")).toBeNull();
    fireEvent.change(screen.getByLabelText("Game day: how it drafts"), {
      target: { value: "perRound" },
    });
    fireEvent.change(screen.getByLabelText("Game day: day"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Game day: time"), { target: { value: "17" } });
    expect(screen.getByText("The whole round as one set, every Friday at 5 pm.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      roundSchedules: {
        gameDay: { mode: "perRound", day: 5, hour: 17 },
        teamLists: { mode: "perFixture", day: 5, hour: 12 },
        weekendWrap: { mode: "off", day: 0, hour: 19 },
      },
    });
  });

  it("the weekend wrap is whole round or off only", () => {
    renderAt(<RoundSchedulesCard settings={SETTINGS} />, "/admin/social/cards");
    const options = Array.from(
      (screen.getByLabelText("Weekend wrap: how it drafts") as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(options).toEqual(["perRound", "off"]);
  });
});
