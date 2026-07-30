import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { type CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { type PackCardData } from "@/lib/pack-render";
import { type ShareCardInput } from "@/lib/share-card";
import { PackPreviewTile } from "@/components/social-studio/pack-preview-tile";
import { ALL_CARD_KINDS } from "@/lib/social-studio";
import type { PackSelection } from "@/lib/use-pack-selection";

/**
 * The bulk path: one tile per design pack the tenant can use, each applying its
 * pack to every card type it covers.
 *
 * Rendered ABOVE the card-type gallery on purpose. Below it, an admin reading
 * top-down meets one per-kind selector for every card type first and works
 * through them one at a time, never finding the control built for the common
 * case.
 */
export function DesignPacksSection({
  selection,
  previewInput,
  previewData,
  theme,
}: {
  selection: PackSelection;
  /** The sample card every pack tile previews (Match Summary). */
  previewInput: ShareCardInput;
  previewData: PackCardData | null;
  theme: ApiCardTheme | null;
}) {
  const { availablePacks, bulkPackId, busy, kindsUsing, usePackEverywhere } =
    selection;

  if (availablePacks.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Design packs</h2>
      <p className="text-sm text-muted-foreground">
        A pack is a complete set of card designs. Apply one to every card type at
        once, or pick a different pack for a single card type below.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {availablePacks.map((pack) => {
          const owned = kindsUsing(pack.packId);
          return (
            <PackPreviewTile
              key={pack.packId}
              input={previewInput}
              theme={theme}
              data={previewData}
              packId={pack.packId}
            >
              <span className="block truncate text-sm font-medium">
                {pack.name}
              </span>
              <p className="text-[11px] text-muted-foreground">
                {owned === 0
                  ? "Not used by any card type"
                  : `Used by ${owned} of ${ALL_CARD_KINDS.length} card types`}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
                aria-label={`Use ${pack.name} for all card types`}
                disabled={busy}
                onClick={() => usePackEverywhere(pack.packId)}
              >
                {bulkPackId === pack.packId && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                Use for all card types
              </Button>
            </PackPreviewTile>
          );
        })}
      </div>
    </section>
  );
}
