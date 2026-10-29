/**
 * Create → a carousel (S4): the flow drives the Weekend Carousel's own state. "Open
 * in editor" builds the set, sends it to review, and opens the set editor; a set it
 * cannot make says why and stays put.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithHistory } from "@/test/render";

let behaviour: { slides: number } = { slides: 4 };
const seen: Array<{ setType: string; audience: string }> = [];

function fakeState() {
  const [generated, setGenerated] = useState(false);
  const [queuedId, setQueuedId] = useState<number | null>(null);
  return {
    error: false,
    loading: false,
    retry: () => {},
    rangeValid: true,
    selected: [{ id: 1 }, { id: 2 }],
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
  ContentOverridePanel: () => <p>what these cards show</p>,
}));
vi.mock("@/components/weekend-carousel/template-choice", () => ({
  CarouselTemplatePicker: () => <p>looks</p>,
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

  it("picks the games on step 3, then moves on", () => {
    const onNext = vi.fn();
    renderWithHistory(
      <CarouselFlow setType="results" audience="senior" step={3} onNext={onNext} />,
      "/admin/social/create",
    );
    expect(screen.getByText("games in range")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalled();
  });
});
