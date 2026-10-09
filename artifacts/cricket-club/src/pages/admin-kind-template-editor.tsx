import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, Download, Monitor, Shapes, Type } from "lucide-react";
import {
  getGetKindTemplateQueryKey,
  getListKindTemplatesQueryKey,
  getListSocialDraftsQueryKey,
  useGetKindTemplate,
  useListKindTemplates,
  useListSocialDrafts,
  useSaveKindTemplate,
  useStartKindTemplate,
  type KindTemplate,
  type KindTemplateConflict,
} from "@workspace/api-client-react";
import {
  kindFields,
  planTemplateSlides,
  type LayerDocument,
  type LayoutWarning,
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
import { StarterChooser } from "@/components/studio-editor/starter-chooser";
import { ApplyTemplateDialog } from "@/components/studio-editor/apply-template-dialog";
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
  group as groupLayers,
  layersOf,
  nudge,
  reorderLayers,
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
  starterExport,
} from "@/components/studio-editor/template-ops";
import { usePlatformAdmin } from "@/lib/platform-admin-auth";
import { actionForKey, isTypingTarget } from "@/components/studio-editor/shortcuts";
import { BLANK_PACK_ID, packFieldValues, packNativeSize, type FreeLayer } from "@/lib/pack-render";
import { previewSample, stressSample } from "@/lib/kind-templates/samples";
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
];

const STUDIO = "/admin/social";

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

/** The HTTP status the API client attaches to a failed request. */
const statusOf = (err: unknown): number | undefined => {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
};

const conflictOf = (err: unknown): KindTemplateConflict | null =>
  statusOf(err) === 409 ? ((err as { data?: KindTemplateConflict }).data ?? null) : null;

const notFound = (err: unknown) => statusOf(err) === 404;

/**
 * The card kind template editor (plan U8): an admin designs how every card
 * of one kind looks — Canva-style, on each size, with live data fields —
 * without opening a draft. Saving stores a new version of the club's
 * template; cards made from then on use it, and cards already waiting can be
 * updated in one step.
 */
export default function AdminKindTemplateEditor() {
  const { kind = "" } = useParams<{ kind: string }>();
  const qc = useQueryClient();
  const viewport = useViewport();
  const listQ = useListKindTemplates({ query: { queryKey: getListKindTemplatesQueryKey() } });
  const known = kindFields(kind) !== null;
  const enabled = listQ.data?.enabled === true;
  const templateQ = useGetKindTemplate(kind, {
    query: { queryKey: getGetKindTemplateQueryKey(kind), enabled: known && enabled, retry: false },
  });
  const start = useStartKindTemplate({
    mutation: {
      onSuccess: (t) => {
        qc.setQueryData(getGetKindTemplateQueryKey(kind), t);
        qc.invalidateQueries({ queryKey: getListKindTemplatesQueryKey() });
      },
    },
  });
  const label = kindLabel(kind);
  const { data, clubName } = useKindTemplateData(kind as ShareCardInput["kind"]);

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
  if (!known) return centred(<p>There&apos;s no card called &ldquo;{kind}&rdquo;.</p>);
  if (listQ.isError) return centred(<QueryError onRetry={() => listQ.refetch()} />);
  if (listQ.isLoading) return centred(<LoadingState label="Opening the template…" />);
  if (!enabled) {
    return centred(<p>Card templates aren&apos;t switched on for your club yet.</p>);
  }
  if (templateQ.isLoading) return centred(<LoadingState label="Opening the template…" />);
  if (templateQ.isError && !notFound(templateQ.error)) {
    return centred(<QueryError onRetry={() => templateQ.refetch()} />);
  }
  if (!templateQ.data) {
    return (
      <div className="studio-editor min-h-screen">
        <StarterChooser
          kind={kind}
          label={label}
          input={previewSample(kind as ShareCardInput["kind"], clubName)}
          data={data}
          busy={start.isPending}
          error={start.isError ? "Couldn't start the template. Try again." : null}
          onPick={(starter) => start.mutate({ kind, data: { starter } })}
        />
      </div>
    );
  }
  return (
    <TemplateEditor
      kind={kind}
      label={label}
      template={templateQ.data}
      waiting={listQ.data?.templates.find((t) => t.kind === kind)?.waitingDrafts ?? 0}
      viewport={viewport}
      onReload={() => templateQ.refetch()}
    />
  );
}

