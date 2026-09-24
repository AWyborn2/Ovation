import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SeasonBar } from "../season-bar";

const SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, null];

function renderBar(path: string, props: Partial<Parameters<typeof SeasonBar>[0]> = {}) {
  const loc = memoryLocation({ path, record: true });
  const utils = render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      <SeasonBar seasons={SEASONS} {...props} />
    </Router>,
  );
  const params = () => new URLSearchParams(loc.history!.at(-1)!.split("?")[1] ?? "");
  return { ...utils, loc, params };
}

describe("SeasonBar", () => {
  it("renders the range chips from the page's seasons, Career active by default", () => {
    renderBar("/players/7");
    const group = screen.getByRole("group", { name: "Season range" });
    const chips = Array.from(group.querySelectorAll("button")).map((b) => b.textContent);
    expect(chips).toEqual(["Career", "Last 3 seasons", "2025/26", "2024/25"]);
    expect(screen.getByRole("button", { name: "Career" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "Batting" })).toHaveAttribute("aria-checked", "true");
  });

  it("Last 3 seasons writes from and to for the three latest seasons", () => {
    const { params } = renderBar("/players/7");
    fireEvent.click(screen.getByRole("button", { name: "Last 3 seasons" }));
    expect(params().get("from")).toBe("2023");
    expect(params().get("to")).toBe("2025");
    expect(screen.getByRole("button", { name: "Last 3 seasons" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Career clears from/to and keeps unrelated params (a=12)", () => {
    const { params } = renderBar("/compare?a=12&from=2021&to=2022&d=bowl");
    fireEvent.click(screen.getByRole("button", { name: "Career" }));
    expect(params().get("a")).toBe("12");
    expect(params().has("from")).toBe(false);
    expect(params().has("to")).toBe(false);
    expect(params().get("d")).toBe("bowl");
  });

  it("the discipline switch sets d=bowl and back", () => {
    const { params } = renderBar("/players/7?from=2023&to=2025");
    fireEvent.click(screen.getByRole("radio", { name: "Bowling" }));
    expect(params().get("d")).toBe("bowl");
    expect(params().get("from")).toBe("2023");
    fireEvent.click(screen.getByRole("radio", { name: "Batting" }));
    expect(params().has("d")).toBe(false);
  });

  it("From after To pushes To forward; To before From pulls From back", () => {
    const { params } = renderBar("/players/7?from=2020&to=2021");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2024" } });
    expect(params().get("from")).toBe("2024");
    expect(params().get("to")).toBe("2024");
    fireEvent.change(screen.getByLabelText("to"), { target: { value: "2019" } });
    expect(params().get("from")).toBe("2019");
    expect(params().get("to")).toBe("2019");
  });

  it("picking From while on Career closes the range at the latest season", () => {
    const { params } = renderBar("/players/7");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2022" } });
    expect(params().get("from")).toBe("2022");
    expect(params().get("to")).toBe("2025");
  });

  it("the discipline switch is absent when showDiscipline is false", () => {
    renderBar("/records", { showDiscipline: false });
    expect(screen.queryByRole("radiogroup", { name: "Discipline" })).toBeNull();
    expect(screen.getByRole("group", { name: "Season range" })).toBeInTheDocument();
  });
});
