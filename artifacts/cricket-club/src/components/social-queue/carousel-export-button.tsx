import { useRef, useState } from "react";
import { createPostPack } from "@workspace/api-client-react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/share-card";

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
    <div className="space-y-1" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <Button type="button" variant="outline" size="sm" onClick={exportZip} disabled={busy}>
        {busy
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          : <Download className="mr-2 h-4 w-4" aria-hidden />}
        {busy ? "Exporting…" : "Export ZIP"}
      </Button>
      {error && <p role="alert" className="max-w-60 text-xs text-destructive">{error}</p>}
    </div>
  );
}
