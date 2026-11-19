import { toast } from "@/hooks/use-toast";

/**
 * Chrome (and other Chromium browsers) let a page start one download on its
 * own; a second one soon after, from the same tab, waits behind a "download
 * multiple files" permission shown only as a small icon in the address bar.
 * Nothing reaches the page, so a blocked download can't be detected. Instead,
 * when a download follows another within a couple of minutes, say where the
 * browser asks, once per stretch so repeat downloads aren't nagged.
 */
export const REPEAT_DOWNLOAD_WINDOW_MS = 2 * 60_000;

export const REPEAT_DOWNLOAD_NOTICE = {
  title: "Didn't get the file?",
  description:
    "Your browser may hold back a second download from the same page. Look for the download icon at the right of the address bar, choose to allow multiple downloads from this site, then download again.",
} as const;

let lastDownload: number | null = null;
let lastNotice: number | null = null;

/**
 * Record a download starting at `now`, and show the notice when it follows
 * another one closely (and the notice hasn't just been shown). Returns whether
 * it was shown.
 */
export function noteDownload(
  now: number = Date.now(),
  notify: (notice: typeof REPEAT_DOWNLOAD_NOTICE) => void = (n) => toast({ ...n }),
): boolean {
  const repeat = lastDownload !== null && now - lastDownload < REPEAT_DOWNLOAD_WINDOW_MS;
  const recentlyTold = lastNotice !== null && now - lastNotice < REPEAT_DOWNLOAD_WINDOW_MS;
  lastDownload = now;
  if (!repeat || recentlyTold) return false;
  lastNotice = now;
  notify(REPEAT_DOWNLOAD_NOTICE);
  return true;
}

/** Forget earlier downloads (tests). */
export function resetDownloadNotice(): void {
  lastDownload = null;
  lastNotice = null;
}
