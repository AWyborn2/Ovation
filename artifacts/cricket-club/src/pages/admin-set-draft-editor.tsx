/**
 * Edit and reformat a carousel set draft (carousel set editor plan, part 3):
 * a queued templated carousel or a Round Team Lists draft, opened in the
 * multi-page editor with its real data. Reorder, add and delete slides,
 * switch the whole set to another look, change the size; saving keeps the
 * data snapshot and stores the design, and the queue shows the change.
 */
import { useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Monitor, Palette } from "lucide-react";
import {
  getGetDraftSetDesignQueryKey,
  getGetSocialDraftQueryKey,
  getListClubTemplatesQueryKey,
  getListLibraryTemplatesQueryKey,
  getListSocialDraftsQueryKey,
  saveDraftSetDesign,
  updateSocialDraft,
  useGetDraftSetDesign,
  useGetSocialDraft,
  useListClubTemplates,
  useListLibraryTemplates,
  type DraftSetDesign,
  type SocialDraft,
  type TemplateRef,
} from "@workspace/api-client-react";
import {
  isSetDocument,
  setTemplateKind,
  SET_TYPE_LABELS,
  withoutStrandedLayouts,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";
import { LoadingState, QueryError } from "@/components/data-states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SetPageThumb, useLibraryPreviewData } from "@/components/template-library/previews";
import {
  draftDay,
  draftFallbackTitle,
  draftHeading,
  editorStatusLabel,
} from "@/components/social-queue/draft-meta";

/** A set's own name (its player or headline), else the day it was made: "17 Nov". */
const ownHeading = (draft: SocialDraft) => {
  const heading = draftHeading(draft);
  return heading === draftFallbackTitle(draft) || heading === "Blank design"
    ? draftDay(draft)
    : heading;
};
import { readableDateRange } from "@workspace/scorecard/card-content";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { useDraftContent } from "@/components/studio-editor/draft-panels";
import { useJuniorPhotoGuard } from "@/components/studio-editor/junior-photos";
import { setDraftSlides } from "@/lib/set-draft";
import { useNewStudio } from "@/lib/entitlements";
import { SharePanel } from "@/components/studio-editor/export/share-panel";
import { SendToReview } from "@/components/studio-editor/send-to-review";
import { SlideLayoutPanel, slideLayoutApplies } from "@/components/studio-editor/slide-layout";
import { EditSlideButton } from "@/components/studio-editor/edit-slide-button";
import {
  ChangePhotoButton,
  SlidePhotoPanel,
  slideHasPhoto,
} from "@/components/studio-editor/change-photo";
import { keepAddedPages, storedSetDocument } from "@/components/studio-editor/set-doc";
import type { CardSize } from "@/lib/share-card";
import { editorOpeningSize } from "@/lib/draft-design-size";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  PHOTO_PANEL,
  TemplateEditorV2,
  useViewport,
  type EditorHost,
  type EditorTemplate,
} from "./admin-template-editor";
import type { EditorTemplateDoc } from "@/components/studio-editor/set-doc";

const QUEUE = "/admin/social/queue";
/** The panel beside the rail for the slide on show's own layout (S9). */
const LAYOUT_PANEL = "layout";

const errorOf = (err: unknown): string | null => {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : null;
};

