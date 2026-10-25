/**
 * A templated draft's own design in the full editor (full draft editor plan,
 * stage 1). A draft made from a template holds its own copy of the design
 * (ADR-002); this opens that copy in the template editor's engine, so every
 * part of the card is a layer that can be stepped into, moved, resized,
 * restyled or deleted, drawn with the draft's real card. The draft editor's
 * content panels (Cricket, Players, Photos, Uploads, Live stats, Brand) sit
 * beside the editor's own, and Download is in the top bar. Saving stores the
 * design on the draft; the library template never changes.
 */
import { useMemo } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Monitor, Palette, Radio, Trophy, Upload, Users } from "lucide-react";
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
import { StatusPill } from "@/components/admin-ui";
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
import { DownloadMenu } from "@/components/studio-editor/export/download-menu";
import {
  STATUS_LABEL,
  STATUS_TONE,
  draftHeading,
  draftInput,
  draftStatus,
} from "@/components/social-queue/draft-meta";
import { useBrand } from "@/lib/brand-context";
import {
  buildPackData,
  cardGrade,
  kindSponsors,
  presentingSponsorName,
  tenantHashtag,
  withGroundPhoto,
} from "@/lib/pack-card-data";
import { BLANK_PACK_ID, packTextFields, type CardAdjustments } from "@/lib/pack-render";
import { SIZES, cardBaseFilename, type CardSize } from "@/lib/share-card";
import { primaryPage } from "@workspace/scorecard/kind-templates";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  TemplateEditorV2,
  useViewport,
  type EditorDraftMode,
  type EditorHost,
  type EditorTemplate,
} from "./admin-template-editor";

const STUDIO = "/admin/social";

/**
 * The draft's design, with any layers the previous draft editor put at the root
 * of a page-based (format v2) document moved onto its primary page: format v2
 * draws pages only, so they were never shown.
 */
export function withRootLayersOnPage(adjustments: unknown, kind: string): unknown {
  const doc = (adjustments ?? {}) as Record<string, unknown> & {
    layers?: unknown[];
    pages?: Record<string, { layers?: unknown[] } | undefined>;
  };
  if (doc.formatVersion !== 2 || !doc.pages || !doc.layers?.length) return doc;
  const key = primaryPage(kind);
  const page = doc.pages[key] ?? {};
  const { layers, ...rest } = doc;
  return {
    ...rest,
    pages: { ...doc.pages, [key]: { ...page, layers: [...(page.layers ?? []), ...layers] } },
  };
}

export function DraftDesignEditor({
  draft,
  onReload,
}: {
  draft: SocialDraft;
  onReload: () => Promise<SocialDraft | undefined>;
}) {
  const qc = useQueryClient();
  const brand = useBrand();
  const viewport = useViewport();
  const input = draftInput(draft)!;
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const themesQ = useListCardThemes({ query: { queryKey: getListCardThemesQueryKey() } });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const theme = themes.find((t) => t.isDefault) ?? themes[0] ?? null;

  // The size the design was started at (Studio home's Create picker), else square.
  const search = useSearch();
  const initialFormat = useMemo<CardSize>(() => {
    const asked = new URLSearchParams(search).get("format");
    return asked && asked in SIZES ? (asked as CardSize) : "square";
  }, [search]);

  // The draft's card as it posts: the club's brand and sponsors, and its own photo.
  const grade = cardGrade(input);
  const data = useMemo(
    () => ({
      ...buildPackData({
        brand: withGroundPhoto(bundle?.brand ?? brand, brand),
        hashtag: tenantHashtag(bundle),
        sponsors: kindSponsors(bundle, input.kind, true, grade),
        presentingSponsorName: presentingSponsorName(bundle, true),
        packColourModes: bundle?.settings.packColourModes,
        names: bundle?.cardNames,
      }),
      photoUrl: draft.photoUrl ?? undefined,
    }),
    [bundle, brand, input.kind, grade, draft.photoUrl],
  );
  const palette = [
    bundle?.brand?.primaryColour ?? brand.primaryColour,
    bundle?.brand?.backgroundColour ?? brand.backgroundColour,
  ].filter((c): c is string => !!c);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetSocialDraftQueryKey(draft.id) });
  };

  const template: EditorTemplate = useMemo(
    () => ({
      id: draft.id,
      kind: input.kind,
      name: draftHeading(draft),
      version: 1,
      document: withRootLayersOnPage(draft.adjustments, input.kind),
      fitStatus: "pass",
    }),
    // Opened once per draft: the editor keeps its own history from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id],
  );

  const status = draftStatus(draft);
  const host: EditorHost<EditorTemplate> = {
    club: true,
    backHref: STUDIO,
    save: async (baseVersion, document) => {
      await updateSocialDraft(draft.id, {
        adjustments: document as unknown as CardAdjustments,
      } as Parameters<typeof updateSocialDraft>[1]);
      refresh();
      return { ...template, version: baseVersion + 1, document };
    },
    reload: async () => {
      const next = await onReload();
      return next
        ? { ...template, document: withRootLayersOnPage(next.adjustments, input.kind) }
        : undefined;
    },
    status: () => <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>,
  };

  const draftMode: EditorDraftMode = {
    input: input as unknown as Record<string, unknown>,
    data,
    panels: [
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
      { id: "uploads", label: "Uploads", icon: Upload, render: () => <UploadsPanel /> },
      {
        id: "live",
        label: "Live stats",
        icon: Radio,
        render: ({ size, add, values }) => (
          <LiveStatsPanel
            size={size}
            fields={packTextFields(input, BLANK_PACK_ID)}
            values={values}
            onAdd={(l) => add([l])}
          />
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
    ],
    actions: ({ document, size, input: shown, data: shownData }) => (
      <DownloadMenu
        card={{
          input: shown,
          size,
          theme,
          data: shownData,
          packId: BLANK_PACK_ID,
          adjustments: document as unknown as CardAdjustments,
        }}
        baseName={cardBaseFilename(input, bundle?.brand ?? brand)}
      />
    ),
  };

  if (viewport.w < TEMPLATE_EDITOR_MIN_WIDTH) {
    return (
      <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">
        <p className="flex max-w-xs items-center gap-2 text-sm text-[var(--ed-ink2)]">
          <Monitor className="h-4 w-4 shrink-0" aria-hidden /> Open on a computer or tablet to edit
          this design.
        </p>
      </div>
    );
  }
  return (
    <TemplateEditorV2
      template={template}
      viewport={viewport}
      host={host}
      draftMode={draftMode}
      initialFormat={initialFormat}
    />
  );
}
