import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorLibraryPhotos,
  getListJuniorLibraryPhotosQueryKey,
  useTagJuniorLibraryPhotos,
  useMoveJuniorLibraryPhotos,
  useDeleteJuniorLibraryPhotos,
  ingestJuniorLibraryPhotos,
  setJuniorLibraryPhotoFocus,
  useListJuniorPlayers,
  getListJuniorPlayersQueryKey,
  type ClubPhotoMatchFormat,
  type JuniorLibraryPhoto,
} from "@workspace/api-client-react";
import { Check, ChevronRight, Folder, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ListSkeleton, QueryError } from "@/components/data-states";
import { SettingsCard, SettingsRow, StatusPill } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import { JuniorPhotoFocusDialog } from "@/components/photo-library/photo-focus-dialog";
import { uploadLibraryPhotos, type UploadState } from "@/components/social-queue/library-upload";
import { MATCH_FORMATS, MATCH_FORMAT_LABELS } from "@workspace/scorecard";
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
import { suggestUploadFocus } from "@/lib/face-suggestions";
import { cn } from "@/lib/utils";

type Upload = { name: string; state: UploadState };
type TagFormat = "" | "none" | ClubPhotoMatchFormat;

const selectClass = "h-9 rounded-lg border border-input bg-background px-3 text-sm";

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
 * The junior photo library (kiosk-photo-rotation A): the senior library's folders (a
 * folder per junior team plus Club-wide, a sub-folder per photo type plus Unsorted) over
 * the junior tables. Children are tagged from the club's junior players, several per
 * photo. A photo shows outside admin only when it has a tag and every tagged child is
 * allowed a photo — the "Hidden" badge says why one is not.
 */
