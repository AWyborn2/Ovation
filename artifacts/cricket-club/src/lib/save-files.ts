import JSZip from "jszip";
import { downloadBlob } from "@/lib/share-card";

/**
 * Saving exported cards. On a phone or tablet the files go through the OS
 * share sheet, one image per slide, so they save straight to Photos or Files
 * (iOS can't open a zip, and social apps don't take one). On a desktop a set
 * still downloads as one zip, and a single file downloads as itself.
 */

export type SaveOutcome = "shared" | "downloaded" | "cancelled" | "waiting";

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

/** A File for `blob`, typed from the blob or, failing that, the name's extension. */
export function toFile(blob: Blob, name: string): File {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const type = blob.type || MIME_BY_EXT[ext] || "application/octet-stream";
  return new File([blob], name, { type });
}

/**
 * Whether to save through the share sheet: a touch device that can share
 * image files. iPad Safari reports itself as a Mac, so touch points decide,
 * not the user agent; a Mac (no touch) keeps the zip download.
 */
export function isShareDevice(nav: ShareNavigator | undefined = globalThis.navigator): boolean {
  try {
    if (!nav || typeof nav.canShare !== "function" || typeof nav.share !== "function") {
      return false;
    }
    const touch = (nav.maxTouchPoints ?? 0) > 1 || /Android|iPhone|iPad|iPod/i.test(nav.userAgent);
    return touch && nav.canShare({ files: [new File([""], "card.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Opens the share sheet. A dismissed sheet is "cancelled"; other failures throw. */
export async function shareFiles(
  files: File[],
  nav: ShareNavigator = globalThis.navigator,
): Promise<"shared" | "cancelled"> {
  try {
    await nav.share!({ files });
    return "shared";
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return "cancelled";
    throw e;
  }
}

// Files waiting for a fresh tap. iOS opens the share sheet only from a tap,
// and a render can outlast that tap, so the SaveFilesDialog asks for another.
export interface PendingSave {
  files: File[];
  title: string;
}
let pending: PendingSave | null = null;
const listeners = new Set<() => void>();
const setPending = (next: PendingSave | null) => {
  pending = next;
  listeners.forEach((l) => l());
};
export const getPendingSave = (): PendingSave | null => pending;
export const clearPendingSave = (): void => setPending(null);
export function subscribePendingSave(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Save exported files: the share sheet on a phone or tablet, otherwise a
 * download (`zipName` when there's more than one file). Returns "waiting"
 * when the share sheet needs another tap, which the SaveFilesDialog asks for.
 */
export async function saveFiles(
  files: File[],
  { zipName, title = "Your images are ready" }: { zipName: string; title?: string },
): Promise<SaveOutcome> {
  if (files.length === 0) throw new Error("There was nothing to save.");
  const nav = globalThis.navigator as ShareNavigator | undefined;
  if (isShareDevice(nav) && nav!.canShare!({ files })) {
    try {
      return await shareFiles(files, nav);
    } catch {
      // Usually the tap expired while rendering (NotAllowedError).
      setPending({ files, title });
      return "waiting";
    }
  }
  if (files.length === 1) {
    downloadBlob(files[0], files[0].name);
  } else {
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f);
    downloadBlob(await zip.generateAsync({ type: "blob" }), zipName);
  }
  return "downloaded";
}

/** One file: the share sheet on a phone or tablet, otherwise a plain download. */
export function saveFile(blob: Blob, name: string): Promise<SaveOutcome> {
  return saveFiles([toFile(blob, name)], { zipName: name, title: "Your file is ready" });
}

/** The export button's wording: `mobile` on a phone or tablet, else `desktop`. */
export function saveLabel(desktop: string, mobile = "Save to Photos"): string {
  return isShareDevice() ? mobile : desktop;
}
