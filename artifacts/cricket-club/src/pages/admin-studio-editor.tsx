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
import { LayersDrawer } from "@/components/studio-editor/layers-drawer";
import { SaveTemplateButton } from "@/components/studio-editor/save-template";
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
  layersOf,
  nudge,
  removeLayers,
  selectionFor,
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
  inheritedFormats,
  packFieldValues,
  packImageSlots,
  packNativeSize,
  packTextFields,
  photoFor,
  type CardAdjustments,
  type FreeLayer,
} from "@/lib/pack-render";
import { resolvePackIdForKind } from "@/lib/card-template";
import { useBrand } from "@/lib/brand-context";
import {
  buildPackData,
  kindSponsors,
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
  const packId =
    draft.packId ?? resolvePackIdForKind(templatesQ.data as CardTemplate[] | undefined, input.kind);

  const data = useMemo(
    () => ({
      ...buildPackData({
        brand: bundle?.brand ?? brand,
        hashtag: tenantHashtag(bundle),
        sponsors: kindSponsors(bundle, input.kind, true),
        presentingSponsorName: presentingSponsorName(bundle, true),
      }),
      photoUrl: draft.photoUrl ?? undefined,
    }),
    [bundle, brand, input.kind, draft.photoUrl],
  );

  const saved = (draft.adjustments ?? {}) as CardAdjustments;
  const [history, setHistory] = useState<History<EditorDoc>>(() => createHistory(saved));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(saved));
  const gestureBase = useRef<EditorDoc | null>(null);
  const doc = history.present;
  const dirty = JSON.stringify(doc) !== savedJson;

  const [format, setFormat] = useState<CardSize>("square");
  const [selection, setSelection] = useState<string[]>([]);
  const [inside, setInside] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>("content");
  const [layersOpen, setLayersOpen] = useState(false);
  const [zoom, setZoom] = useState(100);

  const edit = useCallback((next: EditorDoc) => setHistory((h) => commit(h, next)), []);
  const onCanvasChange = (next: EditorDoc, done: boolean) => {
    if (!done) {
      if (!gestureBase.current) gestureBase.current = history.present;
      setHistory((h) => replace(h, next));
      return;
    }
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base) setHistory((h) => commitFrom(h, base, next));
  };

  const update = useUpdateSocialDraft({
    mutation: {
      onSuccess: () => {
        setSavedJson(JSON.stringify(doc));
        qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
      },
    },
  });
  const save = () => update.mutate({ id: draftId, data: { adjustments: doc } });

  const layers = layersOf(doc);
  const selected = layers.filter((l) => selection.includes(l.id));
  const isGroup =
    selected.length > 1 && selected.every((l) => l.group && l.group === selected[0].group);

  // Keyboard shortcuts (ignored while typing in an input).
  const stateRef = useRef({ doc, selection, format, inside });
  stateRef.current = { doc, selection, format, inside };
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    bundle?.brand?.juniorsColour ?? brand.juniorsColour,
  ].filter((c): c is string => !!c);
  const fieldValues = packFieldValues(input, data, packId);

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
              card={{ input, size: format, theme, data, packId, adjustments: doc }}
              baseName={cardBaseFilename(input, bundle?.brand ?? brand)}
            />
            <SaveTemplateButton
              draftId={draftId}
              beforeSave={() =>
                dirty
                  ? update.mutateAsync({ id: draftId, data: { adjustments: doc } })
                  : Promise.resolve()
              }
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
                fields={packTextFields(input, packId)}
                values={fieldValues}
                slots={packImageSlots(input, { packId, includeHidden: true })}
                size={format}
                photo={photoFor(doc, format)?.value ?? { focalX: 0.5, focalY: 0.5, zoom: 1 }}
                onField={(k, v) => edit(setField(doc, k, v))}
                onToggleHidden={(k) => edit(toggleHidden(doc, k))}
                onPhoto={(p) => edit(setPhoto(doc, format, p))}
              />
            )}
            {panel === "text" && <TextPanel size={format} onAdd={addFreeLayer} />}
            {panel === "elements" && <ElementsPanel size={format} onAdd={addFreeLayer} />}
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
                fields={packTextFields(input, packId)}
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
            />
          </div>
          <EditorCanvas
            doc={doc}
            size={format}
            width={boardW}
            input={input}
            theme={theme}
            data={data}
            packId={packId}
            selection={selection}
            onSelect={(lid) => {
              if (lid === null) {
                setSelection([]);
                setInside(null);
              } else setSelection(selectionFor(doc, lid, inside));
            }}
            onToggle={(lid) => setSelection((s) => toggleSelection(doc, s, lid, inside))}
            onEnterGroup={(lid) => {
              const g = layers.find((l) => l.id === lid)?.group ?? null;
              setInside(g);
              setSelection([lid]);
            }}
            onChange={onCanvasChange}
          />
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
