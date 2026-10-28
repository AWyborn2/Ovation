/**
 * A draft's card and content panels in the full editor (full draft editor
 * plan, stages 1 and 2): the draft's real card data (the club's brand and
 * sponsors, and its own photo), and the draft editor's Cricket, Players,
 * Photos, Uploads, Live stats and Brand panels, for a draft's design or a
 * draft made into pages.
 */
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Palette, Radio, Trophy, Upload, Users } from "lucide-react";
import {
  getGetSocialDraftQueryKey,
  getGetSocialSettingsQueryKey,
  getListCardThemesQueryKey,
  getListSocialDraftsQueryKey,
  updateSocialDraft,
  useGetSocialSettings,
  useListCardThemes,
  type CardTheme as ApiCardTheme,
  type SocialDraft,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import {
  BrandPanel,
  CricketPanel,
  LiveStatsPanel,
  PhotosPanel,
  PlayersPanel,
  UploadsPanel,
  matchDayFixtureId,
} from "@/components/studio-editor/content-panels";
import { recolourToBrand, setSponsorLock } from "@/components/studio-editor/content";
import { draftInput } from "@/components/social-queue/draft-meta";
import { pageForInput, pageTokens } from "@workspace/scorecard/kind-templates";
import { useBrand } from "@/lib/brand-context";
import {
  buildPackData,
  draftLayerPhotos,
  cardGrade,
  cardSponsorData,
  tenantHashtag,
  withGroundPhoto,
} from "@/lib/pack-card-data";
import { BLANK_PACK_ID, packTextFields, type PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import type { EditorDraftMode } from "@/pages/admin-template-editor";

export type DraftContent = {
  input: ShareCardInput;
  data: PackCardData;
  bundle: SocialSettingsBundle | undefined;
  theme: ApiCardTheme | null;
  /** Lists and this draft again, after a save. */
  refresh: () => void;
  panels: NonNullable<EditorDraftMode["panels"]>;
};

export function useDraftContent(draft: SocialDraft): DraftContent {
  const qc = useQueryClient();
  const brand = useBrand();
  const input = (draftInput(draft) ?? { kind: "player" }) as ShareCardInput;
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const themesQ = useListCardThemes({ query: { queryKey: getListCardThemesQueryKey() } });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const theme = themes.find((t) => t.isDefault) ?? themes[0] ?? null;

  // The draft's card as it posts: the club's brand and sponsors, and its own photo.
  const grade = cardGrade(input);
  const data = useMemo(
    () => ({
      ...buildPackData({
        brand: withGroundPhoto(bundle?.brand ?? brand, brand),
        hashtag: tenantHashtag(bundle),
        // The club's strip, a team's own sponsor, or the card's player's sponsors.
        ...cardSponsorData(bundle, { kind: input.kind, grade }, true, draft.subjectPlayerId),
        packColourModes: bundle?.settings.packColourModes,
        names: bundle?.cardNames,
      }),
      photoUrl: draft.photoUrl ?? undefined,
      // The photo's focus box: frames the design hasn't positioned crop to it.
      ...(draft.photoFocus ? { photoFocus: draft.photoFocus } : {}),
      // Sourced photo layers' own photos, while the draft's photo is automatic.
      layerPhotos: draftLayerPhotos({
        photoSource: draft.photoSource,
        layerPhotos: draft.layerPhotos,
      }),
    }),
    [
      bundle,
      brand,
      input.kind,
      grade,
      draft.subjectPlayerId,
      draft.photoUrl,
      draft.photoFocus,
      draft.photoSource,
      draft.layerPhotos,
    ],
  );
  const palette = [
    bundle?.brand?.primaryColour ?? brand.primaryColour,
    bundle?.brand?.backgroundColour ?? brand.backgroundColour,
  ].filter((c): c is string => !!c);

  // Every field the card's page has (stage 3), else the kind's.
  const liveFields =
    pageTokens(input.kind, pageForInput(input))?.fields ?? packTextFields(input, BLANK_PACK_ID);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetSocialDraftQueryKey(draft.id) });
  };

  const panels: DraftContent["panels"] = [
    {
      id: "cricket",
      label: "Cricket",
      icon: Trophy,
      render: ({ size, add }) => (
        <CricketPanel
          size={size}
          input={input}
          fixtureId={matchDayFixtureId(input.kind, draft.sourceKey)}
          onAdd={(l) => add([l])}
        />
      ),
    },
    {
      id: "players",
      label: "Players",
      icon: Users,
      render: ({ size, add }) => <PlayersPanel size={size} onAddMany={add} />,
    },
    {
      id: "photos",
      label: "Photos",
      icon: ImageIcon,
      render: ({ size, add }) => (
        <PhotosPanel
          size={size}
          onAdd={(l) => add([l])}
          // The card's own photo is the draft's: every photo layer shows it.
          onSetPhoto={async (url) => {
            await updateSocialDraft(draft.id, { photoUrl: url });
            refresh();
          }}
        />
      ),
    },
    {
      id: "uploads",
      label: "Uploads",
      icon: Upload,
      render: ({ size, add }) => <UploadsPanel size={size} onAdd={(l) => add([l])} />,
    },
    {
      id: "live",
      label: "Live stats",
      icon: Radio,
      render: ({ size, add, values }) => (
        <LiveStatsPanel size={size} fields={liveFields} values={values} onAdd={(l) => add([l])} />
      ),
    },
    {
      id: "brand",
      label: "Brand",
      icon: Palette,
      render: ({ size, add, page, setPage }) => (
        <BrandPanel
          size={size}
          logoUrl={(bundle?.brand ?? brand).logoUrl ?? null}
          palette={palette}
          sponsorLock={!!page.sponsorLock}
          onAdd={(l) => add([l])}
          onRecolour={() => setPage(recolourToBrand(page, palette))}
          onSponsorLock={(on) => setPage(setSponsorLock(page, on))}
        />
      ),
    },
  ];

  return { input, data, bundle, theme, refresh, panels };
}