export default function AdminSetDraftEditor() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const viewport = useViewport();
  const enabled = Number.isInteger(id) && id > 0;
  const draftQ = useGetSocialDraft(id, {
    query: { queryKey: getGetSocialDraftQueryKey(id), enabled, retry: false },
  });
  const designQ = useGetDraftSetDesign(id, {
    query: { queryKey: getGetDraftSetDesignQueryKey(id), enabled, retry: false },
  });
  // A junior set draws (and downloads) only the photos it may show (ADR-007);
  // the editor opens once the club's photos say which those are.
  const guard = useJuniorPhotoGuard();
  const safe = useMemo(
    () =>
      draftQ.data && designQ.data
        ? {
            draft: guard.safeDraft(draftQ.data),
            design: {
              ...designQ.data,
              document: guard.safeDesign(draftQ.data, designQ.data.document),
            },
          }
        : null,
    [draftQ.data, designQ.data, guard],
  );
  const centred = (node: React.ReactNode) => (
    <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">{node}</div>
  );
  if (viewport.w < TEMPLATE_EDITOR_MIN_WIDTH) {
    return centred(
      <p className="flex max-w-xs items-center gap-2 text-sm text-[var(--ed-ink2)]">
        <Monitor className="h-4 w-4 shrink-0" aria-hidden /> Open on a computer or tablet to edit
        carousel sets.
      </p>,
    );
  }
  if (draftQ.isLoading || designQ.isLoading || !guard.ready)
    return centred(<LoadingState label="Opening the set…" />);
  if (draftQ.isError || designQ.isError || !draftQ.data || !designQ.data) {
    const why = errorOf(designQ.error);
    return why
      ? centred(<p>{why}</p>)
      : centred(
          <QueryError
            onRetry={() => {
              void draftQ.refetch();
              void designQ.refetch();
            }}
          />,
        );
  }
  if (!isSetDocument(designQ.data.document)) return centred(<p>This set can&apos;t be edited.</p>);
  return (
    <SetDraftEditor
      // A switched look is a new design: the editor opens it afresh.
      key={JSON.stringify(designQ.data.templateRef) + String(designQ.dataUpdatedAt)}
      draft={safe?.draft ?? draftQ.data}
      design={safe?.design ?? designQ.data}
      juniorStock={guard.juniorStock}
      viewport={viewport}
      onReload={async () => {
        await Promise.all([draftQ.refetch(), designQ.refetch()]);
      }}
    />
  );
}

