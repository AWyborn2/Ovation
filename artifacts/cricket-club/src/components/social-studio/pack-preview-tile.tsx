import type { ReactNode } from "react";
import { PackCard } from "@/components/pack-card";
import { SIZES, type CardSize, type ShareCardInput } from "@/lib/share-card";
import { type PackCardData } from "@/lib/pack-render";
import { type CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { THUMB_SIZE } from "@/lib/social-studio";
import { cn } from "@/lib/utils";

/**
 * A card tile with a live pack-rendered preview above a caption/controls slot.
 *
 * The Design packs section and the per-type list show the same thing — "here
 * is what a card looks like" — and differ only in the controls underneath, so
 * the preview shell lives here once. `children` is the footer slot.
 */
export function PackPreviewTile({
  input,
  theme,
  data,
  packId,
  size = THUMB_SIZE,
  selected = false,
  children,
}: {
  input: ShareCardInput;
  theme: ApiCardTheme | null;
  data: PackCardData | null;
  /** The pack to render with; `null` uses the renderer's default. */
  packId: string | null;
  /** The format to preview (defaults to the square thumbnail). */
  size?: CardSize;
  /** Highlight the tile (the club's default pack). */
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card p-3 transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <div
        className="overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: `${SIZES[size].w} / ${SIZES[size].h}` }}
      >
        <PackCard
          input={input}
          size={size}
          sponsorsOn
          junior={false}
          theme={theme}
          data={data}
          packId={packId}
        />
      </div>
      <div className="space-y-2 pt-3">{children}</div>
    </div>
  );
}
