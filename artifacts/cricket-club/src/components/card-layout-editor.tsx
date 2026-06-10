import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import {
  useListCardLayouts,
  useUpsertCardLayout,
  useDeleteCardLayout,
  getListCardLayoutsQueryKey,
  useListCardEffectPresets,
  useCreateCardEffectPreset,
  useDeleteCardEffectPreset,
  getListCardEffectPresetsQueryKey,
  type CardLayout,
  type CardLayoutLayer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Type,
  ImageIcon,
  Square,
  Circle,
  Minus,
  Trash2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Save,
  X,
  Sticker,
} from "lucide-react";
import {
  STICKER_ASSETS,
  STICKER_CATEGORIES,
  searchStickers,
  renderStickerThumb,
  getSticker,
  type StickerAsset,
  type StickerCategory,
} from "@/lib/sticker-library";
import { fieldsForKind } from "@/lib/card-template";
import { CARD_KIND_OPTIONS, CardKindPicker } from "@/components/card-kind-picker";
import {
  SIZES,
  computeCardLayers,
  renderShareCard,
  hasLayerEffects,
  DEFAULT_LAYER_EFFECTS,
  BUILTIN_EFFECT_PRESETS,
  type CardKind,
  type CardSize,
  type EditorLayer,
  type EffectPreset,
  type LayerEffects,
  type RenderOptions,
  type ShareCardInput,
} from "@/lib/share-card";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Snap threshold expressed as a fraction of the 1080 base width.
const SNAP = 0.012;

// Brand palette — colour choices for text/sticker layers are constrained to
// these club tokens (senior gold + junior brown chrome) so cards stay on-brand.
const PALETTE: { value: string; label: string }[] = [
  { value: "#FBAC27", label: "Gold" },
  { value: "#F5F2E8", label: "Cream" },
  { value: "#42342B", label: "Brown" },
  { value: "#FFFFFF", label: "White" },
  { value: "#1A1A1A", label: "Black" },
];

function PaletteSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PALETTE.map((c) => {
        const active = (value || "").toUpperCase() === c.value.toUpperCase();
        return (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className={`h-6 w-6 rounded border ${active ? "ring-2 ring-ring ring-offset-1" : ""}`}
            style={{ backgroundColor: c.value }}
          />
        );
      })}
    </div>
  );
}

// Convert the editor's working layers back into the minimal saved layout: only
// built-in `element` layers that actually differ from their pristine defaults,
// plus every custom layer in full. Keeping unchanged elements out means a card
// the admin never touched saves nothing and stays pixel-identical.
function editorToSaved(
  layers: EditorLayer[],
  pristine: EditorLayer[],
): CardLayoutLayer[] {
  const pById = new Map(pristine.map((p) => [p.id, p]));
  const out: CardLayoutLayer[] = [];
  for (const l of layers) {
    if (l.editKind === "element") {
      const p = pById.get(l.id);
      if (!p) continue;
      // The full-bleed feature/background layer can't be moved or resized, so its
      // geometry must NEVER be persisted: its natural rect is the render canvas,
      // which differs per size (square/portrait/story). Persisting a square-sized
      // rect would shrink the background on taller sizes via savedRectToPx (which
      // scales by 1080, not the render height). Only its effects/z/visibility are
      // meaningful, so we emit those and leave geometry to the built-in default.
      const geometryLocked = !l.resizable;
      const changed =
        (!geometryLocked &&
          (p.x !== l.x ||
            p.y !== l.y ||
            p.w !== l.w ||
            p.h !== l.h ||
            p.focalX !== l.focalX ||
            p.focalY !== l.focalY ||
            p.zoom !== l.zoom)) ||
        p.z !== l.z ||
        p.hidden !== l.hidden ||
        JSON.stringify(p.effects ?? null) !== JSON.stringify(l.effects ?? null);
      if (!changed) continue;
      out.push({
        id: l.id,
        kind: "element",
        ...(geometryLocked
          ? {}
          : {
              x: l.x,
              y: l.y,
              w: l.w,
              h: l.h,
              focalX: l.focalX,
              focalY: l.focalY,
              zoom: l.zoom,
            }),
        z: l.z,
        hidden: l.hidden,
        vAnchor: l.vAnchor,
        effects: l.effects,
      });
    } else {
      out.push({
        id: l.id,
        kind: l.editKind,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        z: l.z,
        hidden: l.hidden,
        vAnchor: l.vAnchor,
        url: l.url,
        shape: l.shape,
        fit: l.fit,
        focalX: l.focalX,
        focalY: l.focalY,
        zoom: l.zoom,
        color: l.color,
        radius: l.radius,
        text: l.text,
        fontSize: l.fontSize,
        fontWeight: l.fontWeight,
        align: l.align,
        fontFamily: l.fontFamily,
        uppercase: l.uppercase,
        assetId: l.assetId,
        field: l.field,
        effects: l.effects,
      });
    }
  }
  return out;
}

