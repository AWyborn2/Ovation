/**
 * Edit and reformat a carousel set draft (carousel set editor plan, part 3):
 * a queued templated carousel or a Round Team Lists draft, opened in the
 * multi-page editor with its real data. Reorder, add and delete slides,
 * switch the whole set to another look, change the size; saving keeps the
 * data snapshot and stores the design, and the queue shows the change.
 */
import { useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Monitor, Palette } from "lucide-react";
import {
  getGetDraftSetDesignQueryKey,
  getGetSocialDraftQueryKey,
  getListClubTemplatesQueryKey,
  getListLibraryTemplatesQueryKey,
  getListSocialDraftsQueryKey,
  saveDraftSetDesign,
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
import { draftHeading } from "@/components/social-queue/draft-meta";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { setDraftSlides } from "@/lib/set-draft";
import type { CardSize } from "@/lib/share-card";
import {
  TEMPLATE_EDITOR_MIN_WIDTH,
  TemplateEditorV2,
  useViewport,
  type EditorHost,
  type EditorTemplate,
} from "./admin-template-editor";

const QUEUE = "/admin/social/queue";

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
  if (draftQ.isLoading || designQ.isLoading)
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
      draft={draftQ.data}
      design={designQ.data}
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
  viewport,
  onReload,
}: {
  draft: SocialDraft;
  design: DraftSetDesign;
  viewport: { w: number; h: number };
  onReload: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const { data: brand } = useKindTemplateData("matchDay", { photoUrl: null });
  const [size, setSize] = useState<CardSize>((design.size ?? "square") as CardSize);
  const [current, setCurrent] = useState(draft);
  const [lookOpen, setLookOpen] = useState(false);
  // The design as last saved here: a look switch keeps its slide order.
  const saved = useRef(design.document as unknown as SetDocument);
  const label = SET_TYPE_LABELS[design.setType];
  const round = (draft.cardInput as { roundLabel?: unknown } | null)?.roundLabel;
  const template: EditorTemplate = useMemo(
    () => ({
      id: draft.id,
      kind: setTemplateKind(design.setType),
      name: `${label}: ${typeof round === "string" && round ? round : draftHeading(draft)}`,
      version: 1,
      document: design.document,
      fitStatus: "pass",
    }),
    [draft, design, label, round],
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetSocialDraftQueryKey(draft.id) });
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
        {design.layout === "carousel" ? "Queued set" : "Round set"} ·{" "}
        {current.status === "ready" ? "Ready" : "To review"}
      </span>
    ),
  };
  return (
    <>
      <TemplateEditorV2
        template={template}
        viewport={viewport}
        host={host}
        slidesMode={{
          slides: (doc) => setDraftSlides(current, doc, brand),
          size,
          onSize: setSize,
          actions: (
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
        onPicked={async (document, templateRef) => {
          // Keep the set's slide order and deletions on the new look.
          const arrangement = saved.current.arrangement;
          const next: SetDocument = arrangement ? { ...document, arrangement } : document;
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
  onPicked: (document: SetDocument, ref: TemplateRef) => Promise<void>;
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
      await onPicked(o.document, o.ref);
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
            Every slide takes the new look; the teams, fixtures and results stay as they are. Edits
            made to this set&apos;s design are replaced.
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
