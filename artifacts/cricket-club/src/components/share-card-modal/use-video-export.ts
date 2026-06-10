import { useEffect, useRef, useState } from "react";
import {
  createCardVideoJob,
  getCardVideoJob,
  downloadCardVideoJob,
  type CardVideoJobInput,
} from "@workspace/api-client-react";
import {
  SIZES,
  renderShareCardVideo,
  renderShareCardGif,
  canExportGif,
  downloadBlob,
  cardBaseFilename,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";

const POLL_INTERVAL_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Owns the animated-card video flow: recording a clip, holding it back for
// review in a preview dialog, and saving (or re-recording) it. Playing the exact
// rendered blob in a <video> lets admins confirm the real output, because
// MediaRecorder timing/codec quirks can diverge from the live canvas.
export function useVideoExport({
  open,
  input,
  buildOpts,
  photoTransform,
}: {
  open: boolean;
  input: ShareCardInput | null;
  buildOpts: (size: CardSize, transform: PhotoTransform) => RenderOptions;
  photoTransform: PhotoTransform;
}) {
  const [videoExporting, setVideoExporting] = useState(false);
  const [gifExporting, setGifExporting] = useState(false);
  // Server-side MP4 render (admin): progress 0..1, error message, cancel guard.
  const [serverRendering, setServerRendering] = useState(false);
  const [serverProgress, setServerProgress] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const gifSupported = canExportGif();
  // The most recently rendered video clip, held back for review before saving.
  const [videoPreview, setVideoPreview] = useState<{
    url: string;
    blob: Blob;
    ext: string;
    size: CardSize;
  } | null>(null);

  // Drop any held-back clip whenever the modal opens or closes; abort any
  // in-flight server poll so it can't resolve into a closed modal.
  useEffect(() => {
    cancelledRef.current = true;
    setServerRendering(false);
    setServerProgress(0);
    setServerError(null);
    setVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, [open]);

  // Record the animated card to a video clip (MP4 where supported, else WebM)
  // and hold it back for review — the admin plays the exact rendered blob before
  // deciding to save it or re-record. This catches MediaRecorder timing/codec
  // quirks (first-frame flash, loop seam) that the live canvas preview can hide.
  const handleDownloadVideo = async (size: CardSize) => {
    if (!input) return;
    setVideoExporting(true);
    try {
      const { blob, ext } = await renderShareCardVideo(input, buildOpts(size, photoTransform));
      const url = URL.createObjectURL(blob);
      setVideoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, blob, ext, size };
      });
    } catch (e) {
      console.error("Card video export failed", e);
    } finally {
      setVideoExporting(false);
    }
  };

  // Save the reviewed clip to disk.
  const handleSaveVideo = () => {
    if (!input || !videoPreview) return;
    downloadBlob(
      videoPreview.blob,
      `${cardBaseFilename(input)}-${SIZES[videoPreview.size].code}.${videoPreview.ext}`,
    );
    setVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const closeVideoPreview = () => {
    setVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  // Render the animated card to a looping GIF and download it straight away. A
  // GIF is a plain image (no codec/seam quirks to review), so it skips the
  // hold-back preview the video flow uses.
  const handleDownloadGif = async (size: CardSize) => {
    if (!input) return;
    setGifExporting(true);
    try {
      const { blob, ext } = await renderShareCardGif(input, buildOpts(size, photoTransform));
      downloadBlob(blob, `${cardBaseFilename(input)}-${SIZES[size].code}.${ext}`);
    } catch (e) {
      console.error("Card GIF export failed", e);
    } finally {
      setGifExporting(false);
    }
  };

  // Server-side MP4 render (admin-only). Posts the EXACT same {input, options}
  // the preview uses, polls for progress, then holds the finished clip back in
  // the same review dialog the browser path uses. Guaranteed H.264/MP4 (no
  // MediaRecorder WebM fallback that some platforms reject). On failure it sets
  // serverError and rethrows so the caller can fall back to the browser path.
  const handleServerRender = async (size: CardSize) => {
    if (!input) return;
    cancelledRef.current = false;
    setServerError(null);
    setServerProgress(0);
    setServerRendering(true);
    try {
      const body = {
        input: input as unknown as CardVideoJobInput["input"],
        options: buildOpts(size, photoTransform) as unknown as CardVideoJobInput["options"],
        fps: 30,
      };
      const job = await createCardVideoJob(body);
      let status = job.status;
      while (status !== "done" && status !== "error") {
        if (cancelledRef.current) return;
        await sleep(POLL_INTERVAL_MS);
        if (cancelledRef.current) return;
        const polled = await getCardVideoJob(job.id);
        status = polled.status;
        setServerProgress(polled.progress ?? 0);
        if (status === "error") {
          throw new Error(polled.error ?? "Server render failed");
        }
      }
      if (cancelledRef.current) return;
      const blob = await downloadCardVideoJob(job.id);
      if (cancelledRef.current) return;
      setServerProgress(1);
      const url = URL.createObjectURL(blob);
      setVideoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, blob, ext: "mp4", size };
      });
    } catch (e) {
      console.error("Server card video render failed", e);
      setServerError(e instanceof Error ? e.message : "Server render failed");
      throw e;
    } finally {
      setServerRendering(false);
    }
  };

  return {
    videoExporting,
    videoPreview,
    handleDownloadVideo,
    handleSaveVideo,
    closeVideoPreview,
    gifExporting,
    gifSupported,
    handleDownloadGif,
    serverRendering,
    serverProgress,
    serverError,
    handleServerRender,
  };
}
