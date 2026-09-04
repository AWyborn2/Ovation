import { useState } from "react";
import { Trash2, Upload } from "lucide-react";
import type { KioskAd } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Editor row for a single uploaded kiosk ad creative (name + full-screen image). */
export function AdEditor({
  ad,
  onPatch,
  onRemove,
}: {
  ad: KioskAd;
  onPatch: (patch: Partial<KioskAd>) => void;
  onRemove: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const upload = useUpload({ onError: (e) => setError(e.message) });
  const handleFile = async (file: File) => {
    setError(null);
    // Matches the video-type check in card-template-builder.tsx's handleBg.
    // No filename-extension fallback for an empty file.type: the upload
    // endpoint's contentType allowlist (storage.ts) already rejects an empty
    // file.type (sent as "application/octet-stream") before onPatch below
    // ever runs, so a client-side fallback here can never affect a saved ad.
    const isVideo = file.type.startsWith("video/");
    const mediaType: KioskAd["mediaType"] = isVideo ? "video" : "image";
    const r = await upload.uploadFile(file);
    if (r) onPatch({ imageUrl: `/api/storage${r.objectPath}`, mediaType });
  };
  return (
    <div
      className="border rounded-lg p-3 flex flex-wrap items-center gap-3 bg-muted/30"
      data-testid={`ad-${ad.id}`}
    >
      <Input
        className="flex-1 min-w-[10rem]"
        value={ad.name}
        placeholder="Ad name"
        onChange={(e) => onPatch({ name: e.target.value })}
        data-testid={`ad-name-${ad.id}`}
      />
      <Input
        className="flex-1 min-w-[12rem] font-mono text-xs"
        value={ad.imageUrl}
        placeholder="https://… or upload →"
        onChange={(e) => onPatch({ imageUrl: e.target.value })}
        data-testid={`ad-url-${ad.id}`}
      />
      <label className="text-xs inline-flex items-center gap-1.5 cursor-pointer text-primary">
        <Upload className="h-3.5 w-3.5" />
        {upload.isUploading ? "Uploading…" : "Upload"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4"
          className="hidden"
          disabled={upload.isUploading}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          data-testid={`ad-file-${ad.id}`}
        />
      </label>
      {ad.imageUrl &&
        (ad.mediaType === "video" ? (
          <video
            src={ad.imageUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-9 w-16 object-cover rounded border bg-white"
            data-testid={`ad-preview-${ad.id}`}
          />
        ) : (
          <img
            src={ad.imageUrl}
            alt={ad.name}
            className="h-9 w-16 object-cover rounded border bg-white"
            data-testid={`ad-preview-${ad.id}`}
          />
        ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onRemove}
        data-testid={`ad-remove-${ad.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
