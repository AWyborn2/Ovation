import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import type { Premiership } from "@workspace/api-client-react";
import { PremiershipCard } from "@/components/premierships/premiership-cards";
import { renderAt } from "@/test/render";

afterEach(cleanup);

const PREM: Premiership = {
  id: 9,
  year: 2026,
  grade: "B Grade",
  competition: "B GRADE McINTOSH CUP",
  venue: "Stan Twight Reserve",
  matchDate: "2026-03-21",
  result: "Halls Head 6/145 def White Knights 140",
  mom: "Oscar Smith",
  matchId: 42,
  players: [
    { id: 3, premiershipId: 9, playerId: 12, name: "Craig Ford", isCaptain: true, battingOrder: 3 },
    {
      id: 1,
      premiershipId: 9,
      playerId: 40,
      name: "Angus Kent",
      isCaptain: false,
      battingOrder: 1,
    },
    {
      id: 2,
      premiershipId: 9,
      playerId: 90012,
      name: "Sam Fillin",
      isCaptain: false,
      battingOrder: 2,
    },
    { id: 4, premiershipId: 9, playerId: null, name: "Unlinked Player", isCaptain: false },
  ],
} as Premiership;

describe("PremiershipCard team list", () => {
  it("lists the full named side in batting order with the captain marked", () => {
    renderAt(<PremiershipCard p={PREM} />, "/premierships");
    const team = screen.getByTestId("premiership-team");
    const names = within(team)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(names).toEqual(["Angus Kent", "Sam Fillin", "Craig Ford (c)", "Unlinked Player"]);
    expect(screen.getByText("Oscar Smith")).toBeTruthy();
  });

  it("links real players to their profile, never fill-ins or unlinked names", () => {
    renderAt(<PremiershipCard p={PREM} />, "/premierships");
    const team = screen.getByTestId("premiership-team");
    expect(within(team).getByRole("link", { name: "Angus Kent" }).getAttribute("href")).toBe(
      "/players/40",
    );
    expect(within(team).queryByRole("link", { name: "Sam Fillin" })).toBeNull();
    expect(within(team).queryByRole("link", { name: "Unlinked Player" })).toBeNull();
  });

  it("with no recorded side, shows no team list but keeps man of the match", () => {
    renderAt(<PremiershipCard p={{ ...PREM, players: [] }} />, "/premierships");
    expect(screen.queryByTestId("premiership-team")).toBeNull();
    expect(screen.getByText("Man of the match")).toBeTruthy();
  });
});
