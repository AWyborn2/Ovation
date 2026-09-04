// Compositing: bake a layer to a bitmap for animation, wrap the Match Summary
// scorecard as a base layer, pick the built-in layer source for a card kind,
// and compute the normalised editor layers (built-ins merged with a saved
// layout) for the card design studio.
import { getSticker } from "../sticker-library";
import { buildLayers, loadCardAssets } from "./editor-model";
import { ensureCardFonts } from "./fonts";
import {
  drawEffectedLayer,
  drawLayerContent,
  hasLayerEffects,
  type EditorLayer,
  type PxRect,
  type RenderLayer,
} from "./layers";
import { renderMatchSummaryCard } from "./renderers/match-summary";
import {
  renderPackPortraitMatchSummary,
  renderPackSquareMatchSummary,
  renderPackStoryMatchSummary,
} from "./renderers/pack";
import { isJuniorInput, juniorThemeFromBrand, resolvePalette, type Palette } from "./theme";
import { SIZES, type RenderOptions, type ShareCardInput } from "./types";

// A baked layer: its draw() output rendered once onto a full-frame transparent
// canvas (so its pixels already sit at final position). Compositing the bitmap
// with a per-layer alpha/transform is what lets every element animate
// independently without re-running its (sometimes async) draw each frame.
export type BakedLayer = {
  layer: RenderLayer;
  bitmap: ImageBitmap | null;
  // Element-space centre + bounds (final pixels) for popIn scaling / wipe clip.
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
};

// Render a single layer onto its own full-frame canvas and snapshot it. Returns
// a null bitmap if the layer is empty/zero-sized (composited as a no-op).
export const bakeLayer = async (
  l: RenderLayer,
  W: number,
  H: number,
): Promise<BakedLayer> => {
  const rect = l.rect;
  const meta = {
    cx: rect.x + rect.w / 2,
    cy: rect.y + rect.h / 2,
    rx: rect.x,
    ry: rect.y,
    rw: rect.w,
    rh: rect.h,
  };
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { layer: l, bitmap: null, ...meta };
  // Bake with the same effect-compositing the still renderer uses, so a toned /
  // masked / gradient feature photo (or any effected layer) carries into video.
  if (hasLayerEffects(l.effects)) {
    await drawEffectedLayer(ctx, l, W, H);
  } else {
    await drawLayerContent(ctx, l);
  }
  try {
    const bitmap = await createImageBitmap(canvas);
    return { layer: l, bitmap, ...meta };
  } catch {
    return { layer: l, bitmap: null, ...meta };
  }
};

// Match Summary as a single base layer: the bespoke two-innings scorecard is
// painted onto an offscreen canvas at natural full-frame size, then wrapped as
// one geometry-locked `element` layer so it flows through the same
// computeCardLayers / applyLayout / drawLayers pipeline as every other card.
// With no saved layout the layer draws 1:1 at (0,0) under an identity transform,
// so the output is byte-identical to the original bespoke renderer; admins can
// still add image/text/sticker overlays and toggle / restack / effect it.
const buildMatchSummaryLayers = async (
  input: Extract<ShareCardInput, { kind: "matchSummary" }>,
  opts: RenderOptions,
  p: Palette,
  W: number,
  H: number,
  scale: number,
): Promise<RenderLayer[]> => {
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const offCtx = off.getContext("2d");
  if (offCtx) {
    // If a pack template is applied, dispatch to the pack variant renderer
    if (opts.template?.source === "pack" && opts.template.packVariant) {
      const variant = opts.template.packVariant;
      if (variant === "square") await renderPackSquareMatchSummary(offCtx, W, H, scale, input, opts, p);
      else if (variant === "portrait") await renderPackPortraitMatchSummary(offCtx, W, H, scale, input, opts, p);
      else if (variant === "story") await renderPackStoryMatchSummary(offCtx, W, H, scale, input, opts, p);
      else await renderMatchSummaryCard(offCtx, W, H, scale, input, opts, p);
    } else {
      await renderMatchSummaryCard(offCtx, W, H, scale, input, opts, p);
    }
  }
  const natural: PxRect = { x: 0, y: 0, w: W, h: H };
  return [
    {
      id: "scorecard",
      editKind: "element",
      label: "Scorecard",
      natural,
      rect: { ...natural },
      vAnchor: "top",
      z: 0,
      hidden: false,
      selectable: true,
      // Geometry-locked (like the background): the full-frame scorecard never
      // persists x/y/w/h, so it stays correct across square/portrait/story.
      resizable: false,
      drawsAtNatural: true,
      draw: (ctx) => {
        ctx.drawImage(off, 0, 0);
      },
    },
  ];
};

