import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProfileHero } from "./hero";

/**
 * ProfileHero season shirt numbers (shirt-numbers plan U9; R14, R15; AE5).
 * The jersey number sits beside the name, separate from the "Cap N" pill, and
 * the past-seasons line appears only when more than one season is numbered.
 */

afterEach(cleanup);

const base = {
  fullName: "Casey Fixture",
  photo: null,
  clubPhoto: null,
  meta: null,
  chips: [],
  rangeLabel: "Career",
  stats: [],
  discipline: "bat" as const,
};

describe("ProfileHero shirt numbers", () => {
  it("shows the current number as a jersey badge, separate from the cap pill", () => {
    render(
      <ProfileHero
        {...base}
        capNumber={88}
        shirtNumber="4"
        shirtNumbers={[{ season: 2026, number: "4" }]}
      />,
    );
    expect(screen.getByTestId("hero-shirt-number").textContent).toBe("#4");
    expect(screen.getByText("Cap 88")).toBeTruthy();
    // One season only: no history line.
    expect(screen.queryByTestId("hero-shirt-history")).toBeNull();
  });

  it("lists past numbers newest-first when more than one season exists", () => {
    render(
      <ProfileHero
        {...base}
        capNumber={null}
        shirtNumber="12"
        shirtNumbers={[
          { season: 2025, number: "12" },
          { season: 2024, number: "7" },
        ]}
      />,
    );
    expect(screen.getByTestId("hero-shirt-history").textContent).toBe("2025/26 #12 · 2024/25 #7");
  });

  it("R15: no current number shows no badge (never the cap number in its place)", () => {
    render(
      <ProfileHero
        {...base}
        capNumber={88}
        shirtNumber={null}
        shirtNumbers={[
          { season: 2024, number: "9" },
          { season: 2023, number: "07" },
        ]}
      />,
    );
    expect(screen.queryByTestId("hero-shirt-number")).toBeNull();
    expect(screen.getByTestId("hero-shirt-history").textContent).toBe("2024/25 #9 · 2023/24 #07");
  });

  it("AE5: without shirt-number data the hero renders as before", () => {
    render(<ProfileHero {...base} capNumber={88} />);
    expect(screen.queryByTestId("hero-shirt-number")).toBeNull();
    expect(screen.queryByTestId("hero-shirt-history")).toBeNull();
    expect(screen.getByText("Cap 88")).toBeTruthy();
  });
});
