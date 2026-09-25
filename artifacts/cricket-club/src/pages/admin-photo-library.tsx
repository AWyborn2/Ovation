import { useMemo, useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClubPhotos,
  getListClubPhotosQueryKey,
  useTagClubPhotos,
  useDeleteClubPhotos,
  useListPlayers,
  getListPlayersQueryKey,
  useGetGoogleDriveConfig,
  getGetGoogleDriveConfigQueryKey,
  type ClubPhoto,
  type ClubPhotoType,
} from "@workspace/api-client-react";
import { Check, HardDrive, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ListSkeleton, QueryError } from "@/components/data-states";
import { SettingsCard, SettingsRow, StatusPill } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import {
  importDrivePhotos,
  uploadLibraryPhotos,
  type UploadState,
} from "@/components/social-queue/library-upload";
import { pickDrivePhotos } from "@/components/social-queue/google-drive-picker";
import { CardPhotoRules } from "@/components/social-queue/card-photo-rules";
import { isJuniorGradeLabel, PHOTO_TYPES, PHOTO_TYPE_LABELS } from "@workspace/scorecard";
import { cn } from "@/lib/utils";

type Upload = { name: string; state: UploadState };

/** A pending bulk change to one photo type on the selected photos. */
type TypeEdit = "add" | "remove";

/** Whether all, some or none of `photos` carry `type`. */
function typeCoverage(photos: ClubPhoto[], type: ClubPhotoType): "all" | "some" | "none" {
  const n = photos.filter((p) => (p.photoTypes ?? []).includes(type)).length;
  return n === 0 ? "none" : n === photos.length ? "all" : "some";
}

/** Small type chips under a library photo. */
function PhotoTypeChips({ types }: { types: readonly ClubPhotoType[] }) {
  if (types.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1 px-2 pb-1">
      {types.map((t) => (
        <span
          key={t}
          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground"
        >
          {PHOTO_TYPE_LABELS[t]}
        </span>
      ))}
    </span>
  );
}

/**
 * The club photo library (R10–R12): bulk upload (HEIC converted on the
 * server), a grid with multi-select, batch tagging by grade, season, senior
 * player and photo type, and a photo type filter. Photos here feed
 * auto-drafts, never junior cards; each card type prefers certain photo types.
 */
