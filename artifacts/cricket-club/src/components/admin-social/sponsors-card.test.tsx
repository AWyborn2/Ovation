import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Sponsor } from "@workspace/api-client-react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { SponsorsCard } from "./sponsors-card";

const sponsor = (over: Partial<Sponsor> = {}): Sponsor => ({
  id: 7,
  name: "Acme",
  logoUrl: "/acme.png",
  link: "",
  displayOrder: 0,
  cardKinds: [],
  grades: [],
  isPresenting: false,
  tier: "standard",
  players: [],
  ...over,
});

/** Records each sponsor write the card sends. */
function setup(sponsors: Sponsor[]) {
  installApiMock();
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        writes.push({ method, url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // The player search (player sponsors).
      if (String(input).includes("/api/players?")) {
        return new Response(
          JSON.stringify({
            players: [{ id: 55, givenName: "Kim", surname: "Lee" }],
            total: 1,
            page: 1,
            limit: 8,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return base(input, init);
    }),
  );
  renderAt(<SponsorsCard sponsors={sponsors} onChanged={() => {}} />);
  return writes;
}

describe("SponsorsCard tier (ADR-010 P6)", () => {
  it("shows each sponsor's tier as a Major sponsor switch", async () => {
    setup([sponsor(), sponsor({ id: 8, name: "Big Co", tier: "major" })]);
    expect(
      await screen.findByLabelText("Major sponsor", { selector: "#sp-tier-7" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Major sponsor", { selector: "#sp-tier-8" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("switching it saves the sponsor's tier", async () => {
    const writes = setup([sponsor()]);
    fireEvent.click(await screen.findByLabelText("Major sponsor", { selector: "#sp-tier-7" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("PATCH");
    expect(writes[0].url).toContain("/sponsors/7");
    expect(writes[0].body).toEqual({ tier: "major" });
  });
});

describe("SponsorsCard player sponsors", () => {
  it("shows the players a sponsor backs", async () => {
    setup([sponsor({ players: [{ id: 42, name: "Sam Keeper" }] })]);
    expect(await screen.findByText("Sam Keeper")).toBeInTheDocument();
  });

  it("removing a player saves the rest", async () => {
    const writes = setup([
      sponsor({
        players: [
          { id: 42, name: "Sam Keeper" },
          { id: 43, name: "Alex Bowler" },
        ],
      }),
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Sam Keeper" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].url).toContain("/sponsors/7");
    expect(writes[0].body).toEqual({ playerIds: [43] });
  });

  it("adding a player from the search saves them", async () => {
    const writes = setup([sponsor({ players: [{ id: 42, name: "Sam Keeper" }] })]);
    fireEvent.change(await screen.findByLabelText("Player sponsor for"), {
      target: { value: "Ki" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "+ Kim Lee" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toEqual({ playerIds: [42, 55] });
  });
});

describe("SponsorsCard card types for a player sponsor", () => {
  it("no card types on a player sponsor reads as only their players' cards", async () => {
    setup([
      sponsor({ players: [{ id: 42, name: "Sam Keeper" }] }),
      sponsor({ id: 8, name: "Club Co" }),
    ]);
    expect(await screen.findByRole("button", { name: "Only their players' cards" })).toBeTruthy();
    // The club sponsor row and the empty add form still read "All cards".
    expect(screen.getAllByRole("button", { name: "All cards" })).toHaveLength(2);
  });

  it("picking the empty chip on a player sponsor saves no card types", async () => {
    const writes = setup([
      sponsor({ cardKinds: ["milestone"], players: [{ id: 42, name: "Sam Keeper" }] }),
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Only their players' cards" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toEqual({ cardKinds: [] });
  });

  it("the add form's hint follows whether players are tagged", async () => {
    setup([]);
    expect(
      await screen.findByText("No specific types selected = logo shows on all card types."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Player sponsor (optional)"), {
      target: { value: "Ki" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "+ Kim Lee" }));
    expect(await screen.findByText(/shows only on its players' cards/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Only their players' cards" })).toHaveLength(1);
  });
});
