/**
 * Create → Carousel set → Fill it from: Season, then Round (one or several), with the
 * dates behind "Use dates instead". A pick fills the carousel's From/To and limits
 * its games; junior sets read the junior rounds only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CarouselRounds } from "@workspace/api-client-react";
import type { CarouselSetType } from "@workspace/scorecard/queued-carousel";
import { renderWithHistory } from "@/test/render";
import { RoundPicker, roundDates, spanOf, useRoundPick } from "./round-picker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const round = (key: string, label: string, from: string, to: string, gameIds: number[]) => ({
  key,
  label,
  from,
  to,
  other: key === "other",
  gameIds,
});

const RESULTS: CarouselRounds = {
  seasons: [
    {
      season: 2026,
      label: "2026/27",
      rounds: [
        round("r:round 5", "Round 5", "2026-11-07", "2026-11-08", [-1, -2]),
        round("r:round 6", "Round 6", "2026-11-14", "2026-11-15", [-3, -4]),
      ],
    },
    {
      season: 2021,
      label: "2021/22",
      rounds: [
        round("r:round 3", "Round 3", "2021-10-30", "2021-10-30", [-50]),
        round("r:round 4", "Round 4", "2021-11-06", "2021-11-06", [-51, -52]),
        round("r:round 5", "Round 5", "2021-11-13", "2021-11-13", [-53]),
        round("other", "Other games", "2022-01-08", "2022-01-08", [-54]),
      ],
    },
  ],
  defaultSeason: 2026,
  defaultRounds: ["r:round 6"],
};

const FIXTURES: CarouselRounds = {
  seasons: [
    {
      season: 2026,
      label: "2026/27",
      rounds: [
        round("r:round 7", "Round 7", "2026-11-21", "2026-11-22", [11, 12]),
        round("r:round 8", "Round 8", "2026-11-28", "2026-11-28", [13]),
      ],
    },
  ],
  defaultSeason: 2026,
  defaultRounds: ["r:round 7"],
};

const JUNIOR: CarouselRounds = {
  seasons: [
    {
      season: 2026,
      label: "2026/27",
      rounds: [round("other", "Other games", "2026-11-21", "2026-12-05", [-2_000_000_031])],
    },
  ],
  defaultSeason: null,
  defaultRounds: [],
};

function stubRounds(byPath: Record<string, CarouselRounds>) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      urls.push(url);
      const hit = Object.entries(byPath).find(([p]) => url.includes(p));
      return new Response(JSON.stringify(hit ? hit[1] : {}), {
        status: hit ? 200 : 404,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return urls;
}

/** The carousel's range as the picker sets it, shown so the test can read it. */
function Harness({
  setType,
  audience = "senior",
}: {
  setType: CarouselSetType;
  audience?: "senior" | "junior";
}) {
  const [range, setRange] = useState<{ from: string; to: string; ids: number[] | null }>({
    from: "2026-11-19",
    to: "2026-11-22",
    ids: null,
  });
  const s = {
    from: range.from,
    to: range.to,
    applyRange: (r: typeof range) => setRange(r),
  };
  const pick = useRoundPick(s, setType, audience);
  return (
    <>
      <RoundPicker pick={pick} setType={setType} disabled={false} />
      {pick.mode === "dates" && (
        <>
          <label>
            From
            <input
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
        </>
      )}
      <output data-testid="range">
        {range.from}|{range.to}|{range.ids === null ? "all" : range.ids.join(",")}
      </output>
    </>
  );
}

const range = () => screen.getByTestId("range").textContent;
const roundBox = (name: RegExp) =>
  within(screen.getByRole("group", { name: "Rounds" })).getByRole("checkbox", { name });

