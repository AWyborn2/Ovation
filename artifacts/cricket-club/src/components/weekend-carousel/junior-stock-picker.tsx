import { useRef, useState } from "react";
import type { ClubPhoto } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { uploadLibraryPhotos } from "@/components/social-queue/library-upload";

export function JuniorStockPicker({
  photos,
  disabled,
  canApply,
  onUploaded,
  onApply,
}: {
  photos: ClubPhoto[];
  disabled: boolean;
  canApply: boolean;
  onUploaded: () => Promise<void>;
  onApply: (id: number | null) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setError("");
    setMessage("Uploading carousel image…");
    const failures: string[] = [];
    try {
      await uploadLibraryPhotos(files, {
        juniorStock: true,
        onState: (_, state) => {
          if (state.phase === "error") failures.push(state.message);
        },
      });
      await onUploaded();
      setError(failures.join(" "));
      setMessage(
        failures.length ? "" : "Saved to your club’s stock images for future carousel sets.",
      );
    } catch {
      setError("Could not refresh stock images. Please reopen the carousel to try again.");
      setMessage("");
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  const locked = disabled || uploading;
  return (
    <section className="space-y-3 rounded-md border p-4" aria-label="Carousel stock images">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Carousel stock images</h3>
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={() => file.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload stock image"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload club-provided artwork or a generic stock image approved for sharing, not junior
        player photos. Reuse saved images for Match day, Team lists, Results and Match summaries,
        for senior or junior teams. Generate the set, then apply an image to all team cards;
        individual cards can still use different images and crops. Stock images are also available
        in the title-page photo picker.
      </p>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        aria-label="Upload carousel stock image"
        disabled={locked}
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
      />
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={locked || !canApply}
          onClick={() => onApply(null)}
        >
          No image on team cards
        </Button>
        {photos.map((photo, index) => (
          <button
            type="button"
            key={photo.id}
            disabled={locked || !canApply}
            className="rounded border p-1 disabled:opacity-50"
            aria-label={`Use stock image ${index + 1} for all team cards`}
            onClick={() => onApply(photo.id)}
          >
            <img src={photo.thumbUrl} alt="" className="h-20 w-24 rounded object-cover" />
          </button>
        ))}
      </div>
      {!photos.length && (
        <p className="text-xs text-muted-foreground">No stock images saved yet.</p>
      )}
    </section>
  );
}
