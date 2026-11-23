import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  FileText,
  ImageUp,
  Layers3,
  Monitor,
  Move,
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
  layerOnSize,
  pageTokens,
  MAX_STACK_DEPTH,
  planTemplateSlides,
  primaryPage,
  SET_TYPE_LABELS,
  sizesToOffer,
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
  TOP_BAR_BUTTON,
  EditorBottomBar,
  EditorPanel,
  EditorRail,
  EditorTopBar,
  readPagesView,
  writePagesView,
  type PagesView,
  type RailItem,
} from "@/components/studio-editor/editor-shell";
import { ElementsPanel, TextPanel } from "@/components/studio-editor/panels";
import {
  EditorToolbar,
  PageColourOptions,
  QuickColours,
  type ToolbarTool,
} from "@/components/studio-editor/toolbar";
import { TokenTextInput } from "@/components/studio-editor/token-text-input";
import { PositionPanel } from "@/components/studio-editor/position-panel";
import { PageScroll } from "@/components/studio-editor/page-scroll";
import { PageOverview } from "@/components/studio-editor/page-grid";
import { useNewStudio } from "@/lib/entitlements";
import { usePlatformAdmin } from "@/lib/platform-admin-auth";
import { InDock } from "@/components/studio-editor/dock";
import {
  boardWidth,
  estimateCanvasArea,
  TOOLBAR_STRIP,
} from "@/components/studio-editor/canvas-fit";
import { SaveElementDialog } from "@/components/studio-editor/save-element-dialog";
import { backgroundDepth } from "@/components/studio-editor/element-insert";
import { elementSaveContext } from "@/components/studio-editor/element-save";
import { ElementPropsEditor } from "@/components/studio-editor/element-library";
import { moveLayerNear } from "@/components/studio-editor/layers-drawer";
import { FieldsPanel } from "@/components/studio-editor/fields-panel";
import {
  isJuniorRule,
  juniorSafeAddedLayers,
  photoRuleFor,
} from "@/components/studio-editor/junior-photos";
import { RowsPanel } from "@/components/studio-editor/rows-panel";
import { TextStyleBar } from "@/components/studio-editor/text-style-bar";
import { ApplyTemplateDialog } from "@/components/studio-editor/apply-template-dialog";
import { LayerDesignPanel } from "@/components/studio-editor/layer-design-panel";
import {
  cleanPosition,
  PhotoPositionSection,
  withLayerPhotoPosition,
  type PhotoPositionControl,
} from "@/components/studio-editor/photo-position";
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
  setBoxes,
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
import {
  PageStrip,
  type StripAddOption,
  type StripItem,
} from "@/components/studio-editor/page-strip";
import { PageFromTemplateDialog } from "@/components/studio-editor/page-from-template";
import {
  addBlankPage,
  addRepeatPage,
  addSetPage,
  blankSetBlockers,
  deleteSetPage,
  deletedSlides,
  deleteSlide,
  duplicateSetPage,
  editorPageList,
  firstPageId,
  singleCardPages,
  isOwnDesignPage,
  missingRepeatSlots,
  moveSetPage,
  openSetTemplate,
  pageRenderDocument,
  slidePhotoPosition,
  storedSetDocument,
  SET_SLOT_LABELS,
  withArrangement,
  withSlideOrder,
  withSlidePhotoPosition,
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
import { draftFormatSizes, olderSizesIn, openingSizeAmong } from "@/lib/offered-sizes";

/** Below this width (a phone) templates aren't edited; tablets and up are (R23). */
export const TEMPLATE_EDITOR_MIN_WIDTH = 768;

/**
 * The rail's own tools. Position (Arrange and Layers) is the one way in to a
 * page's layers; a layer's own settings open from the toolbar's Edit, or from
 * Edit beside it in Position → Layers (Nov 2026: Ash's feedback, one control
 * instead of a Layer item and a Layers button).
 */
const RAIL: RailItem[] = [
  { id: "fields", label: "Fields", icon: Database },
  { id: "text", label: "Text", icon: Type },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "position", label: "Position", icon: Move },
];

/**
 * The panels the toolbar and the page open in the slot beside the rail: a
 * layer's settings, its photo, and the page's own settings.
 */
const EDIT_PANEL = "edit";
const REPLACE_PANEL = "replace";
const PAGE_PANEL = "page";
/**
 * Edit page in the rail: always on show, so there is a route to the page's
 * own settings whatever is selected (a click on the page, Esc and a click
 * off the card open it too).
 */
const PAGE_RAIL_ITEM: RailItem = { id: PAGE_PANEL, label: "Edit page", icon: FileText };
/** The strip's Add a page, as a panel (its menu would open over the canvas). */
const ADD_PAGE_PANEL = "add-page";
/** A page's header row in the Scroll view (px), taken from the room the canvas fits. */
const SCROLL_PAGE_HEADER = 44;
/** The strip's thumbnails are this tall at every size (px). */
const STRIP_THUMB_HEIGHT = 112;
/** Why a set's data slide (one per game) has no Duplicate. */
const GAME_SLIDE_NO_DUPLICATE = "Game slides can't be duplicated";
/** Why the set's other own slides (its title, its sponsors) have none. */
const SET_SLIDE_NO_DUPLICATE = "Only added or blank pages can be duplicated";
/** The side panel a host gives for the photo on show (Change photo). */
export const PHOTO_PANEL = "photo";

const TEMPLATES = "/admin/social/template-library";

