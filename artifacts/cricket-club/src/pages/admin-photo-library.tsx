import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClubPhotos,
  getListClubPhotosQueryKey,
  useTagClubPhotos,
  useMoveClubPhotos,
  useDeleteClubPhotos,
  useListPlayers,
  getListPlayersQueryKey,
  useListGrades,
  useGetGoogleDriveConfig,
  getGetGoogleDriveConfigQueryKey,
  type ClubPhoto,
} from "@workspace/api-client-react";
import { Check, ChevronRight, Folder, HardDrive, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ListSkeleton, QueryError } from "@/components/data-states";
import { SettingsCard, SettingsRow, StatusPill } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import {
  importDrivePhotos,
  uploadLibraryPhotos,
  type UploadState,
  type UploadTarget,
} from "@/components/social-queue/library-upload";
import { pickDrivePhotos } from "@/components/social-queue/google-drive-picker";
import { CardPhotoRules } from "@/components/social-queue/card-photo-rules";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import {
  CLUB_WIDE,
  CLUB_WIDE_LABEL,
  TYPE_FOLDERS,
  UNSORTED,
  folderCounts,
  folderLabel,
  folderSearch,
  folderTarget,
  gradeFolderLabel,
  gradeFolderOf,
  parseFolder,
  typeCountKey,
  typeFolderLabel,
  typeFolderOf,
  type FolderPath,
  type GradeFolder,
  type TypeFolder,
} from "@/lib/photo-folders";
import { cn } from "@/lib/utils";

type Upload = { name: string; state: UploadState };

const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm";

