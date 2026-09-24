import { useState } from "react";
import { Loader2 } from "lucide-react";
import { type CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/broadcast";
import { type PackCardData } from "@/lib/pack-render";
import { type CardSize, type ShareCardInput } from "@/lib/share-card";
import { PackPreviewTile } from "@/components/social-studio/pack-preview-tile";
import type { PackSelection } from "@/lib/use-pack-selection";

const FORMATS: { value: CardSize; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "story", label: "Story" },
  { value: "landscape", label: "Landscape" },
];

/**
 * Design packs (Social Studio U14): one live preview per pack in the chosen
 * format, which pack is the club's default (the one most card types use),
 * how many types use each, and "Use for every card".
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
  const [format, setFormat] = useState<CardSize>("square");
  const { availablePacks, bulkPackId, busy, kindsUsing, applyPackEverywhere } = selection;
  if (availablePacks.length === 0) return null;

  const usage = availablePacks.map((p) => ({ ...p, used: kindsUsing(p.packId) }));
  const defaultPack = usage.reduce((best, p) => (p.used > best.used ? p : best), usage[0]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">Design packs</h2>
        <SegmentedControl
          label="Preview format"
          options={FORMATS}
          value={format}
          onChange={(v) => setFormat(v as CardSize)}
        />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
        {usage.map((pack) => {
          const isDefault = pack.packId === defaultPack.packId && pack.used > 0;
          return (
            <PackPreviewTile
              key={pack.packId}
              input={previewInput}
              theme={theme}
              data={previewData}
              packId={pack.packId}
              size={format}
              selected={isDefault}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{pack.name}</span>
                {isDefault && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary-text">
                    Default
                  </span>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground">
                {pack.used === 0
                  ? "Not in use"
                  : `Used by ${pack.used} card type${pack.used === 1 ? "" : "s"}`}
              </p>
              <Button
                variant="outline"
                className="h-9 w-full font-semibold"
                aria-label={`Use ${pack.name} for every card`}
                disabled={busy}
                onClick={() => applyPackEverywhere(pack.packId)}
              >
                {bulkPackId === pack.packId && (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                )}
                Use for every card
              </Button>
            </PackPreviewTile>
          );
        })}
      </div>
    </section>
  );
}
