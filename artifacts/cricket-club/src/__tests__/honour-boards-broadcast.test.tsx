import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HonourBoards from "@/pages/honour-boards";
import { splitResult } from "@/components/premierships/premiership-cards";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Render with a recording (non-static) location so URL writes are observable. */
function renderHonours(path: string) {
  const loc = memoryLocation({ path, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <Router hook={loc.hook} searchHook={loc.searchHook}>
          <HonourBoards />
        </Router>
      </ConfirmProvider>
    </QueryClientProvider>,
  );
  return loc;
}

const prem = (id: number, year: number, grade: string, matchId: number | null) => ({
  id,
  year,
  grade,
  competition: grade.toUpperCase(),
  venue: "Rushton Park",
  matchDate: `${year}-03-21`,
  result: `Halls Head 4/191 def Rockingham 185`,
  mom: "Peter Wyllie",
  matchId,
  players: [{ id: 1, premiershipId: id, name: "John Doe", isCaptain: true }],
});

const PREMS = [
  prem(1, 1992, "A Grade", 7),
  prem(2, 2001, "B Grade", null),
  prem(3, 2010, "A Grade", null),
];

describe("Honour boards (Broadcast U10)", () => {
  it("defaults to the Premierships tab with cards newest-first and a count", async () => {
    installApiMock({ "/api/premierships": PREMS });
    renderHonours("/honour-boards");
    await screen.findAllByTestId("premiership-card");
    const years = screen.getAllByTestId("premiership-card").map((c) => c.textContent?.slice(0, 4));
    expect(years).toEqual(["2010", "2001", "1992"]);
    expect(screen.getByTestId("premiership-count").textContent).toBe("3 premierships shown");
    expect(screen.getByRole("tab", { name: "Premierships" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("the grade filter narrows the grid, updates the count and the URL", async () => {
    installApiMock({ "/api/premierships": PREMS });
    const loc = renderHonours("/honour-boards");
    await screen.findAllByTestId("premiership-card");
    // Grade chips are de-duplicated (A Grade appears once).
    expect(screen.getAllByRole("button", { name: "A Grade" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "A Grade" }));
    expect(screen.getByTestId("premiership-count").textContent).toBe("2 premierships shown");
    expect(loc.history?.at(-1)).toBe("/honour-boards?grade=A+Grade");
  });

  it("a card with a match navigates to it; a card without one is not a link", async () => {
    installApiMock({ "/api/premierships": PREMS });
    const loc = renderHonours("/honour-boards");
    const cards = await screen.findAllByTestId("premiership-card");
    const linked = cards.find((c) => c.textContent?.startsWith("1992"))!;
    const unlinked = cards.find((c) => c.textContent?.startsWith("2001"))!;
    expect(unlinked.getAttribute("role")).toBeNull();
    fireEvent.click(linked);
    expect(loc.history?.at(-1)).toBe("/matches/7");
  });

  it("?tab= opens that tab, and switching tabs writes the URL", async () => {
    installApiMock({ "/api/premierships": PREMS });
    const loc = renderHonours("/honour-boards?tab=life-members");
    expect(screen.getByRole("tab", { name: "Life members" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Awards" }));
    await waitFor(() => expect(loc.history?.at(-1)).toBe("/honour-boards?tab=awards"));
  });

  it("shows an empty state when no premierships are recorded", async () => {
    installApiMock({ "/api/premierships": [] });
    renderHonours("/honour-boards");
    expect(await screen.findByText("No premierships recorded yet.")).toBeTruthy();
  });

  it("shows card skeletons while premierships load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderHonours("/honour-boards");
    await waitFor(() => expect(screen.getByTestId("skeleton-cards")).toBeTruthy());
  });

  it("renders the honours hero with the brand gradient when no photo is set (AE5)", () => {
    installApiMock({ "/api/premierships": [] });
    renderHonours("/honour-boards");
    expect(screen.getByTestId("hero-honours").querySelector("img")).toBeNull();
  });
});

describe("splitResult", () => {
  it("splits around the verb", () => {
    expect(splitResult("Halls Head 4/191 def Rockingham 185")).toEqual([
      "Halls Head 4/191",
      "def",
      "Rockingham 185",
    ]);
    expect(splitResult("Washed out")).toBeNull();
  });
});
