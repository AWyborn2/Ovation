import { useEffect, useState } from "react";
import {
  SIZES,
  renderShareCardVideo,
  downloadBlob,
  cardBaseFilename,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";

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
  // The most recently rendered video clip, held back for review before saving.
  const [videoPreview, setVideoPreview] = useState<{
    url: string;
    blob: Blob;
    ext: string;
    size: CardSize;
  } | null>(null);

  // Drop any held-back clip whenever the modal opens or closes.
  useEffect(() => {
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

  return {
    videoExporting,
    videoPreview,
    handleDownloadVideo,
    handleSaveVideo,
    closeVideoPreview,
  };
}
