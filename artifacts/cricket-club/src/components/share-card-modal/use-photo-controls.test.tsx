import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ShareCardInput } from "@/lib/share-card";

/**
 * The queue's preview must use the draft's own photo (the one the drawer shows
 * and the post pack renders), ahead of the player's profile photo.
 */

let gallery: { imageUrl: string; isDefault: boolean }[] = [];
let profileUrl: string | null = null;
const query = (data: unknown) => ({ data });

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@workspace/object-storage-web", () => ({
  useUpload: () => ({ uploadFile: vi.fn(), isUploading: false }),
}));
vi.mock("@/lib/admin-auth", () => ({ useCurrentAdmin: () => ({ data: { id: 1 } }) }));
vi.mock("@workspace/api-client-react", () => ({
  useGetPlayer: () => query(profileUrl ? { imageUrl: profileUrl } : undefined),
  getGetPlayerQueryKey: (id: number) => ["player", id],
  useListPlayerImages: () => query(gallery),
  getListPlayerImagesQueryKey: (id: number) => ["images", id],
  useAddPlayerImage: () => ({ mutate: vi.fn() }),
  useGetMatchCardPhoto: () => query(undefined),
  getGetMatchCardPhotoQueryKey: (id: number) => ["match", id],
  useListClubPhotos: () => query([]),
  getListClubPhotosQueryKey: () => ["photos"],
}));

const { usePhotoControls } = await import("./use-photo-controls");

const input = { kind: "gradeLeader", playerName: "Jarod Little" } as unknown as ShareCardInput;
const DRAFT = "/api/storage/objects/keeper-dive.jpg";

describe("usePhotoControls with a draft photo", () => {
  it("uses the draft's photo when the card has no player id", () => {
    gallery = [];
    profileUrl = null;
    const { result } = renderHook(() =>
      usePhotoControls({ open: true, input, draftPhotoUrl: DRAFT }),
    );
    expect(result.current.showPhotoControls).toBe(true);
    expect(result.current.effectivePhotoUrl).toBe(DRAFT);
  });

  it("puts the draft's photo ahead of the player's profile photo and gallery", () => {
    profileUrl = "/api/storage/objects/profile.jpg";
    gallery = [
      { imageUrl: "/api/storage/objects/profile.jpg", isDefault: true },
      { imageUrl: DRAFT, isDefault: false },
    ];
    const { result } = renderHook(() =>
      usePhotoControls({ open: true, input, playerId: 23, draftPhotoUrl: DRAFT }),
    );
    expect(result.current.effectivePhotoUrl).toBe(DRAFT);
    expect(result.current.galleryPhotos.map((p) => p.url)).toEqual([
      DRAFT,
      "/api/storage/objects/profile.jpg",
    ]);
    expect(result.current.galleryPhotos.filter((p) => p.isDefault)).toHaveLength(1);
  });

  it("never puts a photo on a junior card", () => {
    gallery = [];
    profileUrl = null;
    const junior = { ...input, junior: true } as unknown as ShareCardInput;
    const { result } = renderHook(() =>
      usePhotoControls({ open: true, input: junior, draftPhotoUrl: DRAFT }),
    );
    expect(result.current.effectivePhotoUrl).toBeNull();
    expect(result.current.showPhotoControls).toBe(false);
  });
});
