/**
 * Where a photo layer's photo comes from (photo layer sources), in the Layer
 * panel: the card's photo (the club's card photo rules, as before), a player
 * from the team list, or a random photo from one of the club's photo
 * collections. The source is stored on the layer (`PhotoLayerSource`); drafts
 * pick the photo when they are made, and the editor previews it.
 */
import { Link } from "wouter";
import {
  useListClubPhotoCollections,
  getListClubPhotoCollectionsQueryKey,
} from "@workspace/api-client-react";
import {
  MAX_PHOTO_SOURCE_POSITION,
  type PhotoLayerSource,
  type PhotoSourcePlayerPick,
} from "@workspace/scorecard/kind-templates";
import { field, label, NumberField } from "./design-controls";

const PICK_LABEL: Record<PhotoSourcePlayerPick, string> = {
  random: "A selected player (changes per card)",
  captain: "The captain",
  viceCaptain: "The vice-captain",
  keeper: "The wicketkeeper",
  position: "The player at a list position",
};

/** The picker's first choice, from the layer's source. */
type From = "card" | "player" | "collection";

const fromOf = (source: PhotoLayerSource | undefined): From => source?.kind ?? "card";

export function PhotoSourcePicker({
  source,
  onChange,
}: {
  source: PhotoLayerSource | undefined;
  onChange: (next: PhotoLayerSource | undefined) => void;
}) {
  const collectionsQ = useListClubPhotoCollections({
    query: { queryKey: getListClubPhotoCollectionsQueryKey(), staleTime: 60_000 },
  });
  const collections = Array.isArray(collectionsQ.data) ? collectionsQ.data : [];
  const from = fromOf(source);
  const missing =
    source?.kind === "collection" && !collections.some((c) => c.id === source.collectionId);

  const choose = (next: From) => {
    if (next === from) return;
    if (next === "card") onChange(undefined);
    else if (next === "player") onChange({ kind: "player", pick: "random" });
    // An empty collection id isn't valid: the first collection, or wait for one.
    else if (collections[0]) onChange({ kind: "collection", collectionId: collections[0].id });
  };

  return (
    <div className="space-y-2">
      <label className={label}>
        Photo comes from
        <select
          className={field}
          aria-label="Photo comes from"
          value={from}
          onChange={(e) => choose(e.target.value as From)}
        >
          <option value="card">The card&apos;s photo</option>
          <option value="player">A player from the team list</option>
          <option value="collection" disabled={collections.length === 0 && from !== "collection"}>
            A random photo from a collection
          </option>
        </select>
      </label>

      {source?.kind === "player" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className={label}>
            Which player
            <select
              className={field}
              aria-label="Which player"
              value={source.pick}
              onChange={(e) => {
                const pick = e.target.value as PhotoSourcePlayerPick;
                onChange(
                  pick === "position"
                    ? { kind: "player", pick, position: source.position ?? 1 }
                    : { kind: "player", pick },
                );
              }}
            >
              {(Object.keys(PICK_LABEL) as PhotoSourcePlayerPick[]).map((p) => (
                <option key={p} value={p}>
                  {PICK_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          {source.pick === "position" && (
            <NumberField
              name="Position"
              value={source.position ?? 1}
              min={1}
              max={MAX_PHOTO_SOURCE_POSITION}
              onChange={(n) => onChange({ kind: "player", pick: "position", position: n ?? 1 })}
            />
          )}
        </div>
      )}

      {source?.kind === "collection" && (
        <label className={label}>
          Collection
          <select
            className={field}
            aria-label="Collection"
            value={String(source.collectionId)}
            onChange={(e) => onChange({ kind: "collection", collectionId: Number(e.target.value) })}
          >
            {missing && <option value={String(source.collectionId)}>A deleted collection</option>}
            {collections.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name} ({c.photoCount})
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="text-[11px] text-[var(--ed-ink2)]">
        {source?.kind === "player"
          ? "Team List cards: the player's tagged library photo, cropped to them, then their headshot."
          : source?.kind === "collection"
            ? "Each card picks one of the collection's photos and keeps it."
            : "The photo the club's card photo rules pick."}{" "}
        {source && "When nothing matches, the card's photo shows. "}
        {collections.length === 0 && from !== "collection" && (
          <>
            Make collections in{" "}
            <Link className="underline" href="/admin/social/library">
              the photo library
            </Link>
            .{" "}
          </>
        )}
        Junior cards never show a photo.
      </p>
    </div>
  );
}
