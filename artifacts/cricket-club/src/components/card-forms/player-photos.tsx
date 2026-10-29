import { useEffect, useMemo, useRef } from "react";
import {
  useListClubPhotos,
  getListClubPhotosQueryKey,
  type ClubPhoto,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/**
 * A player's tagged library photos, best first: the same choice the automatic
 * cards make (a photo of them alone before a group shot, then the newest).
 */
export function rankPlayerPhotos(photos: readonly ClubPhoto[]): ClubPhoto[] {
  const when = (p: ClubPhoto) => Date.parse(p.takenAt ?? p.createdAt ?? "") || 0;
  return [...photos].sort(
    (a, b) =>
      (a.playerIds?.length ?? 0) - (b.playerIds?.length ?? 0) || when(b) - when(a) || b.id - a.id,
  );
}

/**
 * The card's player's tagged photos under the Photo field in Create a card
 * (Ash, 28 Oct 2026). With an empty photo, or one this picked itself, the
 * card takes the player's best photo as soon as the player is known, so the
 * live preview shows them; the strip offers their other photos. Upload and the
 * library picker stay on the field itself.
 */
export function PlayerPhotoStrip({
  playerId,
  playerName,
  value,
  onPick,
}: {
  playerId: number;
  playerName: string;
  value: string;
  onPick: (url: string) => void;
}) {
  const params = { playerId };
  const q = useListClubPhotos(params, {
    query: { queryKey: getListClubPhotosQueryKey(params) },
  });
  const photos = useMemo(() => rankPlayerPhotos(q.data ?? []), [q.data]);

  // The photo this strip chose: replaced when the player changes, never an
  // admin's own choice (an upload, a library pick or a pasted URL).
  const autoPicked = useRef<string | null>(null);
  const best = photos[0]?.url ?? null;
  const loaded = q.isSuccess;
  useEffect(() => {
    if (!loaded) return;
    if (value !== "" && value !== autoPicked.current) return;
    // A new player with no tagged photo takes the last player's photo off.
    const next = best ?? "";
    autoPicked.current = best;
    if (value !== next) onPick(next);
    // Only when the player's photos arrive or change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best, loaded, playerId]);

  if (q.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading {playerName}&rsquo;s photos…</p>;
  }
  if (photos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="player-photos-empty">
        No photos tagged with {playerName} yet. Upload one or choose from the library.
      </p>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="player-photos">
      <p className="text-xs font-medium text-muted-foreground">
        Photos of {playerName} ({photos.length})
      </p>
      <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={`Photos of ${playerName}`}>
        {photos.map((p) => {
          const chosen = p.url === value;
          return (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  autoPicked.current = null;
                  onPick(p.url);
                }}
                aria-pressed={chosen}
                aria-label={`Use photo ${p.id} of ${playerName}`}
                className={cn(
                  "block h-16 w-16 overflow-hidden rounded-md border-2 bg-muted",
                  chosen ? "border-primary" : "border-transparent hover:border-muted-foreground/40",
                )}
              >
                <img src={p.thumbUrl ?? p.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