describe("Season and Round picker", () => {
  it("formats round dates DD/MM/YYYY and spans a multi-round pick", () => {
    expect(roundDates({ from: "2021-10-30", to: "2021-10-30" })).toBe("30/10/2021");
    expect(roundDates({ from: "2026-11-07", to: "2026-11-08" })).toBe("07/11/2026 to 08/11/2026");
    expect(spanOf(RESULTS.seasons[1].rounds.slice(0, 2))).toEqual({
      from: "2021-10-30",
      to: "2021-11-06",
      ids: [-50, -51, -52],
    });
    expect(spanOf([])).toBeNull();
  });

  it("opens Results on the most recent completed round, filling From/To", async () => {
    stubRounds({ "/api/weekend-carousel/rounds": RESULTS });
    renderWithHistory(<Harness setType="results" />);
    await waitFor(() => expect(range()).toBe("2026-11-14|2026-11-15|-3,-4"));
    expect(screen.getByLabelText("Season")).toHaveValue("2026");
    expect(roundBox(/Round 6/)).toBeChecked();
    expect(roundBox(/Round 5/)).not.toBeChecked();
    expect(roundBox(/Round 6/).closest("label")).toHaveTextContent("14/11/2026 to 15/11/2026");
  });

  it("picks a round from an old season, then several, filling From/To with their dates", async () => {
    stubRounds({ "/api/weekend-carousel/rounds": RESULTS });
    renderWithHistory(<Harness setType="matchSummary" />);
    await waitFor(() => expect(range()).toBe("2026-11-14|2026-11-15|-3,-4"));
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "2021" } });
    // A new season starts with nothing ticked: no games until a round is.
    await waitFor(() => expect(range()).toMatch(/\|$/));
    fireEvent.click(roundBox(/Round 3/));
    await waitFor(() => expect(range()).toBe("2021-10-30|2021-10-30|-50"));
    // A run of rounds: From/To span them, and only their games load.
    fireEvent.click(roundBox(/Round 5/));
    await waitFor(() => expect(range()).toBe("2021-10-30|2021-11-13|-50,-53"));
    expect(roundBox(/Round 4/)).not.toBeChecked();
    // Unlabelled games are the season's Other games, picked like a round.
    fireEvent.click(roundBox(/Other games/));
    await waitFor(() => expect(range()).toBe("2021-10-30|2022-01-08|-50,-53,-54"));
  });

  it("opens Team List and Match Day on the next round of this season's fixtures", async () => {
    for (const setType of ["teamList", "matchDay"] as const) {
      const urls = stubRounds({ "/api/weekend-carousel/rounds": FIXTURES });
      renderWithHistory(<Harness setType={setType} />);
      await waitFor(() => expect(range()).toBe("2026-11-21|2026-11-22|11,12"));
      expect(screen.getByText(/Upcoming and recent rounds/)).toBeInTheDocument();
      expect(urls.some((u) => u.includes(`setType=${setType}`))).toBe(true);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it("keeps each mode's pick when switching between rounds and dates", async () => {
    stubRounds({ "/api/weekend-carousel/rounds": RESULTS });
    renderWithHistory(<Harness setType="results" />);
    await waitFor(() => expect(range()).toBe("2026-11-14|2026-11-15|-3,-4"));
    fireEvent.click(roundBox(/Round 5/));
    await waitFor(() => expect(range()).toBe("2026-11-07|2026-11-15|-1,-2,-3,-4"));

    // Dates: the rounds' dates stay in From/To, and every game in them loads.
    fireEvent.click(screen.getByRole("button", { name: "Use dates instead" }));
    await waitFor(() => expect(range()).toBe("2026-11-07|2026-11-15|all"));
    expect(screen.queryByLabelText("Season")).toBeNull();
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-30" } });
    await waitFor(() => expect(range()).toBe("2026-11-07|2026-11-30|all"));

    // Back to rounds: the same rounds are still ticked.
    fireEvent.click(screen.getByRole("button", { name: "Pick a season and round instead" }));
    await waitFor(() => expect(range()).toBe("2026-11-07|2026-11-15|-1,-2,-3,-4"));
    expect(roundBox(/Round 5/)).toBeChecked();
    expect(roundBox(/Round 6/)).toBeChecked();
  });

  it("reads junior rounds only for a junior set, opening on dates with no labelled round", async () => {
    const urls = stubRounds({
      "/api/juniors/carousel-rounds": JUNIOR,
      "/api/weekend-carousel/rounds": RESULTS,
    });
    renderWithHistory(<Harness setType="teamList" audience="junior" />);
    // No labelled junior round: dates, as before, with rounds a click away.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Pick a season and round instead" }),
      ).toBeInTheDocument(),
    );
    expect(range()).toBe("2026-11-19|2026-11-22|all");
    expect(urls.every((u) => u.includes("/api/juniors/carousel-rounds"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Pick a season and round instead" }));
    fireEvent.click(roundBox(/Other games/));
    await waitFor(() => expect(range()).toBe("2026-11-21|2026-12-05|-2000000031"));
  });

  it("falls back to dates when the rounds can't load", async () => {
    stubRounds({});
    renderWithHistory(<Harness setType="results" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t load the club’s seasons and rounds. Pick dates instead.",
    );
    expect(range()).toBe("2026-11-19|2026-11-22|all");
  });
});
