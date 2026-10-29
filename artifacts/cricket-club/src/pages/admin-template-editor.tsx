import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Layers3,
  Monitor,
  Shapes,
  SlidersHorizontal,
  Type,
  Upload,
} from "lucide-react";
import {
  getGetClubTemplateQueryKey,
  getListClubTemplatesQueryKey,
  getListSocialDraftsQueryKey,
  useGetClubTemplate,
  useListSocialDrafts,
  useSaveClubTemplate,
  type ClubTemplate,
  type KindTemplateConflict,
} from "@workspace/api-client-react";
import {
  CONTENT_PRESET_LABELS,
  CONTENT_PRESETS,
  isBundledImage,
  isContentKind,
  isSetDocument,
  kindFields,
  pageTokens,
  MAX_STACK_DEPTH,
  planTemplateSlides,
  primaryPage,
  SET_TYPE_LABELS,
  setTypeOfKind,
  TEMPLATE_CARD_KINDS,
  type ContentPreset,
  type LayerDocument,
  type LayoutWarning,
  type PageKey,
  type SetDocument,
} from "@workspace/scorecard/kind-templates";
import { LoadingState, QueryError } from "@/components/data-states";
import { EditorCanvas } from "@/components/studio-editor/canvas";
import {
  EditorBottomBar,
  EditorPanel,
  EditorRail,
  EditorTopBar,
  type RailItem,
} from "@/components/studio-editor/editor-shell";
import { ElementsPanel, TextPanel } from "@/components/studio-editor/panels";
import { EditorToolbar } from "@/components/studio-editor/toolbar";
import { SaveElementDialog } from "@/components/studio-editor/save-element-dialog";
import { backgroundDepth } from "@/components/studio-editor/element-insert";
import { elementSaveContext } from "@/components/studio-editor/element-save";
import { ElementPropsEditor } from "@/components/studio-editor/element-library";
import { LayersDrawer } from "@/components/studio-editor/layers-drawer";
import { FieldsPanel } from "@/components/studio-editor/fields-panel";
import { RowsPanel } from "@/components/studio-editor/rows-panel";
import { TextStyleBar } from "@/components/studio-editor/text-style-bar";
import { ApplyTemplateDialog } from "@/components/studio-editor/apply-template-dialog";
import { LayerDesignPanel } from "@/components/studio-editor/layer-design-panel";
import { useLayerPhotoPreview } from "@/components/studio-editor/use-layer-photo-preview";
import {
  commit,
  commitFrom,
  createHistory,
  redo,
  replace,
  undo,
  type History,
} from "@/components/studio-editor/history";
import {
  boxOf,
  duplicate,
  group as groupLayers,
  layersOf,
  nudge,
  reorderLayers,
  selectMany,
  selectionFor,
  setElementProp,
  toggleSelection,
  ungroup,
  updateLayer,
  type EditorDoc,
} from "@/components/studio-editor/document";
import {
  addToOtherSizes,
  insertToken,
  keyFieldOf,
  layersOnSize,
  onlyOnSize,
  removeFromSize,
  saveBlockers,
  setTextStyle,
  showsKeyField,
  SIZE_LABEL,
} from "@/components/studio-editor/template-ops";
import {
  asAdjustments,
  depthOf,
  findLayer,
  makeStack,
  moveChild,
  needsV2,
  openTemplate,
  pageDoc,
  pageInput,
  presetInput,
  storedDocument,
  unstack,
  updateDeep,
  withPage,
  type EditorLayer,
} from "@/components/studio-editor/template-doc";
import {
  align,
  distribute,
  matchSize,
  selectAll,
  unitCount,
} from "@/components/studio-editor/arrange";
import {
  copyLayers,
  pasteLayers,
  readClipboard,
  writeClipboard,
} from "@/components/studio-editor/clipboard";
import { isImageRowField } from "@/components/studio-editor/rows-panel";
import { PageStrip, type StripItem } from "@/components/studio-editor/page-strip";
import { PageFromTemplateDialog } from "@/components/studio-editor/page-from-template";
import {
  addBlankPage,
  addRepeatPage,
  addSetPage,
  deleteSetPage,
  duplicateSetPage,
  editorPageList,
  firstPageId,
  missingRepeatSlots,
  moveSetPage,
  openSetTemplate,
  pageRenderDocument,
  storedSetDocument,
  SET_SLOT_LABELS,
  withArrangement,
  type EditorPage,
  type EditorSlide,
  type EditorTemplateDoc,
} from "@/components/studio-editor/set-doc";
import type { SetShareContext } from "@/components/studio-editor/export/share-panel";
import { removeLinked, sharedLinks, syncLinks } from "@/components/studio-editor/links";
import {
  cellAt,
  isContainer,
  isStack,
  parentOf,
  scopeDoc,
  scopeInStack,
  scopeLayer,
  scopePath,
  withScope,
} from "@/components/studio-editor/scope";
import { actionForKey, isTypingTarget } from "@/components/studio-editor/shortcuts";
import {
  BLANK_PACK_ID,
  packFieldValues,
  packNativeSize,
  resolveCardTokens,
  type FreeLayer,
  type PackCardData,
} from "@/lib/pack-render";
import { previewSample, sampleItem, stressSample } from "@/lib/kind-templates/samples";
import { PackCard } from "@/components/pack-card";
import { MakeSetDialog } from "@/components/template-library/make-set-dialog";
import { PublishDialog } from "@/components/template-library/publish-dialog";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { draftInput } from "@/components/social-queue/draft-meta";
import { kindLabel } from "@/lib/social-studio";
import { ensureDocumentFonts } from "@/lib/document-fonts";
import type { CardSize, ShareCardInput } from "@/lib/share-card";

/** Below this width (a phone) templates aren't edited; tablets and up are (R23). */
export const TEMPLATE_EDITOR_MIN_WIDTH = 768;

const RAIL: RailItem[] = [
  { id: "fields", label: "Fields", icon: Database },
  { id: "text", label: "Text", icon: Type },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "layer", label: "Layer", icon: SlidersHorizontal },
];

const TEMPLATES = "/admin/social/template-library";

/** What the breadcrumb calls a group, stack or list being edited. */
const scopeName = (l: EditorLayer): string =>
  l.name ?? (l.kind === "rows" ? "List" : isStack(l) ? "Stack" : "Group");

/** The whole template with one level of one page (the page, or a group in it) replaced. */
const withLevel = (
  present: EditorTemplateDoc,
  page: string,
  scope: string | null,
  next: EditorDoc,
  size: CardSize,
) => {
  const before = pageDoc(present, page);
  // An edit to a linked copy's content or style reaches its other copies.
  return withPage(present, page, syncLinks(before, withScope(before, scope, next, size)));
};