function TemplateEditor({
  kind,
  label,
  template,
  waiting,
  viewport,
  onReload,
}: {
  kind: string;
  label: string;
  template: KindTemplate;
  waiting: number;
  viewport: { w: number; h: number };
  onReload: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const cardKind = kind as ShareCardInput["kind"];
  const { data, clubName } = useKindTemplateData(cardKind);

  const initial = (template.document ?? { layers: [] }) as EditorDoc;
  const [history, setHistory] = useState<History<EditorDoc>>(() => createHistory(initial));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [baseVersion, setBaseVersion] = useState(template.version);
  const doc = history.present;
  const dirty = JSON.stringify(doc) !== savedJson;
  const gestureBase = useRef<EditorDoc | null>(null);

  const [format, setFormat] = useState<CardSize>("square");
  const [selection, setSelection] = useState<string[]>([]);
  const [inside, setInside] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(viewport.w >= 1024 ? "fields" : null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [stress, setStress] = useState(false);
  const [addPrompt, setAddPrompt] = useState<{ ids: string[]; from: CardSize } | null>(null);
  const [warnings, setWarnings] = useState<LayoutWarning[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [conflict, setConflict] = useState<KindTemplateConflict | null>(null);
  const [applyFor, setApplyFor] = useState<{ version: number; waiting: number } | null>(null);
  const [fontFailures, setFontFailures] = useState<string[]>([]);
  // Platform admins author the starter designs here (T6.2).
  const platformAdmin = !!usePlatformAdmin().data;
  const exportStarter = () => {
    const blob = new Blob([starterExport(doc)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.starter.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load the faces the document uses, and note any that fail (KTD17).
  const fontKey = JSON.stringify(
    layersOf(doc).map((l) => [l.style?.fontFamily, l.style?.fontWeight, l.rows?.cells]),
  );
  useEffect(() => {
    let live = true;
    ensureDocumentFonts(doc).then((failed) => live && setFontFailures(failed));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts change only with fontKey
  }, [fontKey]);

  // Preview data: the latest real card of this kind, else the sample (R11).
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const latest = useMemo(() => {
    const mine = (draftsQ.data ?? [])
      .filter((d) => draftInput(d)?.kind === kind)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return mine[0] ? draftInput(mine[0]) : null;
  }, [draftsQ.data, kind]);
  const sourceInput = stress
    ? stressSample(cardKind, clubName)
    : (latest ?? previewSample(cardKind, clubName));
  // Lists spill onto extra slides by capacity; the editor shows the first.
  const plan = planTemplateSlides(
    sourceInput as unknown as Record<string, unknown>,
    doc as LayerDocument,
    format,
  );
  const input = plan.slides[0].input as unknown as ShareCardInput;
  const values = packFieldValues(input, data, BLANK_PACK_ID);

  // Any other change closes the add-to-sizes offer, so accepting it can only
  // ever fold into the add it was made for (one undo step).
  const edit = useCallback((next: EditorDoc) => {
    setHistory((h) => commit(h, next));
    setAddPrompt(null);
  }, []);
  const onCanvasChange = (next: EditorDoc, done: boolean) => {
    if (!done) {
      if (!gestureBase.current) gestureBase.current = history.present;
      setHistory((h) => replace(h, next));
      return;
    }
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base) {
      setHistory((h) => commitFrom(h, base, next));
      setAddPrompt(null);
    }
  };

  const layers = layersOnSize(doc, format);
  const selected = layers.filter((l) => selection.includes(l.id));
  const single = selected.length === 1 ? selected[0] : null;
  const isGroup =
    selected.length > 1 && selected.every((l) => l.group && l.group === selected[0].group);

  // Adding an element puts it on this size, then offers the others (R10, KTD16).
  const addTemplateLayers = (added: FreeLayer[]) => {
    const placed = added.map((l) => onlyOnSize(l, format));
    edit({ ...doc, layers: [...layersOf(doc), ...placed] });
    setSelection(placed.map((l) => l.id));
    setAddPrompt({ ids: placed.map((l) => l.id), from: format });
  };
  const acceptAddPrompt = () => {
    if (!addPrompt) return;
    // Folded into the add itself, so one undo removes it from every size.
    setHistory((h) => replace(h, addToOtherSizes(h.present, addPrompt.ids, addPrompt.from)));
    setAddPrompt(null);
  };

  const removeSelected = (ids: string[]) => {
    edit(removeFromSize(doc, ids, format));
    setSelection([]);
  };

  // Keyboard shortcuts (ignored while typing).
  const stateRef = useRef({ doc, selection, format });
  stateRef.current = { doc, selection, format };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = actionForKey(e);
      if (!action) return;
      e.preventDefault();
      const s = stateRef.current;
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
            edit(removeFromSize(s.doc, s.selection, s.format));
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  const save = useSaveKindTemplate();
  const onSave = () => {
    const blockers = saveBlockers(doc);
    setBlocked(blockers);
    if (blockers.length) return;
    save.mutate(
      { kind, data: { baseVersion, document: doc } },
      {
        onSuccess: (t) => {
          setBaseVersion(t.version);
          setSavedJson(JSON.stringify(doc));
          // A save is a checkpoint: undo starts again from here.
          setHistory(createHistory(doc));
          setConflict(null);
          qc.setQueryData(getGetKindTemplateQueryKey(kind), t);
          qc.invalidateQueries({ queryKey: getListKindTemplatesQueryKey() });
          if (t.waitingDrafts > 0) setApplyFor({ version: t.version, waiting: t.waitingDrafts });
        },
        onError: (err) => setConflict(conflictOf(err)),
      },
    );
  };
  const reloadTheirs = async () => {
    const res = (await onReload()) as { data?: KindTemplate };
    const t = res?.data;
    if (!t) return;
    const next = (t.document ?? { layers: [] }) as EditorDoc;
    setHistory(createHistory(next));
    setSavedJson(JSON.stringify(next));
    setBaseVersion(t.version);
    setConflict(null);
    setSelection([]);
  };

  const onLayout = useCallback((next: LayoutWarning[]) => {
    setWarnings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const shownWarnings: LayoutWarning[] = [
    ...(plan.warning ? [plan.warning] : []),
    ...warnings,
    ...fontFailures.map((f) => ({ reason: "font" as const, size: format, detail: f })),
  ];
  const layerName = (id: string | undefined) =>
    layersOf(doc).find((l) => l.id === id)?.name ?? "a text box";
  const keyField = keyFieldOf(kind);

  const native = packNativeSize(format);
  const panelW = panel ? 340 : 0;
  const areaW = viewport.w - 76 - panelW - 96;
  const areaH = viewport.h - 56 - 56 - 160;
  const fit = Math.min(areaW / native.w, areaH / native.h);
  const boardW = Math.max(160, Math.round(native.w * fit * (zoom / 100)));
  const status = (
    <span className="rounded-full bg-[var(--ed-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-ink2)]">
      Template · v{baseVersion}
    </span>
  );

  return (
    <div className="studio-editor flex h-screen flex-col overflow-hidden">
      <EditorTopBar
        title={`${label} template`}
        status={status}
        format={format}
        onFormat={(f) => {
          setFormat(f);
          setSelection([]);
          setAddPrompt(null);
        }}
        inheritedFormats={[]}
        formatLabel={(f) => (layersOnSize(doc, f).length === 0 ? " · empty" : "")}
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
        backHref={STUDIO}
        actions={
          <>
            {platformAdmin && (
              <button
                type="button"
                onClick={exportStarter}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"
              >
                <Download className="h-4 w-4" aria-hidden /> Export as starter
              </button>
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
        <EditorRail items={RAIL} active={panel} onSelect={setPanel} />
        {panel && (
          <EditorPanel
            title={RAIL.find((r) => r.id === panel)!.label}
            onCollapse={() => setPanel(null)}
          >
            {panel === "fields" && (
              <FieldsPanel
                kind={kind}
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
                crestUrl={data.brand?.logoUrl ?? null}
              />
            )}
          </EditorPanel>
        )}
        <main
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
            />
            {single?.kind === "text" && (
              <TextStyleBar
                style={single.style}
                onStyle={(patch) => edit(setTextStyle(doc, single.id, patch))}
              />
            )}
            {single?.kind === "rows" && single.rows && (
              <RowsPanel doc={doc} layer={single} kind={kind} size={format} onEdit={edit} />
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

          <EditorCanvas
            doc={doc}
            size={format}
            width={boardW}
            input={input}
            theme={null}
            data={data}
            packId={BLANK_PACK_ID}
            selection={selection}
            onSelect={(lid) => {
              if (lid === null) {
                setSelection([]);
                setInside(null);
              } else setSelection(selectionFor(doc, lid, inside));
            }}
            onToggle={(lid) => setSelection((s) => toggleSelection(doc, s, lid, inside))}
            onEnterGroup={(lid) => {
              setInside(layers.find((l) => l.id === lid)?.group ?? null);
              setSelection([lid]);
            }}
            onChange={onCanvasChange}
            onLayout={onLayout}
            touch
            flagged={warnings.map((w) => w.layerId).filter((id): id is string => !!id)}
          />

          <div className="mt-4 flex w-full max-w-2xl flex-col gap-2 text-sm">
            {plan.slides.length > 1 && (
              <p className="text-[var(--ed-ink2)]">
                Showing slide 1 of {plan.slides.length}: rows that don&apos;t fit go on extra
                slides.
              </p>
            )}
            {!latest && !stress && (
              <p className="text-[var(--ed-ink2)]">Previewing with sample data.</p>
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
            {keyField && !showsKeyField(doc, kind) && (
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
            {save.isError && !conflict && (
              <p role="alert" className="text-[var(--ed-danger)]">
                Couldn&apos;t save. Try again.
              </p>
            )}
          </div>

          {layersOpen && (
            <LayersDrawer
              layers={layers}
              selection={selection}
              onSelect={(lid) => setSelection([lid])}
              onToggleHidden={(lid) => {
                const l = layers.find((x) => x.id === lid);
                if (l) edit(updateLayer(doc, lid, { hidden: !l.hidden }));
              }}
              onToggleLocked={(lid) => {
                const l = layers.find((x) => x.id === lid);
                if (l) edit(updateLayer(doc, lid, { locked: !l.locked }));
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
        waiting={applyFor?.waiting ?? waiting}
        open={applyFor !== null}
        onClose={() => setApplyFor(null)}
        onApplied={() => {
          qc.invalidateQueries({ queryKey: getListKindTemplatesQueryKey() });
          qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
        }}
      />
    </div>
  );
}
