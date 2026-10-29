import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ClubPhoto } from "@workspace/api-client-react";
import { PlayerPhotoStrip, rankPlayerPhotos } from "./player-photos";
import { CardFormRouter } from "./forms";
import { renderAt } from "@/test/render";

/**
 * Create a card shows the card's player in the live preview (Ash, 28 Oct
 * 2026): their best tagged photo fills an empty Photo field, and their other
 * tagged photos sit under it to pick from. An admin's own photo is never
 * replaced.
 */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = (id: number, playerIds: number[], takenAt: string): ClubPhoto =>
  ({
    id,
    url: `/api/storage/objects/p${id}.jpg`,
    thumbUrl: `/api/storage/objects/t${id}.jpg`,
    playerIds,
    takenAt,
    createdAt: takenAt,
  }) as unknown as ClubPhoto;

const SOLO_OLD = photo(1, [7], "2025-01-01T00:00:00Z");
const GROUP_NEW = photo(2, [7, 8, 9], "2026-10-01T00:00:00Z");
const SOLO_NEW = photo(3, [7], "2026-09-01T00:00:00Z");

function stubPhotos(byPlayer: Record<number, ClubPhoto[]>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = Number(new URL(String(url), "http://x").searchParams.get("playerId"));
      return new Response(JSON.stringify(byPlayer[id] ?? []), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function Harness({ initial = "", playerId = 7 }: { initial?: string; playerId?: number }) {
  const [value, setValue] = useState(initial);
  const [pid, setPid] = useState(playerId);
  return (
    <div>
      <PlayerPhotoStrip
        playerId={pid}
        playerName="Zachary Dreckow"
        value={value}
        onPick={setValue}
      />
      <output data-testid="value">{value}</output>
      <button type="button" onClick={() => setPid(8)}>
        switch player
      </button>
    </div>
  );
}

describe("rankPlayerPhotos", () => {
  it("puts a photo of the player alone first, then the newest", () => {
    expect(rankPlayerPhotos([SOLO_OLD, GROUP_NEW, SOLO_NEW]).map((p) => p.id)).toEqual([3, 1, 2]);
  });
});

describe("PlayerPhotoStrip", () => {
  it("fills an empty photo with the player's best photo and lists the rest", async () => {
    stubPhotos({ 7: [SOLO_OLD, GROUP_NEW, SOLO_NEW] });
    renderAt(<Harness />);
    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe(SOLO_NEW.url));
    expect(screen.getByText("Photos of Zachary Dreckow (3)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use photo 2 of Zachary Dreckow" }));
    expect(screen.getByTestId("value").textContent).toBe(GROUP_NEW.url);
    expect(
      screen
        .getByRole("button", { name: "Use photo 2 of Zachary Dreckow" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("never replaces a photo the admin chose", async () => {
    stubPhotos({ 7: [SOLO_NEW] });
    renderAt(<Harness initial="https://example.com/mine.jpg" />);
    expect(await screen.findByText("Photos of Zachary Dreckow (1)")).toBeTruthy();
    expect(screen.getByTestId("value").textContent).toBe("https://example.com/mine.jpg");
  });

  it("swaps its own pick when the player changes, and clears it for a player with none", async () => {
    stubPhotos({ 7: [SOLO_NEW], 8: [] });
    renderAt(<Harness />);
    await waitFor(() => expect(screen.getByTestId("value").textContent).toBe(SOLO_NEW.url));
    fireEvent.click(screen.getByRole("button", { name: "switch player" }));
    expect(await screen.findByTestId("player-photos-empty")).toBeTruthy();
    expect(screen.getByTestId("value").textContent).toBe("");
  });
});

describe("Card details", () => {
  it("shows the player's photos under the Photo field", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]")),
    );
    renderAt(
      <CardFormRouter
        kind="century"
        state={{}}
        setState={() => {}}
        photoExtra={<span data-testid="extra">photos</span>}
      />,
    );
    const extra = screen.getByTestId("extra");
    expect(extra.closest("div.sm\\:col-span-2")?.textContent).toContain("Photo");
  });
});
