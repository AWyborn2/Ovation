import { Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SIZES, type CardSize } from "@/lib/share-card";
import type { CardExport } from "./use-card-export";
import type { useVideoExport } from "./use-video-export";

type VideoExport = ReturnType<typeof useVideoExport>;

/** The download / render / approve button row. */
export function ExportFooter({
  activeSize,
  isAdmin,
  animated,
  videoSupported,
  gifSupported,
  exp,
  video,
  onApprove,
  approveLabel,
}: {
  activeSize: CardSize;
  isAdmin: boolean;
  animated: boolean;
  videoSupported: boolean;
  gifSupported: boolean;
  exp: CardExport;
  video: VideoExport;
  onApprove: (() => void | Promise<void>) | undefined;
  approveLabel: string;
}) {
  const { downloading, zipping, approving, handleDownload, handleDownloadAll, handleApproveAndDownload } =
    exp;
  const {
    videoExporting,
    gifExporting,
    handleDownloadVideo,
    handleDownloadGif,
    serverRendering,
    serverProgress,
    handleServerRender,
  } = video;
  return (
    <DialogFooter className="gap-2 sm:gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => handleDownload(activeSize)}
        disabled={downloading || zipping || approving}
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {downloading ? "Downloading…" : `Download ${SIZES[activeSize].label}`}
      </Button>
      {isAdmin && animated && (
        <Button
          type="button"
          onClick={() => {
            void handleServerRender(activeSize);
          }}
          disabled={serverRendering || videoExporting || gifExporting || zipping || approving}
        >
          {serverRendering ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {serverRendering
            ? `Rendering MP4… ${Math.round(serverProgress * 100)}%`
            : "Render MP4"}
        </Button>
      )}
      {isAdmin && animated && videoSupported && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleDownloadVideo(activeSize)}
          disabled={videoExporting || serverRendering || gifExporting || zipping || approving}
        >
          {videoExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {videoExporting ? "Rendering…" : "Preview (browser)"}
        </Button>
      )}
      {isAdmin && animated && gifSupported && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleDownloadGif(activeSize)}
          disabled={gifExporting || videoExporting || zipping || approving}
        >
          {gifExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {gifExporting ? "Rendering GIF…" : "Download GIF"}
        </Button>
      )}
      <Button
        type="button"
        variant={onApprove ? "secondary" : "default"}
        onClick={() => {
          // Failures already set exportError inside handleDownloadAll;
          // swallow the rejection here so it doesn't surface as an
          // unhandled promise rejection when clicked directly.
          handleDownloadAll().catch(() => {});
        }}
        disabled={zipping || approving || videoExporting}
      >
        {zipping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Download all sizes (zip)
      </Button>
      {onApprove && (
        <Button
          type="button"
          onClick={handleApproveAndDownload}
          disabled={approving || zipping}
        >
          {approving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {approveLabel}
        </Button>
      )}
    </DialogFooter>
  );
}

/** Modal showing the just-recorded browser video clip before saving it. */
export function VideoPreviewDialog({ video }: { video: VideoExport }) {
  const { videoPreview, closeVideoPreview, handleDownloadVideo, handleSaveVideo, videoExporting } =
    video;
  return (
    <Dialog
      open={videoPreview !== null}
      onOpenChange={(o) => {
        if (!o) closeVideoPreview();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preview rendered video</DialogTitle>
          <DialogDescription>
            This is the exact {videoPreview?.ext.toUpperCase()} clip that will
            download. Play it through to check the first frame and loop seam, then
            save it or re-record.
          </DialogDescription>
        </DialogHeader>
        {videoPreview && (
          <div
            className="bg-muted border rounded-md flex items-center justify-center overflow-hidden"
            style={{
              aspectRatio: `${SIZES[videoPreview.size].w} / ${SIZES[videoPreview.size].h}`,
              maxHeight: 400,
            }}
          >
            <video
              src={videoPreview.url}
              className="w-full h-full object-contain"
              controls
              autoPlay
              loop
              playsInline
            />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => videoPreview && handleDownloadVideo(videoPreview.size)}
            disabled={videoExporting}
          >
            {videoExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {videoExporting ? "Re-recording…" : "Re-record"}
          </Button>
          <Button type="button" onClick={handleSaveVideo} disabled={videoExporting}>
            <Download className="h-4 w-4 mr-2" />
            Save video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
