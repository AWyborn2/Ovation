import { useEffect, useMemo, useState } from "react";
import {
  useListCardTemplates,
  getListCardTemplatesQueryKey,
  useListCardLayouts,
  getListCardLayoutsQueryKey,
  type CardTemplate,
  type CardLayout,
  type CardLayoutLayer,
} from "@workspace/api-client-react";
import {
  templateAppliesToKind,
  resolveDefaultLayoutTemplate,
  resolvePackIdForKind,
} from "@/lib/card-template";
import { packImageSlots } from "@/lib/pack-render";
import { useCurrentAdmin } from "@/lib/admin-auth";
import type { Props } from "./constants";

/**
 * Which design renders this card: BYO template vs built-in, the resolved
 * design pack, the admin's saved per-kind layout, the layout editor toggle,
 * and the per-slot image overrides (B1) the pack template exposes.
 */
export function useLayoutTemplate({
  open,
  input,
  isJunior,
}: {
  open: boolean;
  input: Props["input"];
  isJunior: boolean;
}) {
  // --- Per-slot image overrides (B1) -----------------------------------------
  // A generic slot-key → url map letting an admin repoint ANY image slot the
  // pack template exposes (logo, sponsor tile, POTM headshot, …) — the slots the
  // descriptor `image` fields don't cover. Threaded onto `PackCardData.imagesOverride`
  // (override > input > bind) so it wins in the renderer and flows to the server
  // still export via the same `buildPackData`. Reset whenever the card changes.
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});
  useEffect(() => {
    setImageOverrides({});
  }, [open, input]);
  const setSlotOverride = (key: string, url: string) =>
    setImageOverrides((prev) => {
      const next = { ...prev };
      if (url) next[key] = url;
      else delete next[key];
      return next;
    });

  // Custom "bring your own" templates that apply to this card kind.
  const templatesQ = useListCardTemplates({
    query: { enabled: open, queryKey: getListCardTemplatesQueryKey() },
  });
  const applicableTemplates = useMemo<CardTemplate[]>(() => {
    if (!input) return [];
    return (templatesQ.data ?? []).filter((t) =>
      templateAppliesToKind(t, input.kind),
    );
  }, [templatesQ.data, input]);
  // `null` = built-in layout; otherwise a template id.
  const [layoutId, setLayoutId] = useState<number | null>(null);
  const [layoutTouched, setLayoutTouched] = useState(false);
  // Pre-select the per-kind default template when one applies; otherwise keep
  // built-in. A template is the default for kind K iff K ∈ defaultForKinds;
  // fall back to the legacy global `isDefault` flag for older templates.
  // `source: "pack"` rows are excluded (see `resolveDefaultLayoutTemplate`):
  // the pack-per-kind decision is read only via `resolvePackIdForKind`, and a
  // pack row claiming a kind is not the admin choosing a BYO layout.
  useEffect(() => {
    if (!open || layoutTouched || !input) return;
    const def = resolveDefaultLayoutTemplate(applicableTemplates, input.kind);
    if (def) setLayoutId(def.id);
  }, [open, layoutTouched, applicableTemplates, input]);
  // Reset the layout choice each time the modal opens or the card changes.
  useEffect(() => {
    if (open) {
      setLayoutId(null);
      setLayoutTouched(false);
    }
  }, [open, input]);
  const selectedTemplate = useMemo<CardTemplate | null>(
    () =>
      isJunior || layoutId === null
        ? null
        : applicableTemplates.find((t) => t.id === layoutId) ?? null,
    [isJunior, layoutId, applicableTemplates],
  );
  // A layer-source template feeds the layer pipeline (opts.layout); only a
  // background template drives opts.template. Splitting them here keeps the rest
  // of the modal (animation, dropdown) using the single `selectedTemplate` pick.
  const isLayerTemplate = selectedTemplate?.source === "layers";
  // A pack-source row selects a DESIGN PACK, not a background image. It has no
  // bgImageUrl and no layers, so it must not reach the canvas renderer — it
  // routes to the pack path via `packId` below. `ensurePackTemplates`
  // (api-server lib/design-packs.ts) materialises these rows per tenant, and
  // until Phase 2 the renderer ignored them: selecting one produced a blank
  // canvas card rather than that pack's design.
  const isPackTemplate = selectedTemplate?.source === "pack";
  const bgTemplate = isLayerTemplate || isPackTemplate ? null : selectedTemplate;
  /**
   * The pack supplying the design: an explicitly selected pack row's, else the
   * tenant's per-kind choice, else the renderer's default.
   *
   * The middle case is load-bearing. Pack rows are excluded from the layout
   * pre-selection above (they are not a BYO layout choice), so on the built-in
   * path `selectedTemplate` is null — and reading `packId` off it alone would
   * hand every export the default pack no matter which pack the tenant picked
   * in the Studio. `resolvePackIdForKind` is the single reader of that choice,
   * exactly as the composer, carousel and gallery use it.
   */
  const packId = isPackTemplate
    ? selectedTemplate?.packId ?? null
    : selectedTemplate === null && input
      ? resolvePackIdForKind(templatesQ.data as CardTemplate[] | undefined, input.kind)
      : null;
  // Image slots (photo/logo) the resolved pack's design for this kind exposes.
  // Declared after `packId` because packs differ in which slots they offer.
  const imageSlots = useMemo(
    () => (input ? packImageSlots(input, { packId }) : []),
    [input, packId],
  );
  const templateLayers = useMemo<CardLayoutLayer[] | null>(
    () => (isLayerTemplate ? selectedTemplate?.layers ?? [] : null),
    [isLayerTemplate, selectedTemplate],
  );

  // Admin-only layer authoring. The saved custom layout (if any) drives every
  // render — preview, PNG and zip — for both admins and the public; only admins
  // get the "Customise layout" editor.
  const adminQ = useCurrentAdmin();
  const isAdmin = !!adminQ.data;
  const layoutsQ = useListCardLayouts({
    query: { enabled: open, queryKey: getListCardLayoutsQueryKey() },
  });
  const savedLayout = useMemo<CardLayoutLayer[]>(() => {
    if (!input) return [];
    const row = (layoutsQ.data as CardLayout[] | undefined)?.find(
      (l) => l.cardKind === input.kind,
    );
    return row?.layers ?? [];
  }, [layoutsQ.data, input]);
  const layoutSig = useMemo(
    () => (savedLayout.length ? JSON.stringify(savedLayout) : "none"),
    [savedLayout],
  );
  const [editingLayout, setEditingLayout] = useState(false);
  useEffect(() => {
    if (!open) setEditingLayout(false);
  }, [open]);

  return {
    applicableTemplates,
    layoutId,
    setLayoutId,
    setLayoutTouched,
    selectedTemplate,
    isLayerTemplate,
    isPackTemplate,
    bgTemplate,
    packId,
    imageSlots,
    templateLayers,
    isAdmin,
    savedLayout,
    layoutSig,
    editingLayout,
    setEditingLayout,
    imageOverrides,
    setImageOverrides,
    setSlotOverride,
  };
}

export type LayoutTemplate = ReturnType<typeof useLayoutTemplate>;
