/**
 * The single Team List card's Card panel (build decision 16): its own player
 * order, saved for this design only, and back to the order it was made with.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TeamListCardPanel } from "../draft-panels";
import type { ShareCardInput } from "@/lib/share-card";

type TeamListInput = Extract<ShareCardInput, { kind: "teamList" }>;
const input = (over: Partial<TeamListInput> = {}): TeamListInput => ({
  kind: "teamList",
  gradeRound: "A GRADE",
  competitionLine: "",
  venueDateTime: "",
  players: [
    { order: 1, surname: "YOUNG", shirtNumber: "23" },
    { order: 2, surname: "ADAMS" },
  ],
  ...over,
});

afterEach(cleanup);

describe("TeamListCardPanel", () => {
  it("shows the order the card was made with and saves this design's own", async () => {
    const onOrder = vi.fn(async () => {});
    render(
      <TeamListCardPanel
        input={input({ playerOrder: "shirt" })}
        clubOrder="shirt"
        onOrder={onOrder}
      />,
    );
    expect(screen.getByTestId("card-panel-player-order-shirt")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/never your club’s default/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("card-panel-player-order-alpha"));
    await waitFor(() => expect(onOrder).toHaveBeenCalledWith("alpha"));
  });

  it("a design with its own order can go back to the one it was made with", async () => {
    const onOrder = vi.fn(async () => {});
    render(
      <TeamListCardPanel
        input={input({ playerOrder: "shirt", playerOrderOverride: "alpha" })}
        clubOrder="shirt"
        onOrder={onOrder}
      />,
    );
    expect(screen.getByTestId("card-panel-player-order-alpha")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/For this design only/)).toHaveTextContent("Shirt number");
    fireEvent.click(screen.getByTestId("card-panel-player-order-reset"));
    await waitFor(() => expect(onOrder).toHaveBeenCalledWith(null));
  });

  it("says when shirt order has no numbers to sort by", () => {
    render(
      <TeamListCardPanel
        input={input({ players: [{ order: 1, surname: "YOUNG" }], playerOrderOverride: "shirt" })}
        clubOrder="selected"
        onOrder={async () => {}}
      />,
    );
    expect(screen.getByText(/shows no shirt numbers/)).toBeInTheDocument();
  });
});
