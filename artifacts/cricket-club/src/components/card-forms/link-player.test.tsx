import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CardFormRouter } from "./forms";
import { renderAt } from "@/test/render";

/**
 * "Link a player" (Ash's Production test, 28 Oct 2026): picking a player
 * fills the name and also tells Create a card which player the card is
 * about, so the card carries that player's sponsors.
 */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubPlayers() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            players: [{ id: 42, givenName: "Jarod", surname: "Little" }],
            total: 1,
            page: 1,
            limit: 10,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

describe("Link a player", () => {
  it("fills the name and reports the player to the page", async () => {
    stubPlayers();
    const setState = vi.fn();
    const onPlayer = vi.fn();
    renderAt(
      <CardFormRouter kind="milestone" state={{}} setState={setState} onPlayer={onPlayer} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search players…"), {
      target: { value: "Lit" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /Little, Jarod/ }));
    expect(setState).toHaveBeenCalledWith({ playerName: "Jarod Little" });
    expect(onPlayer).toHaveBeenCalledWith({ id: 42, givenName: "Jarod", surname: "Little" });
  });
});
