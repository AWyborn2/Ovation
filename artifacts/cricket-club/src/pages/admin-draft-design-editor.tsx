/**
 * A templated draft's own design in the full editor (full draft editor plan,
 * stage 1). A draft made from a template holds its own copy of the design
 * (ADR-002); this opens that copy in the template editor's engine, so every
 * part of the card is a layer that can be stepped into, moved, resized,
 * restyled or deleted, drawn with the draft's real card. The draft editor's
 * content panels (Cricket, Players, Photos, Uploads, Live stats, Brand) sit
 * beside the editor's own, and Download is in the top bar. Saving stores the
 * design on the draft; the library template never changes. "Make a carousel
 * set" turns the design into pages (stage 2), with the look's matching pages
 * to start from (D9).
 */
import { TOP_BAR_BUTTON } from "@/components/studio-editor/editor-shell";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Layers, Monitor } from "lucide-react";
import { updateSocialDraft, type SocialDraft } from "@workspace/api-client-react";
import type { SetDocument } from "@workspace/scorecard/kind-templates";
import { StatusPill } from "@/components/admin-ui";
import { useDraftContent } from "@/components/studio-editor/draft-panels";
import { DraftSetDialog } from "@/components/studio-editor/draft-set-dialog";
import { DownloadMenu } from "@/components/studio-editor/export/download-menu";
import { ChangePhotoButton, ChangePhotoPanel } from "@/components/studio-editor/change-photo";
import { SendToReview } from "@/components/studio-editor/send-to-review";
import { useNewStudio } from "@/lib/entitlements";
import {
  STATUS_TONE,
  draftHeading,
  draftStatus,
  editorStatusLabel,
  isJuniorDraft,
} from "@/components/social-queue/draft-meta";
import { useBrand } from "@/lib/brand-context";
import { draftEditorDocument } from "@/lib/draft-design";
import { BLANK_PACK_ID, type CardAdjustments } from "@/lib/pack-render";
import { cardBaseFilename, type CardSize } from "@/lib/share-card";
import { editorOpeningSize } from "@/lib/draft-design-size";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  PHOTO_PANEL,
  TemplateEditorV2,
  useViewport,
  type EditorDraftMode,
  type EditorHost,
  type EditorTemplate,
} from "./admin-template-editor";

const STUDIO = "/admin/social";

/**
 * A blank design: a white page on the blank base, started from no template (Create's
 * or Studio home's Blank design). A design made from a template names it.
 */
export function isBlankDesignDraft(
  draft: Pick<SocialDraft, "packId" | "templateRef" | "templateVersion">,
): boolean {
  return (
    draft.packId === BLANK_PACK_ID && draft.templateRef == null && draft.templateVersion == null
  );
}