function SetDraftEditor({
  draft,
  design,
  juniorStock,
  viewport,
  onReload,
}: {
  draft: SocialDraft;
  design: DraftSetDesign;
  /** The club's approved junior stock: the only own photo a junior slide draws. */
  juniorStock: ReadonlySet<number>;
  viewport: { w: number; h: number };
  onReload: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const { data: club } = useKindTemplateData("matchDay", { photoUrl: null });
  // A card made into pages (stage 2) draws its own card on every page, with
  // the draft editor's content panels beside the editor's.
  const pages = design.layout === "pages";
  const content = useDraftContent(draft);
  const brand = pages ? content.data : club;
  // It opens at the link's size, else the size it was last designed at
  // (Stage 2), else a queued carousel's own size; the editor then opens only
  // at a size the design draws.
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [size, setSize] = useState<CardSize>(() => editorOpeningSize(search, draft));
  const [current, setCurrent] = useState(draft);
  const [lookOpen, setLookOpen] = useState(false);
  // New Studio (preview): Share → Download beside the editor's own controls.
  const newStudio = useNewStudio();
  // The design as last saved here: a look switch keeps its slide order.
  const saved = useRef(design.document as unknown as SetDocument);
  // The set as it stands in the editor, saved or not: a look switch keeps its
  // order and the pages added to it, even one added since the last save.
  const live = useRef<EditorTemplateDoc | null>(null);
  // A free set (Pick by hand) is a carousel the admin fills: named for its day.
  const label = design.setType === "free" ? "Carousel" : SET_TYPE_LABELS[design.setType];
  const round = (draft.cardInput as { roundLabel?: unknown } | null)?.roundLabel;
  const template: EditorTemplate = useMemo(
    () => ({
      id: draft.id,
      kind: setTemplateKind(design.setType),
      // A set queued before Nov 2026 named its range raw ("2026-11-13 – 2026-11-22").
      name: `${label}: ${typeof round === "string" && round ? readableDateRange(round) : ownHeading(draft)}`,
      version: 1,
      // A layout page no slide maps to (saved before the 17 Nov 2026 fix) is
      // left out, so the next save drops it.
      document: withoutStrandedLayouts(design.document as unknown as SetDocument),
      fitStatus: "pass",
    }),
    [draft, design, label, round],
  );
  // The page a slide draws with on its own slot, without a layout of its own (S9).
  const naturalPage = (doc: EditorTemplateDoc, key: string) => {
    const set = storedSetDocument(doc);
    const { pageFor: _own, ...arrangement } = set.arrangement ?? { order: [], removed: [] };
    const shared = { ...set, arrangement: { ...arrangement, pageFor: {} } };
    return setDraftSlides(current, shared, brand).find((x) => x.key === key)?.page.id;
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetSocialDraftQueryKey(draft.id) });
  };
  // Changing Format saves it straight away, as a single card's editor does
  // (round 10, set 1025: a set's Story was lost on reload unless something
  // else was saved with it). A queued carousel's own size
  // (weekendCarousel.size) follows on the server, and the address follows
  // too, so a reload or the queue opens it at that size.
  const pickSize = (next: CardSize) => {
    setSize(next);
    navigate(`${location}?format=${next}`, { replace: true });
    updateSocialDraft(draft.id, { designSize: next }).then(refresh, () => {
      // Not saved: the draft keeps the size it had.
    });
  };
  const host: EditorHost<EditorTemplate> = {
    club: true,
    backHref: QUEUE,
    save: async (baseVersion, document) => {
      const next = await saveDraftSetDesign(draft.id, {
        document,
        ...(design.layout === "carousel" ? { size: size as DraftSetDesign["size"] & string } : {}),
      } as Parameters<typeof saveDraftSetDesign>[1]);
      setCurrent(next);
      saved.current = document as unknown as SetDocument;
      refresh();
      return { ...template, version: baseVersion + 1, document };
    },
    reload: async () => {
      await onReload();
      return undefined;
    },
    status: () => (
      <span className="rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]">
        {design.layout === "carousel" ? "Queued set" : pages ? "Pages" : "Round set"} ·{" "}
        {current.status === "ready"
          ? "Ready"
          : editorStatusLabel(current, newStudio) === "Draft, not yet reviewed"
            ? "Draft, not yet reviewed"
            : "To review"}
      </span>
    ),
  };
  return (
    <>
      <TemplateEditorV2
        template={template}
        viewport={viewport}
        host={host}
        sidePanels={({ set, setDesign }) => {
          if (!set || !setDesign) return [];
          // Change photo: the slide on the canvas, this slide only. Layout: its
          // own layout (S9, New Studio). Both open beside the rail, and show in
          // Edit page too.
          const natural = (key: string) => naturalPage(setDesign.doc, key);
          return [
            ...(slideHasPhoto(set, setDesign)
              ? [
                  {
                    id: PHOTO_PANEL,
                    title: "Change photo",
                    onPage: true,
                    body: <SlidePhotoPanel draftId={draft.id} set={set} design={setDesign} />,
                  },
                ]
              : []),
            ...(newStudio && slideLayoutApplies(set, setDesign, natural)
              ? [
                  {
                    id: LAYOUT_PANEL,
                    title: "Layout",
                    onPage: true,
                    body: <SlideLayoutPanel set={set} design={setDesign} naturalPageId={natural} />,
                  },
                ]
              : []),
          ];
        }}
        actions={({ set, setDesign, dirty, openPanel }) => {
          live.current = setDesign?.doc ?? null;
          const photo =
            set && setDesign && slideHasPhoto(set, setDesign) ? (
              <ChangePhotoButton onClick={() => openPanel(PHOTO_PANEL)} />
            ) : null;
          return newStudio ? (
            <>
              {photo}
              {set &&
                setDesign &&
                slideLayoutApplies(set, setDesign, (key) => naturalPage(setDesign.doc, key)) && (
                  <button
                    type="button"
                    onClick={() => openPanel(LAYOUT_PANEL)}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)]"
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" aria-hidden /> Layout
                  </button>
                )}
              {set && <EditSlideButton draftId={draft.id} set={set} dirty={dirty} />}
              {set && <SharePanel set={set} name={template.name} />}
              <SendToReview draftId={draft.id} dirty={dirty} />
            </>
          ) : (
            photo
          );
        }}
        draftMode={
          pages
            ? {
                input: content.input as unknown as Record<string, unknown>,
                data: content.data,
                panels: content.panels,
              }
            : undefined
        }
        slidesMode={{
          slides: (doc) => setDraftSlides(current, doc, brand, { juniorStock }),
          size,
          onSize: pickSize,
          // Older sizes only where the set was made in them (round 9 B8).
          olderSizes: draft.olderSizes ?? [],
          // A free set of pages has no look's set to switch to.
          actions: pages ? undefined : (
            <button
              type="button"
              onClick={() => setLookOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)]"
            >
              <Palette className="h-3.5 w-3.5" aria-hidden /> Change look
            </button>
          ),
        }}
      />
      <ChangeLookDialog
        open={lookOpen}
        onClose={() => setLookOpen(false)}
        design={design}
        onPicked={async (document, templateRef, oldLook) => {
          // Keep the set's slide order and deletions on the new look; a slide's
          // own layout (S9) was a page of the old look, so it goes. The pages
          // the admin added are their own, so they stay (dev retest 3, item 12).
          const now = live.current ? storedSetDocument(live.current) : saved.current;
          const kept = now.arrangement;
          // A slide's own photo is the slide's, not the look's: it stays.
          const arrangement = kept
            ? {
                order: kept.order,
                removed: kept.removed,
                ...(kept.ownPhotos ? { ownPhotos: kept.ownPhotos } : {}),
              }
            : undefined;
          const relooked: SetDocument = arrangement ? { ...document, arrangement } : document;
          const next = keepAddedPages(relooked, now, oldLook).doc;
          await saveDraftSetDesign(draft.id, {
            document: next,
            templateRef,
            ...(design.layout === "carousel" ? { size } : {}),
          } as Parameters<typeof saveDraftSetDesign>[1]);
          refresh();
          await onReload();
        }}
      />
    </>
  );
}

