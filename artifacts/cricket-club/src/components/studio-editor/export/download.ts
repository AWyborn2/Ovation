/**
 * Editor downloads (Social Studio U18): stills (PNG, JPG, PDF) and clips (MP4,
 * GIF) rendered on the server through the card harness with the editor's
 * adjustments, so every file matches the canvas.
 */
import {
  createCardRenderStill,
  createCardVideoJob,
  downloadCardVideoJob,
  getCardVideoJob,
  type CardTheme as ApiCardTheme,
} from "@workspace/api-client-react";
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import type { CardAdjustments, PackCardData } from "@/lib/pack-render";

export type DownloadFormat = "png" | "jpg" | "pdf" | "mp4" | "gif";
export const DOWNLOAD_FORMATS: { value: DownloadFormat; label: string; hint: string }[] = [
  { value: "png", label: "PNG", hint: "Sharpest image, for posting" },
  { value: "jpg", label: "JPG", hint: "Smaller image file" },
  { value: "pdf", label: "PDF", hint: "Print-ready, any size" },
  { value: "mp4", label: "MP4", hint: "Video with the layer animations" },
  { value: "gif", label: "GIF", hint: "Looping animation" },
];

/** Where each format fits best (shown under the size). */
export const PLATFORM_HINT: Record<CardSize, string> = {
  square: "Instagram and Facebook feed",
  portrait: "Instagram feed (takes the most space)",
  story: "Stories, Reels and TikTok",
  landscape: "Facebook links, X and LinkedIn",
};

export const isClip = (f: DownloadFormat): f is "mp4" | "gif" => f === "mp4" || f === "gif";

/** Output pixel size: native × scale, except PDF which is vector. */
export function outputSize(size: CardSize, format: DownloadFormat, scale: number) {
  const s = format === "pdf" ? 1 : scale;
  return { w: SIZES[size].w * s, h: SIZES[size].h * s };
}

export type CardRender = {
  input: ShareCardInput;
  size: CardSize;
  theme: ApiCardTheme | null;
  data: PackCardData | null;
  packId: string | null;
  adjustments: CardAdjustments | null;
};

/** The harness options for the card (the same props the canvas renders with). */
export function harnessOptions(card: CardRender) {
  return {
    size: card.size,
    sponsorsOn: true,
    junior: false,
    theme: card.theme,
    data: card.data,
    packId: card.packId,
    adjustments: card.adjustments,
  };
}

const POLL_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Render the card to a file. Clips run as a server job; `onProgress` reports
 * 0..1 and `signal` stops polling when the menu closes.
 */
export async function renderDownload(
  card: CardRender,
  format: DownloadFormat,
  scale: number,
  onProgress: (p: number) => void = () => {},
  signal?: AbortSignal,
): Promise<Blob> {
  const input = card.input as unknown as Record<string, unknown>;
  const options = harnessOptions(card) as unknown as Record<string, unknown>;
  if (!isClip(format)) {
    return createCardRenderStill({ input, options, format, scale });
  }
  const job = await createCardVideoJob({
    input,
    options: { ...options, pack: true },
    format,
    scale,
  });
  for (;;) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const current = await getCardVideoJob(job.id);
    onProgress(current.progress);
    if (current.status === "done") return downloadCardVideoJob(job.id);
    if (current.status === "error") throw new Error(current.error ?? "Render failed");
    await sleep(POLL_MS);
  }
}

export function downloadFilename(
  base: string,
  size: CardSize,
  format: DownloadFormat,
  scale: number,
) {
  const suffix = format !== "pdf" && scale > 1 ? `@${scale}x` : "";
  return `${base}-${SIZES[size].code}${suffix}.${format}`;
}
