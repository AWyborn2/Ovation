import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type { SocialPrefillMoment } from "@workspace/api-client-react";
import { PrefillPanel } from "./prefill-panels";
import { momentLabel, momentToBigMomentState } from "./prefill";
import { renderAt } from "@/test/render";

/**
 * Century, five-for and Big Moment cards prefill from a recent performance the
 * achievements engine found (Ash, 28 Oct 2026), like the milestone prefill:
 * one pick fills the figures and match and sets the card's player.
 */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HUNDRED: SocialPrefillMoment = {
  id: 11,
  kind: "century",
  playerId: 4301,
  playerName: "Zachary Dreckow",
  grade: "A Grade",
  round: 4,
  opponent: "Mandurah",
  seenAt: "2026-10-26T10:00:00.000Z",
  input: {
    kind: "century",
    playerName: "Zachary Dreckow",
    grade: "A Grade",
    runs: 104,
    balls: 98,
    notOut: true,
    opponent: "Mandurah",
    round: 4,
    photoUrl: null,
    match: { homeTeam: "Halls Head" },
  },
};
const FIVE: SocialPrefillMoment = {
  id: 12,
  kind: "fiveFor",
  playerId: null,
  playerName: "Sam Keeper",
  grade: "B Grade",
  round: 3,
  opponent: "Rockingham",
  seenAt: "2026-10-25T10:00:00.000Z",
  input: {
    kind: "fiveFor",
    playerName: "Sam Keeper",
    grade: "B Grade",
    wickets: 5,
    runsConceded: 24,
    overs: "9.2",
    figures: "5/24",
    opponent: "Rockingham",
    round: 3,
    photoUrl: null,
  },
};

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = String(url).includes("/social-prefill/moments") ? [HUNDRED, FIVE] : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

describe("moment prefill", () => {
  it("a century card lists recent centuries only and fills the engine's figures and player", async () => {
    stubApi();
    const onApply = vi.fn();
    const onPlayer = vi.fn();
    renderAt(<PrefillPanel kind="century" onApply={onApply} onPlayer={onPlayer} />);
    const option = await screen.findByRole("option", { name: momentLabel(HUNDRED) });
    const select = option.closest("select")!;
    expect(within(select).queryByRole("option", { name: momentLabel(FIVE) })).toBeNull();
    fireEvent.change(select, { target: { value: "11" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Prefill/ })[0]!);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        playerName: "Zachary Dreckow",
        runs: 104,
        balls: 98,
        notOut: true,
        opponent: "Mandurah",
        round: 4,
        match: { homeTeam: "Halls Head" },
      }),
    );
    expect(onApply.mock.calls[0]![0]).not.toHaveProperty("photoUrl");
    expect(onPlayer).toHaveBeenCalledWith({ id: 4301, givenName: "Zachary", surname: "Dreckow" });
  });

  it("says so when there is none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
    );
    renderAt(<PrefillPanel kind="century" onApply={vi.fn()} />);
    expect(await screen.findByRole("option", { name: "No recent centuries found" })).toBeTruthy();
  });

  it("keeps the match prefill for older games", async () => {
    stubApi();
    renderAt(<PrefillPanel kind="fiveFor" onApply={vi.fn()} />);
    expect(await screen.findByText("Prefill from a recent five-wicket haul")).toBeTruthy();
    expect(screen.getByText("Prefill from a match")).toBeTruthy();
  });

  it("labels a moment with the figures, grade, round and opponent", () => {
    expect(momentLabel(HUNDRED)).toBe("Zachary Dreckow — 104* (98) · A Grade Rd 4 vs Mandurah");
    expect(momentLabel(FIVE)).toBe("Sam Keeper — 5/24 · B Grade Rd 3 vs Rockingham");
  });

  it("turns a moment into a Big Moment card", () => {
    expect(momentToBigMomentState(HUNDRED)).toMatchObject({
      momentLabel: "CENTURY",
      playerName: "Zachary Dreckow",
      runs: 104,
      balls: 98,
      oppositionName: "Mandurah",
      inningsLabel: "A Grade · Round 4",
      equation: "Not out",
      match: { homeTeam: "Halls Head" },
    });
    expect(momentToBigMomentState(FIVE)).toMatchObject({
      momentLabel: "FIVE-WICKET HAUL",
      runs: null,
      equation: "5/24 off 9.2 overs",
    });
  });
});