// Template mode (Social Studio): the editor authors a NAMED reusable layer
// template instead of persisting to the per-kind `card_layouts` table. It seeds
// from `controlledLayout` (the template's saved layers), exposes name / assign /
// default-for fields, and hands the whole payload back via `onSaveTemplate`.
export type TemplateMode = {
  initialName: string;
  initialCardKinds: string[];
  initialDefaultForKinds: string[];
  saving: boolean;
  onSaveTemplate: (data: {
    name: string;
    cardKinds: string[];
    defaultForKinds: string[];
    layers: CardLayoutLayer[];
  }) => void;
};

export function CardLayoutEditor({
  input,
  baseOpts,
  activeSize,
  onClose,
  controlledLayout,
  onSaveLayout,
  templateMode,
}: {
  input: ShareCardInput;
  // Render options WITHOUT a layout — the editor manages the layout itself.
  baseOpts: RenderOptions;
  activeSize: CardSize;
  onClose: () => void;
  // Controlled mode (carousel sets): when `onSaveLayout` is provided the editor
  // does NOT persist to the global per-card-kind `card_layouts` table. Instead
  // it seeds from `controlledLayout` and hands the edited layers back via
  // `onSaveLayout`, so each carousel slide carries its own independent layout.
  controlledLayout?: CardLayoutLayer[];
  onSaveLayout?: (layers: CardLayoutLayer[]) => void;
  // Template mode (Social Studio): author a named reusable template. Seeds from
  // `controlledLayout` like controlled mode but saves via `onSaveTemplate`.
  templateMode?: TemplateMode;
}) {
  const cardKind = input.kind;
  const isTemplate = !!templateMode;
  // Template mode also seeds from `controlledLayout` and never touches the
  // per-kind card_layouts table, so it shares the controlled seeding path.
  const controlled = !!onSaveLayout || isTemplate;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const layoutsQ = useListCardLayouts();
  const savedLayers = useMemo<CardLayoutLayer[]>(() => {
    if (controlled) return controlledLayout ?? [];
    const row = (layoutsQ.data as CardLayout[] | undefined)?.find(
      (l) => l.cardKind === cardKind,
    );
    return row?.layers ?? [];
  }, [controlled, controlledLayout, layoutsQ.data, cardKind]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListCardLayoutsQueryKey() });
  const upsert = useUpsertCardLayout({
    mutation: {
      onSuccess: () => {
        invalidate();
        onClose();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  const remove = useDeleteCardLayout({
    mutation: {
      onSuccess: () => {
        invalidate();
        onClose();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  const imgUpload = useUpload({ onError: (e) => setError(e.message) });

  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [pristine, setPristine] = useState<EditorLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [computing, setComputing] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template-mode form state (name + assigned card types + per-type default).
  const [tplName, setTplName] = useState(templateMode?.initialName ?? "");
  const [tplKinds, setTplKinds] = useState<CardKind[]>(
    (templateMode?.initialCardKinds ?? []) as CardKind[],
  );
  const [tplDefaults, setTplDefaults] = useState<CardKind[]>(
    (templateMode?.initialDefaultForKinds ?? []) as CardKind[],
  );

  // Build pristine defaults + the working set (defaults merged with saved
  // overrides) whenever the card, size or saved layout changes.
  useEffect(() => {
    let cancelled = false;
    setComputing(true);
    (async () => {
      const opts: RenderOptions = { ...baseOpts, size: activeSize, layout: [] };
      const base = await computeCardLayers(input, opts);
      const merged = await computeCardLayers(input, {
        ...baseOpts,
        size: activeSize,
        layout: savedLayers,
      });
      if (cancelled) return;
      setPristine(base);
      setLayers(merged);
      setComputing(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKind, activeSize, savedLayers]);

  // Re-render the card preview (debounced) whenever the working layers change.
  useEffect(() => {
    if (computing || layers.length === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const blob = await renderShareCard(input, {
          ...baseOpts,
          size: activeSize,
          layout: editorToSaved(layers, pristine),
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, computing, activeSize]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const patchLayer = (id: string, patch: Partial<EditorLayer>) =>
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const restack = (id: string, dir: "up" | "down") => {
    setLayers((ls) => {
      const sorted = [...ls].sort((a, b) => a.z - b.z);
      const i = sorted.findIndex((l) => l.id === id);
      if (i < 0) return ls;
      const j = dir === "up" ? i + 1 : i - 1;
      if (j < 0 || j >= sorted.length) return ls;
      const zi = sorted[i].z;
      sorted[i] = { ...sorted[i], z: sorted[j].z };
      sorted[j] = { ...sorted[j], z: zi };
      return sorted;
    });
  };

  const addLayer = (kind: "image" | "sticker" | "text", extra: Partial<EditorLayer>) => {
    const maxZ = layers.reduce((m, l) => Math.max(m, l.z), 0);
    const layer: EditorLayer = {
      id: newId(),
      editKind: kind,
      label: kind === "image" ? "Image" : kind === "sticker" ? "Shape" : "Text",
      selectable: true,
      resizable: true,
      x: 0.3,
      y: 0.3,
      w: 0.4,
      h: kind === "text" ? 0.1 : 0.3,
      vAnchor: "top",
      z: maxZ + 1,
      hidden: false,
      ...extra,
    };
    setLayers((ls) => [...ls, layer]);
    setSelectedId(layer.id);
  };

  const handleAddImage = async (file: File) => {
    setError(null);
    const r = await imgUpload.uploadFile(file);
    if (r) addLayer("image", { url: `/api/storage${r.objectPath}`, shape: "rect", fit: "cover", zoom: 1, focalX: 0.5, focalY: 0.5 });
  };

  // Add a built-in library sticker as a normal movable/resizable layer. When
  // `at` (normalised drop point, fractions of 1080) is given the sticker is
  // centred there; otherwise it lands centred-ish on the card.
  const addSticker = (asset: StickerAsset, at?: { x: number; y: number }) => {
    const maxZ = layers.reduce((m, l) => Math.max(m, l.z), 0);
    const w = 0.28;
    const h = clamp(w / asset.aspect, 0.04, 1.4);
    const x = at ? clamp(at.x - w / 2, 0, 1 - w) : 0.36;
    const y = at ? Math.max(0, at.y - h / 2) : 0.36;
    const layer: EditorLayer = {
      id: newId(),
      editKind: "libsticker",
      label: asset.name,
      selectable: true,
      resizable: true,
      x,
      y,
      w,
      h,
      vAnchor: "top",
      z: maxZ + 1,
      hidden: false,
      assetId: asset.id,
      color: "#FBAC27",
      field: asset.dataBound ? asset.defaultField : undefined,
    };
    setLayers((ls) => [...ls, layer]);
    setSelectedId(layer.id);
  };

  const handleDropSticker = (assetId: string, at: { x: number; y: number }) => {
    const asset = getSticker(assetId);
    if (asset) addSticker(asset, at);
  };

  const handleSave = () => {
    setError(null);
    if (isTemplate) {
      if (!tplName.trim()) {
        setError("Give the template a name.");
        return;
      }
      templateMode!.onSaveTemplate({
        name: tplName.trim(),
        cardKinds: tplKinds,
        defaultForKinds: tplDefaults.filter((k) => tplKinds.includes(k)),
        layers: editorToSaved(layers, pristine),
      });
      return;
    }
    if (controlled) {
      onSaveLayout!(editorToSaved(layers, pristine));
      onClose();
      return;
    }
    upsert.mutate({
      cardKind,
      data: { layers: editorToSaved(layers, pristine) },
    });
  };

  const handleReset = async () => {
    if (
      !(await confirm({
        title: "Reset layout",
        description:
          "Discard the custom layout for this card type and restore the built-in design?",
        confirmText: "Reset",
        destructive: true,
      }))
    )
      return;
    if (isTemplate) {
      // Template mode: just clear the working overlays back to the built-in
      // design; the named template is only persisted on Save.
      setLayers(pristine.map((l) => ({ ...l })));
      return;
    }
    if (controlled) {
      setLayers(pristine.map((l) => ({ ...l })));
      onSaveLayout!([]);
      onClose();
      return;
    }
    if (savedLayers.length === 0) {
      // Nothing persisted — just restore the working set to defaults.
      setLayers(pristine.map((l) => ({ ...l })));
      onClose();
      return;
    }
    remove.mutate({ cardKind });
  };

  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const pending = isTemplate
    ? templateMode!.saving
    : upsert.isPending || remove.isPending;
  const { w: W, h: H } = SIZES[activeSize];

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {isTemplate ? "Design template" : `Customise layout — ${cardKind}`}
        </h3>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Drag any element to move it, drag its corner to resize. Add images,
        shapes or text, restack with the layer list, then save. Changes apply to
        every size; reset restores the built-in design.
      </p>

      {isTemplate && (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Template name</Label>
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="e.g. Gold milestone frame"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assign to card types</Label>
            <CardKindPicker
              value={tplKinds}
              onChange={(next) => {
                setTplKinds(next);
                setTplDefaults((d) => d.filter((k) => next.includes(k)));
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              Card types this template can be applied to. Empty = available for
              all types.
            </p>
          </div>
          {tplKinds.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Make default for</Label>
              <div className="flex flex-wrap gap-1.5">
                {tplKinds.map((k) => {
                  const active = tplDefaults.includes(k);
                  const label =
                    CARD_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setTplDefaults((d) =>
                          active ? d.filter((x) => x !== k) : [...d, k],
                        )
                      }
                      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                A default template is applied automatically to that card type.
                Only one default per type — setting this one replaces any other.
              </p>
            </div>
          )}
        </div>
      )}

      {computing ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
          <EditorCanvas
            previewUrl={previewUrl}
            rendering={rendering}
            layers={layers}
            selectedId={selectedId}
            W={W}
            H={H}
            onSelect={setSelectedId}
            onChange={patchLayer}
            onDropSticker={handleDropSticker}
          />

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <label className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAddImage(e.target.files[0])}
                />
                <span className="flex cursor-pointer items-center justify-center gap-1 rounded border px-2 py-1.5 text-xs hover:bg-muted">
                  {imgUpload.isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  Image
                </span>
              </label>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => addLayer("sticker", { shape: "rect", color: "#FBAC27", radius: 0 })}
              >
                <Square className="mr-1 h-3.5 w-3.5" /> Shape
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() =>
                  addLayer("text", {
                    text: "New text",
                    color: "#F5F2E8",
                    fontSize: 0.05,
                    fontWeight: 700,
                    align: "center",
                    fontFamily: "sans",
                    uppercase: false,
                  })
                }
              >
                <Type className="mr-1 h-3.5 w-3.5" /> Text
              </Button>
              <Button
                size="sm"
                variant={showStickers ? "default" : "outline"}
                className="flex-1"
                onClick={() => setShowStickers((s) => !s)}
              >
                <Sticker className="mr-1 h-3.5 w-3.5" /> Stickers
              </Button>
            </div>

            {showStickers && <StickerPicker onPick={(a) => addSticker(a)} />}

            <LayerList
              layers={layers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleHidden={(id, hidden) => patchLayer(id, { hidden })}
              onRestack={restack}
            />

            {selected && (
              <Inspector
                layer={selected}
                cardKind={cardKind}
                onChange={(patch) => patchLayer(selected.id, patch)}
                onRemove={() => removeLayer(selected.id)}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <Button variant="outline" size="sm" onClick={handleReset} disabled={pending}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset to built-in
        </Button>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={pending || computing}>
            {pending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            {isTemplate ? "Save template" : "Save layout"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StickerPicker({ onPick }: { onPick: (asset: StickerAsset) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<StickerCategory | "all">("all");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Array<[string, string]> = [];
      for (const a of STICKER_ASSETS) {
        try {
          const url = await renderStickerThumb(a, "#FBAC27", 88);
          if (url) entries.push([a.id, url]);
        } catch {
          /* skip thumbs that fail to render */
        }
        if (cancelled) return;
      }
      if (!cancelled) setThumbs(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = searchStickers(cat, q);

  return (
    <div className="space-y-2 rounded border p-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stickers…"
        className="h-8 text-xs"
      />
      <div className="flex flex-wrap gap-1">
        {[{ id: "all", label: "All" }, ...STICKER_CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id as StickerCategory | "all")}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              cat === c.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto">
        {list.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.name}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-sticker", a.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onPick(a)}
            className="flex aspect-square items-center justify-center rounded border bg-card p-1 hover:border-primary"
          >
            {thumbs[a.id] ? (
              <img
                src={thumbs[a.id]}
                alt={a.name}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </button>
        ))}
        {list.length === 0 && (
          <p className="col-span-3 py-4 text-center text-[11px] text-muted-foreground">
            No stickers found
          </p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Click to add, or drag onto the card.</p>
    </div>
  );
}

function EditorCanvas({
  previewUrl,
  rendering,
  layers,
  selectedId,
  W,
  H,
  onSelect,
  onChange,
  onDropSticker,
}: {
  previewUrl: string | null;
  rendering: boolean;
  layers: EditorLayer[];
  selectedId: string | null;
  W: number;
  H: number;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<EditorLayer>) => void;
  onDropSticker: (assetId: string, at: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<{ vx: number[]; hy: number[] }>({ vx: [], hy: [] });
  // Latest props for the native (non-passive) wheel listener below.
  const selRef = useRef(selectedId);
  const layersRef = useRef(layers);
  const onChangeRef = useRef(onChange);
  selRef.current = selectedId;
  layersRef.current = layers;
  onChangeRef.current = onChange;
  const drag = useRef<
    | {
        mode: "move" | "resize";
        px: number;
        py: number;
        x: number;
        y: number;
        w: number;
        h: number;
        vAnchor: "top" | "bottom";
      }
    | null
  >(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Wheel-to-zoom the selected built-in headshot photo. Native non-passive
  // listener so we can preventDefault and stop the modal scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (selRef.current !== "photo") return;
      const photo = layersRef.current.find((x) => x.id === "photo");
      if (!photo) return;
      e.preventDefault();
      const cur = photo.zoom ?? 1;
      const next = clamp(cur - e.deltaY * 0.0015, 1, 3);
      onChangeRef.current("photo", { zoom: next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Convert a normalised layer into overlay CSS percentages. x/w are fractions
  // of W's worth of base units (1080); the top edge in card px depends on the
  // anchor, then both axes scale by the same display factor (aspect preserved).
  const cssFor = (l: EditorLayer) => {
    const cardX = l.x * 1080;
    const cardW = l.w * 1080;
    const cardH = l.h * 1080;
    const cardTop = l.vAnchor === "bottom" ? H - l.y * 1080 : l.y * 1080;
    return {
      left: `${(cardX / W) * 100}%`,
      top: `${(cardTop / H) * 100}%`,
      width: `${(cardW / W) * 100}%`,
      height: `${(cardH / H) * 100}%`,
    };
  };

  const onPointerDown = (e: React.PointerEvent, l: EditorLayer, mode: "move" | "resize") => {
    e.stopPropagation();
    onSelect(l.id);
    drag.current = {
      mode,
      px: e.clientX,
      py: e.clientY,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      vAnchor: l.vAnchor,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent, l: EditorLayer) => {
    const d = drag.current;
    if (!d || box.w === 0 || box.h === 0) return;
    // px delta → fraction of the 1080 base on each axis.
    const dx = ((e.clientX - d.px) / box.w) * (W / 1080);
    const dy = ((e.clientY - d.py) / box.h) * (H / 1080);
    if (d.mode === "move") {
      let nx = d.x + dx;
      // y grows downward for top anchor, upward for bottom anchor.
      let ny = d.y + (d.vAnchor === "bottom" ? -dy : dy);
      const wUnit = W / 1080;
      const hUnit = H / 1080;
      // All other visible selectable layers act as alignment references.
      const others = layers.filter((o) => o.id !== l.id && o.selectable && !o.hidden);

      // --- Horizontal snap: left / centre / right of the dragged box against
      // the card edges + midline AND every other layer's left/centre/right. ---
      const xEdges = [nx, nx + d.w / 2, nx + d.w];
      const xTargets = [0, wUnit / 2, wUnit];
      for (const o of others) xTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
      let bestX: { delta: number; snap: number; dist: number } | null = null;
      for (const edge of xEdges) {
        for (const t of xTargets) {
          const dist = Math.abs(edge - t);
          if (dist < SNAP && (!bestX || dist < bestX.dist)) {
            bestX = { delta: t - edge, snap: t, dist };
          }
        }
      }
      const vx: number[] = [];
      if (bestX) {
        nx += bestX.delta;
        vx.push(bestX.snap);
      }

      // --- Vertical snap: work in top-origin units (fraction of 1080) so the
      // anchor doesn't matter, then convert the result back to the anchor. ---
      const topU = d.vAnchor === "bottom" ? hUnit - ny : ny;
      const yEdges = [topU, topU + d.h / 2, topU + d.h];
      const yTargets = [0, hUnit / 2, hUnit];
      for (const o of others) {
        const oTop = o.vAnchor === "bottom" ? hUnit - o.y : o.y;
        yTargets.push(oTop, oTop + o.h / 2, oTop + o.h);
      }
      let bestY: { delta: number; snap: number; dist: number } | null = null;
      for (const edge of yEdges) {
        for (const t of yTargets) {
          const dist = Math.abs(edge - t);
          if (dist < SNAP && (!bestY || dist < bestY.dist)) {
            bestY = { delta: t - edge, snap: t, dist };
          }
        }
      }
      const hy: number[] = [];
      let newTopU = topU;
      if (bestY) {
        newTopU = topU + bestY.delta;
        hy.push(bestY.snap);
      }
      ny = d.vAnchor === "bottom" ? hUnit - newTopU : newTopU;

      onChange(l.id, {
        x: clamp(nx, 0, wUnit - d.w),
        y: Math.max(0, ny),
      });
      setGuides({ vx, hy });
    } else {
      onChange(l.id, {
        w: clamp(d.w + dx, 0.03, W / 1080 - d.x),
        h: clamp(d.h + dy, 0.02, 2),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    setGuides({ vx: [], hy: [] });
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const ordered = [...layers].sort((a, b) => a.z - b.z);

  return (
    <div
      ref={ref}
      className="relative w-full select-none touch-none overflow-hidden rounded-md border bg-muted"
      style={{ aspectRatio: `${W} / ${H}`, maxHeight: 460 }}
      onPointerDown={() => onSelect(null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-sticker")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("application/x-sticker");
        if (!id || !ref.current) return;
        e.preventDefault();
        const rect = ref.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * (W / 1080);
        const y = ((e.clientY - rect.top) / rect.height) * (H / 1080);
        onDropSticker(id, { x, y });
      }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Card preview"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {rendering && (
        <div className="absolute right-1 top-1 rounded bg-black/50 p-1">
          <Loader2 className="h-3 w-3 animate-spin text-white" />
        </div>
      )}

      {/* Snapping guides */}
      {guides.vx.map((vx, i) => (
        <div
          key={`v${i}`}
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
          style={{ left: `${(vx * 1080) / W * 100}%` }}
        />
      ))}
      {guides.hy.map((hy, i) => (
        <div
          key={`h${i}`}
          className="pointer-events-none absolute left-0 right-0 h-px bg-primary"
          style={{ top: `${(hy * 1080) / H * 100}%` }}
        />
      ))}

      {ordered.map((l) => {
        if (!l.selectable) return null;
        const selected = l.id === selectedId;
        return (
          <div
            key={l.id}
            className={`absolute border-2 ${
              selected ? "border-primary bg-primary/10" : "border-white/50"
            } ${l.hidden ? "opacity-30" : ""}`}
            style={{ ...cssFor(l), cursor: "move" }}
            onPointerDown={(e) => onPointerDown(e, l, "move")}
            onPointerMove={(e) => onPointerMove(e, l)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {selected && (
              <span className="absolute -top-4 left-0 whitespace-nowrap rounded-sm bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {l.label}
              </span>
            )}
            {selected && l.resizable && (
              <div
                className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm border border-white bg-primary"
                style={{ cursor: "nwse-resize" }}
                onPointerDown={(e) => onPointerDown(e, l, "resize")}
                onPointerMove={(e) => onPointerMove(e, l)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LayerList({
  layers,
  selectedId,
  onSelect,
  onToggleHidden,
  onRestack,
}: {
  layers: EditorLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onRestack: (id: string, dir: "up" | "down") => void;
}) {
  const ordered = [...layers].sort((a, b) => b.z - a.z);
  return (
    <div className="space-y-1 rounded border p-2">
      <Label className="text-[11px] text-muted-foreground">Layers (top first)</Label>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {ordered.map((l) => (
          <div
            key={l.id}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs ${
              l.id === selectedId ? "bg-primary/15" : "hover:bg-muted"
            }`}
          >
            <button
              type="button"
              className="flex-1 truncate text-left"
              onClick={() => onSelect(l.id)}
            >
              {l.label}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onToggleHidden(l.id, !l.hidden)}
              title={l.hidden ? "Show" : "Hide"}
            >
              {l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onRestack(l.id, "up")}
              title="Bring forward"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onRestack(l.id, "down")}
              title="Send backward"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Inspector({
  layer,
  cardKind,
  onChange,
  onRemove,
}: {
  layer: EditorLayer;
  cardKind: ShareCardInput["kind"];
  onChange: (patch: Partial<EditorLayer>) => void;
  onRemove: () => void;
}) {
  const isCustom = layer.editKind !== "element";
  const sticker = layer.editKind === "libsticker" ? getSticker(layer.assetId) : undefined;
  return (
    <div className="space-y-2 rounded border p-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{layer.label}</Label>
        {isCustom && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>

      {layer.editKind === "text" && (
        <>
          <Input
            value={layer.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Text"
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-2">
            <PaletteSwatches
              value={layer.color ?? "#F5F2E8"}
              onChange={(color) => onChange({ color })}
            />
            <select
              value={layer.align ?? "center"}
              onChange={(e) => onChange({ align: e.target.value as EditorLayer["align"] })}
              className="h-8 flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={layer.fontFamily ?? "sans"}
              onChange={(e) =>
                onChange({ fontFamily: e.target.value as EditorLayer["fontFamily"] })
              }
              className="h-8 flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
            </select>
            <label className="flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={layer.uppercase ?? false}
                onChange={(e) => onChange({ uppercase: e.target.checked })}
              />
              CAPS
            </label>
          </div>
          <RangeRow
            label="Size"
            min={0.02}
            max={0.2}
            step={0.005}
            value={layer.fontSize ?? 0.05}
            onChange={(v) => onChange({ fontSize: v })}
          />
        </>
      )}

      {layer.editKind === "sticker" && (
        <>
          <div className="flex items-center gap-2">
            <PaletteSwatches
              value={layer.color ?? "#FBAC27"}
              onChange={(color) => onChange({ color })}
            />
            <div className="flex gap-1">
              <ShapeBtn active={layer.shape === "rect" || !layer.shape} onClick={() => onChange({ shape: "rect" })}>
                <Square className="h-3.5 w-3.5" />
              </ShapeBtn>
              <ShapeBtn active={layer.shape === "circle"} onClick={() => onChange({ shape: "circle" })}>
                <Circle className="h-3.5 w-3.5" />
              </ShapeBtn>
              <ShapeBtn active={layer.shape === "line"} onClick={() => onChange({ shape: "line" })}>
                <Minus className="h-3.5 w-3.5" />
              </ShapeBtn>
            </div>
          </div>
          {(layer.shape === "rect" || !layer.shape) && (
            <RangeRow
              label="Corner"
              min={0}
              max={0.5}
              step={0.02}
              value={layer.radius ?? 0}
              onChange={(v) => onChange({ radius: v })}
            />
          )}
          {layer.shape === "line" && (
            <RangeRow
              label="Thickness"
              min={0.002}
              max={0.04}
              step={0.002}
              value={layer.radius ?? 0.008}
              onChange={(v) => onChange({ radius: v })}
            />
          )}
        </>
      )}

      {layer.editKind === "libsticker" && sticker && (
        <>
          {sticker.recolourable && (
            <div className="flex items-center gap-2">
              <PaletteSwatches
                value={layer.color ?? "#FBAC27"}
                onChange={(color) => onChange({ color })}
              />
            </div>
          )}
          {sticker.dataBound && (
            <>
              <Label className="text-[10px] text-muted-foreground">Auto-fill from</Label>
              <select
                value={layer.field ?? ""}
                onChange={(e) => onChange({ field: e.target.value || undefined })}
                className="h-8 w-full rounded border bg-card px-1 text-xs"
              >
                <option value="">— None (manual text) —</option>
                {fieldsForKind(cardKind)
                  .filter((f) => f.type === "text")
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
              <Input
                value={layer.text ?? ""}
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder={sticker.defaultText ?? "Text"}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {layer.field
                  ? "Auto-fills from card data; the text above is a fallback."
                  : "Enter the text to display on the badge."}
              </p>
            </>
          )}
        </>
      )}

      {layer.editKind === "image" && (
        <>
          <div className="flex items-center gap-2">
            <ShapeBtn active={layer.shape !== "circle"} onClick={() => onChange({ shape: "rect" })}>
              <Square className="h-3.5 w-3.5" />
            </ShapeBtn>
            <ShapeBtn active={layer.shape === "circle"} onClick={() => onChange({ shape: "circle" })}>
              <Circle className="h-3.5 w-3.5" />
            </ShapeBtn>
            <select
              value={layer.fit ?? "cover"}
              onChange={(e) => onChange({ fit: e.target.value as EditorLayer["fit"] })}
              className="h-8 flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
            </select>
          </div>
          <RangeRow
            label="Zoom"
            min={1}
            max={3}
            step={0.05}
            value={layer.zoom ?? 1}
            onChange={(v) => onChange({ zoom: v })}
          />
          <RangeRow
            label="X"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalX ?? 0.5}
            onChange={(v) => onChange({ focalX: v })}
          />
          <RangeRow
            label="Y"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalY ?? 0.5}
            onChange={(v) => onChange({ focalY: v })}
          />
        </>
      )}

      {!isCustom && layer.id === "photo" && (
        <>
          <RangeRow
            label="Zoom"
            min={1}
            max={3}
            step={0.05}
            value={layer.zoom ?? 1}
            onChange={(v) => onChange({ zoom: v })}
          />
          <RangeRow
            label="X"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalX ?? 0.5}
            onChange={(v) => onChange({ focalX: v })}
          />
          <RangeRow
            label="Y"
            min={0}
            max={1}
            step={0.02}
            value={layer.focalY ?? 0.5}
            onChange={(v) => onChange({ focalY: v })}
          />
          <p className="text-[11px] text-muted-foreground">
            Scroll on the photo to zoom. Drag to move or resize.
          </p>
        </>
      )}

      {!isCustom && layer.id === "background" && (
        <p className="text-[11px] text-muted-foreground">
          The full-bleed feature photo. Use the effects below to tone, gradient
          or mask it; it always covers the whole card.
        </p>
      )}

      {!isCustom && layer.id !== "photo" && layer.id !== "background" && (
        <p className="text-[11px] text-muted-foreground">
          Drag on the canvas to move or resize. Hide it from the layer list.
        </p>
      )}

      <EffectsSection
        effects={layer.effects}
        onChange={(effects) => onChange({ effects })}
      />
    </div>
  );
}

// Per-layer visual effects: colour grade, mask shape, gradient overlay, drop
// shadow, and border — all from the club palette. "Reset" clears every effect.
// A presets row lets admins apply a saved/built-in effect bundle in one click,
// or save the current layer's effects as a new named preset.
function EffectsSection({
  effects,
  onChange,
}: {
  effects?: LayerEffects;
  onChange: (effects: LayerEffects | undefined) => void;
}) {
  const cur = effects ?? {};
  const fx = { ...DEFAULT_LAYER_EFFECTS, ...cur };
  const update = (patch: Partial<LayerEffects>) => {
    const merged = { ...DEFAULT_LAYER_EFFECTS, ...cur, ...patch };
    onChange(hasLayerEffects(merged) ? merged : undefined);
  };
  return (
    <div className="space-y-2 border-t pt-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">Effects</Label>
        {hasLayerEffects(cur) && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      <EffectPresets
        current={cur}
        onApply={(eff) => onChange(hasLayerEffects(eff) ? { ...DEFAULT_LAYER_EFFECTS, ...eff } : undefined)}
      />

      {/* Colour grade */}
      <div className="space-y-1">
        <div className="flex gap-1">
          <EffectBtn active={!cur.tone} onClick={() => update({ tone: undefined })}>
            Colour
          </EffectBtn>
          <EffectBtn active={cur.tone === "bw"} onClick={() => update({ tone: "bw" })}>
            B&amp;W
          </EffectBtn>
          <EffectBtn active={cur.tone === "duotone"} onClick={() => update({ tone: "duotone" })}>
            Duotone
          </EffectBtn>
        </div>
        {cur.tone === "duotone" && (
          <PaletteSwatches value={fx.toneColor!} onChange={(c) => update({ toneColor: c })} />
        )}
        {cur.tone && (
          <RangeRow
            label="Strength"
            min={0}
            max={1}
            step={0.05}
            value={fx.toneIntensity!}
            onChange={(v) => update({ toneIntensity: v })}
          />
        )}
      </div>

      {/* Mask shape */}
      <div className="space-y-1">
        <div className="flex gap-1">
          <EffectBtn active={!cur.mask} onClick={() => update({ mask: undefined })}>
            None
          </EffectBtn>
          <EffectBtn active={cur.mask === "rounded"} onClick={() => update({ mask: "rounded" })}>
            Rounded
          </EffectBtn>
          <EffectBtn active={cur.mask === "circle"} onClick={() => update({ mask: "circle" })}>
            Circle
          </EffectBtn>
          <EffectBtn active={cur.mask === "feather"} onClick={() => update({ mask: "feather" })}>
            Feather
          </EffectBtn>
        </div>
        {cur.mask === "rounded" && (
          <RangeRow
            label="Corner"
            min={0}
            max={0.5}
            step={0.02}
            value={fx.maskRadius!}
            onChange={(v) => update({ maskRadius: v })}
          />
        )}
        {cur.mask === "feather" && (
          <RangeRow
            label="Softness"
            min={0.05}
            max={0.9}
            step={0.05}
            value={fx.maskRadius!}
            onChange={(v) => update({ maskRadius: v })}
          />
        )}
      </div>

      {/* Gradient overlay */}
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={!!cur.gradient}
          onChange={(e) => update({ gradient: e.target.checked })}
        />
        Gradient overlay
      </label>
      {cur.gradient && (
        <div className="space-y-1 pl-4">
          <div className="flex items-center gap-2">
            <PaletteSwatches value={fx.gradientColor!} onChange={(c) => update({ gradientColor: c })} />
            <select
              value={fx.gradientDir}
              onChange={(e) => update({ gradientDir: e.target.value as LayerEffects["gradientDir"] })}
              className="h-7 flex-1 rounded border bg-card px-1 text-xs"
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <RangeRow
            label="Strength"
            min={0}
            max={1}
            step={0.05}
            value={fx.gradientIntensity!}
            onChange={(v) => update({ gradientIntensity: v })}
          />
        </div>
      )}

      {/* Drop shadow */}
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={!!cur.shadow}
          onChange={(e) => update({ shadow: e.target.checked })}
        />
        Drop shadow
      </label>
      {cur.shadow && (
        <div className="space-y-1 pl-4">
          <PaletteSwatches value={fx.shadowColor!} onChange={(c) => update({ shadowColor: c })} />
          <RangeRow
            label="Strength"
            min={0}
            max={1}
            step={0.05}
            value={fx.shadowIntensity!}
            onChange={(v) => update({ shadowIntensity: v })}
          />
        </div>
      )}

      {/* Border */}
      <label className="flex items-center gap-1 text-[11px]">
        <input
          type="checkbox"
          checked={!!cur.border}
          onChange={(e) => update({ border: e.target.checked })}
        />
        Border
      </label>
      {cur.border && (
        <div className="space-y-1 pl-4">
          <PaletteSwatches value={fx.borderColor!} onChange={(c) => update({ borderColor: c })} />
          <RangeRow
            label="Width"
            min={0.002}
            max={0.02}
            step={0.001}
            value={fx.borderWidth!}
            onChange={(v) => update({ borderWidth: v })}
          />
        </div>
      )}
    </div>
  );
}

// Reusable effect presets: apply a built-in or saved bundle to the current
// layer in one click, save the current effects as a new named preset, or delete
// a saved one. Built-ins ship with the app; saved presets persist server-side.
function EffectPresets({
  current,
  onApply,
}: {
  current: LayerEffects;
  onApply: (effects: LayerEffects) => void;
}) {
  const qc = useQueryClient();
  const { data: saved = [] } = useListCardEffectPresets();
  const createPreset = useCreateCardEffectPreset();
  const deletePreset = useDeleteCardEffectPreset();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const presets: EffectPreset[] = [
    ...BUILTIN_EFFECT_PRESETS,
    ...saved.map((p) => ({ id: p.id, name: p.name, effects: p.effects as LayerEffects })),
  ];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListCardEffectPresetsQueryKey() });

  const apply = (id: string) => {
    const p = presets.find((x) => String(x.id) === id);
    if (p) onApply(p.effects);
  };

  const saveCurrent = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createPreset.mutateAsync({ data: { name: trimmed, effects: current } });
      await invalidate();
      setName("");
      setSaving(false);
    } catch (err) {
      handleAdminMutationError(err);
    }
  };

  const removePreset = async (p: EffectPreset) => {
    const ok = await confirm({
      title: "Delete preset",
      description: `Delete the "${p.name}" effect preset? This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePreset.mutateAsync({ id: p.id });
      await invalidate();
    } catch (err) {
      handleAdminMutationError(err);
    }
  };

  return (
    <div className="space-y-1 rounded border bg-muted/30 p-2">
      <div className="flex items-center gap-1">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) apply(e.target.value);
            e.target.value = "";
          }}
          className="h-7 flex-1 rounded border bg-card px-1 text-xs"
        >
          <option value="">Apply preset…</option>
          <optgroup label="Built-in">
            {BUILTIN_EFFECT_PRESETS.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup label="Saved">
              {saved.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {!saving && (
          <button
            type="button"
            disabled={!hasLayerEffects(current)}
            onClick={() => setSaving(true)}
            title="Save current effects as a preset"
            className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
        )}
      </div>

      {saving && (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveCurrent();
              } else if (e.key === "Escape") {
                setSaving(false);
                setName("");
              }
            }}
            placeholder="Preset name"
            className="h-7 flex-1 text-xs"
          />
          <button
            type="button"
            disabled={!name.trim() || createPreset.isPending}
            onClick={() => void saveCurrent()}
            className="rounded border px-2 py-1 text-[10px] text-primary disabled:opacity-40"
          >
            {createPreset.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSaving(false);
              setName("");
            }}
            className="rounded border px-2 py-1 text-[10px] text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {saved.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px]"
            >
              {p.name}
              <button
                type="button"
                onClick={() => void removePreset({ id: p.id, name: p.name, effects: p.effects as LayerEffects })}
                title="Delete preset"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EffectBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded border px-1 py-1 text-[10px] ${
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ShapeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded border ${
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-12 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
    </label>
  );
}
