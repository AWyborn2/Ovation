import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import {
  deleteClubUpload,
  ingestClubUploads,
  useListClubUploads,
  getListClubUploadsQueryKey,
  useRenameClubUpload,
  useDeleteClubUpload,
  type ClubUpload,
} from "@workspace/api-client-react";
import type { FreeLayer } from "@/lib/pack-render";
import { SIZES, type CardSize } from "@/lib/share-card/types";
import { putWithProgress, requestUploadUrl } from "@/components/social-queue/library-upload";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { newId } from "./document";

/**
 * Uploads (migration 0073): the club's own logos, artwork and SVG shapes, as
 * in Canva. They stay here, apart from the photo library, with a name to
 * search by; a PNG keeps its transparency and an SVG goes on the card as a
 * vector. Deleting takes an upload out of this list; cards already using it
 * keep it. Select picks several to delete at once.
 */

const searchBox =
  "h-9 w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] pl-8 pr-2.5 text-sm placeholder:text-[var(--ed-muted)]";

/** An SVG upload as an `<img>` source for its tile. */
const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** A layer for an upload: half the card's width, in the upload's own shape, centred. */
export function uploadLayer(upload: ClubUpload, size: CardSize, now = Date.now()): FreeLayer {
  const card = SIZES[size];
  const w = 50;
  const aspect = upload.width > 0 && upload.height > 0 ? upload.height / upload.width : 1;
  const h = Math.min(90, ((w / 100) * card.w * aspect * 100) / card.h);
  const geometry = { [size]: { x: (100 - w) / 2, y: (100 - h) / 2, w, h } };
  const common = { id: newId(), name: upload.name, geometry, editedAt: { [size]: now } };
  return upload.kind === "svg" && upload.svg
    ? ({ ...common, kind: "vector", svg: upload.svg } as unknown as FreeLayer)
    : { ...common, kind: "image", content: upload.url ?? "" };
}

/** What the browser should call a file, for signing (SVG and HEIC often come with no type). */
function fileType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "application/octet-stream";
}

