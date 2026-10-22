import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Image as ImageIcon,
  Monitor,
  Palette,
  Radio,
  Shapes,
  Trophy,
  Type,
  Upload,
  Users,
} from "lucide-react";
import {
  useListSocialDrafts,
  getListSocialDraftsQueryKey,
  useUpdateSocialDraft,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListCardThemes,
  getListCardThemesQueryKey,
  useListCardTemplates,
  getListCardTemplatesQueryKey,
  type CardTemplate,
  type CardTheme as ApiCardTheme,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import { LoadingState, QueryError } from "@/components/data-states";
import { StatusPill } from "@/components/admin-ui";
import { EditorCanvas } from "@/components/studio-editor/canvas";
import {
  EditorBottomBar,
  EditorPanel,
  EditorRail,
  EditorTopBar,
  type RailItem,
} from "@/components/studio-editor/editor-shell";
import { ContentPanel, ElementsPanel, TextPanel } from "@/components/studio-editor/panels";
import {
  BrandPanel,
  CricketPanel,
  LiveStatsPanel,
  PhotosPanel,
  matchDayFixtureId,
  PlayersPanel,
  UploadsPanel,
} from "@/components/studio-editor/content-panels";
import { recolourToBrand, setSponsorLock } from "@/components/studio-editor/content";
import { EditorToolbar } from "@/components/studio-editor/toolbar";
import { ElementPropsEditor } from "@/components/studio-editor/element-library";
import { LayersDrawer } from "@/components/studio-editor/layers-drawer";
import { DownloadMenu } from "@/components/studio-editor/export/download-menu";
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
  addLayer,
  addLayers,
  duplicate,
  group as groupLayers,
  isSponsorElement,
  layersOf,
  nudge,
  removeLayers,
  reorderLayers,
  selectMany,
  selectionFor,
  setElementProp,
  setField,
  setImage,
  setPhoto,
  toggleHidden,
  toggleSelection,
  ungroup,
  updateLayer,
  type EditorDoc,
} from "@/components/studio-editor/document";
import { actionForKey, isTypingTarget } from "@/components/studio-editor/shortcuts";
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
  type ClipboardMode,
} from "@/components/studio-editor/clipboard";
import {
  inheritedFormats,
  packFieldValues,
  packImageSlots,
  packNativeSize,
  packTextFields,
  photoFor,
  resolveCardTokens,
  slideAdjustments,
  withSlideAdjustments,
  type CardAdjustments,
  type FreeLayer,
} from "@/lib/pack-render";
import { isJuniorSlide, isSetKind, slidesForSize, type PlannedSlide } from "@/lib/card-sets/plan";
import { planTemplateSlides, type LayerDocument } from "@workspace/scorecard/kind-templates";
import { CardSetStrip } from "@/components/card-sets/card-set-strip";
import { SetOptionsBar } from "@/components/card-sets/set-options";
import { clubKitPaletteFor, clubKitVars } from "@/lib/pack-render/club-kit-vars";
import { resolvePackIdForKind } from "@/lib/card-template";
import { renderablePackId } from "@/lib/pack-templates/registry";
import { useBrand } from "@/lib/brand-context";
import {
  withGroundPhoto,
  buildPackData,
  kindSponsors,
  cardGrade,
  presentingSponsorName,
  tenantHashtag,
} from "@/lib/pack-card-data";
import {
  STATUS_LABEL,
  STATUS_TONE,
  draftHeading,
  draftInput,
  draftStatus,
} from "@/components/social-queue/draft-meta";
import { cardBaseFilename, type CardSize } from "@/lib/share-card";

/** Below this width the editor shows the card with a larger-screen notice. */
export const EDITOR_MIN_WIDTH = 1024;

const RAIL: RailItem[] = [
  { id: "content", label: "Content", icon: FileText },
  { id: "text", label: "Text", icon: Type },
  { id: "elements", label: "Elements", icon: Shapes },
  { id: "cricket", label: "Cricket", icon: Trophy },
  { id: "players", label: "Players", icon: Users },
  { id: "photos", label: "Photos", icon: ImageIcon },
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "live", label: "Live stats", icon: Radio },
  { id: "brand", label: "Brand", icon: Palette },
];

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

/**
 * The Studio editor (Social Studio U16): opens a queue draft full-screen,
 * edits its adjustments (U15) with undo/redo, and saves them as one revision.
 */
