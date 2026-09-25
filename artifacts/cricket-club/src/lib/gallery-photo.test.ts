import { describe, it, expect } from "vitest";
import type { ClubPhoto } from "@workspace/api-client-react";
import { galleryPhotoUrl } from "./gallery-photo";

const photo = (over: Partial<ClubPhoto>): ClubPhoto => ({
  id: 1,
  url: "/api/storage/objects/p.jpg",
  thumbUrl: "/api/storage/objects/p-thumb.jpg",
  width: 100,
  height: 100,
  season: null,
  grade: null,
  takenAt: null,
  createdAt: "2026-09-01",
  playerIds: [],
  photoTypes: [],
  ...over,
});

describe("galleryPhotoUrl", () => {
  it("shows no photo until the club has library photos", () => {
    expect(galleryPhotoUrl(undefined)).toBeNull();
    expect(galleryPhotoUrl([])).toBeNull();
  });

  it("prefers the newest team shot over a newer player photo", () => {
    const url = galleryPhotoUrl([
      photo({ id: 1, url: "/old-team", grade: "A Grade", createdAt: "2026-01-01" }),
      photo({ id: 2, url: "/new-team", grade: "A Grade", createdAt: "2026-06-01" }),
      photo({
        id: 3,
        url: "/player",
        grade: "A Grade",
        playerIds: [7],
        createdAt: "2026-09-01",
      }),
    ]);
    expect(url).toBe("/new-team");
  });

  it("falls back to the newest photo, never a background-removed cut-out", () => {
    const url = galleryPhotoUrl([
      photo({ id: 1, url: "/player", playerIds: [7], takenAt: "2026-05-01" }),
      photo({
        id: 2,
        url: "/cutout",
        playerIds: [7],
        sourcePhotoId: 1,
        takenAt: "2026-08-01",
      }),
    ]);
    expect(url).toBe("/player");
  });
});
