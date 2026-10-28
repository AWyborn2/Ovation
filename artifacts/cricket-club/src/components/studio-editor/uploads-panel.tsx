import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import {
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
 * keep it.
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
}: {
  size: CardSize;
  onAdd: (layer: FreeLayer) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      <label className="relative block">
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
      {uploadsQ.isLoading ? (
        <p className="text-sm text-[var(--ed-ink2)]">Loading your uploads…</p>
      ) : uploads.length === 0 ? (
        <p className="text-sm text-[var(--ed-ink2)]">
          {query ? "No uploads match that name." : "Nothing uploaded yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2" aria-label="Uploads">
          {uploads.map((u) => (
            <UploadTile
              key={u.id}
              upload={u}
              onAdd={() => onAdd(uploadLayer(u, size))}
              onChanged={refresh}
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
}: {
  upload: ClubUpload;
  onAdd: () => void;
  onChanged: () => void;
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
    <li className="overflow-hidden rounded-lg bg-[var(--ed-card)]">
      <button
        type="button"
        className="block w-full bg-[repeating-conic-gradient(var(--ed-line)_0_25%,transparent_0_50%)] bg-[length:14px_14px] p-2"
        aria-label={`Add ${upload.name} to the card`}
        onClick={onAdd}
      >
        <img src={src} alt="" className="mx-auto aspect-[4/3] w-full object-contain" />
      </button>
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