export default function AdminPhotoLibrary() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey() },
  });
  const photos = (photosQ.data ?? []) as ClubPhoto[];
  const [typeFilter, setTypeFilter] = useState<ClubPhotoType | "">("");
  const shown = useMemo(
    () => (typeFilter ? photos.filter((p) => (p.photoTypes ?? []).includes(typeFilter)) : photos),
    [photos, typeFilter],
  );
  const [typeEdits, setTypeEdits] = useState<Partial<Record<ClubPhotoType, TypeEdit>>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [grade, setGrade] = useState("");
  const [season, setSeason] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerIds, setPlayerIds] = useState<Set<number>>(new Set());
  const [tagError, setTagError] = useState<string | null>(null);
  const [useFor, setUseFor] = useState<{ photoId: number; nonce: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Google Drive import shows only when the deployment has Google keys (404 = hidden).
  const driveQ = useGetGoogleDriveConfig({
    query: { queryKey: getGetGoogleDriveConfigQueryKey(), retry: false, staleTime: Infinity },
  });
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: getListClubPhotosQueryKey() });
  const tagM = useTagClubPhotos({
    mutation: {
      onSuccess: () => {
        refresh();
        setSelected(new Set());
        setPlayerIds(new Set());
        setTypeEdits({});
        setTagError(null);
      },
      onError: () =>
        setTagError("Those tags couldn't be saved. Only senior players can be tagged."),
    },
  });
  const deleteM = useDeleteClubPhotos({
    mutation: {
      onSuccess: () => {
        refresh();
        setSelected(new Set());
      },
    },
  });
  const playersQ = useListPlayers(
    { search: playerSearch, limit: 8 },
    {
      query: {
        queryKey: getListPlayersQueryKey({ search: playerSearch, limit: 8 }),
        enabled: playerSearch.trim().length >= 2,
      },
    },
  );

  const startUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const start = uploads.length;
    setUploads((prev) => [
      ...prev,
      ...files.map((f) => ({
        name: f.name,
        state: { phase: "uploading", progress: 0 } as UploadState,
      })),
    ]);
    await uploadLibraryPhotos(files, {
      onState: (i, state) =>
        setUploads((prev) => prev.map((u, j) => (j === start + i ? { ...u, state } : u))),
    });
    refresh();
  };

  const importFromDrive = async () => {
    if (!driveQ.data) return;
    setDriveError(null);
    setDriveBusy(true);
    try {
      const pick = await pickDrivePhotos(driveQ.data);
      if (!pick) return;
      const start = uploads.length;
      setUploads((prev) => [
        ...prev,
        ...pick.files.map((f) => ({ name: f.name, state: { phase: "converting" } as UploadState })),
      ]);
      await importDrivePhotos(pick, {
        onState: (i, state) =>
          setUploads((prev) => prev.map((u, j) => (j === start + i ? { ...u, state } : u))),
      });
      refresh();
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : "Google Drive import didn't finish.");
    } finally {
      setDriveBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void startUpload(Array.from(e.dataTransfer.files));
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedPhotos = photos.filter((p) => selected.has(p.id));

  /** A type chip is on when it will be added, or every selected photo has it. */
  const typeState = (t: ClubPhotoType): boolean | "mixed" => {
    const edit = typeEdits[t];
    if (edit) return edit === "add";
    const coverage = typeCoverage(selectedPhotos, t);
    return coverage === "some" ? "mixed" : coverage === "all";
  };

  const toggleType = (t: ClubPhotoType) => {
    const next: TypeEdit = typeState(t) === true ? "remove" : "add";
    const coverage = typeCoverage(selectedPhotos, t);
    setTypeEdits((prev) => {
      const edits = { ...prev };
      // Back to how the photos already are: nothing to change.
      if ((next === "add" && coverage === "all") || (next === "remove" && coverage === "none"))
        delete edits[t];
      else edits[t] = next;
      return edits;
    });
  };

  const applyTags = () => {
    const seasonNum = season.trim() ? Number(season) : undefined;
    const addTypes = PHOTO_TYPES.filter((t) => typeEdits[t] === "add");
    const removeTypes = PHOTO_TYPES.filter((t) => typeEdits[t] === "remove");
    tagM.mutate({
      data: {
        photoIds: Array.from(selected),
        ...(grade.trim() ? { grade: grade.trim() } : {}),
        ...(seasonNum && Number.isInteger(seasonNum) ? { season: seasonNum } : {}),
        ...(playerIds.size ? { addPlayerIds: Array.from(playerIds) } : {}),
        ...(addTypes.length ? { addTypes } : {}),
        ...(removeTypes.length ? { removeTypes } : {}),
      },
    });
  };

  const chip = (on: boolean | "mixed") =>
    cn(
      "rounded-full border px-2 py-0.5 text-xs transition-colors",
      on === true
        ? "border-primary bg-primary text-primary-foreground"
        : on === "mixed"
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-transparent text-muted-foreground hover:border-primary/50",
    );

  const players = playersQ.data?.players ?? [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Senior photos for your cards. Tag a photo with a grade, season or player and new drafts pick
        it automatically. iPhone HEIC photos are converted, and location data is removed.
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload photos"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/60",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Drop photos here, or click to choose</p>
        <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or HEIC · up to 25 MB each</p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="hidden"
          data-testid="library-file-input"
          onChange={(e) => {
            void startUpload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {driveQ.data && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={driveBusy}
            onClick={() => void importFromDrive()}
          >
            <HardDrive className="mr-2 h-4 w-4" aria-hidden />
            Import from Google Drive
          </Button>
          <span className="text-xs text-muted-foreground">
            Only the photos you pick are shared with Ovation.
          </span>
          {driveError && (
            <p role="alert" className="w-full text-sm text-destructive">
              {driveError}
            </p>
          )}
        </div>
      )}

      {uploads.length > 0 && (
        <ul
          className="divide-y divide-border rounded-xl border border-border bg-card"
          aria-label="Uploads"
        >
          {uploads.map((u, i) => (
            <li
              key={`${u.name}-${i}`}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
            >
              <span className="truncate">{u.name}</span>
              {u.state.phase === "uploading" && (
                <span className="text-muted-foreground">{u.state.progress}%</span>
              )}
              {u.state.phase === "converting" && <StatusPill tone="info">Converting</StatusPill>}
              {u.state.phase === "done" && <StatusPill tone="success">Added</StatusPill>}
              {u.state.phase === "error" && (
                <span className="flex items-center gap-2">
                  <StatusPill tone="danger">Failed</StatusPill>
                  <span className="text-xs text-muted-foreground">{u.state.message}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 && (
        <SettingsCard
          title={`${selected.size} selected`}
          description="Tags are added to every selected photo."
        >
          <SettingsRow label="Grade" htmlFor="tag-grade">
            <Input
              id="tag-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. A Grade"
              className="h-9 w-48"
            />
          </SettingsRow>
          <SettingsRow label="Season" helper="The year the season started" htmlFor="tag-season">
            <Input
              id="tag-season"
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="h-9 w-28"
            />
          </SettingsRow>
          <SettingsRow label="Players" helper="Senior players only" htmlFor="tag-players">
            <div className="w-64 space-y-2">
              <Input
                id="tag-players"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players"
                className="h-9"
              />
              {players.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={playerIds.has(p.id)}
                    onChange={() =>
                      setPlayerIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                  />
                  {p.givenName} {p.surname}
                </label>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow
            label="Photo types"
            helper="Cards prefer photos of their type, e.g. a century picks a batting milestone photo."
          >
            <div className="flex w-64 flex-wrap gap-1.5" role="group" aria-label="Photo types">
              {PHOTO_TYPES.map((t) => {
                const on = typeState(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    className={chip(on)}
                    onClick={() => toggleType(t)}
                  >
                    {PHOTO_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </SettingsRow>
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            {tagError && <p className="text-sm text-destructive">{tagError}</p>}
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteM.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove ${selected.size} photo${selected.size === 1 ? "" : "s"}?`,
                  description: "Drafts that already use them keep their copy.",
                  confirmText: "Remove",
                  destructive: true,
                });
                if (ok) deleteM.mutate({ data: { photoIds: Array.from(selected) } });
              }}
            >
              Remove
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button type="button" onClick={applyTags} disabled={tagM.isPending}>
              Apply tags
            </Button>
          </div>
        </SettingsCard>
      )}

      {photos.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="photo-type-filter" className="text-sm font-medium text-foreground">
            Filter by type
          </label>
          <select
            id="photo-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ClubPhotoType | "")}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">All photos</option>
            {PHOTO_TYPES.map((t) => (
              <option key={t} value={t}>
                {PHOTO_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      )}

      {photosQ.isLoading ? (
        <ListSkeleton rows={3} />
      ) : photosQ.isError ? (
        <QueryError
          message="We couldn’t load the photo library."
          onRetry={() => photosQ.refetch()}
        />
      ) : photos.length === 0 ? (
        <EmptyState
          title="No photos yet"
          message="Upload senior team and match photos to get started."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="No photos of this type"
          message="Select photos and tag them with a photo type, or show all photos."
        />
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          aria-label="Library photos"
        >
          {shown.map((p) => {
            const on = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`Photo ${p.id}${p.grade ? `, ${p.grade}` : ""}`}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "relative block w-full overflow-hidden rounded-lg border-2 text-left",
                    on ? "border-primary" : "border-transparent",
                  )}
                >
                  <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                  {on && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <span className="block truncate px-2 py-1 text-xs text-muted-foreground">
                    {[p.grade, p.season, p.playerIds.length ? `${p.playerIds.length} tagged` : null]
                      .filter(Boolean)
                      .join(" · ") || "Untagged"}
                  </span>
                  <PhotoTypeChips types={p.photoTypes ?? []} />
                </button>
                {!isJuniorGradeLabel(p.grade) && (
                  <button
                    type="button"
                    aria-label={`Use photo ${p.id} for cards`}
                    onClick={() => setUseFor({ photoId: p.id, nonce: Date.now() })}
                    className="px-2 text-xs font-medium text-primary-text hover:underline"
                  >
                    Use for…
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CardPhotoRules photos={photos} useFor={useFor} />
    </div>
  );
}
