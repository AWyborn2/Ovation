import { useState } from "react";
import JSZip from "jszip";
import {
  useCreateCardRenderStill,
  type SocialSettingsBundle,
  type CardTheme as ApiCardTheme,
} from "@workspace/api-client-react";
import {
  SIZES,
  renderShareCard,
  downloadBlob,
  cardBaseFilename,
  type CardSize,
  type PhotoTransform,
  type RenderOptions,
} from "@/lib/share-card";
import { renderShareCardVideo, renderShareCardGif } from "@/lib/share-card-animation";
import type { PackCardData } from "@/lib/pack-render";
import { PLATFORMS, type Props } from "./constants";
import type { useCaptions } from "./use-captions";

/**
 * PNG / zip / approve exports. Pack cards render server-side through the
 * still harness; BYO templates use the client canvas. Admins additionally get
 * a video clip and GIF per size in the zip.
 */
export function useCardExport({
  input,
  bundle,
  isPackCard,
  isJunior,
  effectiveTheme,
  packId,
  includeSponsors,
  buildPackData,
  buildOpts,
  photoTransform,
  enabledSizes,
  animated,
  videoSupported,
  gifSupported,
  isAdmin,
  captionDrafts,
  onApprove,
  onOpenChange,
}: {
  input: Props["input"];
  bundle: SocialSettingsBundle | undefined;
  isPackCard: boolean;
  isJunior: boolean;
  effectiveTheme: ApiCardTheme | null | undefined;
  packId: string | null;
  includeSponsors: boolean;
  buildPackData: (transform: PhotoTransform) => PackCardData;
  buildOpts: (size: CardSize, transform: PhotoTransform) => RenderOptions;
  photoTransform: PhotoTransform;
  enabledSizes: CardSize[];
  animated: boolean;
  videoSupported: boolean;
  gifSupported: boolean;
  isAdmin: boolean;
  captionDrafts: ReturnType<typeof useCaptions>["captionDrafts"];
  onApprove: Props["onApprove"];
  onOpenChange: Props["onOpenChange"];
}) {
  const stillMutation = useCreateCardRenderStill();

  // The static-render payload mirrors the props that drive the live <PackCard>
  // preview, so the server PNG matches what the admin sees. `data` carries the
  // tenant branding (logo/name/hashtags/sponsors/photo) — see `buildPackData`.
  // Exports use the live `photoTransform` (downloads), matching the canvas path.
  const stillOptions = (size: CardSize) => ({
    size,
    sponsorsOn: includeSponsors,
    junior: isJunior,
    theme: effectiveTheme ?? null,
    data: buildPackData(photoTransform),
    // Must match the preview's pack or the exported PNG is a different design.
    packId,
  });

  // Render one pack size to a PNG blob via the server harness.
  const renderPackStill = (size: CardSize): Promise<Blob> =>
    stillMutation.mutateAsync({
      data: { input: input!, options: stillOptions(size) },
    }) as Promise<Blob>;

  const [zipping, setZipping] = useState(false);
  const [approving, setApproving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Surfaced near the export/approve buttons whenever one of those actions
  // throws — without this, a failure just silently resets the busy state with
  // no indication to the admin that anything went wrong.
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownload = async (size: CardSize) => {
    if (!input) return;
    setExportError(null);
    setDownloading(true);
    try {
      // Pack cards render server-side (PNG); BYO templates use the client canvas.
      const blob = isPackCard
        ? await renderPackStill(size)
        : await renderShareCard(input, buildOpts(size, photoTransform));
      downloadBlob(blob, `${cardBaseFilename(input, bundle?.brand)}-${SIZES[size].code}.png`);
    } catch (e) {
      console.error("Card download failed", e);
      setExportError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!input) return;
    setZipping(true);
    setExportError(null);
    const skipped: string[] = [];
    try {
      const zip = new JSZip();
      const base = cardBaseFilename(input, bundle?.brand);
      // Still posters render fast, so do them serially. A single size's render
      // failure shouldn't abort the whole zip (matches the video/GIF blocks
      // below) — skip it and note it, rather than losing every other size too.
      for (const size of enabledSizes) {
        try {
          // Pack cards render server-side (PNG); BYO templates use the canvas.
          const blob = isPackCard
            ? await renderPackStill(size)
            : await renderShareCard(input, buildOpts(size, photoTransform));
          zip.file(`${base}-${SIZES[size].code}.png`, blob);
        } catch (e) {
          console.error(`Card PNG export failed for size ${size}`, e);
          skipped.push(`${SIZES[size].label} PNG`);
        }
      }
      // Admins additionally get an animated video clip per size. Video export is
      // real-time (canvas.captureStream + MediaRecorder), so recording the sizes
      // one after another makes the wait the SUM of every clip's duration.
      // Each renderShareCardVideo uses its own offscreen canvas/stream/recorder,
      // so we record all sizes concurrently — the wait collapses to roughly a
      // single clip's duration instead of the serial sum. Admin-only: public
      // visitors only ever get the still PNG.
      if (animated && videoSupported && isAdmin) {
        const results = await Promise.all(
          enabledSizes.map((size) =>
            renderShareCardVideo(input, buildOpts(size, photoTransform))
              .then((r) => ({ size, ...r }))
              .catch((e) => {
                console.error("Card video export failed", e);
                skipped.push(`${SIZES[size].label} video`);
                return null;
              }),
          ),
        );
        for (const r of results) {
          if (r) zip.file(`${base}-${SIZES[r.size].code}.${r.ext}`, r.blob);
        }
      }
      // Admins additionally get a looping GIF per size (heavier, so admin-only).
      if (animated && gifSupported && isAdmin) {
        const gifs = await Promise.all(
          enabledSizes.map((size) =>
            renderShareCardGif(input, buildOpts(size, photoTransform))
              .then((r) => ({ size, ...r }))
              .catch((e) => {
                console.error("Card GIF export failed", e);
                skipped.push(`${SIZES[size].label} GIF`);
                return null;
              }),
          ),
        );
        for (const r of gifs) {
          if (r) zip.file(`${base}-${SIZES[r.size].code}.${r.ext}`, r.blob);
        }
      }
      if (bundle?.settings.captionsEnabled) {
        for (const p of PLATFORMS) {
          const caption = captionDrafts[p.value];
          if (caption) zip.file(`caption-${p.value}.txt`, caption);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, `${cardBaseFilename(input, bundle?.brand)}-all.zip`);
      if (skipped.length > 0) {
        setExportError(`Zip downloaded, but skipped: ${skipped.join(", ")}`);
      }
    } catch (e) {
      console.error("Card zip export failed", e);
      setExportError(e instanceof Error ? e.message : "Zip download failed");
      throw e;
    } finally {
      setZipping(false);
    }
  };

  const handleApproveAndDownload = async () => {
    if (!input || !onApprove) return;
    setApproving(true);
    setExportError(null);
    try {
      await handleDownloadAll();
      await onApprove();
      onOpenChange(false);
    } catch (e) {
      console.error("Approve & download failed", e);
      setExportError(
        e instanceof Error ? `Approve failed: ${e.message}` : "Approve failed",
      );
    } finally {
      setApproving(false);
    }
  };

  return {
    zipping,
    approving,
    downloading,
    exportError,
    handleDownload,
    handleDownloadAll,
    handleApproveAndDownload,
  };
}

export type CardExport = ReturnType<typeof useCardExport>;
