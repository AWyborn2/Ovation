import type { ClubPhoto } from "@workspace/api-client-react";

/** Bundled stand-in shown in design-pack previews until the club has photos. */
export const PLACEHOLDER_CARD_PHOTO = "/placeholder-card-photo.svg";

const shotTime = (p: ClubPhoto): number => new Date(p.takenAt ?? p.createdAt).getTime();

/**
 * The photo the Studio's design-pack previews show, so each pack is seen with
 * a real image in its photo slot: the club's newest team shot (a grade photo
 * with nobody tagged), else its newest library photo, else the placeholder.
 */
export function galleryPhotoUrl(photos: readonly ClubPhoto[] | null | undefined): string {
  const newest = [...(photos ?? [])]
    .filter((p) => !p.sourcePhotoId)
    .sort((a, b) => shotTime(b) - shotTime(a) || b.id - a.id);
  const team = newest.find((p) => p.grade && p.playerIds.length === 0);
  return (team ?? newest[0])?.url ?? PLACEHOLDER_CARD_PHOTO;
}
