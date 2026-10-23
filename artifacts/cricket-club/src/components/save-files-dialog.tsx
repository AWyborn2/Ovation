import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearPendingSave,
  getPendingSave,
  shareFiles,
  subscribePendingSave,
} from "@/lib/save-files";

/**
 * Finishes a save on a phone or tablet when the export outlasted the tap that
 * started it: iOS opens the share sheet only from a fresh tap, so this asks
 * for one. Each image can also be shared alone, or pressed and held to save.
 * Mounted once at the app root.
 */
export function SaveFilesDialog() {
  const pending = useSyncExternalStore(subscribePendingSave, getPendingSave, () => null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const previews = useMemo(
    () =>
      (pending?.files ?? []).map((file) => ({
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })),
    [pending],
  );
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);
  useEffect(() => setNote(null), [pending]);

  const share = async (files: File[], closeAfter: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      const outcome = await shareFiles(files);
      if (outcome === "shared" && closeAfter) clearPendingSave();
    } catch {
      setNote("Sharing isn't working here. Press and hold each image and choose Save to Photos.");
    } finally {
      setBusy(false);
    }
  };

  const count = pending?.files.length ?? 0;
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && clearPendingSave()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          <DialogDescription>
            Tap below, then choose Save {count > 1 ? `${count} Images` : "Image"} to put{" "}
            {count > 1 ? "them" : "it"} in Photos, or Save to Files.
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => pending && share(pending.files, true)}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="mr-2 h-4 w-4" aria-hidden />
          )}
          {count > 1 ? `Save ${count} to Photos` : "Save to Photos"}
        </Button>
        {note && (
          <p role="alert" className="text-sm text-destructive">
            {note}
          </p>
        )}
        {count > 1 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map(({ file, url }, index) => (
              <button
                key={file.name + index}
                type="button"
                className="space-y-1 text-left"
                onClick={() => share([file], false)}
                disabled={busy}
                aria-label={`Save ${file.name}`}
              >
                {url ? (
                  <img src={url} alt="" className="w-full rounded-md border border-border" />
                ) : (
                  <span className="flex aspect-square items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
                    {file.name.split(".").pop()?.toUpperCase()}
                  </span>
                )}
                <span className="block text-center text-xs text-muted-foreground">{index + 1}</span>
              </button>
            ))}
          </div>
        )}
        {count > 1 && (
          <p className="text-xs text-muted-foreground">
            Tap one image to save just that one, or press and hold it.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
