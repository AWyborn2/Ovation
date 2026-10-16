/**
 * Junior card photos — the pure rules (plan 2026-10-16-001, ADR-007): who is allowed a
 * photo, how a card picks one, and what the engines stamp on the card. The DB paths are
 * covered in junior-social.db.test.ts and routes/juniors-photos.test.ts.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  juniorParticipantsTable: {},
  juniorPhotosTable: {},
  socialDraftsTable: {},
}));
vi.mock("./draft-upsert", () => ({ withdrawDraft: vi.fn() }));

import {
  juniorPhotoAllowed,
  juniorPhotoFields,
  juniorPhotoUrl,
  pickJuniorCardPhoto,
  type JuniorPhoto,
} from "./junior-photos";
import { patchWithdrawsPhoto, planJuniorParticipantPatch } from "./junior-privacy";

const photo = (id: number, participantId: string): JuniorPhoto => ({
  photoId: id,
  participantId,
  url: juniorPhotoUrl(id),
  thumbUrl: null,
});

describe("juniorPhotoAllowed", () => {
  it("allows a public player who is not withheld; refuses withheld or private ones", () => {
    expect(
      juniorPhotoAllowed({ photoWithheld: false, isPrivate: false, privacyOverride: false }),
    ).toBe(true);
    expect(
      juniorPhotoAllowed({ photoWithheld: true, isPrivate: false, privacyOverride: false }),
    ).toBe(false);
    expect(
      juniorPhotoAllowed({ photoWithheld: false, isPrivate: true, privacyOverride: false }),
    ).toBe(false);
    // A private player an admin has chosen to name may still have a photo.
    expect(
      juniorPhotoAllowed({ photoWithheld: false, isPrivate: true, privacyOverride: true }),
    ).toBe(true);
    expect(
      juniorPhotoAllowed({ photoWithheld: true, isPrivate: true, privacyOverride: true }),
    ).toBe(false);
  });
});

describe("pickJuniorCardPhoto", () => {
  const photos = new Map<string, JuniorPhoto>([
    ["a", photo(1, "A")],
    ["c", photo(3, "C")],
  ]);

  it("prefers the first preferred player with a photo, matching ids case-insensitively", () => {
    expect(pickJuniorCardPhoto(photos, ["a", "c"], "k", ["b", "C"])?.participantId).toBe("C");
  });

  it("falls back to a seeded pick among candidates with a photo, stable for a seed", () => {
    const first = pickJuniorCardPhoto(photos, ["A", "B", "C"], "teamlist:7");
    expect(first).not.toBeNull();
    expect(pickJuniorCardPhoto(photos, ["A", "B", "C"], "teamlist:7")).toEqual(first);
    // A different candidate order gives the same pick for the same seed.
    expect(pickJuniorCardPhoto(photos, ["C", "B", "A"], "teamlist:7")).toEqual(first);
  });

  it("returns null when no candidate has an allowed photo", () => {
    expect(pickJuniorCardPhoto(photos, ["B", null, undefined], "k")).toBeNull();
    expect(pickJuniorCardPhoto(new Map(), ["A"], "k")).toBeNull();
  });
});

describe("juniorPhotoFields", () => {
  it("stamps the featured player and the positive marker, with the junior photo source", () => {
    expect(juniorPhotoFields(photo(5, "P"))).toEqual({
      cardInput: {
        photoUrl: "/api/juniors/photos/5",
        featuredParticipantId: "P",
        juniorPhotoAllowed: true,
      },
      photo: { url: "/api/juniors/photos/5", source: "auto:junior-photo" },
    });
  });

  it("leaves a card with no pick photo-less and unmarked", () => {
    expect(juniorPhotoFields(null)).toEqual({ cardInput: { photoUrl: null }, photo: null });
  });
});

describe("photo withheld in the participant patch", () => {
  const row = {
    displayName: "Riley T",
    isPrivate: false,
    privacyOverride: false,
    privacyOverrideBy: null,
    privacyOverrideAt: null,
    photoWithheld: false,
    photoWithheldBy: null,
    photoWithheldAt: null,
  };
  const now = new Date("2026-10-16T01:00:00Z");

  it("records who withheld and when, and journals the change", () => {
    const plan = planJuniorParticipantPatch(row, { photoWithheld: true }, "Ash", now);
    expect(plan.ok && plan.set).toEqual({
      photoWithheld: true,
      photoWithheldBy: "Ash",
      photoWithheldAt: now,
    });
    expect(plan.ok && plan.patch).toMatchObject({ photo_withheld: true, photo_withheld_by: "Ash" });
    expect(plan.ok && plan.prev).toMatchObject({ photo_withheld: false });
  });

  it("clears the record when photos are allowed again, and ignores a no-op", () => {
    const plan = planJuniorParticipantPatch(
      { ...row, photoWithheld: true, photoWithheldBy: "Ash", photoWithheldAt: now },
      { photoWithheld: false },
      "Sam",
      now,
    );
    expect(plan.ok && plan.set).toEqual({
      photoWithheld: false,
      photoWithheldBy: null,
      photoWithheldAt: null,
    });
    const same = planJuniorParticipantPatch(row, { photoWithheld: false }, "Sam", now);
    expect(same.ok && same.set).toEqual({});
  });

  it("knows which patches take a photo away: withholding, or going private without an override", () => {
    expect(patchWithdrawsPhoto(row, { photoWithheld: true })).toBe(true);
    expect(patchWithdrawsPhoto(row, { isPrivate: true })).toBe(true);
    expect(patchWithdrawsPhoto(row, { displayName: "R" })).toBe(false);
    // Already not allowed: nothing new to withdraw.
    expect(patchWithdrawsPhoto({ ...row, photoWithheld: true }, { isPrivate: true })).toBe(false);
    // Private but named: allowed; dropping the override takes the photo away.
    expect(
      patchWithdrawsPhoto(
        { ...row, isPrivate: true, privacyOverride: true },
        { privacyOverride: false },
      ),
    ).toBe(true);
  });
});
