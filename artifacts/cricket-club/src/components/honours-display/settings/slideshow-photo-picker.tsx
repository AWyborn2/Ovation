import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import {
  getListClubPhotosQueryKey,
  getListJuniorLibraryPhotosQueryKey,
  useListClubPhotos,
  useListJuniorLibraryPhotos,
  type KioskSlideshowFolder,
  type KioskSlideshowPick,
} from "@workspace/api-client-react";
import { PHOTO_TYPES, PHOTO_TYPE_LABELS } from "@workspace/scorecard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveItem } from "./rotation-list";

/** A library photo the slideshow pickers can show. */
interface PickablePhoto {
  library: KioskSlideshowPick["library"];
  id: number;
  thumb: string;
  grade: string | null;
}

const pickKey = (p: { library: string; id: number }) => `${p.library}:${p.id}`;

/**
 * Both libraries' photos for the slideshow pickers. Junior photos are listed
 * only when they may be shown (every tagged child allowed); the server checks
 * again when it resolves the slideshow.
 */
function useSlideshowLibraries(enabled: boolean) {
  const senior = useListClubPhotos(undefined, {
    query: { enabled, queryKey: getListClubPhotosQueryKey() },
  });
  const junior = useListJuniorLibraryPhotos({
    query: { enabled, queryKey: getListJuniorLibraryPhotosQueryKey() },
  });
  return useMemo(() => {
    const out: PickablePhoto[] = [];
    for (const p of senior.data ?? []) {
      // Junior stock artwork and cut-outs never play in a slideshow.
      if (p.juniorStock || p.sourcePhotoId != null) continue;
      out.push({ library: "senior", id: p.id, thumb: p.thumbUrl || p.url, grade: p.grade ?? null });
    }
    for (const p of junior.data ?? []) {
      if (!p.displayable) continue;
      out.push({ library: "junior", id: p.id, thumb: p.thumbUrl || p.url, grade: p.grade ?? null });
    }
    return { photos: out, loading: senior.isLoading || junior.isLoading };
  }, [senior.data, junior.data, senior.isLoading, junior.isLoading]);
}

/**
 * Hand-picked photos (kiosk-photo-rotation P0): the picks in play order, each
 * movable or removable, over the libraries to add from.
 */