/** The top-most shown photo layer among `layers` (bottom first), groups searched too. */
function topPhotoLayer(layers: readonly FreeLayer[], size: CardSize): EditorLayer | null {
  for (const l of [...layers].reverse()) {
    if (l.hidden || !layerOnSize(l, size)) continue;
    if (l.kind === "photo") return l as EditorLayer;
    const kids = (l as EditorLayer).children;
    const inner = kids ? topPhotoLayer(kids as FreeLayer[], size) : null;
    if (inner) return inner;
  }
  return null;
}

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
        size === "square" || size === "portrait" || size === "story" || size === "landscape"
          ? size
          : undefined
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
                  <button type="button" onClick={() => setMaking(true)} className={TOP_BAR_BUTTON}>
                    <Layers3 className="h-4 w-4" aria-hidden /> Make a carousel set
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
                    className={TOP_BAR_BUTTON}
                  >
                    <Upload className="h-4 w-4" aria-hidden /> Publish
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
  /**
   * The older sizes (Square, Landscape) the draft was made in (the server's
   * `olderSizes`): the only older sizes Format offers (round 9 B8).
   */
  olderSizes?: readonly CardSize[];
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
  /**
   * A blank design (a white page started from Create): it has no key field to keep,
   * so the editor doesn't note one missing.
   */
  blank?: boolean;
  /**
   * One slide of a carousel set (studio-create S8): drawn whole, as the set
   * draws it, so its rows never spill onto extra slides here.
   */
  wholeSlide?: boolean;
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
  /** The admin picked another size in Format (the draft saves it, Stage 2). */
  onFormat?: (size: CardSize) => void;
  /**
   * The older sizes (Square, Landscape) the draft was made in (the server's
   * `olderSizes`): the only older sizes Format offers (round 9 B8).
   */
  olderSizes?: readonly CardSize[];
  /** Top-bar controls, given the design as it would be saved and the card on show. */
  actions?: (ctx: {
    document: Record<string, unknown>;
    size: CardSize;
    input: ShareCardInput;
    data: PackCardData;
    /** Open one of the editor's panels in the slot beside the rail. */
    openPanel: (id: string) => void;
  }) => ReactNode;
  /**
   * The page's own settings in Edit page (recolour to brand, the sponsors
   * lock), given the page on show and a whole-page edit.
   */
  pageSettings?: (ctx: { page: EditorDoc; setPage: (next: EditorDoc) => void }) => ReactNode;
};

/**
 * A panel the host adds to the slot beside the rail (Change photo, a slide's
 * Layout). `onPage` also shows it, under its title, in Edit page.
 */
export type EditorSidePanel = {
  id: string;
  title: string;
  body: ReactNode;
  onPage?: boolean;
};

/** What the top bar's own controls can see and do in the editor. */
export type EditorActionsContext = {
  dirty: boolean;
  /** Show `page` and select `layerId` on it, entering its group if it sits in one. */
  selectLayer: (page: string, layerId: string) => void;
  /** Open one of the editor's panels in the slot beside the rail (a side panel's id). */
  openPanel: (id: string) => void;
  /** A set draft's slides as they draw now (read only), for Share → Download. */
  set?: SetShareContext;
  /**
   * A set draft's design as it stands, and an edit to it that goes through
   * history like any other (a slide's own layout, studio-create S9). `show`
   * puts that slide on the canvas.
   */
  setDesign?: {
    doc: EditorTemplateDoc;
    edit: (fn: (doc: EditorTemplateDoc) => EditorTemplateDoc, show?: string) => void;
  };
};

const EMPTY_SIZES: readonly CardSize[] = [];

