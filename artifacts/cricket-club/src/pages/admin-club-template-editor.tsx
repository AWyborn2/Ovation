import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Monitor,
  Play,
  Settings2,
  Shapes,
  Type,
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
  isContentKind,
  kindPages,
  normaliseDocument,
  planTemplateSlides,
  templateDocumentErrors,
  worstCaseCard,
  type ContentPreset,
  type FitIssue,
  type LayerDocument,
  type LayoutWarning,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateFitReport,
  type TemplateLayerV2,
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
import { ElementPropsEditor } from "@/components/studio-editor/element-library";
import { LayersDrawer } from "@/components/studio-editor/layers-drawer";
import { FieldsPanel } from "@/components/studio-editor/fields-panel";
import { RowsPanel } from "@/components/studio-editor/rows-panel";
import { TextStyleBar } from "@/components/studio-editor/text-style-bar";
import { ApplyTemplateDialog } from "@/components/studio-editor/apply-template-dialog";
import { LayerSettingsPanel } from "@/components/studio-editor/v2-panels";
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
  duplicate,
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
  layersOnSize,
  onlyOnSize,
  removeFromSize,
  SIZE_LABEL,
} from "@/components/studio-editor/template-ops";
import { align, distribute, matchSize, selectAll, unitCount } from "@/components/studio-editor/arrange";
import { actionForKey, isTypingTarget } from "@/components/studio-editor/shortcuts";
import {
  findLayer,
  pageDoc,
  unwrapGroup,
  updatePageLayer,
  withPage,
  wrapInGroup,
} from "@/components/studio-editor/v2-ops";
import { BLANK_PACK_ID, packFieldValues, packNativeSize, type FreeLayer } from "@/lib/pack-render";
import { previewSample, stressSample } from "@/lib/kind-templates/samples";
import { useKindTemplateData } from "@/lib/kind-templates/use-template-data";
import { draftInput } from "@/components/social-queue/draft-meta";
import { kindLabel } from "@/lib/social-studio";
import { ensureDocumentFonts } from "@/lib/document-fonts";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { TEMPLATE_EDITOR_MIN_WIDTH } from "./admin-kind-template-editor";

const RAIL: RailItem[] = [
  { id: "fields", label: "Fields", icon: Database },
  { id: "text", label: "Text", icon: Type },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "layer", label: "Layer", icon: Settings2 },
];

const LIBRARY = "/admin/social/template-library";

const PAGE_LABEL: Record<PageKey, string> = {
  card: "Card",
  fixture: "Fixture",
  title: "Title",
  day: "Junior day",
  sponsors: "Sponsors",
  result: "Result",
  team: "Team",
};

/** What the preview draws: sample data, stress data, or a content preset's worst case. */
type Preview = "sample" | "stress" | ContentPreset;
const PRESET_LABEL: Record<ContentPreset, string> = {
  minimal: "Minimal",
  standard: "Standard",
  full: "Full",
};