export function UploadsPanel({
  size,
  onAdd,
  wide = false,
}: {
  size: CardSize;
  /** Put the upload on the card; without it (Studio → Photos → Uploads) tiles only manage. */
  onAdd?: (layer: FreeLayer) => void;
  /** More tiles to a row, for a full page rather than the editor's rail. */
  wide?: boolean;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  // Select mode: the tiles tick instead of adding, for deleting several at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // Search after a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const params = query ? { q: query } : undefined;
  const uploadsQ = useListClubUploads(params, {
    query: { queryKey: getListClubUploadsQueryKey(params) },
  });
  const uploads = uploadsQ.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: getListClubUploadsQueryKey() });
  // Only uploads still listed count as picked (a search or a delete can hide some).
  const shownPicked = uploads.filter((u) => picked.has(u.id));
  const allPicked = uploads.length > 0 && shownPicked.length === uploads.length;
  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const deletePicked = async () => {
    const targets = shownPicked;
    if (targets.length === 0) return;
    const one = targets.length === 1;
    const ok = await confirm({
      title: one ? `Delete ${targets[0]!.name}?` : `Delete ${targets.length} uploads?`,
      description: `${one ? "It leaves" : "They leave"} Uploads. Cards already using ${one ? "it keep it" : "them keep them"}.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    const results = await Promise.allSettled(targets.map((u) => deleteClubUpload(u.id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    await refresh();
    setDeleting(false);
    setPicked(new Set());
    if (failed) {
      setStatus(`${failed} of ${targets.length} couldn't be deleted. Please try again.`);
    } else {
      setStatus(`Deleted ${one ? targets[0]!.name : `${targets.length} uploads`}.`);
      setSelecting(false);
    }
  };

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setStatus(`Uploading ${files.length === 1 ? files[0]!.name : `${files.length} files`}…`);
    const sent: Array<{ objectPath: string; name: string }> = [];
    let failed = 0;
    await Promise.all(
      files.map(async (file) => {
        try {
          const typed = file.type ? file : new File([file], file.name, { type: fileType(file) });
          const { uploadURL, objectPath } = await requestUploadUrl(typed);
          await putWithProgress(uploadURL, typed, () => {});
          sent.push({ objectPath, name: file.name });
        } catch {
          failed += 1;
        }
      }),
    );
    const errors: string[] = [];
    if (sent.length > 0) {
      try {
        const res = await ingestClubUploads({ files: sent });
        for (const r of res.results) if (!r.ok) errors.push(r.error ?? "A file couldn't be added.");
      } catch {
        errors.push("Those files couldn't be added. Please try again.");
      }
    }
    failed += errors.length;
    await refresh();
    setBusy(false);
    setStatus(failed ? (errors[0] ?? `${failed} couldn't be added.`) : null);
  };

  return (
    <div className="mt-3 space-y-3">
      <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--ed-line)] text-sm hover:bg-[var(--ed-card)]">
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-6 w-6" aria-hidden />
        )}
        <span className="font-semibold">Upload logos, artwork or SVGs</span>
        <span className="text-xs text-[var(--ed-ink2)]">PNG, JPEG, WebP, SVG or HEIC</span>
        <input
          type="file"
          multiple
          accept="image/*,.svg,.heic,.heif"
          className="sr-only"
          aria-label="Upload files"
          disabled={busy}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-[var(--ed-ink2)]">
        Uploads stay here, not in the photo library. For player and team photos, use Photos.
      </p>
      {status && (
        <p role="status" className="text-sm text-[var(--ed-ink2)]">
          {status}
        </p>
      )}
      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search uploads</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ed-ink2)]"
            aria-hidden
          />
          <input
            className={searchBox}
            placeholder="Search uploads"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {uploads.length > 0 && (
          <button
            type="button"
            className="h-9 shrink-0 rounded-lg border border-[var(--ed-line)] px-3 text-sm font-semibold hover:bg-[var(--ed-card)]"
            aria-pressed={selecting}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>
      {selecting && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--ed-card)] p-2 text-sm">
          <span className="font-semibold" aria-live="polite">
            {shownPicked.length} selected
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-[var(--ed-ink2)] hover:underline"
            onClick={() => setPicked(allPicked ? new Set() : new Set(uploads.map((u) => u.id)))}
          >
            {allPicked ? "Clear" : "Select all"}
          </button>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1 font-semibold text-destructive-foreground disabled:opacity-50"
            disabled={shownPicked.length === 0 || deleting}
            onClick={() => void deletePicked()}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Delete{shownPicked.length > 0 ? ` ${shownPicked.length}` : ""}
          </button>
        </div>
      )}
      {uploadsQ.isLoading ? (
        <p className="text-sm text-[var(--ed-ink2)]">Loading your uploads…</p>
      ) : uploads.length === 0 ? (
        <p className="text-sm text-[var(--ed-ink2)]">
          {query ? "No uploads match that name." : "Nothing uploaded yet."}
        </p>
      ) : (
        <ul
          className={cn("grid grid-cols-2 gap-2", wide && "sm:grid-cols-4 lg:grid-cols-6")}
          aria-label="Uploads"
        >
          {uploads.map((u) => (
            <UploadTile
              key={u.id}
              upload={u}
              onAdd={onAdd ? () => onAdd(uploadLayer(u, size)) : undefined}
              onChanged={refresh}
              selecting={selecting}
              selected={picked.has(u.id)}
              onToggle={() => toggle(u.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadTile({
  upload,
  onAdd,
  onChanged,
  selecting,
  selected,
  onToggle,
}: {
  upload: ClubUpload;
  onAdd?: () => void;
  onChanged: () => void;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(upload.name);
  const rename = useRenameClubUpload({
    mutation: { onSuccess: () => (setEditing(false), onChanged()) },
  });
  const remove = useDeleteClubUpload({ mutation: { onSuccess: onChanged } });
  const src = upload.kind === "svg" && upload.svg ? svgSrc(upload.svg) : (upload.thumbUrl ?? "");
  const save = () => {
    const next = name.trim();
    if (!next || next === upload.name) {
      setName(upload.name);
      setEditing(false);
      return;
    }
    rename.mutate({ id: upload.id, data: { name: next } });
  };
  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-lg bg-[var(--ed-card)]",
        selected && "ring-2 ring-[var(--ed-accent)]",
      )}
    >
      {selecting ? (
        <label className="block w-full cursor-pointer bg-[repeating-conic-gradient(var(--ed-line)_0_25%,transparent_0_50%)] bg-[length:14px_14px] p-2">
          <input
            type="checkbox"
            className="absolute left-2 top-2 h-4 w-4 accent-[var(--ed-accent)]"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${upload.name}`}
          />
          <img src={src} alt="" className="mx-auto aspect-[4/3] w-full object-contain" />
        </label>
      ) : onAdd ? (
        <button
          type="button"
          className="block w-full bg-[repeating-conic-gradient(var(--ed-line)_0_25%,transparent_0_50%)] bg-[length:14px_14px] p-2"
          aria-label={`Add ${upload.name} to the card`}
          onClick={onAdd}
        >
          <img src={src} alt="" className="mx-auto aspect-[4/3] w-full object-contain" />
        </button>
      ) : (
        <div className="block w-full bg-[repeating-conic-gradient(var(--ed-line)_0_25%,transparent_0_50%)] bg-[length:14px_14px] p-2">
          <img src={src} alt={upload.name} className="mx-auto aspect-[4/3] w-full object-contain" />
        </div>
      )}
      <div className="flex items-center gap-1 p-1.5">
        {editing ? (
          <>
            <input
              className="h-7 min-w-0 flex-1 rounded border border-[var(--ed-line)] bg-transparent px-1.5 text-xs"
              value={name}
              maxLength={80}
              aria-label="Upload name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setName(upload.name);
                  setEditing(false);
                }
              }}
            />
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded"
              aria-label="Save the name"
              onClick={save}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={upload.name}>
              {upload.name}
            </span>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded text-[var(--ed-ink2)]"
              aria-label={`Rename ${upload.name}`}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className={cn(
                "grid h-7 w-7 place-items-center rounded text-[var(--ed-ink2)]",
                remove.isPending && "opacity-50",
              )}
              aria-label={`Delete ${upload.name}`}
              disabled={remove.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete ${upload.name}?`,
                  description: "It leaves Uploads. Cards already using it keep it.",
                  confirmText: "Delete",
                  destructive: true,
                });
                if (ok) remove.mutate({ id: upload.id });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