export default function AdminStudioEditor() {
  const { id } = useParams<{ id: string }>();
  const draftId = Number(id);
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const draft = (draftsQ.data ?? []).find((d) => d.id === draftId) ?? null;

  if (draftsQ.isError) {
    return (
      <div className="studio-editor grid min-h-screen place-items-center">
        <QueryError onRetry={() => draftsQ.refetch()} />
      </div>
    );
  }
  if (draftsQ.isLoading) {
    return (
      <div className="studio-editor grid min-h-screen place-items-center">
        <LoadingState label="Opening the editor…" />
      </div>
    );
  }
  if (!draft || !draftInput(draft)) {
    return (
      <div className="studio-editor grid min-h-screen place-items-center text-center">
        <p>That card could not be found. It may have been removed.</p>
      </div>
    );
  }
  return <EditorApp key={draft.id} draftId={draft.id} />;
}

function EditorApp({ draftId }: { draftId: number }) {
  const qc = useQueryClient();
  const brand = useBrand();
  const viewport = useViewportWidth();
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const draft = (draftsQ.data ?? []).find((d) => d.id === draftId)!;
  const input = draftInput(draft)!;

  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;
  const themesQ = useListCardThemes({ query: { queryKey: getListCardThemesQueryKey() } });
  const themes = (themesQ.data ?? []) as ApiCardTheme[];
  const theme = themes.find((t) => t.isDefault) ?? themes[0] ?? null;
  const templatesQ = useListCardTemplates({ query: { queryKey: getListCardTemplatesQueryKey() } });
  // A draft saved with a hidden legacy pack (P9) edits as Club Kit.
  const packId = renderablePackId(
    draft.packId ?? resolvePackIdForKind(templatesQ.data as CardTemplate[] | undefined, input.kind),
  );

  // A team list carries its team's own sponsor.
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

  const saved = (draft.adjustments ?? {}) as CardAdjustments;
  const [history, setHistory] = useState<History<EditorDoc>>(() => createHistory(saved));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(saved));
  const gestureBase = useRef<EditorDoc | null>(null);
  // The root document: the card's own edits plus, for a balanced set, each
  // slide's edits (`slides`) and the set's options (`set`).
  const rootDoc = history.present;
  const dirty = JSON.stringify(rootDoc) !== savedJson;

  const [format, setFormat] = useState<CardSize>("square");
  // Balanced card sets (plan 2026-10-01-001): the slides this card posts as
  // at the current format, and the one being edited.
  // A templated draft is one design on every slide, its list split by the
  // design's own row capacity exactly as the server renders it (KTD6, KTD13).
  const templated = draft.templateVersion != null;
  const slides = useMemo<PlannedSlide[]>(
    () =>
      templated
        ? planTemplateSlides(
            input as unknown as Record<string, unknown>,
            rootDoc as LayerDocument,
            format,
          ).slides.map((s) => ({ ...s, role: "single" }) as unknown as PlannedSlide)
        : slidesForSize(input, format, rootDoc.set),
    [templated, input, format, rootDoc],
  );
  const [slideKey, setSlideKey] = useState("single");
  const slide = slides.find((s) => s.key === slideKey) ?? slides[0]!;
  const slideKeyRef = useRef(slide.key);
  // Edits to a templated draft always land on its one design.
  slideKeyRef.current = templated ? "single" : slide.key;
  const doc: EditorDoc = templated ? rootDoc : (slideAdjustments(rootDoc, slide.key) ?? {});
  const slideInput = slide.input;
  const slideJunior = isJuniorSlide(slide, false);
  const [selection, setSelection] = useState<string[]>([]);
  const [inside, setInside] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>("content");
  const [layersOpen, setLayersOpen] = useState(false);
  const [zoom, setZoom] = useState(100);

  // Every edit lands on the active slide's adjustments inside the root.
  const edit = useCallback(
    (next: EditorDoc) =>
      setHistory((h) => commit(h, withSlideAdjustments(h.present, slideKeyRef.current, next))),
    [],
  );
  const onCanvasChange = (next: EditorDoc, done: boolean) => {
    const key = slideKeyRef.current;
    if (!done) {
      if (!gestureBase.current) gestureBase.current = history.present;
      setHistory((h) => replace(h, withSlideAdjustments(h.present, key, next)));
      return;
    }
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base) setHistory((h) => commitFrom(h, base, withSlideAdjustments(base, key, next)));
  };
  const setSetOptions = (set: NonNullable<CardAdjustments["set"]>) =>
    setHistory((h) => commit(h, { ...h.present, set: { ...h.present.set, ...set } }));

  const update = useUpdateSocialDraft({
    mutation: {
      onSuccess: () => {
        setSavedJson(JSON.stringify(rootDoc));
        qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
      },
    },
  });
  const save = () => update.mutate({ id: draftId, data: { adjustments: rootDoc } });

  const layers = layersOf(doc);
  const selected = layers.filter((l) => selection.includes(l.id));
  const isGroup =
    selected.length > 1 && selected.every((l) => l.group && l.group === selected[0].group);

  // Copy and paste (studio-editor-multiselect). A draft made from a template
  // shares the template clipboard (same layers, same fields); other drafts
  // have their own.
  const clipMode: ClipboardMode = templated ? "template" : "draft";
  const [canPaste, setCanPaste] = useState(() => readClipboard(clipMode) !== null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  // Keyboard shortcuts (ignored while typing in an input).
  // The canvas around the card, where a drag starts a marquee.
  const canvasArea = useRef<HTMLElement>(null);
  const stateRef = useRef({ doc, selection, format, inside });
  stateRef.current = { doc, selection, format, inside };
  const copySelection = () => {
    const s = stateRef.current;
    const clip = copyLayers(s.doc, s.format, s.selection, clipMode);
    if (!clip) return false;
    writeClipboard(clip);
    setCanPaste(true);
    return true;
  };
  const pasteClipboard = () => {
    const clip = readClipboard(clipMode);
    const s = stateRef.current;
    if (!clip) return;
    const r = pasteLayers(s.doc, clip, s.format, templated ? { kind: input.kind } : {});
    if (r.ids.length) {
      edit(r.doc);
      setSelection(r.ids);
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
      // With nothing to copy or paste, the browser's own copy and paste still work.
      if ((action.type === "copy" || action.type === "cut") && !s.selection.length) return;
      if (action.type === "paste" && !readClipboard(clipMode)) return;
      e.preventDefault();
      switch (action.type) {
        case "undo":
          setHistory((h) => undo(h));
          break;
        case "redo":
          setHistory((h) => redo(h));
          break;
        case "delete":
          if (s.selection.length) {
            edit(removeLayers(s.doc, s.selection));
            setSelection([]);
          }
          break;
        case "escape":
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
          edit(r.doc);
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
          if (copySelection()) {
            edit(removeLayers(s.doc, s.selection));
            setSelection([]);
          }
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

  const addFreeLayer = (layer: FreeLayer) => {
    edit(addLayer(doc, layer));
    setSelection([layer.id]);
  };
  const addGroup = (group: FreeLayer[]) => {
    edit(addLayers(doc, group));
    setSelection(group.map((l) => l.id));
  };
  // The tenant's own colours, for recolour-to-brand.
  const palette = [
    bundle?.brand?.primaryColour ?? brand.primaryColour,
    bundle?.brand?.backgroundColour ?? brand.backgroundColour,
  ].filter((c): c is string => !!c);
  // A junior slide keeps its photo only behind the server's positive marker (ADR-007).
  const slideData =
    slideJunior && (slideInput as { juniorPhotoAllowed?: boolean }).juniorPhotoAllowed !== true
      ? { ...data, photoUrl: undefined }
      : data;
  const fieldValues = packFieldValues(slideInput, slideData, packId);
  // The club's Club Kit palette, for the element library's thumbnails.
  const elementPalette = clubKitVars(
    clubKitPaletteFor(resolveCardTokens({ theme, junior: slideJunior, data, packId }), data?.brand),
  );

  const native = packNativeSize(format);
  const title = draftHeading(draft);
  const status = draftStatus(draft);
  const statusPill = <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>;

  if (viewport < EDITOR_MIN_WIDTH) {
    return (
      <div className="studio-editor flex min-h-screen flex-col items-center gap-5 p-6 text-center">
        <p className="flex items-center gap-2 text-sm text-[var(--ed-ink2)]">
          <Monitor className="h-4 w-4" aria-hidden /> Open the editor on a larger screen to edit
          this card.
        </p>
        <div className="w-full max-w-sm">
          <PackCard
            input={input}
            size="square"
            sponsorsOn
            junior={false}
            theme={theme}
            data={data}
            packId={packId}
            adjustments={doc}
          />
        </div>
      </div>
    );
  }

  // Fit the artboard into the canvas area, then apply zoom.
  const panelW = panel ? 340 : 0;
  const areaW = viewport - 76 - panelW - 96;
  const areaH = (typeof window === "undefined" ? 900 : window.innerHeight) - 56 - 56 - 140;
  const fit = Math.min(areaW / native.w, areaH / native.h);
  const boardW = Math.max(160, Math.round(native.w * fit * (zoom / 100)));

  return (
    <div className="studio-editor flex h-screen flex-col overflow-hidden">
      <EditorTopBar
        title={title}
        status={statusPill}
        format={format}
        onFormat={(f) => {
          setFormat(f);
          setSelection([]);
        }}
        inheritedFormats={inheritedFormats(doc, ["square", "portrait", "story", "landscape"])}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={() => setHistory((h) => undo(h))}
        onRedo={() => setHistory((h) => redo(h))}
        dirty={dirty}
        saving={update.isPending}
        onSave={save}
        actions={
          <>
            <DownloadMenu
              card={{
                input: slideInput,
                size: format,
                theme,
                data: slideData,
                packId,
                adjustments: doc,
                junior: slideJunior,
              }}
              baseName={cardBaseFilename(input, bundle?.brand ?? brand)}
            />
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
            {panel === "content" && (
              <ContentPanel
                doc={doc}
                fields={packTextFields(slideInput, packId)}
                values={fieldValues}
                slots={packImageSlots(slideInput, { packId, includeHidden: true })}
                size={format}
                photo={photoFor(doc, format)?.value ?? { focalX: 0.5, focalY: 0.5, zoom: 1 }}
                onField={(k, v) => edit(setField(doc, k, v))}
                onToggleHidden={(k) => edit(toggleHidden(doc, k))}
                onPhoto={(p) => edit(setPhoto(doc, format, p))}
              />
            )}
            {panel === "text" && <TextPanel size={format} onAdd={addFreeLayer} />}
            {panel === "elements" && (
              <ElementsPanel
                size={format}
                onAdd={addFreeLayer}
                paletteVars={elementPalette}
                crestUrl={(bundle?.brand ?? brand).logoUrl ?? null}
              />
            )}
            {panel === "cricket" && (
              <CricketPanel
                size={format}
                input={input}
                fixtureId={matchDayFixtureId(input.kind, draft.sourceKey)}
                onAdd={addFreeLayer}
              />
            )}
            {panel === "players" && <PlayersPanel size={format} onAddMany={addGroup} />}
            {panel === "photos" && (
              <PhotosPanel
                size={format}
                onAdd={addFreeLayer}
                onSetPhoto={(url) => edit(setImage(doc, "photo", url))}
              />
            )}
            {panel === "uploads" && <UploadsPanel />}
            {panel === "live" && (
              <LiveStatsPanel
                size={format}
                fields={packTextFields(slideInput, packId)}
                values={fieldValues}
                onAdd={addFreeLayer}
              />
            )}
            {panel === "brand" && (
              <BrandPanel
                size={format}
                logoUrl={(bundle?.brand ?? brand).logoUrl ?? null}
                palette={palette}
                sponsorLock={!!doc.sponsorLock}
                onAdd={addFreeLayer}
                onRecolour={() => edit(recolourToBrand(doc, palette))}
                onSponsorLock={(on) => edit(setSponsorLock(doc, on))}
              />
            )}
          </EditorPanel>
        )}
        <main
          ref={canvasArea}
          className="relative flex min-w-0 flex-1 flex-col items-center overflow-auto bg-[var(--ed-canvas)] p-6"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="mb-6">
            <EditorToolbar
              selected={selected}
              isGroup={isGroup}
              onText={(t) =>
                selected[0] &&
                edit(updateLayer(doc, selected[0].id, { content: t, name: t.slice(0, 24) }))
              }
              onColour={(c) => {
                const l = selected[0];
                if (!l) return;
                const style =
                  l.kind === "text" ? { ...l.style, color: c } : { ...l.style, background: c };
                edit(updateLayer(doc, l.id, { style }));
              }}
              onLock={() => {
                const lock = !selected.every((l) => l.locked);
                edit(selected.reduce((d, l) => updateLayer(d, l.id, { locked: lock }), doc));
              }}
              onDuplicate={() => {
                const r = duplicate(doc, format, selection);
                edit(r.doc);
                setSelection(r.ids);
              }}
              onDelete={() => {
                edit(removeLayers(doc, selection));
                setSelection([]);
              }}
              onGroup={() => edit(groupLayers(doc, selection).doc)}
              onUngroup={() => edit(ungroup(doc, selection))}
              onReorder={(move) => edit(reorderLayers(doc, selection, move))}
              onCopy={copySelection}
              onPaste={pasteClipboard}
              canPaste={canPaste}
              arrange={{
                count: unitCount(doc, format, selection, inside),
                onAlign: (to) => edit(align(doc, format, selection, to, inside)),
                onDistribute: (axis) => edit(distribute(doc, format, selection, axis, inside)),
                onMatch: (dim, ref) => edit(matchSize(doc, format, selection, dim, ref, inside)),
              }}
            />
            {pasteNote && (
              <p role="status" className="mt-2 text-sm text-amber-300">
                {pasteNote}
              </p>
            )}
            {selected.length === 1 && selected[0].kind === "element" && (
              <ElementPropsEditor
                layer={selected[0]}
                values={fieldValues}
                onProp={(k, v) => edit(setElementProp(doc, selected[0].id, k, v))}
              />
            )}
          </div>
          <EditorCanvas
            doc={doc}
            size={format}
            width={boardW}
            input={slideInput}
            theme={theme}
            data={slideData}
            packId={packId}
            junior={slideJunior}
            selection={selection}
            onSelect={(lid) => {
              if (lid === null) {
                setSelection([]);
                setInside(null);
              } else setSelection(selectionFor(doc, lid, inside));
            }}
            onToggle={(lid) => setSelection((s) => toggleSelection(doc, s, lid, inside))}
            marqueeArea={canvasArea}
            onSelectMany={(ids, additive) =>
              setSelection((s) => selectMany(doc, s, ids, inside, additive))
            }
            onEnterGroup={(lid) => {
              const g = layers.find((l) => l.id === lid)?.group ?? null;
              setInside(g);
              setSelection([lid]);
            }}
            onChange={onCanvasChange}
          />
          {templated && slides.length > 1 ? (
            <div
              className="mt-6 flex items-center gap-2 text-sm text-[var(--ed-ink2)]"
              role="group"
              aria-label="Slides"
            >
              <span>Slides use one design:</span>
              {slides.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={s.key === slide.key}
                  onClick={() => setSlideKey(s.key)}
                  className="h-8 min-w-8 rounded-full border border-[var(--ed-line)] px-2 font-semibold aria-pressed:border-[var(--ed-accent)]"
                >
                  {s.page}
                </button>
              ))}
            </div>
          ) : !templated &&
            (slides.length > 1 || (isSetKind(input.kind) && format !== "landscape")) ? (
            <div className="mt-6 flex w-full max-w-4xl flex-col gap-3">
              <SetOptionsBar
                options={rootDoc.set ?? {}}
                onChange={setSetOptions}
                slideCount={slides.length}
              />
              {slides.length > 1 && (
                <CardSetStrip
                  input={input}
                  size={format}
                  sponsorsOn
                  theme={theme}
                  junior={false}
                  data={data}
                  packId={packId}
                  options={rootDoc.set}
                  adjustments={rootDoc}
                  slideWidth={120}
                  selectedKey={slide.key}
                  onSelect={(s) => {
                    setSlideKey(s.key);
                    setSelection([]);
                    setInside(null);
                  }}
                  className="text-[var(--ed-ink2)]"
                />
              )}
            </div>
          ) : null}
          {layersOpen && (
            <LayersDrawer
              layers={layers}
              selection={selection}
              onSelect={(ids, mode) =>
                setSelection((s) =>
                  mode === "replace"
                    ? ids
                    : mode === "toggle"
                      ? toggleSelection(doc, s, ids[0], inside)
                      : [...new Set([...s, ...ids])],
                )
              }
              onToggleHidden={(lid) => {
                const l = layers.find((x) => x.id === lid);
                // A locked sponsor strip stays visible.
                if (l && !(doc.sponsorLock && isSponsorElement(l) && !l.hidden)) {
                  edit(updateLayer(doc, lid, { hidden: !l.hidden }));
                }
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
      {update.isError && (
        <p
          role="alert"
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm text-black"
        >
          Couldn't save. Try again.
        </p>
      )}
    </div>
  );
}