// The built-in layer source for a card kind: matchSummary renders its bespoke
// scorecard into a single base layer; every other kind builds the standard body.
// Shared by the editor, the still renderer, and the animation baker so all three
// agree on the layer model.
export const buildBuiltinLayers = async (
  input: ShareCardInput,
  opts: RenderOptions,
  p: Palette,
  W: number,
  H: number,
  scale: number,
): Promise<RenderLayer[]> => {
  if (input.kind === "matchSummary") {
    return buildMatchSummaryLayers(input, opts, p, W, H, scale);
  }
  const assets = await loadCardAssets(input, opts);
  return buildLayers(input, opts, p, W, H, scale, assets);
};

// Exported for the editor: compute the normalised editable layers for a card,
// merging any saved layout. Returns [] only when a custom template is selected
// (matchSummary now flows through the layer pipeline as a base scorecard layer).
export const computeCardLayers = async (
  input: ShareCardInput,
  opts: RenderOptions,
): Promise<EditorLayer[]> => {
  // BYO templates bypass the layer pipeline; pack templates flow through it
  // because their renderers paint onto the scorecard base layer.
  if (opts.template && opts.template.source !== "pack") return [];
  await ensureCardFonts();
  const { w: W, h: H } = SIZES[opts.size];
  const scale = W / 1080;
  const p = isJuniorInput(input)
    ? resolvePalette(juniorThemeFromBrand(opts.brand), opts.brand)
    : resolvePalette(opts.theme, opts.brand);
  const builtins = await buildBuiltinLayers(input, opts, p, W, H, scale);
  const toNorm = (l: RenderLayer): EditorLayer => ({
    id: l.id,
    editKind: l.editKind,
    label: l.label,
    selectable: l.selectable,
    resizable: l.resizable,
    x: l.rect.x / 1080,
    y: (l.vAnchor === "bottom" ? H - l.rect.y : l.rect.y) / 1080,
    w: l.rect.w / 1080,
    h: l.rect.h / 1080,
    vAnchor: l.vAnchor,
    z: l.z,
    hidden: l.hidden,
    focalX: l.photoTransform?.focalX,
    focalY: l.photoTransform?.focalY,
    zoom: l.photoTransform?.zoom,
    effects: l.effects,
  });
  const order: EditorLayer[] = builtins.map(toNorm);
  const byId = new Map(order.map((e) => [e.id, e]));
  for (const s of opts.layout ?? []) {
    if (s.kind === "element") {
      const e = byId.get(s.id);
      if (!e) continue;
      if (typeof s.x === "number") e.x = s.x;
      if (typeof s.y === "number") e.y = s.y;
      if (typeof s.w === "number") e.w = s.w;
      if (typeof s.h === "number") e.h = s.h;
      if (typeof s.z === "number") e.z = s.z;
      if (typeof s.hidden === "boolean") e.hidden = s.hidden;
      if (typeof s.focalX === "number") e.focalX = s.focalX;
      if (typeof s.focalY === "number") e.focalY = s.focalY;
      if (typeof s.zoom === "number") e.zoom = s.zoom;
      // The Background element can carry an uploaded full-bleed image.
      if (typeof s.url === "string") e.url = s.url;
      if (s.fit) e.fit = s.fit;
      if (hasLayerEffects(s.effects)) e.effects = s.effects;
    } else {
      order.push({
        id: s.id,
        editKind: s.kind,
        label:
          s.kind === "image"
            ? "Image"
            : s.kind === "sticker"
              ? "Shape"
              : s.kind === "libsticker"
                ? getSticker(s.assetId)?.name ?? "Sticker"
                : "Text",
        selectable: true,
        resizable: true,
        x: s.x ?? 0,
        y: s.y ?? 0,
        w: s.w ?? 0.2,
        h: s.h ?? 0.1,
        vAnchor: (s.vAnchor ?? "top") as "top" | "bottom",
        z: s.z ?? order.length,
        hidden: s.hidden ?? false,
        url: s.url,
        shape: s.shape,
        fit: s.fit,
        focalX: s.focalX,
        focalY: s.focalY,
        zoom: s.zoom,
        color: s.color,
        radius: s.radius,
        text: s.text,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        align: s.align,
        fontFamily: s.fontFamily,
        uppercase: s.uppercase,
        assetId: s.assetId,
        field: s.field,
        effects: hasLayerEffects(s.effects) ? s.effects : undefined,
      });
    }
  }
  return order.sort((a, b) => a.z - b.z);
};
