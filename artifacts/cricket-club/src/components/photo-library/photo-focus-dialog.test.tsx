import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ClubPhoto } from "@workspace/api-client-react";

const save = vi.fn();
const saveJunior = vi.fn();
vi.mock("@workspace/api-client-react", () => ({
  getListPlayersQueryKey: (p: unknown) => ["players", p],
  useListPlayers: (params: { search?: string }) => ({
    data: {
      players: params.search
        ? [{ id: 9, givenName: "Kim", surname: "Shutter" }]
        : [{ id: 7, givenName: "Pat", surname: "Lens" }],
    },
  }),
  useSetClubPhotoFocus: () => ({ mutate: save, isPending: false }),
  useSetJuniorLibraryPhotoFocus: () => ({ mutate: saveJunior, isPending: false }),
}));
vi.mock("@/lib/face-suggestions", () => ({
  findFaces: vi.fn(async () => [{ x: 0.4, y: 0.2, w: 0.1, h: 0.15 }]),
  personBoxFromFace: (f: unknown) => f,
  unionBox: (b: unknown[]) => b[0] ?? null,
}));

import { JuniorPhotoFocusDialog, PhotoFocusDialog } from "./photo-focus-dialog";
import type { JuniorLibraryPhoto } from "@workspace/api-client-react";

const photo = {
  id: 3,
  url: "/api/storage/objects/library/a.jpg",
  thumbUrl: "/api/storage/objects/library/a-thumb.jpg",
  width: 3000,
  height: 2000,
  season: null,
  grade: null,
  takenAt: null,
  createdAt: "2026-10-27T00:00:00.000Z",
  playerIds: [7],
  photoTypes: [],
  matchFormat: null,
  focusBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.5 },
  offShapes: [],
  playerAreas: [],
} as ClubPhoto;

const open = (p: ClubPhoto = photo) =>
  render(<PhotoFocusDialog photo={p} open onOpenChange={() => {}} onSaved={() => {}} />);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PhotoFocusDialog", () => {
  it("shows the tagged players by name and how the box fits each shape", () => {
    open();
    expect(screen.getByRole("button", { name: /Pat Lens/ })).toBeTruthy();
    expect(screen.getAllByText("Fits").length).toBeGreaterThan(0);
  });

  it("says when the box was suggested on upload; saving sends it as checked", () => {
    open({ ...photo, focusSuggested: true });
    expect(screen.getByText(/suggested from the faces found on upload/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save focus" }));
    expect(save.mock.calls[0]![0].data).not.toHaveProperty("suggested");
    cleanup();
    open();
    expect(screen.queryByText(/suggested from the faces found on upload/)).toBeNull();
  });

  it("saves the box, a switched-off shape and only the areas that changed", async () => {
    open();
    fireEvent.click(screen.getByRole("switch", { name: "Use in tall frames" }));
    // Mark Pat with a suggested face area.
    fireEvent.click(screen.getByRole("button", { name: /Pat Lens/ }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest areas from faces" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use suggested area 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save focus" }));
    expect(save).toHaveBeenCalledWith({
      photoId: 3,
      data: {
        focusBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.5 },
        offShapes: ["tall"],
        playerAreas: [{ playerId: 7, box: { x: 0.4, y: 0.2, w: 0.1, h: 0.15 } }],
      },
    });
  });

  it("adds a player found by search and clears the focus box", () => {
    open();
    fireEvent.change(screen.getByLabelText("Find a player to mark"), { target: { value: "Kim" } });
    fireEvent.click(screen.getByRole("button", { name: "Kim Shutter" }));
    fireEvent.click(screen.getByRole("button", { name: "Whole photo focus" }));
    fireEvent.click(screen.getByRole("button", { name: /Clear this box/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save focus" }));
    // Kim has no area yet, so isn't sent; the focus box is cleared.
    expect(save.mock.calls[0]![0].data).toEqual({ focusBox: null, offShapes: [], playerAreas: [] });
  });
});

describe("JuniorPhotoFocusDialog", () => {
  const junior = {
    id: 11,
    url: "/api/juniors/photos/11",
    thumbUrl: "/api/juniors/photos/11",
    width: 2000,
    height: 3000,
    season: null,
    grade: "Under 13",
    photoTypes: [],
    matchFormat: null,
    takenAt: null,
    createdAt: "2026-10-27T00:00:00.000Z",
    participants: [{ participantId: "p-ava", displayName: "Ava Junior", allowed: true }],
    displayable: true,
    focusBox: null,
    offShapes: [],
    participantAreas: [],
  } as JuniorLibraryPhoto;

  it("marks a tagged child and saves through the junior route, with no player search", async () => {
    render(
      <JuniorPhotoFocusDialog photo={junior} open onOpenChange={() => {}} onSaved={() => {}} />,
    );
    expect(screen.queryByLabelText("Find a player to mark")).toBeNull();
    // Junior picks don't use frame shapes yet: fit badges only, no switches.
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ava Junior/ }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest areas from faces" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use suggested area 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save focus" }));
    expect(saveJunior).toHaveBeenCalledWith({
      photoId: 11,
      data: {
        focusBox: null,
        offShapes: [],
        participantAreas: [{ participantId: "p-ava", box: { x: 0.4, y: 0.2, w: 0.1, h: 0.15 } }],
      },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("isn't offered for an old photo with no size", () => {
    render(
      <JuniorPhotoFocusDialog
        photo={{ ...junior, width: null, height: null }}
        open
        onOpenChange={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