export function useViewport(): { w: number; h: number } {
  const read = () =>
    typeof window === "undefined"
      ? { w: 1440, h: 900 }
      : { w: window.innerWidth, h: window.innerHeight };
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

const statusOf = (err: unknown): number | undefined => {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
};

const conflictOf = (err: unknown): KindTemplateConflict | null =>
  statusOf(err) === 409 ? ((err as { data?: KindTemplateConflict }).data ?? null) : null;

/** What a failed save says, from its body. */
const errorOf = (err: unknown): string | null => {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : null;
};

/** What editor v2 needs of a template, wherever it is stored (a club copy or the library). */
export type EditorTemplate = {
  id: number;
  kind: string;
  name: string;
  version: number;
  document: unknown;
  fitStatus: string;
  fitReport?: unknown;
};

/** Where an edited template lives: how it saves and reloads, and what the editor shows about it. */
export type EditorHost<T extends EditorTemplate = EditorTemplate> = {
  /** Club previews use the club's brand and latest cards; the console previews samples. */
  club: boolean;
  backHref: string;
  /** Saves the document; rejects as the generated client does (409 carries the conflict). */
  save: (baseVersion: number, document: Record<string, unknown>) => Promise<T>;
  /** The stored template again, after a conflict. */
  reload: () => Promise<T | undefined>;
  /** Chips beside the title for the saved template at `version`. */
  status: (version: number) => ReactNode;
};

/** The layout check's verdict on the saved template, in a line. */
function fitLine(t: EditorTemplate): { text: string; tone: "ok" | "wait" | "bad" } | null {
  if (t.fitStatus === "pending") return { text: "Checking the layout…", tone: "wait" };
  const report = (t.fitReport ?? null) as { issues?: unknown[]; skipped?: boolean } | null;
  if (t.fitStatus === "fail") {
    const n = Array.isArray(report?.issues) ? report.issues.length : 0;
    return {
      text: `The layout check found ${n || "some"} ${n === 1 ? "problem" : "problems"}: some cards made with it will wait for review.`,
      tone: "bad",
    };
  }
  if (report && !report.skipped) return { text: "Layout check passed.", tone: "ok" };
  return null;
}

/**
 * Editor v2 (ADR-011, L5-B): one of the club's templates, edited page by page
 * (Match Day's fixture, title, junior day and sponsors pages; the single card
 * for most kinds), previewed at each content preset, with stack groups,
 * conditions, text fit, styles, motion and vector colours. Saves go through
 * `/club-templates/:id`; the first saved change makes the template the club's
 * own.
 */
/** The slot a set page repeats for. */
const repeatSlotOf = (doc: EditorTemplateDoc, id: string) =>
  (doc.setDesign?.pages.find((p) => p.id === id)?.slot ?? "page") as keyof typeof SET_SLOT_LABELS;

export default function AdminTemplateEditor({ id: idProp }: { id?: number } = {}) {
  const params = useParams<{ id: string }>();
  const id = idProp ?? Number(params.id);
  const viewport = useViewport();
  const templateQ = useGetClubTemplate(id, {
    query: {
      queryKey: getGetClubTemplateQueryKey(id),
      enabled: Number.isInteger(id),
      retry: false,
    },
  });

  const centred = (node: React.ReactNode) => (
    <div className="studio-editor grid min-h-screen place-items-center p-6 text-center">{node}</div>
  );
  if (viewport.w < TEMPLATE_EDITOR_MIN_WIDTH) {
    return centred(
      <p className="flex max-w-xs items-center gap-2 text-sm text-[var(--ed-ink2)]">
        <Monitor className="h-4 w-4 shrink-0" aria-hidden /> Open on a computer or tablet to edit
        templates.
      </p>,
    );
  }
  if (templateQ.isLoading) return centred(<LoadingState label="Opening the template…" />);
  if (templateQ.isError || !templateQ.data) {
    return statusOf(templateQ.error) === 404
      ? centred(<p>That template isn&apos;t one of your club&apos;s.</p>)
      : centred(<QueryError onRetry={() => templateQ.refetch()} />);
  }
  if (!kindFields(templateQ.data.kind) && !setTypeOfKind(templateQ.data.kind)) {
    return centred(<p>There&apos;s no card called &ldquo;{templateQ.data.kind}&rdquo;.</p>);
  }
  const size = new URLSearchParams(window.location.search).get("size");
  return (
    <ClubTemplateEditor
      key={templateQ.data.id}
      template={templateQ.data}
      initialFormat={
        size === "portrait" || size === "story" || size === "landscape" ? size : undefined
      }
      viewport={viewport}
      onReload={async () => (await templateQ.refetch()).data}
    />
  );
}

/** One of the club's templates in editor v2: saves to `/club-templates/:id`, then offers to apply. */
function ClubTemplateEditor({
  template,
  viewport,
  onReload,
  initialFormat,
}: {
  template: ClubTemplate;
  viewport: { w: number; h: number };
  onReload: () => Promise<ClubTemplate | undefined>;
  initialFormat?: CardSize;
}) {
  const [making, setMaking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const qc = useQueryClient();
  const save = useSaveClubTemplate();
  const [current, setCurrent] = useState(template);
  const [applyFor, setApplyFor] = useState<{ version: number; waiting: number } | null>(null);
  // An unchanged library copy holds nothing of the club's to publish.
  const unchangedCopy = current.basedOn !== null && !current.edited;
  const host: EditorHost<ClubTemplate> = {
    club: true,
    backHref: TEMPLATES,
    save: async (baseVersion, document) => {
      const t = await save.mutateAsync({ id: template.id, data: { baseVersion, document } });
      setCurrent(t);
      qc.setQueryData(getGetClubTemplateQueryKey(template.id), t);
      qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
      if (t.isDefault && t.waitingDrafts > 0) {
        setApplyFor({ version: t.version, waiting: t.waitingDrafts });
      }
      return t;
    },
    reload: async () => {
      const t = await onReload();
      if (t) setCurrent(t);
      return t;
    },
    status: (version) => (
      <span className="flex items-center gap-2">
        <span className="rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]">
          {current.isDefault ? "Default" : "Template"} · v{version}
        </span>
        {current.updateAvailable && (
          <Link
            href={TEMPLATES}
            className="rounded-full bg-[var(--ed-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-on-accent)]"
          >
            Update available
          </Link>
        )}
      </span>
    ),
  };
  return (
    <>
      <TemplateEditorV2
        template={template}
        viewport={viewport}
        host={host}
        initialFormat={initialFormat}
        actions={
          // A card template can start a carousel set (part 4) and be published
          // to the library (release 2); a set does neither.
          setTypeOfKind(template.kind)
            ? undefined
            : ({ dirty, selectLayer }) => (
                <>
                  <button
                    type="button"
                    onClick={() => setMaking(true)}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)]"
                  >
                    <Layers3 className="h-3.5 w-3.5" aria-hidden /> Make a carousel set
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublishing(true)}
                    disabled={unchangedCopy}
                    title={
                      unchangedCopy
                        ? "This is a library template you haven't changed yet"
                        : undefined
                    }
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden /> Publish
                  </button>
                  <PublishDialog
                    copyId={current.id}
                    kind={current.kind}
                    name={current.name}
                    dirty={dirty}
                    open={publishing}
                    onClose={() => setPublishing(false)}
                    onSelectLayer={(page, layerId) => {
                      setPublishing(false);
                      selectLayer(page, layerId);
                    }}
                  />
                </>
              )
        }
      />
      {!setTypeOfKind(template.kind) && (
        <MakeSetDialog
          open={making}
          onClose={() => setMaking(false)}
          from={{ ref: { copyId: current.id, version: current.version }, name: current.name }}
        />
      )}
      <ApplyTemplateDialog
        copyId={template.id}
        label={kindLabel(template.kind)}
        version={applyFor?.version ?? current.version}
        waiting={applyFor?.waiting ?? current.waitingDrafts}
        open={applyFor !== null}
        onClose={() => setApplyFor(null)}
        onApplied={() => {
          qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
          qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
        }}
      />
    </>
  );
}

/**
 * The editor itself: a template's pages, edited one at a time, previewed at
 * each content preset, and saved through its `host`.
 */
/**
 * A set draft's real slides (carousel set editor plan, part 3): the strip
 * shows the slides as they post, each drawn with its data on its page. A
 * repeating page's slides share one design: editing one edits them all.
 */
