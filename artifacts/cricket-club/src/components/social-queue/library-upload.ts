import { ingestClubPhotos, type IngestClubPhotosResponse } from "@workspace/api-client-react";

/**
 * Bulk upload for the photo library (R10): each file gets a signed upload URL
 * and is PUT straight to storage with progress, then the whole batch is
 * ingested (converted, EXIF stripped) in chunks the server accepts. Files fail
 * independently.
 */
export type UploadState =
  | { phase: "uploading"; progress: number }
  | { phase: "converting" }
  | { phase: "done" }
  | { phase: "error"; message: string };

export const INGEST_BATCH = 50;

/** Browsers often report "" for .heic; the server sniffs bytes, but signing needs a type. */
export function contentTypeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: contentTypeFor(file) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Couldn't start the upload.");
  }
  return res.json();
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentTypeFor(file));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("The upload didn't finish."));
    xhr.onerror = () => reject(new Error("The upload didn't finish."));
    xhr.send(file);
  });
}

export async function uploadLibraryPhotos(
  files: File[],
  opts: {
    onState: (index: number, state: UploadState) => void;
    grade?: string;
    season?: number;
    /** Test seam: the byte upload. */
    put?: typeof putWithProgress;
    /** Test seam: signing. */
    sign?: typeof requestUploadUrl;
    /** Test seam: ingest. */
    ingest?: (body: {
      objectPaths: string[];
      grade?: string;
      season?: number;
    }) => Promise<IngestClubPhotosResponse>;
  },
): Promise<void> {
  const put = opts.put ?? putWithProgress;
  const sign = opts.sign ?? requestUploadUrl;
  const ingest = opts.ingest ?? ((body) => ingestClubPhotos(body));

  const uploaded: Array<{ index: number; objectPath: string }> = [];
  await Promise.all(
    files.map(async (file, index) => {
      try {
        opts.onState(index, { phase: "uploading", progress: 0 });
        const { uploadURL, objectPath } = await sign(file);
        await put(uploadURL, file, (p) =>
          opts.onState(index, { phase: "uploading", progress: Math.round(p * 100) }),
        );
        opts.onState(index, { phase: "converting" });
        uploaded.push({ index, objectPath });
      } catch (err) {
        opts.onState(index, {
          phase: "error",
          message: err instanceof Error ? err.message : "Upload failed.",
        });
      }
    }),
  );

  for (let i = 0; i < uploaded.length; i += INGEST_BATCH) {
    const chunk = uploaded.slice(i, i + INGEST_BATCH);
    try {
      const res = await ingest({
        objectPaths: chunk.map((c) => c.objectPath),
        grade: opts.grade || undefined,
        season: opts.season,
      });
      for (const r of res.results) {
        const match = chunk.find((c) => c.objectPath === r.objectPath);
        if (!match) continue;
        opts.onState(
          match.index,
          r.ok ? { phase: "done" } : { phase: "error", message: r.error ?? "Couldn't convert." },
        );
      }
    } catch {
      for (const c of chunk) {
        opts.onState(c.index, { phase: "error", message: "The photos couldn't be processed." });
      }
    }
  }
}
