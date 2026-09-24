/**
 * Social Studio U14 — Create a card's hero: the keyword box finds the card
 * type, quick picks cover the weekly regulars, and Enter takes the best match.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import { CreateHero } from "@/components/social-studio/create-hero";
import { matchCardKinds } from "@/lib/social-studio";
import { renderAt } from "@/test/render";

afterEach(() => cleanup());

describe("matchCardKinds", () => {
  it("matches labels, everyday words and blurbs, best first", () => {
    expect(matchCardKinds("century")[0]).toBe("century");
    expect(matchCardKinds("ton")[0]).toBe("century");
    expect(matchCardKinds("100")[0]).toBe("century");
    expect(matchCardKinds("xi")[0]).toBe("teamList");
    expect(matchCardKinds("5 for")[0]).toBe("fiveFor");
    expect(matchCardKinds("table")[0]).toBe("ladder");
    expect(matchCardKinds("Ladder")[0]).toBe("ladder");
  });

  it("returns nothing for an empty or unknown query", () => {
    expect(matchCardKinds("  ")).toEqual([]);
    expect(matchCardKinds("zzzz")).toEqual([]);
  });
});

describe("CreateHero", () => {
  const group = () => screen.getByLabelText("Card types");

  it("offers the weekly regulars before anything is typed", () => {
    renderAt(<CreateHero kind="matchSummary" onPick={vi.fn()} />, "/admin/social/create");
    expect(screen.getByRole("heading", { name: "What are we posting today?" })).toBeTruthy();
    const picks = within(group()).getAllByRole("button");
    expect(picks.map((b) => b.textContent)).toContain("Century");
    expect(
      within(group()).getByRole("button", { name: "Match Summary" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("typing narrows the picks and clicking one chooses that card type", () => {
    const onPick = vi.fn();
    renderAt(<CreateHero kind="matchSummary" onPick={onPick} />, "/admin/social/create");
    fireEvent.change(screen.getByRole("textbox", { name: "Find a card type" }), {
      target: { value: "signing" },
    });
    fireEvent.click(within(group()).getByRole("button", { name: "New Signing" }));
    expect(onPick).toHaveBeenCalledWith("newSigning");
  });

  it("Enter takes the best match", () => {
    const onPick = vi.fn();
    renderAt(<CreateHero kind="matchSummary" onPick={onPick} />, "/admin/social/create");
    const box = screen.getByRole("textbox", { name: "Find a card type" });
    fireEvent.change(box, { target: { value: "ton" } });
    fireEvent.submit(box.closest("form")!);
    expect(onPick).toHaveBeenCalledWith("century");
  });

  it("says so when nothing matches", () => {
    renderAt(<CreateHero kind="matchSummary" onPick={vi.fn()} />, "/admin/social/create");
    fireEvent.change(screen.getByRole("textbox", { name: "Find a card type" }), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/No card type matches/)).toBeTruthy();
  });
});
