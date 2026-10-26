/**
 * A templated draft's own design in the full editor (full draft editor plan,
 * stage 1). A draft made from a template holds its own copy of the design
 * (ADR-002); this opens that copy in the template editor's engine, so every
 * part of the card is a layer that can be stepped into, moved, resized,
 * restyled or deleted, drawn with the draft's real card. The draft editor's
 * content panels (Cricket, Players, Photos, Uploads, Live stats, Brand) sit
 * beside the editor's own, and Download is in the top bar. Saving stores the
 * design on the draft; the library template never changes. "Make a carousel
 * set" turns the design into pages (stage 2).
 */
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Layers, Monitor } from "lucide-react";
import { updateSocialDraft, type SocialDraft } from "@workspace/api-client-react";
import { freeSetFromDocument, primaryPage } from "@workspace/scorecard/kind-templates";
import { StatusPill } from "@/components/admin-ui";
import { useConfirm } from "@/components/confirm-dialog";
import { useDraftContent } from "@/components/studio-editor/draft-panels";
import { DownloadMenu } from "@/components/studio-editor/export/download-menu";
import {
  STATUS_LABEL,
  STATUS_TONE,
  draftHeading,
  draftStatus,
} from "@/components/social-queue/draft-meta";
import { useBrand } from "@/lib/brand-context";
import { withRootLayersOnPage } from "@/lib/draft-design";
import { BLANK_PACK_ID, type CardAdjustments } from "@/lib/pack-render";
import { SIZES, cardBaseFilename, type CardSize } from "@/lib/share-card";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  TemplateEditorV2,
  useViewport,
  type EditorDraftMode,
  type EditorHost,
  type EditorTemplate,
} from "./admin-template-editor";

const STUDIO = "/admin/social";

export function DraftDesignEditor({
  draft,
  onReload,
}: {
  draft: SocialDraft;
  onReload: () => Promise<SocialDraft | undefined>;
}) {
  const brand = useBrand();
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  const [making, setMaking] = useState(false);
  const viewport = useViewport();
  const { input, data, bundle, theme, refresh, panels } = useDraftContent(draft);

  // The size the design was started at (Studio home's Create picker), else square.
  const search = useSearch();
  const initialFormat = useMemo<CardSize>(() => {
    const asked = new URLSearchParams(search).get("format");
    return asked && asked in SIZES ? (asked as CardSize) : "square";
  }, [search]);

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

  // Stage 2: the design becomes page 1 of a free set (and a copy as page 2),
  // opened in the set editor to add, duplicate, reorder and delete pages. Every
  // page draws this card's data; the draft then posts as a carousel.
  const makePages = async (document: Record<string, unknown>) => {
    const ok = await confirm({
      title: "Make this a carousel set?",
      description:
        "This design becomes page 1, with a copy as page 2. You can then add, duplicate, reorder and delete pages, and the card posts as one slide per page.",
      confirmText: "Make a carousel set",
    });
    if (!ok) return;
    const set = freeSetFromDocument(input.kind, primaryPage(input.kind), document, 1);
    if (!set) return;
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
    panels,
    actions: ({ document, size, input: shown, data: shownData }) => (
      <>
        <button
          type="button"
          disabled={making}
          onClick={() => void makePages(document)}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:opacity-50"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden /> Make a carousel set
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
    <TemplateEditorV2
      template={template}
      viewport={viewport}
      host={host}
      draftMode={draftMode}
      initialFormat={initialFormat}
    />
  );
}
