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
