/**
 * Change photo's panel (Nov 2026): From library, Random (never the photo on
 * show, junior stock only on a junior slide), Focused only with its empty
 * state, and Back to automatic photo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const state = vi.hoisted(() => ({
  photos: [] as Array<Record<string, unknown>>,
  pool: { junior: false, photoIds: [] as number[], playerIds: [] as number[] },
}));
vi.mock("@workspace/api-client-react", () => ({
  getGetDraftPhotoPoolQueryKey: () => ["pool"],
  getListClubPhotosQueryKey: () => ["photos"],
  useGetDraftPhotoPool: () => ({ data: state.pool, isLoading: false }),
  useListClubPhotos: () => ({ data: state.photos, isLoading: false }),
}));

import { ChangePhotoPanel } from "../change-photo";

const photo = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  url: `/api/storage/objects/library/p${id}`,
  thumbUrl: `/api/storage/objects/library/t${id}`,
  width: 1600,
  height: 1200,
  season: 2026,
  grade: "A Grade",
  takenAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  playerIds: [],
  photoTypes: [],
  matchFormat: null,
  ...over,
});
const stock = (id: number) => photo(id, { grade: null, juniorStock: true });

function open(props: Partial<Parameters<typeof ChangePhotoPanel>[0]> = {}) {
  const onPick = vi.fn(async (_choice: unknown) => {});
  const onAuto = vi.fn(async () => {});
  render(
    <Router hook={memoryLocation({ path: "/admin/social/set/1" }).hook}>
      <ChangePhotoPanel
        draftId={1}
        slideKey="detail:senior:A Grade"
        junior={false}
        currentUrl={photo(1).url}
        own={false}
        onPick={onPick}
        onAuto={onAuto}
        {...props}
      />
    </Router>,
  );
  return { onPick, onAuto };
}

afterEach(() => {
  cleanup();
  state.photos = [];
  state.pool = { junior: false, photoIds: [], playerIds: [] };
});

describe("Change photo", () => {
  it("From library sets the picked photo on this slide", async () => {
    state.photos = [photo(1), photo(2)];
    const { onPick } = open();
    fireEvent.click(screen.getByText("From library"));
    fireEvent.click(screen.getByLabelText("Use library photo 2"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]![0]).toEqual({ photoId: 2, url: photo(2).url });
  });

  it("Random never draws the photo on show, and draws again on each press", async () => {
    state.photos = [photo(1), photo(2), photo(3)];
    state.pool = { junior: false, photoIds: [1, 2], playerIds: [] };
    const { onPick } = open({ random: () => 0 });
    fireEvent.click(screen.getByText("Random"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    // Photo 1 is on show and 3 isn't in the pool: only 2.
    expect(onPick.mock.calls[0]![0]).toMatchObject({ photoId: 2 });
    // The panel stays as it is for another draw.
    fireEvent.click(screen.getByText("Random"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(2));
  });

  it("Random says so when the pool holds no other photo", () => {
    state.photos = [photo(1)];
    state.pool = { junior: false, photoIds: [1], playerIds: [] };
    const { onPick } = open();
    fireEvent.click(screen.getByText("Random"));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/no other photo/i);
  });

  it("a junior slide's library and Random offer approved junior stock only", async () => {
    state.photos = [photo(1), photo(2), stock(3), stock(4)];
    state.pool = { junior: true, photoIds: [3, 4], playerIds: [] };
    const { onPick } = open({ junior: true, currentUrl: stock(3).url, random: () => 0 });
    fireEvent.click(screen.getByText("From library"));
    expect(screen.queryByLabelText("Use library photo 1")).toBeNull();
    expect(screen.queryByLabelText("Use library photo 2")).toBeNull();
    expect(screen.getByLabelText("Use library photo 3")).toBeTruthy();
    expect(screen.getByLabelText("Use library photo 4")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Back to the Change photo menu"));
    fireEvent.click(screen.getByText("Random"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0]![0]).toMatchObject({ photoId: 4 });
  });

  it("the server's pool saying junior is enough (fails closed)", () => {
    state.photos = [photo(1), stock(3)];
    state.pool = { junior: true, photoIds: [3], playerIds: [] };
    open({ junior: false });
    fireEvent.click(screen.getByText("From library"));
    expect(screen.queryByLabelText("Use library photo 1")).toBeNull();
    expect(screen.getByLabelText("Use library photo 3")).toBeTruthy();
  });

  it("Focused only lists framed photos, and links to Photo focus when none qualify", async () => {
    state.photos = [
      photo(1),
      photo(2, { focusBox: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }),
      photo(3, {
        playerIds: [9],
        playerAreas: [{ playerId: 9, box: { x: 0, y: 0, w: 0.4, h: 0.6 } }],
      }),
    ];
    state.pool = { junior: false, photoIds: [], playerIds: [9] };
    const { onPick } = open();
    fireEvent.click(screen.getByText("Focused only"));
    expect(screen.queryByLabelText("Use library photo 1")).toBeNull();
    expect(screen.getByLabelText("Use library photo 2")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Use library photo 3"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    // Framed by the slide's player's tag box.
    expect(onPick.mock.calls[0]![0]).toMatchObject({ photoId: 3, playerId: 9 });
    cleanup();

    state.photos = [photo(1)];
    state.pool = { junior: false, photoIds: [], playerIds: [] };
    open();
    fireEvent.click(screen.getByText("Focused only"));
    const empty = screen.getByTestId("focused-empty");
    expect(empty.textContent).toMatch(/no photo has a focus box yet/i);
    expect(screen.getByRole("link", { name: "Photos → Photo focus" }).getAttribute("href")).toBe(
      "/admin/social/photos",
    );
  });

  it("Back to automatic photo shows only for a slide with its own photo", async () => {
    state.photos = [photo(1)];
    open();
    expect(screen.queryByText("Back to automatic photo")).toBeNull();
    cleanup();
    const { onAuto } = open({ own: true });
    fireEvent.click(screen.getByText("Back to automatic photo"));
    await waitFor(() => expect(onAuto).toHaveBeenCalledTimes(1));
  });

  it("a locked card says why, and offers nothing", () => {
    state.photos = [stock(3)];
    open({ lockedReason: "This is a junior card." });
    expect(screen.getByText("This is a junior card.")).toBeTruthy();
    expect(screen.queryByText("From library")).toBeNull();
    expect(screen.queryByText("Random")).toBeNull();
  });
});