/** Pick another look's set template (or one of the club's) for the whole set. */
function ChangeLookDialog({
  open,
  onClose,
  design,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  design: DraftSetDesign;
  /** The new look's set, its ref, and the old look's set when it is listed here. */
  onPicked: (document: SetDocument, ref: TemplateRef, oldLook: SetDocument | null) => Promise<void>;
}) {
  const kind = setTemplateKind(design.setType);
  const preview = useLibraryPreviewData();
  const libQ = useListLibraryTemplates(
    { kind },
    { query: { queryKey: getListLibraryTemplatesQueryKey({ kind }), enabled: open } },
  );
  const clubQ = useListClubTemplates(
    { kind },
    { query: { queryKey: getListClubTemplatesQueryKey({ kind }), enabled: open } },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = [
    ...(libQ.data?.templates ?? []).map((t) => ({
      key: `lib-${t.id}`,
      name: t.look?.name ?? t.name,
      by: t.authorName,
      document: t.document,
      ref: { libraryTemplateId: t.id, version: t.version } as TemplateRef,
    })),
  ];
  const clubIds = (clubQ.data?.templates ?? []).map((t) => t.id);
  const pick = async (o: (typeof options)[number]) => {
    if (!isSetDocument(o.document)) return;
    setBusy(o.key);
    setError(null);
    try {
      const was = options.find((x) => isCurrent(x.ref))?.document;
      await onPicked(o.document, o.ref, isSetDocument(was) ? was : null);
      onClose();
    } catch (err) {
      setError(errorOf(err) ?? "Couldn't switch the look. Try again.");
    } finally {
      setBusy(null);
    }
  };
  const ref = design.templateRef;
  const isCurrent = (r: TemplateRef) =>
    !!ref && r.libraryTemplateId === ref.libraryTemplateId && r.version === ref.version;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change the set&apos;s look</DialogTitle>
          <DialogDescription>
            Every slide takes the new look; the teams, fixtures and results stay as they are, and so
            do the pages you added. Other edits to this set&apos;s design are replaced, and a slide
            with its own layout (Edit this slide) goes back to the new look&apos;s layout, because
            that layout was made from the old look.
          </DialogDescription>
        </DialogHeader>
        {libQ.isLoading ? (
          <LoadingState label="Loading looks…" />
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other look has this set yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((o) => {
              const set = isSetDocument(o.document) ? o.document : null;
              const on = isCurrent(o.ref);
              return (
                <li key={o.key} className="rounded-xl border border-border bg-card p-2">
                  {set?.pages[0] && (
                    <SetPageThumb set={set} page={set.pages[0]} preview={preview} />
                  )}
                  <p className="mt-2 truncate text-sm font-medium">{o.name}</p>
                  <Button
                    size="sm"
                    className="mt-2 w-full"
                    variant={on ? "secondary" : "default"}
                    disabled={busy !== null || on}
                    onClick={() => pick(o)}
                  >
                    {on ? "Current look" : busy === o.key ? "Switching…" : "Use this look"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {clubIds.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Your own {SET_TYPE_LABELS[design.setType].toLowerCase()} sets are in Templates → Your
            templates.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
