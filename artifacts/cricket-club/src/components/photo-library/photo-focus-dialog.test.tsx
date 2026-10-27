import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ClubPhoto } from "@workspace/api-client-react";

const save = vi.fn();
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
}));
vi.mock("@/lib/face-suggestions", () => ({
  findFaces: vi.fn(async () => [{ x: 0.4, y: 0.2, w: 0.1, h: 0.15 }]),
  personBoxFromFace: (f: unknown) => f,
  unionBox: (b: unknown[]) => b[0] ?? null,
}));

import { PhotoFocusDialog } from "./photo-focus-dialog";

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
