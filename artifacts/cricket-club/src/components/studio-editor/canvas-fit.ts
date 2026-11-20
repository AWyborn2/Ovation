/**
 * How big the canvas draws in a New Studio editor, and where everything around
 * it sits. Nothing may cover the card or slide being edited: every settings
 * panel and menu is docked beside it (the left-hand panel, the dock on the
 * right) or in the toolbar strip above it, and the canvas fits the space they
 * leave, so the whole slide stays in view at 100% zoom.
 */
import { DOCK_WIDTH } from "./dock";

/** The editor's fixed chrome (px). */
export const EDITOR_TOP_BAR = 56;
export const EDITOR_BOTTOM_BAR = 56;
export const EDITOR_RAIL = 76;
export const EDITOR_PANEL = 340;
export { DOCK_WIDTH };

/** Space round the canvas in its stage (px), each side and below. */
export const STAGE_PAD = 24;
/**
 * The toolbar strip above the canvas (px): its top padding, the toolbar (one
 * row since its settings moved to the panel beside the rail, PR #698) and the
 * gap under it. The strip is at least this tall, so the toolbar changing as
 * the selection changes never moves or resizes the canvas. A band as tall is
 * kept under the canvas, so the canvas sits in the middle of its area.
 */
export const TOOLBAR_STRIP = 64;

export type Box = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

/**
 * The canvas area (the editor's `main`) worked out from the viewport, for when
 * it can't be measured (before layout, and in tests): the viewport less the
 * top and bottom bars, the slide strip, the rail, the left panel and the dock.
 */
export function estimateCanvasArea({
  viewport,
  panelOpen,
  dockOpen,
  stripHeight = 0,
}: {
  viewport: Size;
  panelOpen: boolean;
  dockOpen: boolean;
  stripHeight?: number;
}): Size {
  return {
    w: viewport.w - EDITOR_RAIL - (panelOpen ? EDITOR_PANEL : 0) - (dockOpen ? DOCK_WIDTH : 0),
    h: viewport.h - EDITOR_TOP_BAR - EDITOR_BOTTOM_BAR - stripHeight,
  };
}

/** The room the canvas has in an area: the area less the toolbar strip and the stage's padding. */
export function canvasRoom(area: Size): Size {
  return {
    w: Math.max(0, area.w - 2 * STAGE_PAD),
    h: Math.max(0, area.h - 2 * TOOLBAR_STRIP),
  };
}

/**
 * The canvas's width (px) for a card of `native` size at `zoom` percent: at
 * 100% the whole card fits the room the area leaves it.
 */
export function boardWidth(area: Size, native: Size, zoom: number): number {
  const room = canvasRoom(area);
  const fit = Math.min(room.w / native.w, room.h / native.h);
  return Math.max(120, Math.floor(native.w * fit * (zoom / 100)));
}

/**
 * Where the canvas and the dock sit on screen, as the editor lays them out:
 * the canvas centred across its stage, just under the toolbar strip, the dock its own
 * column to the right of the canvas area. For checking that nothing docked
 * covers the canvas.
 */
export function editorLayout({
  viewport,
  native,
  zoom = 100,
  panelOpen,
  dockOpen,
  stripHeight = 0,
}: {
  viewport: Size;
  native: Size;
  zoom?: number;
  panelOpen: boolean;
  dockOpen: boolean;
  stripHeight?: number;
}): { area: Box; canvas: Box; dock: Box | null } {
  const size = estimateCanvasArea({ viewport, panelOpen, dockOpen, stripHeight });
  const area: Box = {
    x: EDITOR_RAIL + (panelOpen ? EDITOR_PANEL : 0),
    y: EDITOR_TOP_BAR,
    ...size,
  };
  const w = boardWidth(size, native, zoom);
  const h = (w * native.h) / native.w;
  const room = canvasRoom(size);
  const canvas: Box = {
    x: area.x + STAGE_PAD + Math.max(0, (room.w - w) / 2),
    y: area.y + TOOLBAR_STRIP + Math.max(0, (room.h - h) / 2),
    w,
    h,
  };
  const dock: Box | null = dockOpen
    ? { x: area.x + area.w, y: EDITOR_TOP_BAR, w: DOCK_WIDTH, h: size.h }
    : null;
  return { area, canvas, dock };
}

/** True when two boxes share any area (touching edges don't count). */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** True when `inner` lies wholly inside `outer`. */
export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