export function PickedPhotosField({
  idPrefix,
  picked,
  onChange,
}: {
  idPrefix: string;
  picked: KioskSlideshowPick[];
  onChange: (picked: KioskSlideshowPick[]) => void;
}) {
  const { photos, loading } = useSlideshowLibraries(true);
  const [tab, setTab] = useState<KioskSlideshowPick["library"]>("senior");
  const byKey = useMemo(() => new Map(photos.map((p) => [pickKey(p), p])), [photos]);
  const chosen = new Set(picked.map(pickKey));
  const toggle = (p: PickablePhoto) =>
    onChange(
      chosen.has(pickKey(p))
        ? picked.filter((x) => pickKey(x) !== pickKey(p))
        : [...picked, { library: p.library, id: p.id }],
    );
  const shown = photos.filter((p) => p.library === tab);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Picked photos ({picked.length}/60), in the order they play
      </p>
      {picked.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Pick photos from the library below.</p>
      ) : (
        <ol
          className="flex flex-wrap gap-2"
          aria-label="Picked photos"
          data-testid={`${idPrefix}-picked`}
        >
          {picked.map((p, i) => {
            const photo = byKey.get(pickKey(p));
            return (
              <li key={pickKey(p)} className="relative h-20 w-20 overflow-hidden rounded border">
                {photo ? (
                  <img src={photo.thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                    {loading ? "…" : "Not available"}
                  </span>
                )}
                <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                  {i + 1}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50">
                  <IconButton
                    label={`Move photo ${i + 1} earlier`}
                    disabled={i === 0}
                    onClick={() => onChange(moveItem(picked, i, i - 1))}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label={`Move photo ${i + 1} later`}
                    disabled={i === picked.length - 1}
                    onClick={() => onChange(moveItem(picked, i, i + 1))}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label={`Remove photo ${i + 1}`}
                    onClick={() => onChange(picked.filter((_, k) => k !== i))}
                  >
                    <X className="h-3 w-3" />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex gap-1" role="group" aria-label="Library">
        {(["senior", "junior"] as const).map((lib) => (
          <Button
            key={lib}
            type="button"
            size="sm"
            variant={tab === lib ? "secondary" : "ghost"}
            aria-pressed={tab === lib}
            onClick={() => setTab(lib)}
            data-testid={`${idPrefix}-tab-${lib}`}
          >
            {lib === "senior" ? "Club photos" : "Junior photos"}
          </Button>
        ))}
      </div>
      <div className="max-h-56 overflow-y-auto rounded border p-1">
        {loading ? (
          <p className="p-2 text-xs text-muted-foreground">Loading photos…</p>
        ) : shown.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            {tab === "senior"
              ? "No photos in the club library yet."
              : "No junior photos that may be shown (each needs every tagged child's consent)."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Library photos">
            {shown.map((p) => {
              const on = chosen.has(pickKey(p));
              return (
                <button
                  key={pickKey(p)}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${on ? "Unpick" : "Pick"} photo ${p.id}${p.grade ? ` (${p.grade})` : ""}`}
                  disabled={!on && picked.length >= 60}
                  onClick={() => toggle(p)}
                  className={cn(
                    "h-16 w-16 overflow-hidden rounded border focus-visible:ring-2 focus-visible:ring-ring",
                    on && "ring-2 ring-primary",
                  )}
                  data-testid={`${idPrefix}-photo-${pickKey(p)}`}
                >
                  <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const CLUB_WIDE = "club-wide";
const UNSORTED = "unsorted";

export function folderLabel(f: KioskSlideshowFolder): string {
  const grade = f.grade === CLUB_WIDE ? "Club-wide" : f.grade;
  if (f.type == null) return grade;
  const type =
    f.type === UNSORTED
      ? "Unsorted"
      : (PHOTO_TYPE_LABELS[f.type as keyof typeof PHOTO_TYPE_LABELS] ?? f.type);
  return `${grade} / ${type}`;
}

/** Library folders (the library's grade / type view) the slideshow reads. */
export function FoldersField({
  idPrefix,
  folders,
  onChange,
}: {
  idPrefix: string;
  folders: KioskSlideshowFolder[];
  onChange: (folders: KioskSlideshowFolder[]) => void;
}) {
  const { photos } = useSlideshowLibraries(true);
  const grades = useMemo(
    () =>
      [...new Set(photos.map((p) => p.grade).filter((g): g is string => !!g))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [photos],
  );
  const [grade, setGrade] = useState(CLUB_WIDE);
  const [type, setType] = useState("");
  const add = () => {
    const next: KioskSlideshowFolder = { grade, type: type || null };
    if (folders.some((f) => folderLabel(f) === folderLabel(next))) return;
    onChange([...folders, next]);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Folders</p>
      {folders.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Add at least one folder.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen folders">
          {folders.map((f, i) => (
            <li
              key={folderLabel(f)}
              className="flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs"
            >
              {folderLabel(f)}
              <IconButton
                label={`Remove ${folderLabel(f)}`}
                onClick={() => onChange(folders.filter((_, k) => k !== i))}
                dark={false}
              >
                <X className="h-3 w-3" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded border bg-card px-2 py-1.5 text-sm"
          aria-label="Folder"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          data-testid={`${idPrefix}-folder-grade`}
        >
          <option value={CLUB_WIDE}>Club-wide</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className="rounded border bg-card px-2 py-1.5 text-sm"
          aria-label="Sub-folder"
          value={type}
          onChange={(e) => setType(e.target.value)}
          data-testid={`${idPrefix}-folder-type`}
        >
          <option value="">Whole folder</option>
          {PHOTO_TYPES.map((t) => (
            <option key={t} value={t}>
              {PHOTO_TYPE_LABELS[t]}
            </option>
          ))}
          <option value={UNSORTED}>Unsorted</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={folders.length >= 50}
          onClick={add}
          data-testid={`${idPrefix}-folder-add`}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add folder
        </Button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  dark = true,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-0.5 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring",
        dark ? "text-white" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
