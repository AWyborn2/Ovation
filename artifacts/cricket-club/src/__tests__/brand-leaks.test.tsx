import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installApiMock } from "../test/mock-api";
import { BrandProvider } from "@/lib/brand-context";
import { CardFront, CardBack } from "@/components/trading-card/card-faces";
import type { TradingCardData } from "@/lib/trading-card";

/**
 * Phase 2 brand-leak regression: a non-Halls-Head tenant's trading card must
 * never show Halls Head's name, shorthand or club text. The API mock's
 * `/tenant-brand` fixture resolves to "Demo Cricket Club" (see
 * `test/mock-api.ts`), a stand-in for any other tenant.
 */

const DATA: TradingCardData = {
  name: "Test Player",
  number: 7,
  role: "Batsman",
  rating: 3,
  debutYear: 2015,
  careerSpan: 5,
  photoUrl: "",
  usingFallback: true,
  stats: {
    matches: 50,
    runs: 1200,
    battingAverage: 32.4,
    centuries: 2,
    halfCenturies: 6,
    wickets: 10,
    bowlingAverage: 25.1,
    fiveWickets: 0,
  },
  additionalStats: {
    highestScore: "112",
    bestBowling: "3/20",
    catches: 15,
    stumpings: 0,
    runOuts: 2,
  },
  configuredStats: null,
  achievements: { premierships: [], awards: [], records: [] },
};

function renderWithBrand(ui: React.ReactElement) {
  installApiMock();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandProvider>{ui}</BrandProvider>
    </QueryClientProvider>,
  );
}

describe("trading card: brand-leak regression (Phase 2 R5/R7)", () => {
  it("card front shows the resolved tenant's name, never Halls Head's", async () => {
    renderWithBrand(<CardFront data={DATA} />);
    await waitFor(() => expect(screen.getByText(/Demo/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("Halls Head");
    expect(document.body.textContent).not.toContain("HHCC");
  });

  it("card back shows the resolved tenant's name, never Halls Head's", async () => {
    renderWithBrand(<CardBack data={DATA} />);
    await waitFor(() => expect(screen.getByText(/Demo/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("Halls Head");
    expect(document.body.textContent).not.toContain("HHCC");
  });
});
