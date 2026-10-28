import { useMemo } from "react";
import {
  getListPlayersQueryKey,
  useListPlayers,
  type ClubPhoto,
} from "@workspace/api-client-react";
import { focusTransform, type FocusBox } from "@workspace/scorecard/photo-focus";

/** One pickable tile: a library photo, or one marked player's area on it. */
type Tile = { key: string; photo: ClubPhoto; area?: { playerId: number; box: FocusBox } };

/**
 * The draft drawer's photo library (Swap photo). A group photo with marked
 * player areas also shows a tile per player (photo focus areas, "virtual
 * versions"): picking it crops the card to that player, as if it were a photo
 * of them alone.
 */
export function PhotoSwapGrid({
  photos,
  onPick,
}: {
  photos: readonly ClubPhoto[];
  onPick: (url: string, playerId?: number) => void;
}) {
  const hasAreas = photos.some((p) => (p.playerAreas ?? []).length > 0);
  // Names for the area tiles' labels, only when there are any.
  const rosterQ = useListPlayers(
    { sortBy: "name", limit: 500 },
    {
      query: {
        queryKey: getListPlayersQueryKey({ sortBy: "name", limit: 500 }),
        enabled: hasAreas,
      },
    },
  );
  const names = useMemo(
    () => new Map((rosterQ.data?.players ?? []).map((p) => [p.id, `${p.givenName} ${p.surname}`])),
    [rosterQ.data],
  );
  const tiles: Tile[] = photos.flatMap((photo) => [
    { key: String(photo.id), photo },
    ...(photo.playerAreas ?? []).map((area) => ({
      key: `${photo.id}:${area.playerId}`,
      photo,
      area,
    })),
  ]);

  if (photos.length === 0)
    return <p className="text-sm text-muted-foreground">The photo library is empty.</p>;
  return (
    <div className="grid grid-cols-3 gap-2" aria-label="Photo library">
      {tiles.map(({ key, photo, area }) => {
        const name = area ? (names.get(area.playerId) ?? `Player ${area.playerId}`) : null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onPick(photo.url, area?.playerId)}
            className="relative overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary"
            aria-label={name ? `${name} on library item ${photo.id}` : undefined}
          >
            {area ? (
              <AreaThumb photo={photo} box={area.box} />
            ) : (
              <img
                src={photo.thumbUrl}
                alt={`Library item ${photo.id}`}
                className="aspect-square w-full object-cover"
              />
            )}
            {name && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-[10px] font-medium">
                {name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A square tile cropped to one player's area, drawn the way cards draw a focus box. */
function AreaThumb({ photo, box }: { photo: ClubPhoto; box: FocusBox }) {
  const t = focusTransform({ box, width: photo.width, height: photo.height }, 1);
  const origin = `${t.focalX * 100}% ${t.focalY * 100}%`;
  return (
    <div className="aspect-square w-full overflow-hidden">
      <img
        src={photo.thumbUrl}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition: origin, transform: `scale(${t.zoom})`, transformOrigin: origin }}
      />
    </div>
  );
}
