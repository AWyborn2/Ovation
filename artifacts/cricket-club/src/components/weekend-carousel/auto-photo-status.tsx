import { ImageOff, RotateCcw, Shuffle } from "lucide-react";
import type { ClubPhoto } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

/**
 * A Match Day slide's photo (ADR-010 P4): the automatic pick (the least
 * recently posted photo that fits), or the admin's swap. "Swap" opens the photo
 * choices; "Use auto pick" goes back. With no photo the slide prints on the
 * club's colours.
 */
export function AutoPhotoStatus({
  id,
  photo,
  swapped,
  swapping,
  disabled,
  onSwap,
  onUseAuto,
}: {
  /** For test ids: the fixture id, or "cover". */
  id: string;
  photo: ClubPhoto | null;
  swapped: boolean;
  swapping: boolean;
  disabled: boolean;
  onSwap: () => void;
  onUseAuto: () => void;
}) {
  const status = swapped
    ? photo
      ? "Swapped photo"
      : "Swapped to no photo. This slide uses the club's colours."
    : photo
      ? "Auto-picked: the photo posted least recently"
      : "No photo fits, so this slide uses the club's colours.";
  return (
    <div className="flex items-center gap-3" data-testid={`auto-photo-${id}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-primary/80 text-primary-foreground">
        {photo ? (
          <img src={photo.thumbUrl || photo.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="h-4 w-4" aria-hidden />
        )}
      </div>
      <p className="min-w-0 flex-1 text-xs text-muted-foreground" role="status">
        {status}
      </p>
      {swapped && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={onUseAuto}
          data-testid={`button-use-auto-photo-${id}`}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden /> Use auto pick
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        aria-expanded={swapping}
        onClick={onSwap}
        data-testid={`button-swap-photo-${id}`}
      >
        <Shuffle className="mr-1 h-3.5 w-3.5" aria-hidden /> Swap
      </Button>
    </div>
  );
}