export default function AdminJuniorPhotoLibrary() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const search = useSearch();
  const [location, navigate] = useLocation();
  const folder = useMemo(() => parseFolder(search), [search]);
  const openFolder = (next: FolderPath) => navigate(`${location}${folderSearch(search, next)}`);

  const photosQ = useListJuniorLibraryPhotos({
    query: { queryKey: getListJuniorLibraryPhotosQueryKey() },
  });
  const photos = useMemo(() => (photosQ.data ?? []) as JuniorLibraryPhoto[], [photosQ.data]);
  const grades = useMemo(() => {
    const names = new Set<string>();
    for (const p of photos) if (p.grade) names.add(p.grade);
    if (folder.grade && folder.grade !== CLUB_WIDE) names.add(folder.grade);
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [photos, folder.grade]);
  const counts = useMemo(() => folderCounts(photos), [photos]);
  const inFolder = useMemo(
    () =>
      folder.grade && folder.type
        ? photos.filter((p) => gradeFolderOf(p) === folder.grade && typeFolderOf(p) === folder.type)
        : [],
    [photos, folder.grade, folder.type],
  );

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Photo focus areas: the photo whose focus editor is open.
  const [focusing, setFocusing] = useState<JuniorLibraryPhoto | null>(null);
  const [season, setSeason] = useState("");
  const [tagFormat, setTagFormat] = useState<TagFormat>("");
  const [uploadFormat, setUploadFormat] = useState<"" | ClubPhotoMatchFormat>("");
  const [childSearch, setChildSearch] = useState("");
  const [childIds, setChildIds] = useState<Map<string, string>>(new Map());
  const [newFolder, setNewFolder] = useState("");
  const [moving, setMoving] = useState<{ grade: GradeFolder; type: TypeFolder } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelected(new Set());
    setMoving(null);
  }, [folder.grade, folder.type]);

  const refresh = () => qc.invalidateQueries({ queryKey: getListJuniorLibraryPhotosQueryKey() });
  const done = () => {
    refresh();
    setSelected(new Set());
    setChildIds(new Map());
    setTagFormat("");
    setMoving(null);
    setError(null);
  };
  const tagM = useTagJuniorLibraryPhotos({
    mutation: {
      onSuccess: done,
      onError: () =>
        setError("Those tags couldn't be saved. Only this club's juniors can be tagged."),
    },
  });
  const moveM = useMoveJuniorLibraryPhotos({
    mutation: { onSuccess: done, onError: () => setError("Those photos couldn't be moved.") },
  });
  const deleteM = useDeleteJuniorLibraryPhotos({ mutation: { onSuccess: done } });
  const childParams = { search: childSearch.trim(), includePrivate: true };
  const childrenQ = useListJuniorPlayers(childParams, {
    query: {
      queryKey: getListJuniorPlayersQueryKey(childParams),
      enabled: childSearch.trim().length >= 2,
    },
  });

  const uploadGrade = folder.grade ?? CLUB_WIDE;
  const uploadType = folder.type ?? UNSORTED;

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
    const t = folderTarget(uploadGrade, uploadType);
    const added: Array<{ id: number; url: string }> = [];
    await uploadLibraryPhotos(files, {
      onIngested: (p) => added.push(p),
      ...(t.grade ? { grade: t.grade } : {}),
      ...(t.photoType ? { photoType: t.photoType } : {}),
      ...(uploadFormat ? { matchFormat: uploadFormat } : {}),
      ingest: ({ objectPaths, grade, season, photoType, matchFormat }) =>
        ingestJuniorLibraryPhotos({ objectPaths, grade, season, photoType, matchFormat }),
      onState: (i, state) =>
        setUploads((prev) => prev.map((u, j) => (j === start + i ? { ...u, state } : u))),
    });
    refresh();
    // Photo focus areas: a focus box suggested from the faces on each new photo, found on
    // this device through the junior routes only; it stays a suggestion until saved.
    void suggestUploadFocus(added, (id, box) =>
      setJuniorLibraryPhotoFocus(id, { focusBox: box, suggested: true }),
    ).then((n) => {
      if (n > 0) refresh();
    });
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
  const taggedOnSelection = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of selectedPhotos)
      for (const c of p.participants) m.set(c.participantId, c.displayName);
    return [...m];
  }, [selectedPhotos]);

  const applyTags = () => {
    const seasonNum = season.trim() ? Number(season) : undefined;
    tagM.mutate({
      data: {
        photoIds: Array.from(selected),
        ...(seasonNum && Number.isInteger(seasonNum) ? { season: seasonNum } : {}),
        ...(childIds.size ? { addParticipantIds: Array.from(childIds.keys()) } : {}),
        ...(tagFormat ? { matchFormat: tagFormat === "none" ? null : tagFormat } : {}),
      },
    });
  };

  const moveGrades = [...grades, CLUB_WIDE];
  const uploadLabel = folderLabel(uploadGrade, uploadType);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Junior photos, in a folder per team and photo type. Tag every child in a photo: a photo is
        used on cards and the clubroom display only when it has at least one tag and every tagged
        child is allowed photos. Location data is removed on upload.
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
                Junior photo library
              </button>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                Junior photo library
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
          data-testid="junior-library-file-input"
          onChange={(e) => {
            void startUpload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="junior-upload-format" className="text-muted-foreground">
          Match format for new photos
        </label>
        <select
          id="junior-upload-format"
          value={uploadFormat}
          onChange={(e) => setUploadFormat(e.target.value as "" | ClubPhotoMatchFormat)}
          className={selectClass}
        >
          <option value="">None</option>
          {MATCH_FORMATS.map((f) => (
            <option key={f} value={f}>
              {MATCH_FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
      </div>

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
              {u.state.phase === "done" && (
                <StatusPill tone="success">Added — tag the children</StatusPill>
              )}
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
          description="Tag the children, season and match format, or move them to another folder."
        >
          <SettingsRow label="Children" helper="This club's junior players" htmlFor="tag-children">
            <div className="w-64 space-y-2">
              {taggedOnSelection.length > 0 && (
                <ul className="space-y-1" aria-label="Tagged children">
                  {taggedOnSelection.map(([id, name]) => (
                    <li key={id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{name}</span>
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline"
                        aria-label={`Remove ${name}`}
                        onClick={() =>
                          tagM.mutate({
                            data: { photoIds: Array.from(selected), removeParticipantIds: [id] },
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Input
                id="tag-children"
                value={childSearch}
                onChange={(e) => setChildSearch(e.target.value)}
                placeholder="Search junior players"
                className="h-9"
              />
              {(childrenQ.data ?? []).slice(0, 8).map((c) => (
                <label key={c.participantId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={childIds.has(c.participantId)}
                    onChange={() =>
                      setChildIds((prev) => {
                        const next = new Map(prev);
                        if (next.has(c.participantId)) next.delete(c.participantId);
                        else next.set(c.participantId, c.displayName);
                        return next;
                      })
                    }
                  />
                  {c.displayName}
                </label>
              ))}
            </div>
          </SettingsRow>
          <SettingsRow
            label="Season"
            helper="The year the season started"
            htmlFor="junior-tag-season"
          >
            <Input
              id="junior-tag-season"
              type="number"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="h-9 w-28"
            />
          </SettingsRow>
          <SettingsRow
            label="Match format"
            helper="One Day, T20 or Two Day"
            htmlFor="junior-tag-format"
          >
            <select
              id="junior-tag-format"
              value={tagFormat}
              onChange={(e) => setTagFormat(e.target.value as TagFormat)}
              className={selectClass}
            >
              <option value="">Leave as is</option>
              {MATCH_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {MATCH_FORMAT_LABELS[f]}
                </option>
              ))}
              <option value="none">No format</option>
            </select>
          </SettingsRow>
          {moving && (
            <SettingsRow label="Move to" helper="A photo sits in one folder: its team and type.">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Move to">
                <label htmlFor="junior-move-grade" className="sr-only">
                  Team folder
                </label>
                <select
                  id="junior-move-grade"
                  value={moving.grade}
                  onChange={(e) => setMoving({ ...moving, grade: e.target.value })}
                  className={selectClass}
                >
                  {[...new Set([...moveGrades, moving.grade])].map((g) => (
                    <option key={g} value={g}>
                      {g === CLUB_WIDE ? CLUB_WIDE_LABEL : g}
                    </option>
                  ))}
                </select>
                <label htmlFor="junior-new-folder" className="sr-only">
                  New team folder
                </label>
                <Input
                  id="junior-new-folder"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onBlur={() =>
                    newFolder.trim() && setMoving({ ...moving, grade: newFolder.trim() })
                  }
                  placeholder="or a new team, e.g. Under 13"
                  className="h-9 w-48"
                />
                <label htmlFor="junior-move-type" className="sr-only">
                  Type folder
                </label>
                <select
                  id="junior-move-type"
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
                <Button
                  type="button"
                  disabled={moveM.isPending}
                  onClick={() =>
                    moveM.mutate({
                      data: {
                        photoIds: Array.from(selected),
                        ...folderTarget(newFolder.trim() || moving.grade, moving.type),
                      },
                    })
                  }
                >
                  Move
                </Button>
              </div>
            </SettingsRow>
          )}
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteM.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove ${selected.size} photo${selected.size === 1 ? "" : "s"}?`,
                  description: "Cards using them lose the photo straight away.",
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
                onClick={() => {
                  setNewFolder("");
                  setMoving({ grade: folder.grade ?? CLUB_WIDE, type: folder.type ?? UNSORTED });
                }}
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
          message="We couldn’t load the junior photo library."
          onRetry={() => photosQ.refetch()}
        />
      ) : !folder.grade ? (
        <section aria-labelledby="junior-library-folders" className="space-y-3">
          <h2 id="junior-library-folders" className="text-base font-semibold text-foreground">
            Folders
          </h2>
          <ul
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Team folders"
          >
            {[...grades, CLUB_WIDE].map((g) => (
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
        <section aria-labelledby="junior-library-grade" className="space-y-3">
          <h2 id="junior-library-grade" className="text-base font-semibold text-foreground">
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
        <section aria-labelledby="junior-library-folder" className="space-y-3">
          <h2 id="junior-library-folder" className="text-base font-semibold text-foreground">
            {folderLabel(folder.grade, folder.type)}
          </h2>
          {inFolder.length === 0 ? (
            <EmptyState
              title="No photos in this folder"
              message="Upload photos here, or move photos in from another folder."
            />
          ) : (
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
              aria-label="Junior library photos"
            >
              {inFolder.map((p) => {
                const on = selected.has(p.id);
                const blocked = p.participants.filter((c) => !c.allowed);
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
                          p.participants.length
                            ? p.participants.map((c) => c.displayName).join(", ")
                            : "No children tagged",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="flex flex-wrap gap-1 px-2 pb-1">
                        {p.displayable ? (
                          <StatusPill tone="success">Shown</StatusPill>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1"
                            title={
                              p.participants.length === 0
                                ? "Hidden: tag the children in this photo"
                                : `Hidden: ${blocked.map((c) => c.displayName).join(", ")} not allowed photos`
                            }
                          >
                            <ShieldAlert className="h-3 w-3 text-destructive" aria-hidden />
                            <StatusPill tone="danger">
                              {p.participants.length === 0
                                ? "Hidden · untagged"
                                : "Hidden · consent"}
                            </StatusPill>
                          </span>
                        )}
                        {p.matchFormat && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                            {MATCH_FORMAT_LABELS[p.matchFormat]}
                          </span>
                        )}
                        {p.focusBox && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
                            {p.focusSuggested ? "Focus suggested" : "Focus set"}
                          </span>
                        )}
                      </span>
                    </button>
                    {/* Photo focus areas: only photos whose size is known (all but the oldest). */}
                    {p.width && p.height ? (
                      <button
                        type="button"
                        aria-label={`Set the focus of photo ${p.id}`}
                        onClick={() => setFocusing(p)}
                        className="px-2 text-xs font-medium text-primary-text hover:underline"
                      >
                        Focus…
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!photosQ.isLoading && !photosQ.isError && photos.length === 0 && (
        <EmptyState
          title="No junior photos yet"
          message="Upload junior team and match photos into a folder to get started."
        />
      )}
      <JuniorPhotoFocusDialog
        photo={focusing}
        open={focusing !== null}
        onOpenChange={(o) => !o && setFocusing(null)}
        onSaved={() => refresh()}
      />
    </div>
  );
}
