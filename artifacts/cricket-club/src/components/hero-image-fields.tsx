import { useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import type { TenantHeroImages } from "@workspace/api-client-react";
import { Label } from "@/components/ui/label";
import { CARD_MAX_WIDTH, HERO_MAX_WIDTH, compressImage } from "@/lib/compress-image";

type TopSlot = "home" | "juniors" | "honours";
type ExploreSlot = "honours" | "players" | "premierships";
type SlotKey = TopSlot | `explore.${ExploreSlot}`;

interface SlotDef {
  key: SlotKey;
  label: string;
  hint: string;
  maxWidth: number;
}

const SLOTS: SlotDef[] = [
  {
    key: "home",
    label: "Home hero",
    hint: "Wide action shot, subject right of centre.",
    maxWidth: HERO_MAX_WIDTH,
  },
  {
    key: "juniors",
    label: "Juniors hero",
    hint: "Junior cricket photo.",
    maxWidth: HERO_MAX_WIDTH,
  },
  {
    key: "honours",
    label: "Honour boards hero",
    hint: "Your honour-board wall.",
    maxWidth: HERO_MAX_WIDTH,
  },
  {
    key: "explore.honours",
    label: "Explore: Honour boards",
    hint: "Card photo.",
    maxWidth: CARD_MAX_WIDTH,
  },
  {
    key: "explore.players",
    label: "Explore: Players",
    hint: "Card photo.",
    maxWidth: CARD_MAX_WIDTH,
  },
  {
    key: "explore.premierships",
    label: "Explore: Premierships",
    hint: "Card photo.",
    maxWidth: CARD_MAX_WIDTH,
  },
];

function readSlot(value: TenantHeroImages | null, key: SlotKey): string {
  if (!value) return "";
  if (key.startsWith("explore.")) {
    const sub = key.slice("explore.".length) as ExploreSlot;
    return value.explore?.[sub] ?? "";
  }
  return value[key as TopSlot] ?? "";
}

/** Return a new slot map with `key` set (or cleared when `url` is empty). */
export function writeSlot(
  value: TenantHeroImages | null,
  key: SlotKey,
  url: string,
): TenantHeroImages {
  const next: TenantHeroImages = { ...(value ?? {}) };
  if (key.startsWith("explore.")) {
    const sub = key.slice("explore.".length) as ExploreSlot;
    next.explore = { ...(next.explore ?? {}), [sub]: url || null };
  } else {
    next[key as TopSlot] = url || null;
  }
  return next;
}

/** True when no slot holds an image (the payload should then be null). */
export function isEmptyHeroImages(value: TenantHeroImages | null): boolean {
  return SLOTS.every((s) => !readSlot(value, s.key));
}

/**
 * Upload controls for a tenant's Broadcast imagery (hero + explore photos).
 * Each file is downscaled in the browser before upload. `basePath` selects the
 * upload route: the club admin's own storage, or the platform concierge route.
 */
export function HeroImageFields({
  value,
  onChange,
  basePath,
  disabled,
  onError,
  onBusyChange,
}: {
  value: TenantHeroImages | null;
  onChange: (next: TenantHeroImages) => void;
  basePath?: string;
  disabled?: boolean;
  onError: (message: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { uploadFile } = useUpload({ basePath, onError: (e) => onError(e.message) });
  const [pending, setPending] = useState<SlotKey | null>(null);

  const handleFile = async (slot: SlotDef, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPending(slot.key);
    onBusyChange?.(true);
    try {
      const compressed = await compressImage(file, slot.maxWidth);
      const result = await uploadFile(compressed);
      if (result) onChange(writeSlot(value, slot.key, `/api/storage${result.objectPath}`));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPending(null);
      onBusyChange?.(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SLOTS.map((slot) => {
        const url = readSlot(value, slot.key);
        const busy = pending === slot.key;
        return (
          <div key={slot.key} className="space-y-1.5" data-testid={`hero-slot-${slot.key}`}>
            <Label>{slot.label}</Label>
            <div className="flex items-center gap-3">
              <div className="h-12 w-20 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                {url && <img src={url} alt="" className="h-full w-full object-cover" />}
              </div>
              <label className="cursor-pointer text-sm font-medium underline-offset-4 hover:underline">
                {busy ? "Uploading…" : url ? "Change" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleFile(slot, e)}
                  disabled={disabled || pending !== null}
                  data-testid={`input-hero-${slot.key}`}
                />
              </label>
              {url && (
                <button
                  type="button"
                  onClick={() => onChange(writeSlot(value, slot.key, ""))}
                  disabled={disabled || pending !== null}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{slot.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