export function TemplateEditorV2<T extends EditorTemplate>({
  template,
  viewport,
  host,
  slidesMode,
  draftMode,
  initialFormat,
  actions,
  sidePanels,
}: {
  template: T;
  viewport: { w: number; h: number };
  host: EditorHost<T>;
  /**
   * Panels the host adds to the slot beside the rail (Change photo as
   * `PHOTO_PANEL`, a slide's Layout). A photo layer's Replace opens the photo one.
   */
  sidePanels?: (ctx: EditorActionsContext) => EditorSidePanel[];
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
  // A single card or draft (not a set, not a template) lists only the page it
  // draws: a Match Day card never draws its kind's title, day or sponsors page.
  const allPages = editorPageList(full, kind);
  const singleCard = !!draftMode && !slidesMode && !full.setDesign;
  const pageList = singleCard ? singleCardPages(allPages, kind, draftMode.input) : allPages;
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
  // The slides deleted from it, by name (Restore a deleted slide).
  const deletedOnes = useMemo(
    () => (slidesMode && setNow ? deletedSlides(setNow, slidesMode.slides) : []),
    [slidesMode, setNow],
  );
  const [slideKey, setSlideKey] = useState<string | null>(null);
  const slide = realSlides.find((x) => x.key === slideKey) ?? realSlides[0] ?? null;
  // What the page on show may show as its photo: a junior card or set takes
  // only what the club has cleared (ADR-007), so the panels offer only that.
  const photoRule = photoRuleFor({
    slide,
    slides: realSlides,
    input: draftMode?.input as { junior?: unknown } | undefined,
  });
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
  // A draft (a card, a set, one slide of a set) is offered only the sizes its
  // design draws, and of the older sizes only those it was made in (round 9
  // B13, B8). A template keeps Portrait and Story to design in, plus the older
  // sizes it has layers on (KTD15 keeps those it had).
  const editingDraft = !!draftMode || !!slidesMode;
  const madeIn = draftMode?.olderSizes ?? slidesMode?.olderSizes ?? EMPTY_SIZES;
  const draftSizesNow = (doc: EditorTemplateDoc) =>
    draftFormatSizes(
      pageList.map((p) => pageDoc(doc, p.id)),
      madeIn,
    );
  // Where it opens: the size asked for when the design draws it (a draft) or
  // has it (a template), else Portrait (round 9 B12: never an older size by
  // default), else the first size it has.
  const [format, setFormat] = useState<CardSize>(() => {
    const wanted = slidesMode?.size ?? initialFormat;
    const sizes = editingDraft
      ? draftSizesNow(full)
      : sizesToOffer(allPages.map((p) => pageDoc(full, p.id)));
    return openingSizeAmong(sizes, wanted);
  });
  // The design's own sizes (Stage 3): Portrait and Story, plus an older size
  // (Square, Landscape) only where one of its pages already has layers on it.
  const ownSizes = useMemo(
    () => sizesToOffer(allPages.map((p) => pageDoc(full, p.id))),
    [allPages, full],
  );
  // The Format menu for a draft: the sizes its design draws (and the one on show).
  const draftFormats = useMemo(
    () => (editingDraft ? draftSizesNow(full) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingDraft, full, pageList, madeIn],
  );
  // A set keeps its own size in step when it opened somewhere else (its saved
  // size isn't one its design draws), so it saves the size on show.
  const opened0 = useRef(format);
  useEffect(() => {
    if (slidesMode?.size && opened0.current !== slidesMode.size)
      slidesMode.onSize?.(opened0.current);
    // Once, at open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // The one panel slot beside the rail: whatever was opened last (a rail tool,
  // the toolbar's Replace, Edit or Position, or Edit page) replaces it.
  const [panel, setPanel] = useState<string | null>(viewport.w >= 1024 ? "fields" : null);
  // Thumbnails (the canvas and the strip) or Scroll (every page stacked).
  const [pagesView, setPagesViewState] = useState<PagesView>(readPagesView);
  const setPagesView = (v: PagesView) => {
    setPagesViewState(v);
    writePagesView(v);
  };
  const newStudio = useNewStudio();
  // Zoom: "fit" (the default) fits the page to the space the panel and the
  // strip leave, and re-fits as they open, close or the window resizes; a
  // number is a zoom of its own, in percent of the page's real pixels.
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const platformAdmin = usePlatformAdmin();
  const isPlatformAdmin = typeof platformAdmin.data?.id === "number";
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
  const plan = draftMode?.wholeSlide
    ? { slides: [{ key: "single", input: sourceInput, page: 1, of: 1 }], warning: undefined }
    : planTemplateSlides(
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
          addToOtherSizes(level, addPrompt.ids, addPrompt.from, draftFormats ?? ownSizes),
          format,
        ),
      );
    });
    setAddPrompt(null);
  };

  const canvasArea = useRef<HTMLElement>(null);
  // The canvas area's size as laid out, so the canvas fits what the panel and
  // the slide strip leave it (editor/no-overlay-panels).
  const [measuredArea, setMeasuredArea] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = canvasArea.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setMeasuredArea((prev) =>
        !w || !h ? null : prev && prev.w === w && prev.h === h ? prev : { w, h },
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
          // On the page itself, Esc deselects and opens Edit page.
          setSelection([]);
          setInside(null);
          setPanel(PAGE_PANEL);
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

  // Photo position (New Studio): a draft's photo layer moved inside its frame,
  // at the size on show. A set slide drawn by a page other slides share
  // (a team, fixture or result page) keeps its own in the set's arrangement,
  // so only that slide moves; any other page draws one slide, so the layer
  // holds it. A template being designed has none (every card's photo differs).
  const photoPositionFor = (layer: EditorLayer): PhotoPositionControl | undefined => {
    if (layer.kind !== "photo" || !editingDraft) return undefined;
    const size = format;
    const own = layer.photoPosition?.[size] ?? null;
    const shared =
      !!slidesMode &&
      !!slide &&
      !!full.setDesign &&
      (slide.page.role === "repeat" ||
        realSlides.filter((x) => x.page.id === slide.page.id).length > 1);
    if (shared && slide) {
      const key = slide.key;
      return {
        size,
        scope: "slide",
        value: slidePhotoPosition(full, key, layer.id, size) ?? own,
        onChange: (next, done) =>
          editFull(
            (d) =>
              withSlidePhotoPosition(d, key, layer.id, size, next ? cleanPosition(next) : null),
            done !== false,
          ),
      };
    }
    return {
      size,
      scope: slide || draftMode?.wholeSlide ? "slide" : "card",
      value: own,
      onChange: (next, done) => {
        const patch = { photoPosition: withLayerPhotoPosition(layer, size, next) };
        const nextDoc = updateDeep(doc, layer.id, patch);
        if (done === false || gestureBase.current) onCanvasChange(nextDoc, done !== false);
        else edit(nextDoc);
      },
    };
  };
  /** A whole-document edit; `done: false` is part of a drag, recorded as one change at its end. */
  const editFull = (fn: (d: EditorTemplateDoc) => EditorTemplateDoc, done: boolean) => {
    if (!done) {
      if (!gestureBase.current) gestureBase.current = history.present;
      setHistory((h) => replace(h, fn(h.present)));
      return;
    }
    const base = gestureBase.current;
    gestureBase.current = null;
    setHistory((h) => (base ? commitFrom(h, base, fn(h.present)) : commit(h, fn(h.present))));
  };

  const onSave = async () => {
    if (full.setDesign) {
      // A set saves every page, and each needs something on it: say which
      // slide is blank, and show it.
      const { messages, firstSlide } = blankSetBlockers(
        full,
        pageList,
        slidesMode ? realSlides : null,
      );
      setBlocked(messages);
      if (messages.length) {
        if (firstSlide) {
          setSlideKey(firstSlide);
          enterScope(null);
        }
        return;
      }
    }
    const v2 = sourceFormat === 2 || !!full.setDesign || needsV2(full, kind);
    // A version 1 template keeps version 1's rule (KTD15, relaxed in the sizes
    // plan's Stage 4): Portrait and Story have something on them, and so does
    // any older size the version last saved had, so a four-size template can't
    // lose Square or Landscape by accident.
    // A draft posts at its own sizes, so the rule is the template's, not the draft's.
    const primary = primaryPage(kind);
    const lastSaved = JSON.parse(savedJson) as EditorTemplateDoc;
    const blockers =
      v2 || draftMode ? [] : saveBlockers(pageDoc(full, primary), pageDoc(lastSaved, primary));
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
  const keyField = draftMode?.blank ? null : keyFieldOf(pageKind);
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
    setPanel(EDIT_PANEL);
  };

  // The page's pages or slides, as the strip and the Scroll view show them
  // (one list, one set of actions and rules for both).
  const pagesNav: PagesNav | null =
    slidesMode && full.setDesign
      ? {
          label: "Slides",
          items: realSlides.map((x): StripItem => ({
            id: x.key,
            label: x.label,
            repeat: x.page.role === "repeat",
            warn: layersOnSize(pageDoc(full, x.page.id), format).length === 0,
            // A design page duplicates with its page; a data slide has none of its own.
            canDuplicate: x.design,
            ...(x.design
              ? {}
              : {
                  noDuplicateReason:
                    x.page.role === "repeat" ? GAME_SLIDE_NO_DUPLICATE : SET_SLIDE_NO_DUPLICATE,
                }),
          })),
          current: slide?.key ?? "",
          onSelect: (key) => {
            setSlideKey(key);
            enterScope(null);
            setAddPrompt(null);
          },
          thumb: (item, w) => {
            const x = realSlides.find((r) => r.key === item.id)!;
            return (
              <PackCard
                input={x.input}
                size={format}
                sponsorsOn={x.sponsorsOn}
                junior={x.junior}
                data={x.data}
                packId={BLANK_PACK_ID}
                adjustments={pageRenderDocument(full, x.page, x.key)}
                page={x.page.page}
                width={w}
              />
            );
          },
          onMove: (key, to) =>
            setHistory((h) => {
              const keys = realSlides.map((r) => r.key).filter((k) => k !== key);
              keys.splice(to, 0, key);
              // Only the order changes: each slide keeps its own layout (S9).
              return commit(h, withSlideOrder(h.present, keys));
            }),
          onDuplicate: (key) => {
            const x = realSlides.find((r) => r.key === key);
            if (!x?.design) return;
            const r = duplicateSetPage(history.present, x.page.id);
            setHistory((h) => commit(h, r.doc));
            setSlideKey(`page:${r.id}`);
            enterScope(null);
          },
          onDelete: (key) => {
            const x = realSlides.find((r) => r.key === key);
            if (!x) return;
            // A design page goes with its page; a data slide is left out of the
            // post with its own layout (S9), and the other slides keep theirs.
            setHistory((h) => commit(h, deleteSlide(h.present, x)));
            setSlideKey(null);
            enterScope(null);
          },
          addOptions: [
            {
              id: "blank",
              label: "Blank page",
              // A draft's own pages all draw its card's data (stage 2).
              detail: draftMode
                ? `A page drawn like ${cur.label}`
                : `A page drawn like ${cur.label}, no data`,
            },
            // A page of one of the club's templates, as the template editor adds
            // one (retest 6, item K): a design page that draws the club's brand
            // and no card data. On a junior set it comes in junior-safe.
            {
              id: "template",
              label: "From another template",
              detail: "Copy a page of one of your templates",
            },
            ...deletedOnes.map(({ key, label }) => ({
              id: `restore:${key}`,
              label: "Restore a deleted slide",
              // Its name, as its tile had it ("A Grade v Waroona"), not its key.
              detail: label,
            })),
          ],
          onAdd: (option) => {
            if (option === "template") {
              setPickingPage(true);
              return;
            }
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
          },
        }
      : !slidesMode && (full.setDesign || pageList.length > 1)
        ? {
            label: full.setDesign ? `${SET_TYPE_LABELS[full.setDesign.type]} pages` : "Pages",
            items: pageList.map((p): StripItem => ({
              id: p.id,
              label: p.label,
              repeat: p.repeat,
              warn: layersOnSize(pageDoc(full, p.id), format).length === 0,
              note: pageDoc(full, p.id).layers?.length ? undefined : " · empty",
            })),
            current: cur.id,
            onSelect: (id) => {
              setPageId(id);
              setSample(0);
              enterScope(null);
              setAddPrompt(null);
            },
            thumb: (item, w) => {
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
            },
            ...(full.setDesign
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
              : {}),
          }
        : null;
  // Scroll stacks every page down the canvas area; a single card has one page.
  const scrolling = !!pagesNav && pagesView === "scroll";

  const native = packNativeSize(format);
  // The canvas fits the area the panel and the slide strip leave it, as
  // measured; until it's measured, as worked out from the viewport. Nothing
  // docks on the right: every panel opens in the one slot beside the rail.
  const area =
    measuredArea ??
    estimateCanvasArea({ viewport, panelOpen: !!panel, dockOpen: false, stripHeight: 0 });
  // In Scroll each page also has its header row above it.
  const fitW = boardWidth(
    scrolling ? { w: area.w, h: area.h - SCROLL_PAGE_HEADER } : area,
    native,
    100,
  );
  const zoomPercent = zoom === "fit" ? (fitW / native.w) * 100 : zoom;
  const boardW = zoom === "fit" ? fitW : Math.max(120, Math.round((native.w * zoom) / 100));
  const fitStatus = fitLine(current);
  const status = host.status(baseVersion);
  const selectCls =
    "h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-xs font-semibold text-[var(--ed-ink)]";

  // What the top bar's controls and the host's panels can see and do.
  const openPanel = (id: string) => setPanel(id);
  const ctx: EditorActionsContext = {
    dirty,
    selectLayer,
    openPanel,
    ...(slidesMode
      ? {
          set: {
            slides: realSlides,
            current: slide?.key ?? null,
            size: format,
            documentFor: (x: EditorSlide) => pageRenderDocument(full, x.page, x.key),
          },
          setDesign: {
            doc: full,
            edit: (fn: (doc: EditorTemplateDoc) => EditorTemplateDoc, show?: string) => {
              setHistory((h) => commit(h, fn(h.present)));
              if (show !== undefined) setSlideKey(show);
              enterScope(null);
            },
          },
        }
      : {}),
  };
  const sides = sidePanels?.(ctx) ?? [];
  const photoSide = sides.find((s) => s.id === PHOTO_PANEL);

  // A photo layer's Replace: its photo (Change photo) and Photo position.
  const photoLayer = focus?.kind === "photo" ? focus : null;
  const photoPos = photoLayer ? photoPositionFor(photoLayer) : undefined;
  const canReplace = !!photoLayer && (!!photoSide || !!photoPos);
  // The slide-level Change photo (the top bar's, Edit page's) moves the same
  // photo as the layer's Replace: the slide's photo layer, the selected one
  // first, else the top-most on this size.
  const slidePhotoLayer = photoLayer ?? topPhotoLayer(layersOnSize(doc, format), format);
  const slidePhotoPos = slidePhotoLayer ? photoPositionFor(slidePhotoLayer) : undefined;
  const slidePhotoBody = photoSide && (
    <div className="space-y-4">
      {photoSide.body}
      {slidePhotoPos && <PhotoPositionSection control={slidePhotoPos} />}
    </div>
  );
  // A layer's panels follow the selection: Edit page with none, and a layer
  // picked while Edit page is open opens its Edit (the last click wins).
  const selKey = selection.join(" ");
  useEffect(() => {
    setPanel((p) => {
      if (!selKey) return p === EDIT_PANEL || p === REPLACE_PANEL ? PAGE_PANEL : p;
      if (p === PAGE_PANEL) return EDIT_PANEL;
      if (p === REPLACE_PANEL && !canReplace) return EDIT_PANEL;
      return p;
    });
  }, [selKey, canReplace]);

  const kindWord = (l: EditorLayer | null): string =>
    !l
      ? "layers"
      : l.kind === "text"
        ? "text"
        : l.kind === "photo"
          ? "photo"
          : l.kind === "rows"
            ? "list"
            : l.kind === "element"
              ? "element"
              : "layer";
  const panelTitle = (id: string): string | null => {
    const railItem = rail.find((r) => r.id === id);
    if (railItem) return railItem.label;
    if (id === EDIT_PANEL) return `Edit ${kindWord(selected.length > 1 ? null : focus)}`;
    if (id === REPLACE_PANEL) return "Change photo";
    if (id === PAGE_PANEL) return "Edit page";
    if (id === ADD_PAGE_PANEL) return pagesNav?.addOptions?.length ? "Add a page" : null;
    return sides.find((s) => s.id === id)?.title ?? null;
  };
  const shownTitle = panel ? panelTitle(panel) : null;

  // The contextual toolbar's own buttons, by the layer's type.
  const tools: ToolbarTool[] = selected.length
    ? [
        ...(canReplace
          ? [
              {
                id: REPLACE_PANEL,
                label: "Replace",
                icon: ImageUp,
                onClick: () => setPanel(REPLACE_PANEL),
                active: panel === REPLACE_PANEL,
              },
            ]
          : []),
        {
          id: EDIT_PANEL,
          label: "Edit",
          icon: SlidersHorizontal,
          onClick: () => setPanel(EDIT_PANEL),
          active: panel === EDIT_PANEL,
        },
        {
          id: "position",
          label: "Position",
          icon: Move,
          onClick: () => setPanel("position"),
          active: panel === "position",
        },
      ]
    : [];

  /** The box of any layer on the page at the size on show, children included. */
  const boxAt = (l: FreeLayer) => boxOf(l, format);
  const selectedBox =
    selection.length === 1 ? (findLayer(pageFull, selection[0]!)?.layer ?? null) : null;
  const pxBox = single ? boxOf(single as FreeLayer, format) : null;

  const layerList = (
    <PositionPanel
      key={`${cur.id}:${slide?.key ?? ""}`}
      selected={selected.length}
      count={unitCount(doc, format, selection, inside)}
      onReorder={(move) => edit(reorderLayers(doc, selection, move))}
      onAlign={(to) => edit(align(doc, format, selection, to, inside))}
      onDistribute={(axis) => edit(distribute(doc, format, selection, axis, inside))}
      onMatch={(dim, ref) => edit(matchSize(doc, format, selection, dim, ref, inside))}
      box={
        pxBox
          ? {
              x: (pxBox.x / 100) * native.w,
              y: (pxBox.y / 100) * native.h,
              w: (pxBox.w / 100) * native.w,
              h: (pxBox.h / 100) * native.h,
            }
          : null
      }
      locked={!!single?.locked}
      onBox={(px) => {
        if (!single || !pxBox) return;
        edit(
          setBoxes(doc, format, {
            [single.id]: {
              ...pxBox,
              x: (px.x / native.w) * 100,
              y: (px.y / native.h) * 100,
              w: (px.w / native.w) * 100,
              h: (px.h / native.h) * 100,
            },
          }),
        );
      }}
      selectedBox={selectedBox ? boxAt(selectedBox as FreeLayer) : null}
      selectedId={selectedBox?.id ?? null}
      boxOf={boxAt}
      tree={{
        layers: layersOnSize(pageFull, format),
        size: format,
        scope,
        fieldLabels,
        selection,
        onSelect: (ids, mode, parent) => {
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
        },
        onEdit: (lid, parent) => {
          if (parent !== scope) enterScope(parent, [lid]);
          else setSelection([lid]);
          setPanel(EDIT_PANEL);
        },
        onMove: ({ id: lid, parent, target, place }) => {
          if (parent === null) {
            editPage({
              ...pageFull,
              layers: moveLayerNear(layersOf(pageFull), lid, target, place),
            });
            return;
          }
          const group = findLayer(pageFull, parent)?.layer;
          if (!group?.children) return;
          editPage(
            updateDeep(pageFull, parent, {
              children: moveLayerNear(
                group.children as FreeLayer[],
                lid,
                target,
                place,
              ) as EditorLayer[],
            }),
          );
        },
        onToggleHidden: (lid) => {
          const l = findLayer(pageFull, lid)?.layer;
          if (l) editPage(updateDeep(pageFull, lid, { hidden: !l.hidden }));
        },
        onToggleLocked: (lid) => {
          const l = findLayer(pageFull, lid)?.layer;
          if (l) editPage(updateDeep(pageFull, lid, { locked: !l.locked }));
        },
      }}
    />
  );

  const editPanel = (
    <div className="space-y-4">
      {single &&
        (single.kind === "text" || single.kind === "sticker" || single.kind === "medal") &&
        !single.bind && (
          <label className="block space-y-1 text-[11px] font-semibold text-[var(--ed-ink2)]">
            <span>Text</span>
            {single.kind === "text" && pageFields.length > 0 ? (
              <TokenTextInput
                value={single.content ?? ""}
                fields={pageFields}
                onChange={(t) =>
                  edit(updateLayer(doc, single.id, { content: t, name: t.slice(0, 24) }))
                }
                className="h-8 w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]"
              />
            ) : (
              <input
                aria-label="Text"
                value={single.content ?? ""}
                onChange={(e) =>
                  edit(
                    updateLayer(doc, single.id, {
                      content: e.target.value,
                      name: e.target.value.slice(0, 24),
                    }),
                  )
                }
                className="h-8 w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]"
              />
            )}
          </label>
        )}
      {single?.kind === "text" && (
        <TextStyleBar
          style={single.style}
          onStyle={(patch) => edit(setTextStyle(doc, single.id, patch))}
        />
      )}
      {single && (single.kind === "text" || single.kind === "shape") && (
        <section aria-label="Quick colours" className="space-y-1.5">
          <h3 className="text-[11px] font-semibold text-[var(--ed-ink2)]">
            {single.kind === "text" ? "Text colour" : "Fill colour"}
          </h3>
          <QuickColours
            layer={single as FreeLayer}
            size="md"
            onColour={(c) => {
              const style =
                single.kind === "text"
                  ? { ...single.style, color: c }
                  : { ...single.style, background: c };
              edit(updateLayer(doc, single.id, { style }));
            }}
          />
        </section>
      )}
      {single?.kind === "element" && (
        <ElementPropsEditor
          layer={single}
          values={values}
          onProp={(k, v) => edit(setElementProp(doc, single.id, k, v))}
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
      {focus ? (
        <LayerDesignPanel
          layer={focus}
          kind={pageKind}
          page={page}
          photoRule={photoRule}
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
        <p className="text-sm text-[var(--ed-ink2)]">
          {selection.length > 1
            ? "Select one layer to set when it shows, how it fits, its style and motion."
            : "Select a layer to set when it shows, how it fits, its style and motion."}
        </p>
      )}
      {selection.length >= 1 && (
        <button
          type="button"
          onClick={stackSelection}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 py-1 text-xs font-semibold"
        >
          <Layers3 className="h-4 w-4" aria-hidden /> Stack these layers
        </button>
      )}
      {stackNote && (
        <p role="status" className="text-xs text-amber-300">
          {stackNote}
        </p>
      )}
    </div>
  );

  const replacePanel = (
    <div className="space-y-4">
      {photoSide?.body}
      {photoPos && <PhotoPositionSection control={photoPos} />}
    </div>
  );

  const pageTitle = "text-xs font-semibold uppercase tracking-wide text-[var(--ed-ink2)]";
  const pagePanel = (
    <div className="space-y-5">
      <p className="text-sm text-[var(--ed-ink2)]">
        Select a layer to edit it, or add one from the rail.
      </p>
      {scope === null ? (
        <section aria-label="Page colour" className="space-y-1.5">
          <h3 className={pageTitle}>Page colour</h3>
          <PageColourOptions
            background={pageFull.background}
            onBackground={(colour) => {
              const { background: _old, ...rest } = pageFull;
              editPage(colour ? { ...rest, background: colour } : rest);
            }}
            swatches={(() => {
              const t = resolveCardTokens({ junior: false, data, packId: BLANK_PACK_ID });
              return { gold: t.accent, panel: t.panel };
            })()}
          />
        </section>
      ) : (
        <p className="text-sm text-[var(--ed-ink2)]">
          You&apos;re editing inside a group. Press Esc to go back to the page.
        </p>
      )}
      {sides
        .filter((s) => s.onPage)
        .map((s) => (
          <section key={s.id} aria-label={s.title} className="space-y-1.5">
            <h3 className={pageTitle}>{s.title}</h3>
            {s.body}
          </section>
        ))}
      {draftMode?.pageSettings && (
        <section aria-label="Brand" className="space-y-1.5">
          <h3 className={pageTitle}>Brand</h3>
          {draftMode.pageSettings({ page: pageFull, setPage: editPage })}
        </section>
      )}
      {isPlatformAdmin && (
        <section aria-label="Platform tools" className="space-y-1.5">
          <h3 className={pageTitle}>Platform tools</h3>
          <label className="flex items-center gap-2 text-sm text-[var(--ed-ink)]">
            <input
              type="checkbox"
              checked={stress}
              onChange={(e) => setStress(e.target.checked)}
              aria-label="Stress test"
            />
            Stress test (longest names and lists)
          </label>
        </section>
      )}
      <section aria-label="Size" className="space-y-1">
        <h3 className={pageTitle}>Size</h3>
        <p className="text-sm text-[var(--ed-ink2)]">
          {SIZE_LABEL[format]}, {native.w} × {native.h}.
          {(draftFormats ?? ownSizes).length > 1 ? " Change it in Format at the top." : ""}
        </p>
      </section>
    </div>
  );

  const canvasNode = (
    <EditorCanvas
      key={`play-${playing}`}
      doc={doc}
      renderDoc={full.setDesign ? pageRenderDocument(full, cur, slide?.key) : asAdjustments(full)}
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
        // A click off every layer clears the selection, leaves a group and
        // opens Edit page.
        if (lid === null) {
          enterScope(null);
          setPanel(PAGE_PANEL);
        } else setSelection(selectionFor(doc, lid, inside));
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
  );

  const notesNode = (
    <div className="mt-4 flex w-full max-w-2xl flex-col gap-2 text-sm">
      {!full.setDesign && page !== primaryPage(kind) && !pageFull.layers?.length && (
        <p className="text-[var(--ed-ink2)]">
          The {cur.label.toLowerCase()} is empty. Add fields and elements to design it; carousels
          use it once it has something on it.
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
            {SET_SLOT_LABELS[repeatSlotOf(full, cur.id)].toLowerCase()}. Editing it edits them all.
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
          Showing slide 1 of {plan.slides.length}: rows that don&apos;t fit go on extra slides.
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
      {page === primaryPage(pageKind) &&
        keyField &&
        // A page of its own (Add page) shows no card's data, so it has none to lose.
        !(full.setDesign && isOwnDesignPage(full, cur.id)) &&
        !showsKeyField(pageFull, pageKind) && (
          <p role="status" className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            This template no longer shows {keyField.label.toLowerCase()}, so cards won&apos;t say
            who or what they&apos;re about.
          </p>
        )}
      {blocked.map((b) => (
        <p key={b} role="alert" className="text-[var(--ed-danger)]">
          {b}
        </p>
      ))}
      {conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-[var(--ed-danger)]">
          <span>
            Someone else changed this template
            {conflict.updatedByName ? ` (${conflict.updatedByName})` : ""} after you opened it. Your
            changes weren&apos;t saved.
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
  );

  return (
    <div className="studio-editor flex h-screen flex-col overflow-hidden">
      <EditorTopBar
        title={current.name}
        status={status}
        format={format}
        onFormat={(f) => {
          setFormat(f);
          slidesMode?.onSize?.(f);
          draftMode?.onFormat?.(f);
          setSelection([]);
          setAddPrompt(null);
        }}
        olderFormats={olderSizesIn(ownSizes)}
        formats={draftFormats}
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
            {typeof actions === "function" ? actions(ctx) : actions}
            {draftMode?.actions?.({
              document: (full.setDesign
                ? storedSetDocument(full)
                : storedDocument(full, kind, sourceFormat)) as Record<string, unknown>,
              size: format,
              input: shownInput,
              data: shownData,
              openPanel,
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
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <EditorRail
          items={[PAGE_RAIL_ITEM, ...rail]}
          active={panel}
          onSelect={(id) => {
            // Edit page is always one click away: it deselects and leaves any group.
            if (id === PAGE_PANEL) enterScope(null);
            setPanel(id);
          }}
        />
        {panel && shownTitle && (
          <EditorPanel
            id={panel}
            title={shownTitle}
            closeIcon="x"
            onCollapse={() => setPanel(null)}
          >
            <InDock>
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
                  photoRule={photoRule}
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
              {panel === "text" && (
                <TextPanel size={format} onAdd={(l) => addTemplateLayers([l])} />
              )}
              {panel === "elements" && (
                <ElementsPanel
                  size={format}
                  onAdd={(l) => addTemplateLayers([l])}
                  onAddLayers={addTemplateLayers}
                />
              )}
              {panel === "position" && layerList}
              {panel === EDIT_PANEL && editPanel}
              {panel === REPLACE_PANEL && replacePanel}
              {panel === PAGE_PANEL && pagePanel}
              {panel === PHOTO_PANEL ? slidePhotoBody : sides.find((s) => s.id === panel)?.body}
              {panel === ADD_PAGE_PANEL && pagesNav?.addOptions && pagesNav.onAdd && (
                <div role="group" aria-label="Add a page" className="space-y-1">
                  {pagesNav.addOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--ed-card)]"
                      onClick={() => {
                        setPanel(null);
                        pagesNav.onAdd!(o.id);
                      }}
                    >
                      <span className="font-semibold">{o.label}</span>
                      {o.detail && (
                        <span className="block text-xs text-[var(--ed-ink2)]">{o.detail}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </InDock>
          </EditorPanel>
        )}
        <main
          ref={canvasArea}
          data-testid="canvas-area"
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--ed-canvas)]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {/* Above the canvas, never on it: the toolbar, prompts and where you are.
            At least the strip's height, so a change of selection never moves the canvas. */}
          <div
            data-testid="toolbar-strip"
            data-canvas-empty
            className="flex shrink-0 flex-col items-center px-6 pt-3"
            style={{ minHeight: TOOLBAR_STRIP }}
          >
            <div className="mb-2 flex max-w-full flex-col items-center">
              <EditorToolbar
                selected={selected}
                isGroup={isGroup}
                fields={pageFields}
                tools={tools}
                hint={false}
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
                onCopy={copySelection}
                onPaste={pasteClipboard}
                canPaste={canPaste}
                // A club's save is credited to it; the console has no club to credit.
                onSaveElement={host.club ? () => setSavingElement(true) : undefined}
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
            </div>

            {addPrompt && (!draftFormats || draftFormats.length > 1) && (
              <div
                role="dialog"
                aria-label="Add to other sizes"
                className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-3 py-2 text-sm"
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
                className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-3 py-2 text-sm"
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
          </div>

          {/* The canvas, centred both ways in the space the panel leaves, with
            the same padding on every side; its notes sit under it without
            moving it off centre. */}
          <div
            data-testid="canvas-scroll"
            data-canvas-empty
            className="min-h-0 flex-1 overflow-auto px-6"
            // The band under the canvas matches the toolbar strip above it.
            style={{ paddingBottom: TOOLBAR_STRIP }}
          >
            {scrolling && pagesNav ? (
              <PageScroll
                label={pagesNav.label}
                items={pagesNav.items}
                current={pagesNav.current}
                onSelect={pagesNav.onSelect}
                onMove={pagesNav.onMove}
                onDuplicate={pagesNav.onDuplicate}
                onDelete={pagesNav.onDelete}
                addOptions={pagesNav.addOptions}
                onAdd={pagesNav.onAdd}
                page={(item, on) =>
                  on ? (
                    <div className="flex flex-col items-center">
                      {canvasNode}
                      {notesNode}
                    </div>
                  ) : (
                    <div style={{ width: boardW }} data-testid={`scroll-preview-${item.id}`}>
                      {pagesNav.thumb(item, boardW)}
                    </div>
                  )
                }
              />
            ) : (
              <div
                data-testid="canvas-stage"
                data-canvas-empty
                className="grid min-h-full min-w-max grid-rows-[1fr_auto_1fr] justify-items-center"
              >
                <span aria-hidden data-canvas-empty className="w-full" />
                <div data-testid="canvas-centre">{canvasNode}</div>
                {/* No height of its own: the notes hang below the canvas in the
                  space under it, so they never push the canvas off centre or
                  change its fit. */}
                <div className="h-0 w-full self-start" data-testid="canvas-notes" data-canvas-empty>
                  <div className="flex w-full justify-center" data-canvas-empty>
                    {notesNode}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {pagesNav && !scrolling && (
        <PageStrip
          label={pagesNav.label}
          items={pagesNav.items}
          current={pagesNav.current}
          onSelect={pagesNav.onSelect}
          aspect={native.w / native.h}
          thumb={pagesNav.thumb}
          onMove={pagesNav.onMove}
          onDuplicate={pagesNav.onDuplicate}
          onDelete={pagesNav.onDelete}
          addOptions={pagesNav.addOptions}
          onAdd={pagesNav.onAdd}
          onAddOpen={() => setPanel(ADD_PAGE_PANEL)}
          overview={false}
          centred
          // One height for every size, so Story's thumbnails don't take more of the canvas's room.
          thumbWidth={Math.round((STRIP_THUMB_HEIGHT * native.w) / native.h)}
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
              // A junior set's page keeps no stored image and no photo source
              // (ADR-007): it draws the club's brand and approved stock only.
              isJuniorRule(photoRule) ? juniorSafeAddedLayers(picked.layers) : picked.layers,
              cur.id,
            );
            setHistory((h) => commit(h, r.doc));
            if (slidesMode) setSlideKey(`page:${r.id}`);
            else setPageId(r.id);
            enterScope(null);
          }}
        />
      )}
      <EditorBottomBar
        zoom={zoomPercent}
        onZoom={setZoom}
        zoomMin={10}
        zoomMax={200}
        fitted={zoom === "fit"}
        onFit={() => setZoom("fit")}
        {...(pagesNav
          ? {
              pagesView,
              onPagesView: setPagesView,
              pageCount: newStudio ? (
                <PageOverview
                  className=""
                  items={pagesNav.items}
                  current={pagesNav.current}
                  onSelect={pagesNav.onSelect}
                  thumb={pagesNav.thumb}
                  aspect={native.w / native.h}
                  onMove={pagesNav.onMove}
                  onDelete={pagesNav.onDelete}
                  label={pagesNav.label}
                />
              ) : (
                <span
                  className="text-xs font-semibold tabular-nums text-[var(--ed-ink2)]"
                  aria-live="polite"
                >
                  {Math.max(
                    0,
                    pagesNav.items.findIndex((i) => i.id === pagesNav.current),
                  ) + 1}{" "}
                  / {pagesNav.items.length}
                </span>
              ),
            }
          : {})}
      />
    </div>
  );
}

/** The pages of a design, as the strip and the Scroll view show and change them. */
type PagesNav = {
  label: string;
  items: StripItem[];
  current: string;
  onSelect: (id: string) => void;
  thumb: (item: StripItem, width: number) => ReactNode;
  onMove?: (id: string, to: number) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  addOptions?: StripAddOption[];
  onAdd?: (option: string) => void;
};

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