/** One folder tile: a keyboard-reachable button with its photo count. */
function FolderTile({
  label,
  count,
  onOpen,
}: {
  label: string;
  count: number;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}, ${count} photo${count === 1 ? "" : "s"}`}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          count === 0 && "text-muted-foreground",
        )}
      >
        <Folder className="h-5 w-5 shrink-0 text-primary-text" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </button>
    </li>
  );
}

/**
 * The club photo library (R10–R12) as folders: a folder per senior grade plus
 * Club-wide, and inside each a sub-folder per photo type plus Unsorted. The
 * folder is a view over the photo's grade and type (a photo has one type), so
 * uploading into a folder files the photo, and "Move to…" re-files a
 * selection. Inside a folder, photos are multi-selected for player tagging,
 * moving or removal. The current folder lives in the URL
 * (`?grade=A%20Grade&type=batting`). Photos here feed auto-drafts, never
 * junior cards.
 */
export default function AdminPhotoLibrary() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const search = useSearch();
  const [location, navigate] = useLocation();
  const folder = useMemo(() => parseFolder(search), [search]);
  const openFolder = (next: FolderPath) => navigate(`${location}${folderSearch(search, next)}`);

  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey() },
  });
  const photos = useMemo(() => (photosQ.data ?? []) as ClubPhoto[], [photosQ.data]);
  const gradesQ = useListGrades();

  // Senior grades from the club's grade list (as the rules editor uses), plus
  // any grade a photo already carries so no photo is hidden.
  const seniorGrades = useMemo(() => {
    const names = (gradesQ.data ?? [])
      .map((g) => g.grade)
      .filter((g) => g !== "CLUB TOTAL" && !isJuniorGradeLabel(g));
    return sortGradesBySeniority(new Set(names));
  }, [gradesQ.data]);
  const gradeFolders = useMemo<GradeFolder[]>(() => {
    const names = new Set(seniorGrades);
    for (const p of photos) if (p.grade) names.add(p.grade);
    if (folder.grade && folder.grade !== CLUB_WIDE) names.add(folder.grade);
    return [...sortGradesBySeniority(names), CLUB_WIDE];
  }, [seniorGrades, photos, folder.grade]);
  const counts = useMemo(() => folderCounts(photos), [photos]);

  const shown = useMemo(
    () =>
      folder.grade && folder.type
        ? photos.filter((p) => gradeFolderOf(p) === folder.grade && typeFolderOf(p) === folder.type)
        : [],
    [photos, folder.grade, folder.type],
  );

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [season, setSeason] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerIds, setPlayerIds] = useState<Set<number>>(new Set());
  const [tagError, setTagError] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ grade: GradeFolder; type: TypeFolder } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [useFor, setUseFor] = useState<{ photoId: number; nonce: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Google Drive import shows only when the deployment has Google keys (404 = hidden).
  const driveQ = useGetGoogleDriveConfig({
    query: { queryKey: getGetGoogleDriveConfigQueryKey(), retry: false, staleTime: Infinity },
  });
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  // A selection belongs to the folder it was made in.
  useEffect(() => {
    setSelected(new Set());
    setMoving(null);
  }, [folder.grade, folder.type]);

  const refresh = () => qc.invalidateQueries({ queryKey: getListClubPhotosQueryKey() });
  const tagM = useTagClubPhotos({
    mutation: {
      onSuccess: () => {
        refresh();
        setSelected(new Set());
        setPlayerIds(new Set());
        setTagError(null);
      },
      onError: () =>
        setTagError("Those tags couldn't be saved. Only senior players can be tagged."),
    },
  });
  const moveM = useMoveClubPhotos({
    mutation: {
      onSuccess: () => {
        refresh();
        setSelected(new Set());
        setMoving(null);
        setMoveError(null);
      },
      onError: () => setMoveError("Those photos couldn't be moved. Choose a senior grade."),
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

  // Uploads land in the open folder (Club-wide / Unsorted at the top level).
  const uploadGrade = folder.grade ?? CLUB_WIDE;
  const uploadType = folder.type ?? UNSORTED;
  const uploadTarget = (): UploadTarget => {
    const t = folderTarget(uploadGrade, uploadType);
    return {
      ...(t.grade ? { grade: t.grade } : {}),
      ...(t.photoType ? { photoType: t.photoType } : {}),
    };
  };

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
      ...uploadTarget(),
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
        ...uploadTarget(),
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

  const applyTags = () => {
    const seasonNum = season.trim() ? Number(season) : undefined;
    tagM.mutate({
      data: {
        photoIds: Array.from(selected),
        ...(seasonNum && Number.isInteger(seasonNum) ? { season: seasonNum } : {}),
        ...(playerIds.size ? { addPlayerIds: Array.from(playerIds) } : {}),
      },
    });
  };

  const applyMove = () => {
    if (!moving) return;
    moveM.mutate({
      data: { photoIds: Array.from(selected), ...folderTarget(moving.grade, moving.type) },
    });
  };

  const players = playersQ.data?.players ?? [];
  // Senior grades (and Club-wide) are the only places a photo can be moved to.
  const moveGrades = [...seniorGrades, CLUB_WIDE];
  const uploadLabel = folderLabel(uploadGrade, uploadType);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Senior photos for your cards, in a folder per team and photo type. Upload into a folder to
        file photos there, then tag the players. iPhone HEIC photos are converted, and location data
        is removed.
      </p>

      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          <li>
            {folder.grade ? (
              <button
                type="button"
                className="font-medium text-primary-text hover:underline"
                onClick={() => openFolder({ grade: null, type: null })}
              >
                Photo library
              </button>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                Photo library
              </span>
            )}
          </li>
          {folder.grade && (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              {folder.type ? (
                <button
                  type="button"
                  className="font-medium text-primary-text hover:underline"
                  onClick={() => openFolder({ grade: folder.grade, type: null })}
                >
                  {gradeFolderLabel(folder.grade)}
                </button>
              ) : (
                <span aria-current="page" className="font-medium text-foreground">
                  {gradeFolderLabel(folder.grade)}
                </span>
              )}
            </li>
          )}
          {folder.grade && folder.type && (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span aria-current="page" className="font-medium text-foreground">
                {typeFolderLabel(folder.type)}
              </span>
            </li>
          )}
        </ol>
      </nav>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Upload photos to ${uploadLabel}`}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/60",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Drop photos here, or click to choose</p>
        <p className="text-xs text-muted-foreground" data-testid="upload-target">
          Uploading to {uploadLabel}
        </p>
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
          description="Tag the players in these photos, or move them to another folder."
        >
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
          <SettingsRow label="Season" helper="The year the season started" htmlFor="tag-season">
            <Input
              id="tag-season"
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="h-9 w-28"
            />
          </SettingsRow>
          {moving && (
            <SettingsRow label="Move to" helper="A photo sits in one folder: its team and type.">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Move to">
                <label htmlFor="move-grade" className="sr-only">
                  Team folder
                </label>
                <select
                  id="move-grade"
                  value={moving.grade}
                  onChange={(e) => setMoving({ ...moving, grade: e.target.value })}
                  className={selectClass}
                >
                  {moveGrades.map((g) => (
                    <option key={g} value={g}>
                      {g === CLUB_WIDE ? CLUB_WIDE_LABEL : g}
                    </option>
                  ))}
                </select>
                <label htmlFor="move-type" className="sr-only">
                  Type folder
                </label>
                <select
                  id="move-type"
                  value={moving.type}
                  onChange={(e) => setMoving({ ...moving, type: e.target.value as TypeFolder })}
                  className={selectClass}
                >
                  {TYPE_FOLDERS.map((t) => (
                    <option key={t} value={t}>
                      {typeFolderLabel(t)}
                    </option>
                  ))}
                </select>
                <Button type="button" onClick={applyMove} disabled={moveM.isPending}>
                  Move
                </Button>
              </div>
            </SettingsRow>
          )}
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            {tagError && <p className="text-sm text-destructive">{tagError}</p>}
            {moveError && <p className="text-sm text-destructive">{moveError}</p>}
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
            {!moving && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setMoving({
                    grade:
                      folder.grade && moveGrades.includes(folder.grade) ? folder.grade : CLUB_WIDE,
                    type: folder.type ?? UNSORTED,
                  })
                }
              >
                Move to…
              </Button>
            )}
            <Button type="button" onClick={applyTags} disabled={tagM.isPending}>
              Apply tags
            </Button>
          </div>
        </SettingsCard>
      )}

      {photosQ.isLoading ? (
        <ListSkeleton rows={3} />
      ) : photosQ.isError ? (
        <QueryError
          message="We couldn’t load the photo library."
          onRetry={() => photosQ.refetch()}
        />
      ) : !folder.grade ? (
        <section aria-labelledby="library-folders" className="space-y-3">
          <h2 id="library-folders" className="text-base font-semibold text-foreground">
            Folders
          </h2>
          <ul
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Team folders"
          >
            {gradeFolders.map((g) => (
              <FolderTile
                key={g}
                label={gradeFolderLabel(g)}
                count={counts.byGrade.get(g) ?? 0}
                onOpen={() => openFolder({ grade: g, type: null })}
              />
            ))}
          </ul>
        </section>
      ) : !folder.type ? (
        <section aria-labelledby="library-grade" className="space-y-3">
          <h2 id="library-grade" className="text-base font-semibold text-foreground">
            {gradeFolderLabel(folder.grade)}
          </h2>
          <ul
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Type folders"
          >
            {TYPE_FOLDERS.map((t) => (
              <FolderTile
                key={t}
                label={typeFolderLabel(t)}
                count={counts.byType.get(typeCountKey(folder.grade!, t)) ?? 0}
                onOpen={() => openFolder({ grade: folder.grade, type: t })}
              />
            ))}
          </ul>
        </section>
      ) : (
        <section aria-labelledby="library-folder" className="space-y-3">
          <h2 id="library-folder" className="text-base font-semibold text-foreground">
            {folderLabel(folder.grade, folder.type)}
          </h2>
          {shown.length === 0 ? (
            <EmptyState
              title="No photos in this folder"
              message="Upload photos here, or move photos in from another folder."
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
                      aria-label={`Photo ${p.id}`}
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
                        {[
                          p.season,
                          p.playerIds.length ? `${p.playerIds.length} tagged` : "No players tagged",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="block px-2 pb-1">
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                          {folderLabel(gradeFolderOf(p), typeFolderOf(p))}
                        </span>
                      </span>
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
        </section>
      )}

      {!photosQ.isLoading && !photosQ.isError && photos.length === 0 && (
        <EmptyState
          title="No photos yet"
          message="Upload senior team and match photos into a folder to get started."
        />
      )}

      <CardPhotoRules photos={photos} useFor={useFor} />
    </div>
  );
}