function useViewport(): { w: number; h: number } {
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
/** The API's own message for a refused save (an invalid document), if any. */
const problemOf = (err: unknown): string | null => {
  if (statusOf(err) !== 400) return null;
  const data = (err as { data?: { error?: unknown } }).data;
  return typeof data?.error === "string" ? data.error : null;
};

/** A stored document of `kind` as format v2 (a v1 document reads as its primary page). */
export function asV2(document: unknown, kind: string): TemplateDocumentV2 {
  const { sourceFormat: _source, ...doc } = normaliseDocument(document, kind);
  return doc;
}

/** A fit issue in a sentence. */
function issueText(issue: FitIssue, layerName: (id?: string) => string): string {
  const where = `${PAGE_LABEL[issue.page] ?? issue.page}, ${SIZE_LABEL[issue.size as CardSize] ?? issue.size}`;
  switch (issue.reason) {
    case "overflow":
      return `${where}: text doesn't fit in ${layerName(issue.layerId)}, even shrunk.`;
    case "core-missing":
      return `${where}: nothing shows ${issue.field ?? "a field every card needs"}.`;
    case "rows-capacity":
      return `${where}: the list has no room for a row.`;
    case "rows-overflow":
      return `${where}: the list's rows run outside its box.`;
    case "off-artboard":
      return `${where}: ${layerName(issue.layerId)} sits outside the card.`;
    default:
      return `${where}: ${issue.reason}${issue.detail ? ` (${issue.detail})` : ""}.`;
  }
}

/**
 * Template editor v2 (ADR-011, L5-B): edits one of the club's templates from
 * the library, page by page and size by size, with stack groups, conditions,
 * text fit, styles, motion and vectors. Loads and saves through
 * `/club-templates/:id` (`baseVersion`, 409 when someone saved first), and
 * shows the fit check's result once it has run on the saved version.
 */
export default function AdminClubTemplateEditor() {
  const { id = "" } = useParams<{ id: string }>();
  const templateId = Number(id);
  const valid = Number.isInteger(templateId) && templateId > 0;
  const viewport = useViewport();
  const q = useGetClubTemplate(templateId, {
    query: {
      queryKey: getGetClubTemplateQueryKey(templateId),
      enabled: valid,
      retry: false,
      // While the saved version's fit check runs, look again every few seconds.
      refetchInterval: (query) =>
        (query.state.data as ClubTemplate | undefined)?.fitStatus === "pending" ? 4000 : false,
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
  if (!valid || statusOf(q.error) === 404) return centred(<p>This template isn&apos;t one of your club&apos;s.</p>);
  if (q.isError) return centred(<QueryError onRetry={() => q.refetch()} />);
  if (!q.data) return centred(<LoadingState label="Opening the template…" />);
  return (
    <ClubTemplateEditor
      key={q.data.id}
      template={q.data}
      viewport={viewport}
      onReload={() => q.refetch()}
    />
  );
}

function ClubTemplateEditor({
  template,
  viewport,
  onReload,
}: {
  template: ClubTemplate;
  viewport: { w: number; h: number };
  onReload: () => Promise<{ data?: ClubTemplate }>;
}) {
  const qc = useQueryClient();
  const kind = template.kind;
  const cardKind = kind as ShareCardInput["kind"];
  const label = kindLabel(kind);
  const pages = kindPages(kind);
  const { data, clubName } = useKindTemplateData(cardKind);

  const initial = useMemo(() => asV2(template.document, kind), [template.document, kind]);
  const [history, setHistory] = useState<History<TemplateDocumentV2>>(() => createHistory(initial));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [baseVersion, setBaseVersion] = useState(template.version);
  const doc = history.present;
  const dirty = JSON.stringify(doc) !== savedJson;
  const gestureBase = useRef<TemplateDocumentV2 | null>(null);

  const [page, setPage] = useState<PageKey>(pages[0] ?? "card");
  const [format, setFormat] = useState<CardSize>("square");
  const [selection, setSelection] = useState<string[]>([]);
  const [inside, setInside] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(viewport.w >= 1024 ? "fields" : null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState<Preview>("sample");
  const [animate, setAnimate] = useState(false);
  const [addPrompt, setAddPrompt] = useState<{ ids: string[]; from: CardSize } | null>(null);
  const [warnings, setWarnings] = useState<LayoutWarning[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState<KindTemplateConflict | null>(null);
  const [applyFor, setApplyFor] = useState<{ version: number; waiting: number } | null>(null);
  const [fontFailures, setFontFailures] = useState<string[]>([]);

  // The page being edited, as the document the canvas and the v1 operations edit.
  const pdoc = pageDoc(doc, page);
  const pageLayers = layersOf(pdoc) as unknown as TemplateLayerV2[];

  const fontKey = JSON.stringify(doc).length;
  useEffect(() => {
    let live = true;
    ensureDocumentFonts(pdoc).then((failed) => live && setFontFailures(failed));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts change with the document
  }, [fontKey, page]);

  // Preview data: a real card of this kind, sample or stress data, or a preset's worst case.
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const latest = useMemo(() => {
    const mine = (draftsQ.data ?? [])
      .filter((d) => draftInput(d)?.kind === kind)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return mine[0] ? draftInput(mine[0]) : null;
  }, [draftsQ.data, kind]);
  const contentKind = isContentKind(kind);
  const primary = page === pages[0];
  const presetFor: ContentPreset | null =
    preview === "sample" || preview === "stress"
      ? contentKind && !primary
        ? preview === "stress"
          ? "full"
          : "standard"
        : null
      : preview;
  const sourceInput = presetFor
    ? (worstCaseCard(kind, { page, contentKind: kind, preset: presetFor, photo: true, sponsors: "max", junior: page === "day" })
        .input as unknown as ShareCardInput)
    : preview === "stress"
      ? stressSample(cardKind, clubName)
      : (latest ?? previewSample(cardKind, clubName));
  const plan = planTemplateSlides(
    sourceInput as unknown as Record<string, unknown>,
    pdoc as LayerDocument,
    format,
  );
  const input = plan.slides[0].input as unknown as ShareCardInput;
  const values = packFieldValues(input, data, BLANK_PACK_ID);

  const edit = useCallback((next: TemplateDocumentV2) => {
    setHistory((h) => commit(h, next));
    setAddPrompt(null);
    setNote(null);
  }, []);
  const editPage = (next: EditorDoc) => edit(withPage(history.present, page, next));
  const onCanvasChange = (next: EditorDoc, done: boolean) => {
    const full = withPage(history.present, page, next);
    if (!done) {
      if (!gestureBase.current) gestureBase.current = history.present;
      setHistory((h) => replace(h, full));
      return;
    }
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base) {
      setHistory((h) => commitFrom(h, base, full));
      setAddPrompt(null);
    }
  };

  const layers = layersOnSize(pdoc, format);
  const selected = layers.filter((l) => selection.includes(l.id));
  const single = selected.length === 1 ? selected[0] : null;
  // The selected layer wherever it sits, a group's children included (the settings panel).
  const focus = selection.length === 1 ? findLayer(pageLayers, selection[0]!) : null;
  const isGroup =
    selected.length > 1 && selected.every((l) => l.group && l.group === selected[0].group);

  const addTemplateLayers = (added: FreeLayer[]) => {
    const placed = added.map((l) => onlyOnSize(l, format));
    editPage({ ...pdoc, layers: [...layersOf(pdoc), ...placed] });
    setSelection(placed.map((l) => l.id));
    setAddPrompt({ ids: placed.map((l) => l.id), from: format });
  };
  const acceptAddPrompt = () => {
    if (!addPrompt) return;
    setHistory((h) =>
      replace(h, withPage(h.present, page, addToOtherSizes(pageDoc(h.present, page), addPrompt.ids, addPrompt.from))),
    );
    setAddPrompt(null);
  };

  /** Group: a stack group in v2 (refused past four levels). */
  const groupSelection = (d: EditorDoc, ids: string[]) => {
    const r = wrapInGroup(d, ids);
    if (r.doc === null) {
      setNote(r.reason);
      return;
    }
    editPage(r.doc);
    setSelection([r.id]);
    setPanel("layer");
  };
  /** Ungroup: a stack group spills its children; a v1 selection group just splits. */
  const ungroupSelection = (d: EditorDoc, ids: string[]) => {
    const g = ids.length === 1 ? findLayer(layersOf(d) as unknown as TemplateLayerV2[], ids[0]!) : null;
    if (g?.layer.kind === "group") {
      editPage(unwrapGroup(d, g.layer.id));
      setSelection([]);
    } else editPage(ungroup(d, ids));
  };

  const canvasArea = useRef<HTMLElement>(null);
  const stateRef = useRef({ pdoc, selection, format, inside });
  stateRef.current = { pdoc, selection, format, inside };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = actionForKey(e);
      if (!action || action.type === "copy" || action.type === "cut" || action.type === "paste")
        return;
      const s = stateRef.current;
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
          if (s.selection.length) {
            editPage(removeFromSize(s.pdoc, s.selection, s.format));
            setSelection([]);
          }
          break;
        case "escape":
          setSelection([]);
          setInside(null);
          setLayersOpen(false);
          setAddPrompt(null);
          break;
        case "nudge":
          if (s.selection.length) editPage(nudge(s.pdoc, s.format, s.selection, action.dx, action.dy));
          break;
        case "duplicate": {
          if (!s.selection.length) break;
          const r = duplicate(s.pdoc, s.format, s.selection);
          const ids = new Set(r.ids);
          editPage({
            ...r.doc,
            layers: layersOf(r.doc).map((l) => (ids.has(l.id) ? onlyOnSize(l, s.format) : l)),
          });
          setSelection(r.ids);
          break;
        }
        case "group":
          if (s.selection.length > 1) groupSelection(s.pdoc, s.selection);
          break;
        case "ungroup":
          if (s.selection.length) ungroupSelection(s.pdoc, s.selection);
          break;
        case "selectAll":
          setSelection(selectAll(s.pdoc, s.format));
          setInside(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads live state through stateRef
  }, [page]);

  const save = useSaveClubTemplate();
  const onSave = () => {
    const errors = templateDocumentErrors(doc, kind);
    setProblems(errors.slice(0, 6));
    if (errors.length) return;
    save.mutate(
      { id: template.id, data: { baseVersion, document: doc as unknown as ClubTemplate["document"] } },
      {
        onSuccess: (t) => {
          setBaseVersion(t.version);
          setSavedJson(JSON.stringify(doc));
          setHistory(createHistory(doc));
          setConflict(null);
          qc.setQueryData(getGetClubTemplateQueryKey(template.id), t);
          qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
          if (t.isDefault && t.waitingDrafts > 0)
            setApplyFor({ version: t.version, waiting: t.waitingDrafts });
        },
        onError: (err) => {
          setConflict(conflictOf(err));
          const problem = problemOf(err);
          if (problem) setProblems([problem]);
        },
      },
    );
  };

  const reloadTheirs = async () => {
    const t = (await onReload())?.data;
    if (!t) return;
    const next = asV2(t.document, kind);
    setHistory(createHistory(next));
    setSavedJson(JSON.stringify(next));
    setBaseVersion(t.version);
    setConflict(null);
    setSelection([]);
  };

  // The latest saved state (the query refreshes while its fit check runs).
  const live = (qc.getQueryData(getGetClubTemplateQueryKey(template.id)) as ClubTemplate | undefined) ?? template;
  const fitReport = live.fitReport as TemplateFitReport | null;

  const onLayout = useCallback((next: LayoutWarning[]) => {
    setWarnings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const layerName = (lid: string | undefined) =>
    (lid && findLayer(pageLayers, lid)?.layer.name) || "a text box";
  const shownWarnings: LayoutWarning[] = [
    ...(plan.warning ? [plan.warning] : []),
    ...warnings,
    ...fontFailures.map((f) => ({ reason: "font" as const, size: format, detail: f })),
  ];

  const native = packNativeSize(format);
  const panelW = panel ? 340 : 0;
  const areaW = viewport.w - 76 - panelW - 96;
  const areaH = viewport.h - 56 - 56 - 200;
  const fitScale = Math.min(areaW / native.w, areaH / native.h);
  const boardW = Math.max(160, Math.round(native.w * fitScale * (zoom / 100)));

  const fitChip =
    live.version !== baseVersion || dirty ? null : live.fitStatus === "pending" ? (
      <span className="flex items-center gap-1 rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Checking fit…
      </span>
    ) : live.fitStatus === "pass" ? (
      <span className="flex items-center gap-1 rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Fits every size
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        <AlertTriangle className="h-3 w-3" aria-hidden /> {fitReport?.issues.length ?? 0} fit warnings
      </span>
    );

  return (
    <div className="studio-editor flex h-screen flex-col overflow-hidden">
      <EditorTopBar
        title={template.name || `${label} template`}
        status={
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]">
              {label} · v{baseVersion}
            </span>
            {fitChip}
          </span>
        }
        format={format}
        onFormat={(f) => {
          setFormat(f);
          setSelection([]);
          setAddPrompt(null);
        }}
        inheritedFormats={[]}
        formatLabel={(f) => (layersOnSize(pdoc, f).length === 0 ? " · empty" : "")}
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
        saving={save.isPending}
        onSave={onSave}
        backHref={LIBRARY}
        actions={
          <>
            <label className="flex items-center gap-1.5 px-2 text-xs font-semibold text-[var(--ed-ink2)]">
              Preview
              <select
                aria-label="Preview data"
                className="h-8 rounded-md border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-xs text-[var(--ed-ink)]"
                value={preview}
                onChange={(e) => setPreview(e.target.value as Preview)}
              >
                <option value="sample">{latest && primary ? "Latest card" : "Sample"}</option>
                <option value="stress">Stress test</option>
                {contentKind &&
                  (Object.keys(PRESET_LABEL) as ContentPreset[]).map((p) => (
                    <option key={p} value={p}>
                      {PRESET_LABEL[p]} preset
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              aria-pressed={animate}
              onClick={() => setAnimate((a) => !a)}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"
            >
              <Play className="h-4 w-4" aria-hidden /> {animate ? "Stop motion" : "Play motion"}
            </button>
          </>
        }
      />
      {pages.length > 1 && (
        <nav aria-label="Pages" className="flex gap-1 border-b border-[var(--ed-line)] bg-[var(--ed-panel)] px-4 py-1.5">
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              aria-current={p === page ? "page" : undefined}
              onClick={() => {
                setPage(p);
                setSelection([]);
                setInside(null);
                setAddPrompt(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${p === page ? "bg-[var(--ed-accent)] text-[var(--ed-on-accent)]" : "text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"}`}
            >
              {PAGE_LABEL[p]}
              {(doc.pages[p]?.layers.length ?? 0) === 0 ? " · empty" : ""}
            </button>
          ))}
        </nav>
      )}
      <div className="flex min-h-0 flex-1">
        <EditorRail items={RAIL} active={panel} onSelect={setPanel} />
        {panel && (
          <EditorPanel title={RAIL.find((r) => r.id === panel)!.label} onCollapse={() => setPanel(null)}>
            {panel === "fields" && (
              <FieldsPanel
                kind={kind}
                page={page}
                size={format}
                values={values}
                textSelected={single?.kind === "text"}
                onInsert={(key) =>
                  single &&
                  editPage(updateLayer(pdoc, single.id, { content: insertToken(single.content ?? "", key) }))
                }
                onAdd={(l) => addTemplateLayers([l])}
              />
            )}
            {panel === "text" && <TextPanel size={format} onAdd={(l) => addTemplateLayers([l])} />}
            {panel === "elements" && (
              <ElementsPanel
                size={format}
                onAdd={(l) => addTemplateLayers([l])}
                crestUrl={data.brand?.logoUrl ?? null}
              />
            )}
            {panel === "layer" &&
              (focus ? (
                <LayerSettingsPanel
                  doc={pdoc}
                  layerId={focus.layer.id}
                  kind={kind}
                  page={page}
                  onEdit={editPage}
                  onSelect={(lid) => setSelection([lid])}
                />
              ) : (
                <p className="text-sm text-[var(--ed-ink2)]">
                  Select one layer to set when it shows, its style, its motion, or how a group
                  stacks.
                </p>
              ))}
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
              isGroup={isGroup || (single?.kind as string) === "group"}
              onText={(t) =>
                single && editPage(updateLayer(pdoc, single.id, { content: t, name: t.slice(0, 24) }))
              }
              onColour={(c) => {
                if (!single) return;
                const style =
                  single.kind === "text" ? { ...single.style, color: c } : { ...single.style, background: c };
                editPage(updateLayer(pdoc, single.id, { style }));
              }}
              onLock={() => {
                const lock = !selected.every((l) => l.locked);
                editPage(selected.reduce((d, l) => updateLayer(d, l.id, { locked: lock }), pdoc));
              }}
              onDuplicate={() => {
                const r = duplicate(pdoc, format, selection);
                const ids = new Set(r.ids);
                editPage({
                  ...r.doc,
                  layers: layersOf(r.doc).map((l) => (ids.has(l.id) ? onlyOnSize(l, format) : l)),
                });
                setSelection(r.ids);
              }}
              onDelete={() => {
                editPage(removeFromSize(pdoc, selection, format));
                setSelection([]);
              }}
              onGroup={() => groupSelection(pdoc, selection)}
              onUngroup={() => ungroupSelection(pdoc, selection)}
              onReorder={(move) => editPage(reorderLayers(pdoc, selection, move))}
              onCopy={() => false}
              onPaste={() => {}}
              canPaste={false}
              arrange={{
                count: unitCount(pdoc, format, selection, inside),
                onAlign: (to) => editPage(align(pdoc, format, selection, to, inside)),
                onDistribute: (axis) => editPage(distribute(pdoc, format, selection, axis, inside)),
                onMatch: (dim, ref) => editPage(matchSize(pdoc, format, selection, dim, ref, inside)),
              }}
            />
            {focus?.layer.kind === "text" && (
              <TextStyleBar
                style={focus.layer.style}
                onStyle={(patch) =>
                  editPage(
                    updatePageLayer(pdoc, focus.layer.id, (l) => {
                      const style = { ...(l.style ?? {}), ...patch } as Record<string, unknown>;
                      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete style[k];
                      return { ...l, style } as TemplateLayerV2;
                    }),
                  )
                }
              />
            )}
            {single?.kind === "rows" && single.rows && (
              <RowsPanel doc={pdoc} layer={single} kind={kind} size={format} onEdit={editPage} />
            )}
            {single?.kind === "element" && (
              <ElementPropsEditor
                layer={single}
                values={values}
                onProp={(k, v) => editPage(setElementProp(pdoc, single.id, k, v))}
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

          <EditorCanvas
            doc={pdoc}
            render={{ adjustments: doc as never, page }}
            animate={animate}
            size={format}
            width={boardW}
            input={input}
            theme={null}
            data={data}
            packId={BLANK_PACK_ID}
            junior={page === "day"}
            selection={selection}
            onSelect={(lid) => {
              if (lid === null) {
                setSelection([]);
                setInside(null);
              } else setSelection(selectionFor(pdoc, lid, inside));
            }}
            onToggle={(lid) => setSelection((s) => toggleSelection(pdoc, s, lid, inside))}
            marqueeArea={canvasArea}
            onSelectMany={(ids, additive) => setSelection((s) => selectMany(pdoc, s, ids, inside, additive))}
            onEnterGroup={(lid) => {
              const l = layers.find((x) => x.id === lid);
              // A stack group opens its settings, where its children are listed.
              if ((l?.kind as string) === "group") {
                setSelection([lid]);
                setPanel("layer");
                return;
              }
              setInside(l?.group ?? null);
              setSelection([lid]);
            }}
            onChange={onCanvasChange}
            onLayout={onLayout}
            touch
            flagged={warnings.map((w) => w.layerId).filter((x): x is string => !!x)}
          />

          <div className="mt-4 flex w-full max-w-2xl flex-col gap-2 text-sm">
            {plan.slides.length > 1 && (
              <p className="text-[var(--ed-ink2)]">
                Showing slide 1 of {plan.slides.length}: rows that don&apos;t fit go on extra slides.
              </p>
            )}
            {presetFor && (
              <p className="text-[var(--ed-ink2)]">
                Previewing the {PRESET_LABEL[presetFor]} preset with the longest names and every
                row, as the fit check does.
              </p>
            )}
            {note && (
              <p role="status" className="text-amber-300">
                {note}
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
            {!dirty && live.version === baseVersion && live.fitStatus === "fail" && fitReport && (
              <section aria-label="Fit check" className="rounded-xl border border-[var(--ed-line)] p-3">
                <p className="mb-1 font-semibold">
                  The fit check found {fitReport.issues.length} thing
                  {fitReport.issues.length === 1 ? "" : "s"} to look at across{" "}
                  {fitReport.variants} variants:
                </p>
                <ul className="flex flex-col gap-1 text-[var(--ed-ink2)]">
                  {fitReport.issues.slice(0, 8).map((issue, i) => (
                    <li key={i}>{issueText(issue, layerName)}</li>
                  ))}
                </ul>
                {fitReport.issues.length > 8 && (
                  <p className="mt-1 text-xs text-[var(--ed-ink2)]">…and {fitReport.issues.length - 8} more.</p>
                )}
                <p className="mt-2 text-xs text-[var(--ed-ink2)]">
                  It can&apos;t be your default until these are fixed.
                </p>
              </section>
            )}
            {problems.map((p) => (
              <p key={p} role="alert" className="text-[var(--ed-danger)]">
                {p}
              </p>
            ))}
            {conflict && (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-[var(--ed-danger)]">
                <span>
                  Someone else changed this template
                  {conflict.updatedByName ? ` (${conflict.updatedByName})` : ""} after you opened it.
                  Your changes weren&apos;t saved.
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
            {save.isError && !conflict && problems.length === 0 && (
              <p role="alert" className="text-[var(--ed-danger)]">
                Couldn&apos;t save. Try again.
              </p>
            )}
          </div>

          {layersOpen && (
            <LayersDrawer
              layers={layers}
              selection={selection}
              onSelect={(ids, mode) =>
                setSelection((s) =>
                  mode === "replace"
                    ? ids
                    : mode === "toggle"
                      ? toggleSelection(pdoc, s, ids[0], inside)
                      : [...new Set([...s, ...ids])],
                )
              }
              onToggleHidden={(lid) => {
                const l = layers.find((x) => x.id === lid);
                if (l) editPage(updateLayer(pdoc, lid, { hidden: !l.hidden }));
              }}
              onToggleLocked={(lid) => {
                const l = layers.find((x) => x.id === lid);
                if (l) editPage(updateLayer(pdoc, lid, { locked: !l.locked }));
              }}
              onClose={() => setLayersOpen(false)}
            />
          )}
        </main>
      </div>
      <EditorBottomBar
        zoom={zoom}
        onZoom={setZoom}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((o) => !o)}
      />
      <ApplyTemplateDialog
        kind={kind}
        label={label}
        version={applyFor?.version ?? baseVersion}
        waiting={applyFor?.waiting ?? 0}
        open={applyFor !== null}
        clubTemplateId={template.id}
        onClose={() => setApplyFor(null)}
        onApplied={() => {
          qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
          qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
        }}
      />
    </div>
  );
}