export function DraftDesignEditor({
  draft,
  onReload,
}: {
  draft: SocialDraft;
  onReload: () => Promise<SocialDraft | undefined>;
}) {
  const brand = useBrand();
  const [, navigate] = useLocation();
  const [making, setMaking] = useState(false);
  // New Studio (preview): Send to review beside Download.
  const newStudio = useNewStudio();
  // The design as it stood when "Make a carousel set" was pressed.
  const [setFrom, setSetFrom] = useState<Record<string, unknown> | null>(null);
  const viewport = useViewport();
  const { input, data, bundle, theme, refresh, panels, pageSettings } = useDraftContent(draft);

  // Where it opens (Stage 2): the link's size, else the size it was last
  // designed at, else a carousel's size, else Square for an older draft (as
  // before) and Portrait for a new one. The editor opens only at a size the
  // design draws (round 9 B13).
  const search = useSearch();
  const [location] = useLocation();
  const initialFormat = useMemo<CardSize>(
    () => editorOpeningSize(search, draft),
    // Read once per draft: the editor keeps its own Format from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id],
  );
  // Changing Format saves it on the draft, and the address follows, so a
  // reload or the queue opens it at that size.
  const saveFormat = (size: CardSize) => {
    navigate(`${location}?format=${size}`, { replace: true });
    updateSocialDraft(draft.id, { designSize: size }).then(refresh, () => {
      // Not saved (the connection dropped, or an older size the design
      // lacks): the draft keeps the size it had, and the editor stays here.
    });
  };

  const template: EditorTemplate = useMemo(
    () => ({
      id: draft.id,
      kind: input.kind,
      name: draftHeading(draft),
      version: 1,
      document: draftEditorDocument(draft.adjustments, input),
      fitStatus: "pass",
    }),
    // Opened once per draft: the editor keeps its own history from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id],
  );

  // Stage 2 and D9: the design and the pages picked from its look become a
  // free set, opened in the set editor to add, duplicate, reorder and delete
  // pages. Every page draws this card's data; the draft then posts as a carousel.
  const makePages = async (set: SetDocument) => {
    setMaking(true);
    try {
      await updateSocialDraft(draft.id, {
        adjustments: set as unknown as CardAdjustments,
      } as Parameters<typeof updateSocialDraft>[1]);
      refresh();
      navigate(`/admin/social/set/${draft.id}`);
    } finally {
      setMaking(false);
    }
  };

  const status = draftStatus(draft);
  const junior = isJuniorDraft(draft);
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
        ? { ...template, document: draftEditorDocument(next.adjustments, input) }
        : undefined;
    },
    status: () => (
      <StatusPill tone={STATUS_TONE[status]}>{editorStatusLabel(draft, newStudio)}</StatusPill>
    ),
  };

  // Change photo (a photo layer's Replace, Edit page, or the top bar's button):
  // the card's own photo, in the panel beside the rail.
  const hasPhoto = !!draft.photoUrl || draft.photoSource === "manual";
  const photoPanel = (
    <ChangePhotoPanel
      draftId={draft.id}
      slideKey={null}
      junior={junior}
      currentUrl={draft.photoUrl ?? null}
      own={draft.photoSource === "manual"}
      // A junior card's photo is the one the club cleared for it (ADR-007).
      lockedReason={
        junior
          ? "This is a junior card: it shows only the photo the club has cleared for this player, so it can't be changed here."
          : undefined
      }
      onPick={async (choice) => {
        await updateSocialDraft(draft.id, {
          photoUrl: choice.url,
          photoPlayerId: choice.playerId ?? null,
        });
        refresh();
      }}
      onAuto={async () => {
        await updateSocialDraft(draft.id, { photoAuto: true });
        refresh();
      }}
    />
  );

  const draftMode: EditorDraftMode = {
    input: input as unknown as Record<string, unknown>,
    data,
    blank: isBlankDesignDraft(draft),
    panels,
    pageSettings,
    onFormat: saveFormat,
    // Older sizes only where the card was made in them (round 9 B8).
    olderSizes: draft.olderSizes ?? [],
    actions: ({ document, size, input: shown, data: shownData, openPanel }) => (
      <>
        {hasPhoto && <ChangePhotoButton onClick={() => openPanel(PHOTO_PANEL)} />}
        <button
          type="button"
          disabled={making}
          onClick={() => setSetFrom(document)}
          className={TOP_BAR_BUTTON}
        >
          <Layers className="h-4 w-4" aria-hidden /> Make a carousel set
        </button>
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
      </>
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
    <>
      <TemplateEditorV2
        template={template}
        viewport={viewport}
        host={host}
        draftMode={draftMode}
        initialFormat={initialFormat}
        sidePanels={() =>
          hasPhoto
            ? [{ id: PHOTO_PANEL, title: "Change photo", body: photoPanel, onPage: true }]
            : []
        }
        actions={
          newStudio ? ({ dirty }) => <SendToReview draftId={draft.id} dirty={dirty} /> : undefined
        }
      />
      {setFrom && (
        <DraftSetDialog
          open
          onClose={() => setSetFrom(null)}
          kind={input.kind}
          document={setFrom}
          templateRef={draft.templateRef}
          busy={making}
          onMake={(set) => void makePages(set)}
        />
      )}
    </>
  );
}
