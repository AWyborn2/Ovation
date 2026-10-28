/**
 * Photo collections in the photo library (photo layer sources): named sets of
 * library photos an admin makes ("Matchday crowd", "Sponsor night"), which a
 * template's photo layer can take a random photo from. Unlike the library's
 * folders (each photo's grade and type), a collection is picked by hand and a
 * photo can be in many.
 *
 * - `CollectionTiles`: the collections on the library's top level, and a new one.
 * - `CollectionHeader`: rename or delete the open collection.
 * - `AddToCollection`: the selection panel's "Add to collection" row.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClubPhotoCollections,
  getListClubPhotoCollectionsQueryKey,
  getListClubPhotosQueryKey,
  useCreateClubPhotoCollection,
  useRenameClubPhotoCollection,
  useDeleteClubPhotoCollection,
  useAddClubPhotoCollectionPhotos,
  useRemoveClubPhotoCollectionPhotos,
  type ClubPhotoCollection,
} from "@workspace/api-client-react";
import { Images, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsRow } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";

const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm";

/** The club's collections, by name. */
export function useCollections(): ClubPhotoCollection[] {
  const q = useListClubPhotoCollections({
    query: { queryKey: getListClubPhotoCollectionsQueryKey() },
  });
  return Array.isArray(q.data) ? q.data : [];
}

/** Refresh the collections and the photos (each photo lists its collections). */
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: getListClubPhotoCollectionsQueryKey() });
    void qc.invalidateQueries({ queryKey: getListClubPhotosQueryKey() });
  };
}

/** A name field and a save button, for a new collection or a rename. */
function NameForm({
  id,
  initial = "",
  label,
  busy,
  error,
  onSave,
  onCancel,
}: {
  id: string;
  initial?: string;
  label: string;
  busy: boolean;
  error: string | null;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <label htmlFor={id} className="sr-only">
        Collection name
      </label>
      <Input
        id={id}
        value={name}
        maxLength={60}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="Collection name"
        className="h-9 w-56"
      />
      <Button type="submit" disabled={busy || !name.trim()}>
        {label}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

const nameError = (err: unknown) =>
  (err as { status?: number } | null)?.status === 409
    ? "There's already a collection with that name."
    : "That collection couldn't be saved.";

/** The collections on the library's top level, and a new collection. */
export function CollectionTiles({ onOpen }: { onOpen: (id: number) => void }) {
  const collections = useCollections();
  const refresh = useRefresh();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createM = useCreateClubPhotoCollection({
    mutation: {
      onSuccess: (c) => {
        refresh();
        setCreating(false);
        setError(null);
        onOpen(c.id);
      },
      onError: (err) => setError(nameError(err)),
    },
  });
  return (
    <section aria-labelledby="library-collections" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="library-collections" className="text-base font-semibold text-foreground">
          Collections
        </h2>
        {!creating && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            New collection
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Hand-picked sets of photos. A photo can be in several. A template&apos;s photo can come from
        a collection: each card picks one of its photos.
      </p>
      {creating && (
        <NameForm
          id="new-collection"
          label="Create"
          busy={createM.isPending}
          error={error}
          onSave={(name) => createM.mutate({ data: { name } })}
          onCancel={() => {
            setCreating(false);
            setError(null);
          }}
        />
      )}
      {collections.length > 0 && (
        <ul
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Photo collections"
        >
          {collections.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                aria-label={`${c.name}, ${c.photoCount} photo${c.photoCount === 1 ? "" : "s"}`}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  c.photoCount === 0 && "text-muted-foreground",
                )}
              >
                {c.coverUrl ? (
                  <img src={c.coverUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                ) : (
                  <Images className="h-5 w-5 shrink-0 text-primary-text" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{c.photoCount}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The open collection's name, with rename and delete. */
export function CollectionHeader({
  collection,
  onDeleted,
}: {
  collection: ClubPhotoCollection;
  onDeleted: () => void;
}) {
  const confirm = useConfirm();
  const refresh = useRefresh();
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameM = useRenameClubPhotoCollection({
    mutation: {
      onSuccess: () => {
        refresh();
        setRenaming(false);
        setError(null);
      },
      onError: (err) => setError(nameError(err)),
    },
  });
  const deleteM = useDeleteClubPhotoCollection({
    mutation: {
      onSuccess: () => {
        refresh();
        onDeleted();
      },
    },
  });
  if (renaming)
    return (
      <NameForm
        id="rename-collection"
        initial={collection.name}
        label="Rename"
        busy={renameM.isPending}
        error={error}
        onSave={(name) => renameM.mutate({ id: collection.id, data: { name } })}
        onCancel={() => {
          setRenaming(false);
          setError(null);
        }}
      />
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 id="library-folder" className="mr-auto text-base font-semibold text-foreground">
        {collection.name}
      </h2>
      <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(true)}>
        Rename
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={deleteM.isPending}
        onClick={async () => {
          const ok = await confirm({
            title: `Delete ${collection.name}?`,
            description:
              "Its photos stay in the library. Template photos that came from it show the card's photo instead.",
            confirmText: "Delete",
            destructive: true,
          });
          if (ok) deleteM.mutate({ id: collection.id });
        }}
      >
        Delete
      </Button>
    </div>
  );
}

/** The selection panel's row: add the selected photos to a collection (or take them out). */
export function AddToCollection({
  photoIds,
  openCollection,
  onDone,
}: {
  photoIds: number[];
  /** The collection on show, whose photos the selection can be taken out of. */
  openCollection: ClubPhotoCollection | null;
  onDone: () => void;
}) {
  const collections = useCollections();
  const refresh = useRefresh();
  const [target, setTarget] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    refresh();
    setError(null);
    onDone();
  };
  const addM = useAddClubPhotoCollectionPhotos({
    mutation: {
      onSuccess: done,
      onError: () => setError("Those photos couldn't be added."),
    },
  });
  const removeM = useRemoveClubPhotoCollectionPhotos({
    mutation: {
      onSuccess: done,
      onError: () => setError("Those photos couldn't be taken out."),
    },
  });
  const others = collections.filter((c) => c.id !== openCollection?.id);
  const chosen = others.find((c) => String(c.id) === target) ?? others[0];
  return (
    <SettingsRow
      label="Collections"
      helper="A photo can be in several collections."
      htmlFor="add-to-collection"
    >
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Collections">
        {others.length > 0 ? (
          <>
            <select
              id="add-to-collection"
              aria-label="Collection to add to"
              value={chosen ? String(chosen.id) : ""}
              onChange={(e) => setTarget(e.target.value)}
              className={selectClass}
            >
              {others.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={!chosen || addM.isPending}
              onClick={() => chosen && addM.mutate({ id: chosen.id, data: { photoIds } })}
            >
              Add to collection
            </Button>
          </>
        ) : (
          !openCollection && (
            <span className="text-sm text-muted-foreground">
              Make a collection on the library&apos;s first page to add photos to it.
            </span>
          )
        )}
        {openCollection && (
          <Button
            type="button"
            variant="outline"
            disabled={removeM.isPending}
            onClick={() => removeM.mutate({ id: openCollection.id, data: { photoIds } })}
          >
            Take out of {openCollection.name}
          </Button>
        )}
        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SettingsRow>
  );
}
