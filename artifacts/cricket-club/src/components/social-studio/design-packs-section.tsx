import { useState } from "react";
import { Loader2 } from "lucide-react";
import { type CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/broadcast";
import { type PackCardData } from "@/lib/pack-render";
import { type CardSize, type ShareCardInput } from "@/lib/share-card";
import { PackPreviewTile } from "@/components/social-studio/pack-preview-tile";
import { Switch } from "@/components/ui/switch";
import type { PackSelection } from "@/lib/use-pack-selection";
import type { PackColourModes } from "@/lib/use-pack-colour-modes";

const FORMATS: { value: CardSize; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "story", label: "Story" },
  { value: "landscape", label: "Landscape" },
];

/**
 * The per-pack "Club colours / Pack's own look" switch. On = the pack takes on
 * the club's colours (the default); off = the pack's own palette. The tile's
 * preview repaints as soon as it flips (see `usePackColourModes`).
 */
function ColourModeSwitch({
  packId,
  packName,
  colourModes,
}: {
  packId: string;
  packName: string;
  colourModes: PackColourModes;
}) {
  const club = colourModes.modeFor(packId) === "club";
  const pending = colourModes.pendingPackId === packId;
  const id = `pack-colours-${packId}`;
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-[13px] font-medium">
        {club ? "Club colours" : "Pack's own look"}
      </label>
      <span className="flex items-center gap-1.5">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Switch
          id={id}
          aria-label={`${packName}: use club colours`}
          checked={club}
          disabled={pending}
          onCheckedChange={(on) => colourModes.setMode(packId, on ? "club" : "pack")}
        />
      </span>
    </div>
  );
}

/**
 * Design packs (Social Studio U14): one live preview per pack in the chosen
 * format, which pack is the club's default (the one most card types use),
 * how many types use each, "Use for every card", and whether each pack wears
 * the club's colours or its own.
 */
export function DesignPacksSection({
  selection,
  previewInput,
  previewData,
  theme,
  colourModes,
}: {
  selection: PackSelection;
  /** The sample card every pack tile previews (Match Summary). */
  previewInput: ShareCardInput;
  previewData: PackCardData | null;
  theme: ApiCardTheme | null;
  colourModes: PackColourModes;
}) {
  const [format, setFormat] = useState<CardSize>("square");
  const { availablePacks, bulkPackId, busy, kindsUsing, applyPackEverywhere } = selection;
  if (availablePacks.length === 0) return null;
  // Every tile shares one sample payload; the per-pack mode rides on it and
  // `PackCard` picks each tile's own entry by its pack id.

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
              <ColourModeSwitch
                packId={pack.packId}
                packName={pack.name}
                colourModes={colourModes}
              />
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
