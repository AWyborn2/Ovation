import { Label } from "@/components/ui/label";
import { ImageControl } from "@/components/card-forms";
import type { LayoutTemplate } from "./use-layout-template";

/** Generic per-slot image overrides for the slots the pack template exposes (B1). */
export function SlotImagesPanel({ layout }: { layout: LayoutTemplate }) {
  const { imageSlots, imageOverrides, setImageOverrides, setSlotOverride } = layout;
  return (
    <div className="space-y-2.5 rounded border px-3 py-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Slot images</Label>
        {Object.keys(imageOverrides).length > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => setImageOverrides({})}
          >
            Reset images
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Upload or paste an image to override any slot on this card. Left blank, each slot keeps its
        bound / branded image.
      </p>
      {imageSlots.map((slot) => (
        <ImageControl
          key={slot.key}
          label={slot.label}
          value={imageOverrides[slot.key] ?? ""}
          onChange={(v) => setSlotOverride(slot.key, v)}
        />
      ))}
    </div>
  );
}
