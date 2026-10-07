/**
 * Season shirt numbers on the trading card (shirt numbers plan U8, AE4): the
 * shirt number is drawn on its own plate, never in the cap slot — a player can
 * hold cap #142 and wear #9, and a player with no cap shows no cap.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CapEntry, PlayerDetail } from "@workspace/api-client-react";
import { buildTradingCardData } from "./trading-card";
import { CardHeader, PlayerPhoto } from "@/components/trading-card/card-pieces";

const player = (over: Partial<PlayerDetail> = {}): PlayerDetail =>
  ({
    id: 42,
    givenName: "Jack",
    surname: "Manuel",
    gradesPlayed: "A Grade",
    deceased: false,
    imageUrl: null,
    libraryPhotoUrl: null,
    stats: [],
    premierships: [],
    ...over,
  }) as PlayerDetail;

const cap = { playerId: 42, capNumber: 142 } as CapEntry;

function renderCard(p: PlayerDetail, caps: CapEntry[]) {
  const data = buildTradingCardData(p, caps);
  render(
    <div>
      <CardHeader data={data} />
      <PlayerPhoto data={data} height={300} />
    </div>,
  );
  return data;
}

describe("trading card shirt number", () => {
  it("carries the player's current-season shirt number from the profile", () => {
    expect(buildTradingCardData(player({ shirtNumber: "9" }), []).shirtNumber).toBe("9");
    expect(buildTradingCardData(player({ shirtNumber: "07" }), []).shirtNumber).toBe("07");
    expect(buildTradingCardData(player({ shirtNumber: null }), []).shirtNumber).toBeNull();
    expect(buildTradingCardData(player(), []).shirtNumber).toBeNull();
  });

  it("shows cap #142 and shirt #9, each in its own place", () => {
    const data = renderCard(player({ shirtNumber: "9" }), [cap]);
    expect(data.number).toBe(142);
    expect(screen.getByText("142")).toBeTruthy();
    const shirt = screen.getByTestId("trading-card-shirt-number");
    expect(shirt.textContent).toBe("#9");
    // The cap slot never holds the shirt number.
    expect(screen.getByText("Cap").parentElement?.textContent).toBe("Cap142");
  });

  it("with only a shirt number shows no cap", () => {
    renderCard(player({ shirtNumber: "9" }), []);
    expect(screen.queryByText("Cap")).toBeNull();
    expect(screen.getByTestId("trading-card-shirt-number").textContent).toBe("#9");
  });

  it("with no shirt number shows no badge and no placeholder", () => {
    const { container } = render(
      <PlayerPhoto data={buildTradingCardData(player(), [cap])} height={300} />,
    );
    expect(screen.queryByTestId("trading-card-shirt-number")).toBeNull();
    expect(container.textContent).not.toContain("#");
  });
});