export type EditorSlidesMode = {
  /** The slides of the design, in posting order. */
  slides: (doc: SetDocument) => EditorSlide[];
  /** The size the set is drawn at; every page follows it. */
  size?: CardSize;
  onSize?: (size: CardSize) => void;
  /** Extra controls beside the size (switch look). */
  actions?: ReactNode;
  /** What the slides are, in the empty-slide note ("this round's teams"). */
  noun?: string;
};

/**
 * A draft's own design (full draft editor plan, stage 1): the editor draws the
 * draft's real card, offers the draft editor's content panels beside its own,
 * and puts the draft's controls (Download) in the top bar.
 */
export type EditorDraftMode = {
  /** The draft's card input and club data, drawn in place of the latest card or a sample. */
  input: Record<string, unknown>;
  data: PackCardData;
  /** Rail panels after the editor's own; each adds layers to the page on show. */
  panels?: Array<
    RailItem & {
      render: (ctx: {
        size: CardSize;
        add: (layers: FreeLayer[]) => void;
        values: Record<string, string>;
        /** The page on show, and a whole-page edit (recolour, sponsor lock). */
        page: EditorDoc;
        setPage: (next: EditorDoc) => void;
      }) => ReactNode;
    }
  >;
  /** Top-bar controls, given the design as it would be saved and the card on show. */
  actions?: (ctx: {
    document: Record<string, unknown>;
    size: CardSize;
    input: ShareCardInput;
    data: PackCardData;
  }) => ReactNode;
};

/** What the top bar's own controls can see and do in the editor. */
export type EditorActionsContext = {
  dirty: boolean;
  /** Show `page` and select `layerId` on it, entering its group if it sits in one. */
  selectLayer: (page: string, layerId: string) => void;
  /** A set draft's slides as they draw now (read only), for Share → Download. */
  set?: SetShareContext;
};

