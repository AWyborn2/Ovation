import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderAt } from "../../test/render";
import { installApiMock } from "../../test/mock-api";
import { SponsorsBackgroundPicker } from "./sponsors-background-picker";

const photo = (id: number) => ({
  id,
  grade: null,
  photoTypes: [],
  url: `/p${id}.jpg`,
  thumbUrl: `/p${id}-t.jpg`,
  width: 1200,
  height: 800,
  playerIds: [],
  createdAt: "",
  season: 2026,
  takenAt: null,
  matchFormat: null,
});

/** The API mock plus a record of every settings write and photo-list request. */
function setup(selectedId: number | null) {
  const { calls } = installApiMock({ "/club-photos": [photo(1), photo(2)] });
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "PATCH") {
        writes.push(JSON.parse(String(init?.body ?? "null")));
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return base(input, init);
    }),
  );
  renderAt(<SponsorsBackgroundPicker selectedId={selectedId} />);
  return { writes, calls };
}

describe("SponsorsBackgroundPicker", () => {
  it("lists the club-wide photos and marks the chosen one", async () => {
    const { calls } = setup(2);
    const chosen = await screen.findByRole("button", { name: "Use photo 2" });
    expect(chosen).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Use photo 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(calls.some((u) => u.includes("/club-photos") && u.includes("ungraded=true"))).toBe(true);
  });

  it("saves a pick at once, and clears it", async () => {
    const { writes } = setup(2);
    fireEvent.click(await screen.findByRole("button", { name: "Use photo 1" }));
    await waitFor(() => expect(writes).toEqual([{ sponsorsBackgroundPhotoId: 1 }]));
    fireEvent.click(screen.getByRole("button", { name: "No background" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({ sponsorsBackgroundPhotoId: null });
  });

  it("offers no clear when nothing is chosen", async () => {
    setup(null);
    await screen.findByRole("button", { name: "Use photo 1" });
    expect(screen.getByRole("button", { name: "No background" })).toBeDisabled();
  });
});
