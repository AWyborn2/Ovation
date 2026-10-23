import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  useGetSocialSettings,
  useListCardTemplates,
  useListCardThemes,
  getListCardThemesQueryKey,
  type CardTemplate,
  type CardTheme as ApiCardTheme,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { type PackCardData } from "@/lib/pack-render";
import { getPackManifest } from "@/lib/pack-templates/registry";
import { type CardSize, type ShareCardInput } from "@/lib/share-card";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import { PackPreviewTile } from "@/components/social-studio/pack-preview-tile";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/confirm-dialog";
import { usePackSelection, type PackSelection } from "@/lib/use-pack-selection";
import { usePackColourModes, type PackColourModes } from "@/lib/use-pack-colour-modes";

export const PACK_PREVIEW_FORMATS: { value: CardSize; label: string }[] = [
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

export type DesignPacks = {
  selection: PackSelection;
  colourModes: PackColourModes;
  theme: ApiCardTheme | null;
  /** The sample card every pack tile previews (Match Summary). */
  previewInput: ShareCardInput;
  /** The club's default pack: the one most card types use, if any are used. */
  defaultPackId: string | null;
  /** The design pack a library look draws with, when it has one. */
  packForLook: (lookSlug: string) => { packId: string; name: string } | null;
  error: string | null;
};

/**
 * Everything the design-pack controls need (Social Studio U14), formerly the
 * Studio page's Design packs section: which pack each card type uses, the bulk
 * "Use for every card" write and each pack's colour mode.
 */
export function useDesignPacks(clubName: string | undefined): DesignPacks {
  const confirm = useConfirm();
  const settingsQ = useGetSocialSettings();
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const templatesQ = useListCardTemplates();
  const templates = (templatesQ.data as CardTemplate[] | undefined) ?? [];
  const selection = usePackSelection({ templates, confirm });
  const colourModes = usePackColourModes(bundle);
  const themesQ = useListCardThemes({ query: { queryKey: getListCardThemesQueryKey() } });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const theme = themes.find((t) => t.isDefault) ?? themes[0] ?? null;
  // Memoised: `input` is one of <PackCard>'s html-memo keys.
  const previewInput = useMemo(() => sampleCardInput("matchSummary", clubName), [clubName]);

  const { availablePacks, kindsUsing } = selection;
  let defaultPackId: string | null = null;
  let most = 0;
  for (const p of availablePacks) {
    const used = kindsUsing(p.packId);
    if (used > most) {
      most = used;
      defaultPackId = p.packId;
    }
  }

  return {
    selection,
    colourModes,
    theme,
    previewInput,
    defaultPackId,
    // A bundle look `club-kit` is the template set for the `club-kit-v1` pack.
    packForLook: (slug) => availablePacks.find((p) => p.packId === `${slug}-v1`) ?? null,
    error: selection.error ?? colourModes.error,
  };
}

/**
 * One look's design-pack card: a live preview in the chosen format, how many
 * card types use the pack, the club colours switch and "Use for every card".
 */
export function LookPackControls({
  packs,
  pack,
  format,
  data,
}: {
  packs: DesignPacks;
  pack: { packId: string; name: string };
  format: CardSize;
  data: PackCardData | null;
}) {
  const { selection, colourModes, theme, previewInput, defaultPackId } = packs;
  const used = selection.kindsUsing(pack.packId);
  const isDefault = pack.packId === defaultPackId;
  return (
    <PackPreviewTile
      input={previewInput}
      theme={theme}
      data={data}
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
        {used === 0 ? "Not in use" : `Used by ${used} card type${used === 1 ? "" : "s"}`}
      </p>
      {getPackManifest(pack.packId).colourMode === "club-only" ? (
        // Built from the club's colours: there is no own look to switch to.
        <p className="text-[13px] font-medium">Always in your club colours</p>
      ) : (
        <ColourModeSwitch packId={pack.packId} packName={pack.name} colourModes={colourModes} />
      )}
      <Button
        variant="outline"
        className="h-9 w-full font-semibold"
        aria-label={`Use ${pack.name} for every card`}
        disabled={selection.busy}
        onClick={() => selection.applyPackEverywhere(pack.packId)}
      >
        {selection.bulkPackId === pack.packId && (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        )}
        Use for every card
      </Button>
    </PackPreviewTile>
  );
}
