import type { ClubPhoto } from "@workspace/api-client-react";

const shotTime = (p: ClubPhoto): number => new Date(p.takenAt ?? p.createdAt).getTime();

/**
 * The photo the Studio's design-pack previews show, so each pack is seen with
 * one of the club's own images in its photo slot: its newest team shot (a
 * grade photo with nobody tagged), else its newest library photo. A club with
 * no library photos gets no preview photo.
 */
export function galleryPhotoUrl(photos: readonly ClubPhoto[] | null | undefined): string | null {
  const newest = [...(photos ?? [])]
    .filter((p) => !p.sourcePhotoId)
    .sort((a, b) => shotTime(b) - shotTime(a) || b.id - a.id);
  const team = newest.find((p) => p.grade && p.playerIds.length === 0);
  return (team ?? newest[0])?.url ?? null;
}

/**
 * The design-pack preview photo: the club's home hero image when one is set,
 * otherwise a photo from its library (see galleryPhotoUrl).
 */
export function packPreviewPhoto(
  heroImage: string | null | undefined,
  photos: readonly ClubPhoto[] | null | undefined,
): string | null {
  return heroImage || galleryPhotoUrl(photos);
}
