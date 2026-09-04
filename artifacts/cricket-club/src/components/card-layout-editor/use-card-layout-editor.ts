import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import {
  useListCardLayouts,
  useUpsertCardLayout,
  useDeleteCardLayout,
  getListCardLayoutsQueryKey,
  type CardLayout,
  type CardLayoutLayer,
} from "@workspace/api-client-react";
import { getSticker, type StickerAsset } from "@/lib/sticker-library";
import {
  SIZES,
  computeCardLayers,
  renderShareCard,
  type CardKind,
  type EditorLayer,
  type RenderOptions,
} from "@/lib/share-card";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";
import { useConfirm } from "@/components/confirm-dialog";
import { editorToSaved } from "./editor-to-saved";
import { clamp, newId } from "./utils";
import type { CardLayoutEditorProps } from "./types";

/**
 * All editor state for `CardLayoutEditor`: the pristine/working layer sets,
 * debounced preview rendering, add/remove/restack/patch operations, template
 * form fields, and the save/reset flows for the three persistence modes
 * (per-kind `card_layouts`, controlled carousel slide, named template).
 */
export function useCardLayoutEditor({
  input,
  baseOpts,
  activeSize,
  onClose,
  controlledLayout,
  onSaveLayout,
  templateMode,
}: CardLayoutEditorProps) {
  const cardKind = input.kind;
  const isTemplate = !!templateMode;
  // Template mode also seeds from `controlledLayout` and never touches the
  // per-kind card_layouts table, so it shares the controlled seeding path.
  const controlled = !!onSaveLayout || isTemplate;
  const qc = useQueryClient();
  const confirm = useConfirm();

  // Prefetch the decorative card fonts (no longer in index.html) as soon as the
  // editor mounts, so the font dropdown previews/exports don't wait on Google.
  useEffect(() => {
    void ensureCardFontsLoaded();
  }, []);

  const layoutsQ = useListCardLayouts();
  const savedLayers = useMemo<CardLayoutLayer[]>(() => {
    if (controlled) return controlledLayout ?? [];
    const row = (layoutsQ.data as CardLayout[] | undefined)?.find((l) => l.cardKind === cardKind);
    return row?.layers ?? [];
  }, [controlled, controlledLayout, layoutsQ.data, cardKind]);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListCardLayoutsQueryKey() });
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
    if (r)
      addLayer("image", {
        url: `/api/storage${r.objectPath}`,
        shape: "rect",
        fit: "cover",
        zoom: 1,
        focalX: 0.5,
        focalY: 0.5,
      });
  };

  // Upload an image and return its public URL (used by the Background layer's
  // full-bleed image upload in the inspector). Returns null on failure.
  const uploadImage = async (file: File): Promise<string | null> => {
    setError(null);
    const r = await imgUpload.uploadFile(file);
    return r ? `/api/storage${r.objectPath}` : null;
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
  const pending = isTemplate ? templateMode!.saving : upsert.isPending || remove.isPending;
  const { w: W, h: H } = SIZES[activeSize];

  return {
    cardKind,
    isTemplate,
    layers,
    selectedId,
    setSelectedId,
    selected,
    showStickers,
    setShowStickers,
    previewUrl,
    computing,
    rendering,
    error,
    pending,
    W,
    H,
    imgUploading: imgUpload.isUploading,
    // Template-mode form
    tplName,
    setTplName,
    tplKinds,
    setTplKinds,
    tplDefaults,
    setTplDefaults,
    // Layer operations
    patchLayer,
    removeLayer,
    restack,
    addLayer,
    addSticker,
    handleAddImage,
    handleDropSticker,
    uploadImage,
    // Persistence
    handleSave,
    handleReset,
  };
}
