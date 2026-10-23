import { useRef, useState } from "react";
import { createPostPack } from "@workspace/api-client-react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/share-card";
import { isShareDevice, saveFiles, saveLabel, toFile } from "@/lib/save-files";

/** Export the persisted composition without approving or marking it posted. */
export function CarouselExportButton({ draftId }: { draftId: number }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportZip = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const pack = await createPostPack(draftId);
      if (isShareDevice()) {
        // A phone or tablet saves each slide as its own image.
        const files = await Promise.all(
          pack.images.map(async (img, index) => {
            const res = await fetch(img.url, { credentials: "include" });
            if (!res.ok) throw new Error("A slide download failed.");
            const name = `${String(index + 1).padStart(3, "0")}-carousel-${draftId}-${img.size}.png`;
            return toFile(await res.blob(), name);
          }),
        );
        await saveFiles(files, { zipName: `carousel-${draftId}.zip` });
        return;
      }
      const response = await fetch(pack.zipUrl, { credentials: "include" });
      if (!response.ok) throw new Error("The ZIP download failed.");
      const blob = await response.blob();
      if (!blob.size) throw new Error("The ZIP was empty.");
      downloadBlob(blob, `carousel-${draftId}.zip`);
    } catch {
      setError("Could not export the carousel. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="space-y-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Button type="button" variant="outline" size="sm" onClick={exportZip} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="mr-2 h-4 w-4" aria-hidden />
        )}
        {busy ? "Exporting…" : saveLabel("Export ZIP")}
      </Button>
      {error && (
        <p role="alert" className="max-w-60 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