export function TemplateEditorV2<T extends EditorTemplate>({
  template,
  viewport,
  host,
  slidesMode,
  draftMode,
  initialFormat,
  actions,
}: {
  template: T;
  viewport: { w: number; h: number };
  host: EditorHost<T>;
  /** Edit a set draft's real slides instead of the template's sample pages. */
  slidesMode?: EditorSlidesMode;
  /** Edit a draft's own design with its real card (stage 1). */
  draftMode?: EditorDraftMode;
  /** The size the editor opens at (a new set's, picked when it was made). */
  initialFormat?: CardSize;
  /**
   * Extra controls in the top bar (Make a carousel set, Publish). The render
   * form gets the unsaved state and selects a layer on a page (a publish flag).
   */
  actions?: ReactNode | ((ctx: EditorActionsContext) => ReactNode);
}) {
  const kind = template.kind;
  const open = useCallback(
    (document: unknown) =>
      isSetDocument(document) ? openSetTemplate(document) : openTemplate(document, kind),
    [kind],
  );
  const opened = useMemo(() => open(template.document), [template.document, open]);
  const [sourceFormat, setSourceFormat] = useState(opened.sourceFormat);
  const [history, setHistory] = useState<History<EditorTemplateDoc>>(() =>
    createHistory(opened.doc),
  );
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(opened.doc));
  const [baseVersion, setBaseVersion] = useState(template.version);
  const [current, setCurrent] = useState(template);
  const full = history.present;
  const dirty = JSON.stringify(full) !== savedJson;
  const gestureBase = useRef<EditorTemplateDoc | null>(null);

  // The pages: a kind's (Match Day's four), or a set's own in slide order (part 2).
  const pageList = editorPageList(full, kind);
  const [pageId, setPageId] = useState(() => firstPageId(opened.doc, kind));
  // A set draft: its real slides, and the one on show (its page is the page edited).
  const setNow = useMemo(
    () => (slidesMode && full.setDesign ? storedSetDocument(full) : null),
    [slidesMode, full],
  );
  const realSlides = useMemo(
    () => (slidesMode && setNow ? slidesMode.slides(setNow) : []),
    [slidesMode, setNow],
  );
  const [slideKey, setSlideKey] = useState<string | null>(null);
  const slide = realSlides.find((x) => x.key === slideKey) ?? realSlides[0] ?? null;
  const cur: EditorPage =
    (slide ? pageList.find((p) => p.id === slide.page.id) : undefined) ??
    pageList.find((p) => p.id === pageId) ??
    pageList[0]!;
  useEffect(() => {
    if (cur.id !== pageId) setPageId(cur.id);
  }, [cur.id, pageId]);
  // The kind page on show: its fields, tokens, presets and samples.
  const page: PageKey = cur.page;
  const pageKind = cur.kind;
  const cardKind = pageKind as ShareCardInput["kind"];
  const { data, clubName } = useKindTemplateData(cardKind, { club: host.club });
  const [sample, setSample] = useState(0);
  const [preset, setPreset] = useState<ContentPreset>("standard");
  const pageFull = pageDoc(full, cur.id);
  const [format, setFormat] = useState<CardSize>(slidesMode?.size ?? initialFormat ?? "square");
  // The level being edited: the page, or a group or list entered by double-click (A2, A3).
  const [scope, setScope] = useState<string | null>(null);
  const doc = scopeDoc(pageFull, scope, format);
  const scopeGroup = scopeLayer(pageFull, scope);
  const inList = scopeGroup?.kind === "rows";
  useEffect(() => {
    if (scope && !scopeGroup) setScope(null);
  }, [scope, scopeGroup]);

  const [selection, setSelection] = useState<string[]>([]);
  const [savingElement, setSavingElement] = useState(false);
  const [inside, setInside] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(viewport.w >= 1024 ? "fields" : null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [stress, setStress] = useState(false);
  const [playing, setPlaying] = useState(0);
  const [addPrompt, setAddPrompt] = useState<{ ids: string[]; from: CardSize } | null>(null);
  // Links whose copies on other sizes may go too, after deleting one copy.
  const [linkPrompt, setLinkPrompt] = useState<string[] | null>(null);
  const [warnings, setWarnings] = useState<LayoutWarning[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [conflict, setConflict] = useState<KindTemplateConflict | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fontFailures, setFontFailures] = useState<string[]>([]);
  const [canPaste, setCanPaste] = useState(() => readClipboard("template") !== null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [stackNote, setStackNote] = useState<string | null>(null);
  const [pickingPage, setPickingPage] = useState(false);

  // Load the faces the page uses, and note any that fail (KTD17).
  const fontKey = JSON.stringify(
    layersOf(pageFull).map((l) => [l.style?.fontFamily, l.style?.fontWeight, l.rows?.cells]),
  );
  useEffect(() => {
    let live = true;
    ensureDocumentFonts(pageFull).then((failed) => live && setFontFailures(failed));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts change only with fontKey
  }, [fontKey]);

  // Preview data: the latest real card of this kind, else the sample (R11).
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey(), enabled: host.club },
  });
  const latest = useMemo(() => {
    const mine = (draftsQ.data ?? [])
      .filter((d) => draftInput(d)?.kind === pageKind)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return mine[0] ? draftInput(mine[0]) : null;
  }, [draftsQ.data, pageKind]);
  const sourceInput = stress
    ? stressSample(cardKind, clubName)
    : (draftMode?.input ?? latest ?? previewSample(cardKind, clubName));
  // Lists spill onto extra slides by capacity; the editor shows the first.
  const plan = planTemplateSlides(
    sourceInput as unknown as Record<string, unknown>,
    pageFull as LayerDocument,
    format,
  );
  // A draft draws its own content as it stands: no sample item, no preset.
  const input =
    draftMode && !stress
      ? pageInput(plan.slides[0].input as unknown as ShareCardInput, pageKind, page)
      : pageInput(
          presetInput(
            sampleItem(plan.slides[0].input as unknown as ShareCardInput, cur.repeat ? sample : 0),
            pageKind,
            page,
            preset,
          ),
          pageKind,
          page,
        );
  // A set draft's slide draws with its own data (its photo, the club's sponsors).
  const shownInput = slide ? slide.input : input;
  // Designing a template, a data block from another kind shows sample text.
  const sampleValues = useMemo(
    () => (draftMode ? null : allKindSamples(data, clubName)),
    [draftMode, data, clubName],
  );
  // A club template's sourced photo layers show the photos a draft would pick.
  const layerPhotos = useLayerPhotoPreview(kind, full, host.club && !draftMode && !slidesMode);
  const templateData = useMemo(
    () => ({
      ...data,
      ...(sampleValues ? { sampleValues } : {}),
      ...(layerPhotos ? { layerPhotos } : {}),
    }),
    [data, sampleValues, layerPhotos],
  );
  const shownData = slide ? slide.data : (draftMode?.data ?? templateData);
  const values = packFieldValues(shownInput, shownData, BLANK_PACK_ID);

  // Every edit is to the page on show; the whole document is what history keeps.
  // Inside a group, `doc` is its children: an edit is written back into the group.
  const pageRef = useRef(cur.id);
  pageRef.current = cur.id;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const formatRef = useRef(format);
  formatRef.current = format;
  const editPage = useCallback((next: EditorDoc) => {
    setHistory((h) => commit(h, withPage(h.present, pageRef.current, next)));
    setAddPrompt(null);
    setLinkPrompt(null);
    setPasteNote(null);
    setStackNote(null);
  }, []);
  const edit = useCallback((next: EditorDoc) => {
    setHistory((h) =>
      commit(h, withLevel(h.present, pageRef.current, scopeRef.current, next, formatRef.current)),
    );
    setAddPrompt(null);
    setLinkPrompt(null);
    setPasteNote(null);
    setStackNote(null);
  }, []);
  const onCanvasChange = (next: EditorDoc, done: boolean) => {
    const nextFull = withLevel(history.present, cur.id, scope, next, format);
    if (!done) {
      if (!gestureBase.current) gestureBase.current = history.present;
      setHistory((h) => replace(h, nextFull));
      return;
    }
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base) {
      setHistory((h) => commitFrom(h, base, withLevel(h.present, cur.id, scope, next, format)));
      setAddPrompt(null);
    }
  };
  /** Edit inside `group` (null: the page), selecting `ids` there. */
  const enterScope = (group: string | null, ids: string[] = []) => {
    setScope(group);
    setInside(null);
    setSelection(ids);
  };

  const selectLayer = (pageKey: string, layerId: string) => {
    const target = pageList.find((p) => p.id === pageKey) ?? cur;
    const hit = findLayer(pageDoc(full, target.id), layerId);
    setPageId(target.id);
    setAddPrompt(null);
    enterScope(hit?.parent?.id ?? null, hit ? [layerId] : []);
  };

  const layers = layersOnSize(doc, format);
  const selected = layers.filter((l) => selection.includes(l.id));
  const single = selected.length === 1 ? selected[0] : null;
  // The layer the Layer panel shows: a selected top-level layer, or a stack's child.
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = (focusId ? findLayer(doc, focusId)?.layer : null) ?? (single as EditorLayer | null);
  useEffect(() => setFocusId(null), [selection, cur.id]);
  const isGroup =
    selected.length > 1 && selected.every((l) => l.group && l.group === selected[0].group);

  // The page's live fields: searched from the text box, and shown by label in
  // the Layers list ("Opposition name", not "{{opposition.name}}").
  const pageFields = useMemo(
    () => pageTokens(pageKind, page)?.fields ?? kindFields(pageKind)?.fields ?? [],
    [pageKind, page],
  );
  const fieldLabels = useMemo(
    () => Object.fromEntries(pageFields.map((f) => [f.key, f.label])),
    [pageFields],
  );

  // The editor's own panels, then a draft's content panels.
  const rail: RailItem[] = [
    ...RAIL,
    ...(draftMode?.panels ?? []).map(({ id, label, icon }) => ({ id, label, icon })),
  ];

  // A new element goes on the page itself, so adding one leaves a group being edited.
  const addTemplateLayers = (added: FreeLayer[]) => {
    const placed = added.map((l) => onlyOnSize(l, format));
    // A library texture or pattern is a background: it goes just above the
    // page's full-card background layers, under the rest of the design.
    const texture = placed.every((l) => l.kind === "image" && isBundledImage(l.content));
    const layers = layersOf(pageFull);
    const at = texture ? backgroundDepth(layers, format) : layers.length;
    editPage({ ...pageFull, layers: [...layers.slice(0, at), ...placed, ...layers.slice(at)] });
    enterScope(
      null,
      placed.map((l) => l.id),
    );
    setAddPrompt({ ids: placed.map((l) => l.id), from: format });
  };
  const acceptAddPrompt = () => {
    if (!addPrompt) return;
    setHistory((h) => {
      const level = scopeDoc(pageDoc(h.present, cur.id), scope, format);
      return replace(
        h,
        withLevel(
          h.present,
          cur.id,
          scope,
          addToOtherSizes(level, addPrompt.ids, addPrompt.from),
          format,
        ),
      );
    });
    setAddPrompt(null);
  };

  const canvasArea = useRef<HTMLElement>(null);
  const stateRef = useRef({ doc, pageFull, page, scope, inList, selection, format, inside });
  stateRef.current = { doc, pageFull, page, scope, inList, selection, format, inside };
  /** Delete layers from this size, offering to delete their linked copies on the other sizes. */
  const removeSelected = (ids: string[]) => {
    const s = stateRef.current;
    const view = removeFromSize(s.doc, ids, s.format);
    edit(view);
    setSelection([]);
    const links = sharedLinks(s.pageFull, withScope(s.pageFull, s.scope, view, s.format), ids);
    if (links.length) setLinkPrompt(links);
  };
  const copySelection = () => {
    const s = stateRef.current;
    const clip = copyLayers(s.doc, s.format, s.selection, "template");
    if (!clip) return false;
    writeClipboard(clip);
    setCanPaste(true);
    return true;
  };
  const pasteClipboard = () => {
    const clip = readClipboard("template");
    const s = stateRef.current;
    if (!clip) return;
    const r = pasteLayers(s.doc, clip, s.format, {
      kind: pageKind,
      onlyOnSize: true,
      page: s.page,
    });
    if (r.ids.length) {
      edit(r.doc);
      setSelection(r.ids);
      // A list's cells are on every size already.
      if (!s.inList) setAddPrompt({ ids: r.ids, from: s.format });
    }
    setPasteNote(
      r.skipped
        ? `${r.skipped} copied ${r.skipped === 1 ? "layer uses" : "layers use"} fields this card doesn't have, so ${r.skipped === 1 ? "it wasn't" : "they weren't"} pasted.`
        : null,
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = actionForKey(e);
      if (!action) return;
      const s = stateRef.current;
      if ((action.type === "copy" || action.type === "cut") && !s.selection.length) return;
      if (action.type === "paste" && !readClipboard("template")) return;
      e.preventDefault();
      switch (action.type) {
        case "undo":
          setHistory((h) => undo(h));
          setAddPrompt(null);
          break;
        case "redo":
          setHistory((h) => redo(h));
          setAddPrompt(null);
          break;
        case "delete":
          if (s.selection.length) removeSelected(s.selection);
          break;
        case "escape":
          setAddPrompt(null);
          // Inside a group, Esc goes up a level with the group selected.
          if (s.scope) {
            setScope(parentOf(s.pageFull, s.scope));
            setSelection([s.scope]);
            setInside(null);
            break;
          }
          setSelection([]);
          setInside(null);
          setLayersOpen(false);
          break;
        case "nudge":
          if (s.selection.length) edit(nudge(s.doc, s.format, s.selection, action.dx, action.dy));
          break;
        case "duplicate": {
          if (!s.selection.length) break;
          const r = duplicate(s.doc, s.format, s.selection);
          const ids = new Set(r.ids);
          edit({
            ...r.doc,
            layers: layersOf(r.doc).map((l) => (ids.has(l.id) ? onlyOnSize(l, s.format) : l)),
          });
          setSelection(r.ids);
          break;
        }
        case "group":
          if (s.selection.length > 1) edit(groupLayers(s.doc, s.selection).doc);
          break;
        case "ungroup":
          if (s.selection.length) edit(ungroup(s.doc, s.selection));
          break;
        case "copy":
          copySelection();
          break;
        case "cut":
          if (copySelection()) removeSelected(s.selection);
          break;
        case "paste":
          pasteClipboard();
          break;
        case "selectAll":
          setSelection(selectAll(s.doc, s.format));
          setInside(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads live state through stateRef
  }, [edit]);

  const onSave = async () => {
    if (full.setDesign) {
      // A set saves every page, and each needs something on it.
      const blockers = pageList
        .filter((p) => !pageDoc(full, p.id).layers?.length)
        .map((p) => `"${p.label}" has nothing on it yet.`);
      setBlocked(blockers);
      if (blockers.length) return;
    }
    const v2 = sourceFormat === 2 || !!full.setDesign || needsV2(full, kind);
    // A version 1 template keeps version 1's rule: every size has something on it.
    // A draft posts at its own sizes, so the rule is the template's, not the draft's.
    const blockers = v2 || draftMode ? [] : saveBlockers(pageDoc(full, primaryPage(kind)));
    if (v2 && Object.values(full.pages).every((p) => !p?.layers.length)) {
      blockers.push("Add at least one element before saving.");
    }
    setBlocked(blockers);
    if (blockers.length) return;
    setSaveError(null);
    setSaving(true);
    try {
      const t = await host.save(
        baseVersion,
        (full.setDesign
          ? storedSetDocument(full)
          : storedDocument(full, kind, sourceFormat)) as Record<string, unknown>,
      );
      setBaseVersion(t.version);
      setCurrent(t);
      setSavedJson(JSON.stringify(full));
      if (v2) setSourceFormat(2);
      setHistory(createHistory(full));
      setConflict(null);
    } catch (err) {
      const c = conflictOf(err);
      setConflict(c);
      if (!c) setSaveError(errorOf(err) ?? "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const reloadTheirs = async () => {
    const t = await host.reload();
    if (!t) return;
    const next = open(t.document);
    setHistory(createHistory(next.doc));
    setSavedJson(JSON.stringify(next.doc));
    setSourceFormat(next.sourceFormat);
    setBaseVersion(t.version);
    setCurrent(t);
    setConflict(null);
    enterScope(null);
  };

  const onLayout = useCallback((next: LayoutWarning[]) => {
    setWarnings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const shownWarnings: LayoutWarning[] = [
    ...(plan.warning ? [plan.warning] : []),
    ...warnings,
    ...fontFailures.map((f) => ({ reason: "font" as const, size: format, detail: f })),
  ];
  const layerName = (lid: string | undefined) =>
    (lid ? findLayer(pageFull, lid)?.layer.name : undefined) ?? "a text box";
  const keyField = keyFieldOf(pageKind);
  const listPhotoField = (kindFields(pageKind)?.repeats ?? []).some((r) =>
    r.fields.some((f) => isImageRowField(f.key)),
  );
  const path = scopePath(pageFull, scope);

  const stackSelection = () => {
    const r = makeStack(doc, selection, format);
    // Inside a group the new stack sits that many levels deeper.
    const made = r ? findLayer(r.doc, r.id)?.layer : null;
    if (!r || (made && depthOf(made) + path.length > MAX_STACK_DEPTH)) {
      setStackNote("Those layers can't go in a stack: stacks nest at most four deep.");
      return;
    }
    edit(r.doc);
    setSelection([r.id]);
    setPanel("layer");
  };

  const native = packNativeSize(format);
  const panelW = panel ? 340 : 0;
  const areaW = viewport.w - 76 - panelW - 96;
  const areaH = viewport.h - 56 - 56 - 160;
  const fit = Math.min(areaW / native.w, areaH / native.h);
  const boardW = Math.max(160, Math.round(native.w * fit * (zoom / 100)));
  const fitStatus = fitLine(current);
  const status = host.status(baseVersion);
  const selectCls =
    "h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-xs font-semibold text-[var(--ed-ink)]";

  return (
    <div className="studio-editor flex h-screen flex-col overflow-hidden">
      <EditorTopBar
        title={current.name}
        status={status}
        format={format}
        onFormat={(f) => {
          setFormat(f);
          slidesMode?.onSize?.(f);
          setSelection([]);
          setAddPrompt(null);
        }}
        inheritedFormats={[]}
        formatLabel={(f) => {
          // One size for the whole design: flag a size any page has nothing on.
          const empty = pageList.filter((p) => layersOnSize(pageDoc(full, p.id), f).length === 0);
          if (empty.length === 0) return "";
          return pageList.length > 1 && empty.length < pageList.length
            ? ` · ${empty.length} ${empty.length === 1 ? "page" : "pages"} empty`
            : " · empty";
        }}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => {
          setHistory((h) => undo(h));
          setAddPrompt(null);
        }}
        onRedo={() => {
          setHistory((h) => redo(h));
          setAddPrompt(null);
        }}
        dirty={dirty}
        saving={saving}
        onSave={onSave}
        backHref={host.backHref}
        actions={
          <>
            {slidesMode?.actions}
            {typeof actions === "function"
              ? actions({
                  dirty,
                  selectLayer,
                  ...(slidesMode
                    ? {
                        set: {
                          slides: realSlides,
                          current: slide?.key ?? null,
                          size: format,
                          documentFor: (x: EditorSlide) => pageRenderDocument(full, x.page),
                        },
                      }
                    : {}),
                })
              : actions}
            {draftMode?.actions?.({
              document: (full.setDesign
                ? storedSetDocument(full)
                : storedDocument(full, kind, sourceFormat)) as Record<string, unknown>,
              size: format,
              input: shownInput,
              data: shownData,
            })}
            {!slidesMode && !draftMode && isContentKind(pageKind) && (
              <label className="flex items-center gap-1.5 px-1 text-xs font-semibold text-[var(--ed-ink2)]">
                Preset
                <select
                  aria-label="Preset"
                  className={selectCls}
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as ContentPreset)}
                >
                  {CONTENT_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {CONTENT_PRESET_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 px-2 text-xs font-semibold text-[var(--ed-ink2)]">
              <input
                type="checkbox"
                checked={stress}
                onChange={(e) => setStress(e.target.checked)}
                aria-label="Stress test"
              />
              Stress test
            </label>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <EditorRail items={rail} active={panel} onSelect={setPanel} />
        {panel && rail.some((r) => r.id === panel) && (
          <EditorPanel
            title={rail.find((r) => r.id === panel)!.label}
            onCollapse={() => setPanel(null)}
          >
            {draftMode?.panels
              ?.find((p) => p.id === panel)
              ?.render({
                size: format,
                add: addTemplateLayers,
                values,
                page: pageFull,
                setPage: editPage,
              })}
            {panel === "fields" && (
              <FieldsPanel
                kind={pageKind}
                page={page}
                size={format}
                values={values}
                textSelected={single?.kind === "text"}
                onInsert={(key) =>
                  single &&
                  edit(
                    updateLayer(doc, single.id, {
                      content: insertToken(single.content ?? "", key),
                    }),
                  )
                }
                onAdd={(l) => addTemplateLayers([l])}
              />
            )}
            {panel === "text" && <TextPanel size={format} onAdd={(l) => addTemplateLayers([l])} />}
            {panel === "elements" && (
              <ElementsPanel
                size={format}
                onAdd={(l) => addTemplateLayers([l])}
                onAddLayers={addTemplateLayers}
              />
            )}
            {panel === "layer" &&
              (focus ? (
                <LayerDesignPanel
                  layer={focus}
                  kind={pageKind}
                  page={page}
                  onPatch={(patch, done) => {
                    // A drag in the panel (the clip pad) is one change, like a canvas drag.
                    const next = updateDeep(doc, focus.id, patch);
                    if (done === false || gestureBase.current) onCanvasChange(next, done !== false);
                    else edit(next);
                  }}
                  onSelect={(cid) => setFocusId(cid)}
                  onMoveChild={(cid, delta) => edit(moveChild(doc, focus.id, cid, delta))}
                  onUnstack={() => {
                    edit(unstack(doc, focus.id));
                    setSelection([]);
                  }}
                  onPlay={() => setPlaying((n) => n + 1)}
                />
              ) : (
                <div className="space-y-3 text-sm text-[var(--ed-ink2)]">
                  <p>Select a layer to set when it shows, how it fits, its style and motion.</p>
                </div>
              ))}
            {panel === "layer" && selection.length >= 1 && (
              <button
                type="button"
                onClick={stackSelection}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 py-1 text-xs font-semibold"
              >
                <Layers3 className="h-4 w-4" aria-hidden /> Stack these layers
              </button>
            )}
            {panel === "layer" && stackNote && (
              <p role="status" className="mt-2 text-xs text-amber-300">
                {stackNote}
              </p>
            )}
          </EditorPanel>
        )}
        <main
          ref={canvasArea}
          className="relative flex min-w-0 flex-1 flex-col items-center overflow-auto bg-[var(--ed-canvas)] p-6 [align-items:safe_center]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="mb-4 flex max-w-full flex-col items-center">
            <EditorToolbar
              selected={selected}
              isGroup={isGroup}
              fields={pageFields}
              onText={(t) =>
                single && edit(updateLayer(doc, single.id, { content: t, name: t.slice(0, 24) }))
              }
              onColour={(c) => {
                if (!single) return;
                const style =
                  single.kind === "text"
                    ? { ...single.style, color: c }
                    : { ...single.style, background: c };
                edit(updateLayer(doc, single.id, { style }));
              }}
              onLock={() => {
                const lock = !selected.every((l) => l.locked);
                edit(selected.reduce((d, l) => updateLayer(d, l.id, { locked: lock }), doc));
              }}
              onDuplicate={() => {
                const r = duplicate(doc, format, selection);
                const ids = new Set(r.ids);
                edit({
                  ...r.doc,
                  layers: layersOf(r.doc).map((l) => (ids.has(l.id) ? onlyOnSize(l, format) : l)),
                });
                setSelection(r.ids);
              }}
              onDelete={() => removeSelected(selection)}
              onGroup={() => edit(groupLayers(doc, selection).doc)}
              onUngroup={() => edit(ungroup(doc, selection))}
              onReorder={(move) => edit(reorderLayers(doc, selection, move))}
              onCopy={copySelection}
              onPaste={pasteClipboard}
              canPaste={canPaste}
              // A club's save is credited to it; the console has no club to credit.
              onSaveElement={host.club ? () => setSavingElement(true) : undefined}
              page={
                scope === null
                  ? {
                      background: pageFull.background,
                      onBackground: (colour) => {
                        const { background: _old, ...rest } = pageFull;
                        editPage(colour ? { ...rest, background: colour } : rest);
                      },
                      swatches: (() => {
                        const t = resolveCardTokens({ junior: false, data, packId: BLANK_PACK_ID });
                        return { gold: t.accent, panel: t.panel };
                      })(),
                    }
                  : undefined
              }
              arrange={{
                count: unitCount(doc, format, selection, inside),
                onAlign: (to) => edit(align(doc, format, selection, to, inside)),
                onDistribute: (axis) => edit(distribute(doc, format, selection, axis, inside)),
                onMatch: (dim, ref) => edit(matchSize(doc, format, selection, dim, ref, inside)),
              }}
            />
            {host.club && (
              <SaveElementDialog
                layers={selected}
                context={elementSaveContext(
                  data,
                  resolveCardTokens({ junior: false, data, packId: BLANK_PACK_ID }),
                )}
                clubName={data.brand?.name || clubName || "your club"}
                open={savingElement}
                onClose={() => setSavingElement(false)}
              />
            )}
            {single?.kind === "text" && (
              <TextStyleBar
                style={single.style}
                onStyle={(patch) => edit(setTextStyle(doc, single.id, patch))}
              />
            )}
            {single?.kind === "rows" && single.rows && (
              <RowsPanel
                doc={doc}
                layer={single}
                kind={pageKind}
                page={page}
                size={format}
                clubLabel={values["club.short"]}
                onEdit={edit}
              />
            )}
            {single?.kind === "element" && (
              <ElementPropsEditor
                layer={single}
                values={values}
                onProp={(k, v) => edit(setElementProp(doc, single.id, k, v))}
              />
            )}
          </div>

          {addPrompt && (
            <div
              role="dialog"
              aria-label="Add to other sizes"
              className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-3 py-2 text-sm"
            >
              <span>Add to the other sizes too?</span>
              <button
                type="button"
                onClick={acceptAddPrompt}
                className="rounded-full bg-[var(--ed-accent)] px-3 py-1 font-semibold text-[var(--ed-on-accent)]"
              >
                Add to all sizes
              </button>
              <button
                type="button"
                onClick={() => setAddPrompt(null)}
                className="rounded-full px-3 py-1 font-semibold hover:bg-[var(--ed-card)]"
              >
                Just {SIZE_LABEL[addPrompt.from].toLowerCase()}
              </button>
            </div>
          )}

          {linkPrompt && (
            <div
              role="dialog"
              aria-label="Delete on other sizes"
              className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-3 py-2 text-sm"
            >
              <span>The other sizes have their own copy. Delete it on every size?</span>
              <button
                type="button"
                onClick={() => editPage(removeLinked(pageFull, linkPrompt))}
                className="rounded-full bg-[var(--ed-accent)] px-3 py-1 font-semibold text-[var(--ed-on-accent)]"
              >
                Delete on every size
              </button>
              <button
                type="button"
                onClick={() => setLinkPrompt(null)}
                className="rounded-full px-3 py-1 font-semibold hover:bg-[var(--ed-card)]"
              >
                Just {SIZE_LABEL[format].toLowerCase()}
              </button>
            </div>
          )}

          {scopeGroup && (
            <nav
              aria-label="Editing inside"
              className="mb-3 flex max-w-full flex-wrap items-center gap-1 text-xs text-[var(--ed-ink2)]"
            >
              <button
                type="button"
                className="rounded px-1.5 py-0.5 font-semibold hover:bg-[var(--ed-card)]"
                onClick={() => enterScope(null, [path[0]!.id])}
              >
                {cur.label}
              </button>
              {path.map((g, i) => (
                <span key={g.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" aria-hidden />
                  {i < path.length - 1 ? (
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 font-semibold hover:bg-[var(--ed-card)]"
                      onClick={() => enterScope(g.id, [path[i + 1]!.id])}
                    >
                      {scopeName(g)}
                    </button>
                  ) : (
                    <span
                      aria-current="location"
                      className="px-1.5 font-semibold text-[var(--ed-ink)]"
                    >
                      {scopeName(g)}
                    </span>
                  )}
                </span>
              ))}
              <span className="ml-2">
                {inList
                  ? "Editing the first row: every row follows. Esc goes up a level."
                  : "Esc goes up a level."}
              </span>
            </nav>
          )}

          <EditorCanvas
            key={`play-${playing}`}
            doc={doc}
            renderDoc={full.setDesign ? pageRenderDocument(full, cur) : asAdjustments(full)}
            animate={playing > 0}
            size={format}
            width={boardW}
            input={shownInput}
            theme={null}
            data={shownData}
            junior={slide?.junior ?? false}
            packId={BLANK_PACK_ID}
            selection={selection}
            onSelect={(lid) => {
              // A click off every layer clears the selection and leaves a group.
              if (lid === null) enterScope(null);
              else setSelection(selectionFor(doc, lid, inside));
            }}
            onToggle={(lid) => setSelection((s) => toggleSelection(doc, s, lid, inside))}
            marqueeArea={canvasArea}
            onSelectMany={(ids, additive) =>
              setSelection((s) => selectMany(doc, s, ids, inside, additive))
            }
            onEnterGroup={(lid, child, at) => {
              const l = layers.find((x) => x.id === lid);
              if (l && isContainer(l)) {
                // In a list, the cell under the pointer in whichever row was clicked.
                const pick = l.kind === "rows" ? (at ? cellAt(l, format, at) : null) : child;
                enterScope(lid, pick ? [pick] : []);
                return;
              }
              setInside(l?.group ?? null);
              setSelection([lid]);
            }}
            scopeId={scopeGroup?.id ?? null}
            scopeBox={scopeGroup ? boxOf(scopeGroup as FreeLayer, format) : null}
            measure={scopeInStack(pageFull, scope)}
            fixed={isStack(scopeGroup)}
            onChange={onCanvasChange}
            onLayout={onLayout}
            touch
            flagged={warnings.map((w) => w.layerId).filter((x): x is string => !!x)}
          />

          <div className="mt-4 flex w-full max-w-2xl flex-col gap-2 text-sm">
            {!full.setDesign && page !== primaryPage(kind) && !pageFull.layers?.length && (
              <p className="text-[var(--ed-ink2)]">
                The {cur.label.toLowerCase()} is empty. Add fields and elements to design it;
                carousels use it once it has something on it.
              </p>
            )}
            {full.setDesign && !pageFull.layers?.length && (
              <p className="text-[var(--ed-ink2)]">
                This page is empty. Add fields and elements to design it.
              </p>
            )}
            {cur.repeat && slide && (
              <p className="text-[var(--ed-ink2)]">
                Every {SET_SLOT_LABELS[repeatSlotOf(full, cur.id)].toLowerCase()} slide shares this
                design: editing this one edits them all.
              </p>
            )}
            {cur.repeat && !slide && (
              <div className="flex flex-wrap items-center gap-2 text-[var(--ed-ink2)]">
                <span>
                  This page repeats: one slide per{" "}
                  {SET_SLOT_LABELS[repeatSlotOf(full, cur.id)].toLowerCase()}. Editing it edits them
                  all.
                </span>
                <span role="group" aria-label="Sample item" className="flex gap-1">
                  {[0, 1, 2].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={sample === n}
                      onClick={() => setSample(n)}
                      className={
                        sample === n
                          ? "rounded-full bg-[var(--ed-accent)] px-2 py-0.5 text-xs font-semibold text-[var(--ed-on-accent)]"
                          : "rounded-full border border-[var(--ed-line)] px-2 py-0.5 text-xs font-semibold"
                      }
                    >
                      Sample {n + 1}
                    </button>
                  ))}
                </span>
              </div>
            )}
            {plan.slides.length > 1 && (
              <p className="text-[var(--ed-ink2)]">
                Showing slide 1 of {plan.slides.length}: rows that don&apos;t fit go on extra
                slides.
              </p>
            )}
            {!slide && !latest && !stress && (
              <p className="text-[var(--ed-ink2)]">Previewing with sample data.</p>
            )}
            {fitStatus && (
              <p
                role="status"
                className={
                  fitStatus.tone === "bad"
                    ? "text-[var(--ed-danger)]"
                    : fitStatus.tone === "wait"
                      ? "text-amber-300"
                      : "text-[var(--ed-ink2)]"
                }
              >
                {fitStatus.text}
              </p>
            )}
            {pasteNote && (
              <p role="status" className="text-amber-300">
                {pasteNote}
              </p>
            )}
            {layers.filter((l) => l.kind === "photo").length > 1 && (
              <p role="status" className="text-[var(--ed-ink2)]">
                Every Card photo shows the same photo.
                {listPhotoField
                  ? " For a photo per player, select the list and set a cell to show Photo in its settings."
                  : ""}
              </p>
            )}
            {shownWarnings.length > 0 && (
              <ul role="status" aria-label="Needs a look" className="flex flex-col gap-1">
                {shownWarnings.map((w, i) => (
                  <li key={i} className="flex items-center gap-2 text-[var(--ed-danger)]">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    {w.reason === "overflow"
                      ? `Text doesn't fit in ${layerName(w.layerId)} on ${SIZE_LABEL[w.size as CardSize]}, even shrunk.`
                      : w.reason === "font"
                        ? `The font ${w.detail ?? ""} couldn't load; cards would use a fallback.`
                        : `This list needs more than 10 slides on ${SIZE_LABEL[w.size as CardSize]}; the rest won't post. Make the rows smaller.`}
                  </li>
                ))}
              </ul>
            )}
            {page === primaryPage(pageKind) && keyField && !showsKeyField(pageFull, pageKind) && (
              <p role="status" className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                This template no longer shows {keyField.label.toLowerCase()}, so cards won&apos;t
                say who or what they&apos;re about.
              </p>
            )}
            {blocked.map((b) => (
              <p key={b} role="alert" className="text-[var(--ed-danger)]">
                {b}
              </p>
            ))}
            {conflict && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 text-[var(--ed-danger)]"
              >
                <span>
                  Someone else changed this template
                  {conflict.updatedByName ? ` (${conflict.updatedByName})` : ""} after you opened
                  it. Your changes weren&apos;t saved.
                </span>
                <button
                  type="button"
                  onClick={reloadTheirs}
                  className="rounded-full border border-[var(--ed-line)] px-3 py-1 font-semibold text-[var(--ed-ink)]"
                >
                  Load their version
                </button>
              </div>
            )}
            {saveError && (
              <p role="alert" className="text-[var(--ed-danger)]">
                {saveError}
              </p>
            )}
          </div>

          {layersOpen && (
            <LayersDrawer
              layers={layersOnSize(pageFull, format)}
              size={format}
              scope={scope}
              fieldLabels={fieldLabels}
              selection={selection}
              onSelect={(ids, mode, parent) => {
                // A row in another group goes inside that group first.
                if (parent !== scope) {
                  enterScope(parent, ids);
                  return;
                }
                setSelection((s) =>
                  mode === "replace"
                    ? ids
                    : mode === "toggle"
                      ? toggleSelection(doc, s, ids[0], inside)
                      : [...new Set([...s, ...ids])],
                );
              }}
              onToggleHidden={(lid) => {
                const l = findLayer(pageFull, lid)?.layer;
                if (l) editPage(updateDeep(pageFull, lid, { hidden: !l.hidden }));
              }}
              onToggleLocked={(lid) => {
                const l = findLayer(pageFull, lid)?.layer;
                if (l) editPage(updateDeep(pageFull, lid, { locked: !l.locked }));
              }}
              onClose={() => setLayersOpen(false)}
            />
          )}
        </main>
      </div>
      {slidesMode && full.setDesign && (
        <PageStrip
          label="Slides"
          items={realSlides.map((x): StripItem => ({
            id: x.key,
            label: x.label,
            repeat: x.page.role === "repeat",
            warn: layersOnSize(pageDoc(full, x.page.id), format).length === 0,
          }))}
          current={slide?.key ?? ""}
          onSelect={(key) => {
            setSlideKey(key);
            enterScope(null);
            setAddPrompt(null);
          }}
          aspect={native.w / native.h}
          thumb={(item, w) => {
            const x = realSlides.find((r) => r.key === item.id)!;
            return (
              <PackCard
                input={x.input}
                size={format}
                sponsorsOn={x.sponsorsOn}
                junior={x.junior}
                data={x.data}
                packId={BLANK_PACK_ID}
                adjustments={pageRenderDocument(full, x.page)}
                page={x.page.page}
                width={w}
              />
            );
          }}
          onMove={(key, to) =>
            setHistory((h) => {
              const keys = realSlides.map((r) => r.key).filter((k) => k !== key);
              keys.splice(to, 0, key);
              const removed = h.present.setDesign?.arrangement?.removed ?? [];
              return commit(h, withArrangement(h.present, { order: keys, removed }));
            })
          }
          {...(slide?.design
            ? {
                onDuplicate: (key: string) => {
                  const x = realSlides.find((r) => r.key === key);
                  if (!x) return;
                  const r = duplicateSetPage(history.present, x.page.id);
                  setHistory((h) => commit(h, r.doc));
                  setSlideKey(`page:${r.id}`);
                },
              }
            : {})}
          onDelete={(key) => {
            const x = realSlides.find((r) => r.key === key);
            if (!x) return;
            setHistory((h) => {
              const arr = h.present.setDesign?.arrangement ?? { order: [], removed: [] };
              const order = arr.order.filter((k) => k !== key);
              // A design page goes with its slide; a data slide is left out of the post.
              return x.design
                ? commit(h, withArrangement(deleteSetPage(h.present, x.page.id), { ...arr, order }))
                : commit(h, withArrangement(h.present, { order, removed: [...arr.removed, key] }));
            });
            setSlideKey(null);
            enterScope(null);
          }}
          addOptions={[
            {
              id: "blank",
              label: "Blank page",
              // A draft's own pages all draw its card's data (stage 2).
              detail: draftMode
                ? `A page drawn like ${cur.label}`
                : `A page drawn like ${cur.label}, no data`,
            },
            ...(setNow?.arrangement?.removed ?? []).map((key) => ({
              id: `restore:${key}`,
              label: "Restore a deleted slide",
              detail: key.replace(/^detail:[a-z]+:|^page:/, ""),
            })),
          ]}
          onAdd={(option) => {
            if (option.startsWith("restore:")) {
              const key = option.slice("restore:".length);
              setHistory((h) => {
                const arr = h.present.setDesign?.arrangement ?? { order: [], removed: [] };
                return commit(
                  h,
                  withArrangement(h.present, {
                    ...arr,
                    removed: arr.removed.filter((k) => k !== key),
                  }),
                );
              });
              setSlideKey(key);
              return;
            }
            const r = addBlankPage(history.present, cur, cur.id);
            setHistory((h) => commit(h, r.doc));
            setSlideKey(`page:${r.id}`);
            enterScope(null);
          }}
        />
      )}
      {!slidesMode && (full.setDesign || pageList.length > 1) && (
        <PageStrip
          label={full.setDesign ? `${SET_TYPE_LABELS[full.setDesign.type]} pages` : "Pages"}
          items={pageList.map((p): StripItem => ({
            id: p.id,
            label: p.label,
            repeat: p.repeat,
            warn: layersOnSize(pageDoc(full, p.id), format).length === 0,
            note: pageDoc(full, p.id).layers?.length ? undefined : " · empty",
          }))}
          current={cur.id}
          onSelect={(id) => {
            setPageId(id);
            setSample(0);
            enterScope(null);
            setAddPrompt(null);
          }}
          aspect={native.w / native.h}
          thumb={(item, w) => {
            const p = pageList.find((x) => x.id === item.id)!;
            return (
              <PackCard
                input={pageInput(
                  previewSample(p.kind as ShareCardInput["kind"], clubName),
                  p.kind,
                  p.page,
                )}
                size={format}
                sponsorsOn
                junior={p.page === "day"}
                data={data}
                packId={BLANK_PACK_ID}
                adjustments={full.setDesign ? pageRenderDocument(full, p) : asAdjustments(full)}
                page={p.page}
                width={w}
              />
            );
          }}
          {...(full.setDesign
            ? {
                onMove: (id: string, to: number) =>
                  setHistory((h) => commit(h, moveSetPage(h.present, id, to))),
                onDuplicate: (id: string) => {
                  const r = duplicateSetPage(history.present, id);
                  setHistory((h) => commit(h, r.doc));
                  setPageId(r.id);
                  enterScope(null);
                },
                onDelete: (id: string) => {
                  setHistory((h) => commit(h, deleteSetPage(h.present, id)));
                  enterScope(null);
                },
                addOptions: [
                  { id: "blank", label: "Blank page", detail: `A page drawn like ${cur.label}` },
                  ...missingRepeatSlots(full).map((slot) => ({
                    id: `repeat:${slot}`,
                    label: `${SET_SLOT_LABELS[slot]} page`,
                    detail: "Repeats for each item",
                  })),
                  {
                    id: "template",
                    label: "From another template",
                    detail: "Copy a page of one of your templates",
                  },
                ],
                onAdd: (option: string) => {
                  if (option === "template") {
                    setPickingPage(true);
                    return;
                  }
                  const r = option.startsWith("repeat:")
                    ? addRepeatPage(
                        history.present,
                        option.slice("repeat:".length) as Parameters<typeof addRepeatPage>[1],
                        cur.id,
                      )
                    : addBlankPage(history.present, cur, cur.id);
                  setHistory((h) => commit(h, r.doc));
                  setPageId(r.id);
                  enterScope(null);
                },
              }
            : {})}
        />
      )}
      {full.setDesign && (
        <PageFromTemplateDialog
          open={pickingPage}
          onClose={() => setPickingPage(false)}
          onPick={(picked) => {
            const r = addSetPage(
              history.present,
              {
                role: "fixed",
                slot: "page",
                kind: picked.kind,
                page: picked.page,
                name: picked.name,
              },
              picked.layers,
              cur.id,
            );
            setHistory((h) => commit(h, r.doc));
            setPageId(r.id);
            enterScope(null);
          }}
        />
      )}
      <EditorBottomBar
        zoom={zoom}
        onZoom={setZoom}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((o) => !o)}
      />
    </div>
  );
}

/**
 * Every card kind's sample values in one map, first kind first: the template
 * editor's fallback text for a field the design's own kind has no value for.
 */
function allKindSamples(
  data: PackCardData,
  clubName: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kind of TEMPLATE_CARD_KINDS) {
    const values = packFieldValues(
      previewSample(kind as ShareCardInput["kind"], clubName),
      data,
      BLANK_PACK_ID,
    );
    for (const [key, value] of Object.entries(values)) if (value && !out[key]) out[key] = value;
  }
  return out;
}
