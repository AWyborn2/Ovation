/**
 * Create → a carousel (S4): the flow drives the Weekend Carousel's own state. "Open
 * in editor" builds the set, sends it to review, and opens the set editor; a set it
 * cannot make says why and stays put.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithHistory } from "@/test/render";

let behaviour: { slides: number; ticked?: number } = { slides: 4 };
const seen: Array<{ setType: string; audience: string }> = [];

function fakeState() {
  const [generated, setGenerated] = useState(false);
  const [queuedId, setQueuedId] = useState<number | null>(null);
  // The club's default is Shirt number; null follows it (as the real hook does).
  const [order, setOrder] = useState<string | null>(null);
  return {
    playerOrder: order ?? "shirt",
    clubPlayerOrder: "shirt",
    playerOrderChanged: order !== null,
    setPlayerOrder: (next: string | null) => setOrder(next === "shirt" ? null : next),
    error: false,
    loading: false,
    retry: () => {},
    rangeValid: true,
    selected: Array.from({ length: behaviour.ticked ?? 2 }, (_, i) => ({ id: i + 1 })),
    size: "square",
    setSize: () => {},
    picked: { ref: { libraryTemplateId: 1, version: 1 } },
    generating: false,
    assembling: false,
    generationError: null as string | null,
    assemblyError: null as string | null,
    queueError: null as string | null,
    generated: generated ? {} : null,
    slides: Array.from({ length: generated ? behaviour.slides : 0 }),
    canQueue: generated && behaviour.slides >= 3,
    generate: async () => setGenerated(true),
    runQueue: async () => setQueuedId(77),
    queuedId,
  };
}

vi.mock("@/components/weekend-carousel", () => ({
  useWeekendCarousel: (setType: string, audience: string) => {
    seen.push({ setType, audience });
    return fakeState();
  },
}));
vi.mock("@/components/weekend-carousel/weekend-carousel", () => ({
  RangeAndFixtures: () => <p>games in range</p>,
  ContentOverridePanel: () => <p>match day: what these cards show</p>,
  SetKindContentPanel: () => <p>this set: what these cards show</p>,
}));
vi.mock("@/components/weekend-carousel/template-choice", () => ({
  CarouselTemplatePicker: () => <p>looks</p>,
}));
// The Season and Round picker has its own suite (round-picker.test.tsx).
vi.mock("./round-picker", () => ({
  useRoundPick: () => ({ loading: false, mode: "rounds" }),
  RoundPicker: () => <p>season and rounds</p>,
}));

const { CarouselFlow } = await import("./carousel-flow");

afterEach(() => {
  cleanup();
  seen.length = 0;
  behaviour = { slides: 4 };
});

describe("Create's carousel flow", () => {
  it("builds the set, sends it to review and opens the set editor", async () => {
    const { url } = renderWithHistory(
      <CarouselFlow setType="teamList" audience="junior" step={4} onNext={() => {}} />,
      "/admin/social/create",
    );
    expect(seen[0]).toEqual({ setType: "teamList", audience: "junior" });
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    await waitFor(() => expect(url()).toBe("/admin/social/set/77"));
  });

  it("says why when the set is too small, and stays on Create", async () => {
    behaviour = { slides: 2 };
    const { url } = renderWithHistory(
      <CarouselFlow setType="matchDay" audience="senior" step={4} onNext={() => {}} />,
      "/admin/social/create",
    );
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 3 slides/);
    expect(url()).toBe("/admin/social/create");
  });

  it("offers What these cards show on every carousel's look step", () => {
    for (const setType of ["teamList", "results", "matchSummary"] as const) {
      renderWithHistory(
        <CarouselFlow setType={setType} audience="senior" step={4} onNext={() => {}} />,
        "/admin/social/create",
      );
      expect(screen.getByText("this set: what these cards show")).toBeInTheDocument();
      expect(screen.queryByText("match day: what these cards show")).toBeNull();
      cleanup();
    }
    renderWithHistory(
      <CarouselFlow setType="matchDay" audience="senior" step={4} onNext={() => {}} />,
      "/admin/social/create",
    );
    expect(screen.getByText("match day: what these cards show")).toBeInTheDocument();
  });

  it("a team list carousel can choose its own player order, and go back to the club's", () => {
    renderWithHistory(
      <CarouselFlow setType="teamList" audience="senior" step={4} onNext={() => {}} />,
      "/admin/social/create",
    );
    expect(screen.getByTestId("create-player-order-shirt")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Your club’s default/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("create-player-order-alpha"));
    expect(screen.getByTestId("create-player-order-alpha")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/For this carousel only/)).toHaveTextContent("Shirt number");
    fireEvent.click(screen.getByTestId("create-player-order-reset"));
    expect(screen.getByTestId("create-player-order-shirt")).toHaveAttribute("aria-checked", "true");
    cleanup();
    // Only team lists have a player order.
    renderWithHistory(
      <CarouselFlow setType="results" audience="senior" step={4} onNext={() => {}} />,
      "/admin/social/create",
    );
    expect(screen.queryByTestId("create-player-order")).toBeNull();
  });

  it("picks the games on step 3, then moves on", () => {
    const onNext = vi.fn();
    renderWithHistory(
      <CarouselFlow setType="results" audience="senior" step={3} onNext={onNext} />,
      "/admin/social/create",
    );
    expect(screen.getByText("season and rounds")).toBeInTheDocument();
    expect(screen.getByText("games in range")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalled();
  });

  // Dev retest (17 Nov 2026): a junior whole round said "60 of 60 selected ·
  // maximum 18" and Next did nothing, with no reason given.
  it("says why Next waits when more teams are ticked than a carousel holds", () => {
    behaviour = { slides: 4, ticked: 60 };
    const onNext = vi.fn();
    renderWithHistory(
      <CarouselFlow setType="teamList" audience="junior" step={3} onNext={onNext} />,
      "/admin/social/create",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A carousel holds up to 18 teams, plus its cover and sponsors. 60 are ticked: untick 42 or more",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("goes on at the maximum", () => {
    behaviour = { slides: 4, ticked: 18 };
    renderWithHistory(
      <CarouselFlow setType="teamList" audience="junior" step={3} onNext={() => {}} />,
      "/admin/social/create",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
