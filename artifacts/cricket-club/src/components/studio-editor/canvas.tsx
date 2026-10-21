import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { layerOnSize, type LayoutWarning } from "@workspace/scorecard/kind-templates";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import type { FreeLayer, LayerBox, PackCardData } from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { fitLayersInDom } from "@/lib/pack-render/layer-fit";
import { boxOf, clamp, layersOf, setBoxes, type EditorDoc } from "./document";
import { boundsOf, snapMove, snapRotation, type Guide } from "./guides";
import { contains, resizeBounds, resizeGroup, type ResizeHandle } from "./arrange";

type Handle = ResizeHandle;
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
};
const MIN_SIZE = 2;

/** Keep a gesture's pointer events on its element; best-effort (it throws if the pointer is gone). */
function capturePointer(e: ReactPointerEvent): void {
  try {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  } catch {
    // The gesture still works through the artboard's own handlers.
  }
}

type Drag =
  | { kind: "move"; x0: number; y0: number; start: Record<string, LayerBox> }
  | { kind: "resize"; handle: Handle; x0: number; y0: number; start: LayerBox; id: string }
  | { kind: "rotate"; id: string; cx: number; cy: number }
  | {
      kind: "group";
      handle: Handle;
      x0: number;
      y0: number;
      from: { x: number; y: number; w: number; h: number };
      start: FreeLayer[];
    }
  | { kind: "marquee"; x0: number; y0: number; additive: boolean };

type Rect = { x: number; y: number; w: number; h: number };
type ModifierKeys = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };
const isCorner = (h: Handle) => h.length === 2;

/**
 * The editor artboard (Social Studio U16): the real pack render of the
 * document underneath, and an interactive overlay for free layers — click to
 * select (the whole group unless inside it), shift- or ctrl-click to
 * multi-select, drag from the canvas around the card (or an empty card) to
 * select by marquee, drag to move
 * with smart guides, handles to resize (several layers together from their
 * bounds; a corner keeps proportions and scales the type), and a rotate
 * handle that snaps to 0/±90/180. Changes stream to `onChange(doc, false)` while dragging
 * and commit with `onChange(doc, true)` on release.
 *
 * Pointer events cover mouse, pen and touch alike; on a coarse pointer (a
 * tablet) the handles grow to a finger-sized target (kind templates, R23).
 * Layers not on the current size (a template's per-size presence) are not
 * shown. With `onLayout`, live-field text is shrunk to fit after each render
 * and the overflow warnings reported, as the server render does (KTD9).
 */
export function EditorCanvas({
  doc,
  size,
  width,
  input,
  theme,
  data,
  packId,
  junior = false,
  selection,
  onSelect,
  onToggle,
  onSelectMany,
  marqueeArea,
  onEnterGroup,
  onChange,
  onLayout,
  flagged = [],
  touch = false,
}: {
  doc: EditorDoc;
  size: CardSize;
  /** Display width of the artboard in px. */
  width: number;
  input: ShareCardInput;
  theme: ApiCardTheme | null;
  data: PackCardData | null;
  packId: string | null;
  /** A junior card (a junior slide of a balanced set): juniors palette. */
  junior?: boolean;
  selection: string[];
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  /** Marquee selection: the layers inside the box, added to the selection or replacing it. */
  onSelectMany?: (ids: string[], additive: boolean) => void;
  /** The canvas around the card: a drag that starts on it draws a marquee too. */
  marqueeArea?: RefObject<HTMLElement | null>;
  onEnterGroup: (id: string) => void;
  onChange: (doc: EditorDoc, commit: boolean) => void;
  /** Run the shrink-to-fit step after each render and report what still overflows. */
  onLayout?: (warnings: LayoutWarning[]) => void;
  /** Layers to outline as needing a look. */
  flagged?: string[];
  /** Tablet editing: drags never scroll the page, and handles grow on touch screens. */
  touch?: boolean;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [scalingType, setScalingType] = useState(false);

  const layers = layersOf(doc).filter((l) => !l.hidden && layerOnSize(l, size));

  // Shrink-to-fit runs on the rendered card, so it reflects real fonts and boxes.
  const layoutRef = useRef(onLayout);
  layoutRef.current = onLayout;
  const docJson = JSON.stringify(doc);
  const inputJson = JSON.stringify(input);
  const fitting = !!onLayout;
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!fitting || !board) return;
    const run = () => layoutRef.current?.(fitLayersInDom(board, size));
    run();
    // The card can commit its markup after this effect (and replaces it on
    // every change), which would wipe the fit: re-fit whenever its content
    // changes. The fit itself only touches attributes, so it can't retrigger.
    const observer = new MutationObserver(run);
    observer.observe(board, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [fitting, docJson, inputJson, size, width, junior, data]);
  const selected = layers.filter((l) => selection.includes(l.id));
  const selectedBoxes = selected.map((l) => boxOf(l, size)).filter((b): b is LayerBox => !!b);
  const single = selected.length === 1 ? selected[0] : null;
  const singleBox = single ? boxOf(single, size) : null;

  const rect = () => boardRef.current?.getBoundingClientRect();
  const toPct = (dxPx: number, dyPx: number) => {
    const r = rect();
    return r ? { dx: (dxPx / r.width) * 100, dy: (dyPx / r.height) * 100 } : { dx: 0, dy: 0 };
  };
  const pointPct = (clientX: number, clientY: number) => {
    const r = rect();
    return r && r.width > 0 && r.height > 0
      ? { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 }
      : { x: 0, y: 0 };
  };
  const marqueeRect = (d: { x0: number; y0: number }, clientX: number, clientY: number): Rect => {
    const a = pointPct(d.x0, d.y0);
    const b = pointPct(clientX, clientY);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
  };

  const onLayerPointerDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onToggle(id);
      return;
    }
    if (!selection.includes(id)) onSelect(id);
    // Selection updates next render; move whatever is (or becomes) selected.
    const ids = selection.includes(id) ? selection : [id];
    const start: Record<string, LayerBox> = {};
    for (const l of layersOf(doc)) {
      const b = boxOf(l, size);
      if (b && !l.locked && (ids.includes(l.id) || (l.group && sameGroup(id, l.group)))) {
        start[l.id] = b;
      }
    }
    drag.current = { kind: "move", x0: e.clientX, y0: e.clientY, start };
    capturePointer(e);
  };

  const sameGroup = (id: string, group: string) =>
    layersOf(doc).find((l) => l.id === id)?.group === group;

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "marquee") return;
    if (d.kind === "group") {
      const { dx, dy } = toPct(e.clientX - d.x0, e.clientY - d.y0);
      const to = resizeBounds(d.from, d.handle, dx, dy, MIN_SIZE);
      onChange(resizeGroup(doc, size, d.start, d.from, to, isCorner(d.handle)), false);
      return;
    }
    if (d.kind === "move") {
      const { dx, dy } = toPct(e.clientX - d.x0, e.clientY - d.y0);
      const ids = Object.keys(d.start);
      const moved = boundsOf(
        ids.map((id) => ({ ...d.start[id], x: d.start[id].x + dx, y: d.start[id].y + dy })),
      );
      const others = layers
        .filter((l) => !ids.includes(l.id))
        .map((l) => boxOf(l, size))
        .filter((b): b is LayerBox => !!b);
      const snap = snapMove(moved, others);
      const sdx = dx + (snap.x - moved.x);
      const sdy = dy + (snap.y - moved.y);
      setGuides(snap.guides);
      const boxes: Record<string, LayerBox> = {};
      for (const id of ids) {
        boxes[id] = { ...d.start[id], x: d.start[id].x + sdx, y: d.start[id].y + sdy };
      }
      onChange(setBoxes(doc, size, boxes), false);
    } else if (d.kind === "resize") {
      const { dx, dy } = toPct(e.clientX - d.x0, e.clientY - d.y0);
      const b = { ...d.start };
      if (d.handle.includes("e")) b.w = Math.max(MIN_SIZE, d.start.w + dx);
      if (d.handle.includes("s")) b.h = Math.max(MIN_SIZE, d.start.h + dy);
      if (d.handle.includes("w")) {
        b.w = Math.max(MIN_SIZE, d.start.w - dx);
        b.x = d.start.x + d.start.w - b.w;
      }
      if (d.handle.includes("n")) {
        b.h = Math.max(MIN_SIZE, d.start.h - dy);
        b.y = d.start.y + d.start.h - b.h;
      }
      onChange(setBoxes(doc, size, { [d.id]: b }), false);
    } else {
      const angle = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
      const current = singleBox ?? { x: 0, y: 0, w: 0, h: 0 };
      onChange(setBoxes(doc, size, { [d.id]: { ...current, rotate: snapRotation(angle) } }), false);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d?.kind === "marquee") return;
    drag.current = null;
    setGuides([]);
    setScalingType(false);
    if (d) onChange(doc, true);
  };

  // The marquee follows the pointer through window listeners, so it can start
  // on the canvas around the card and end anywhere.
  const finishMarquee = useRef<(x: number, y: number) => void>(() => {});
  finishMarquee.current = (clientX, clientY) => {
    const d = drag.current;
    if (d?.kind !== "marquee") return;
    drag.current = null;
    setMarquee(null);
    const m = marqueeRect(d, clientX, clientY);
    // A click (no real drag) clears the selection. A drag picks the layers
    // wholly inside it, so a full-card background isn't swept up as well.
    const hit =
      m.w < 0.5 && m.h < 0.5
        ? []
        : layers
            .filter((l) => !l.locked)
            .filter((l) => {
              const b = boxOf(l, size);
              return !!b && contains(m, b);
            })
            .map((l) => l.id);
    if (hit.length) onSelectMany?.(hit, d.additive);
    else if (!d.additive) onSelect(null);
  };
  const moveMarquee = useRef<(x: number, y: number) => void>(() => {});
  moveMarquee.current = (clientX, clientY) => {
    const d = drag.current;
    if (d?.kind === "marquee") setMarquee(marqueeRect(d, clientX, clientY));
  };
  const startMarquee = (e: { clientX: number; clientY: number } & ModifierKeys) => {
    drag.current = {
      kind: "marquee",
      x0: e.clientX,
      y0: e.clientY,
      additive: e.shiftKey || e.ctrlKey || e.metaKey,
    };
    const move = (ev: PointerEvent) => moveMarquee.current(ev.clientX, ev.clientY);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      finishMarquee.current(ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const startMarqueeRef = useRef(startMarquee);
  startMarqueeRef.current = startMarquee;

  const onBoardPointerDown = (e: ReactPointerEvent) => {
    if (!onSelectMany) {
      onSelect(null);
      return;
    }
    startMarquee(e);
  };

  // A drag on the empty canvas around the card (the area itself, not its
  // toolbars or notes) starts a marquee as well.
  const marqueeOn = !!onSelectMany;
  useEffect(() => {
    const area = marqueeArea?.current;
    if (!area || !marqueeOn) return;
    const down = (e: PointerEvent) => {
      if (e.target === area && e.button === 0) startMarqueeRef.current(e);
    };
    area.addEventListener("pointerdown", down);
    return () => area.removeEventListener("pointerdown", down);
  }, [marqueeArea, marqueeOn]);

  const movable = selected.filter((l) => !l.locked && boxOf(l, size));
  const startGroupResize = (e: ReactPointerEvent, handle: Handle) => {
    e.stopPropagation();
    if (movable.length < 2) return;
    const from = boundsOf(movable.map((l) => boxOf(l, size)!));
    drag.current = {
      kind: "group",
      handle,
      x0: e.clientX,
      y0: e.clientY,
      from,
      start: structuredClone(movable),
    };
    setScalingType(isCorner(handle) && movable.some((l) => l.style?.fontSize || l.rows));
    capturePointer(e);
  };

  const startResize = (e: ReactPointerEvent, handle: Handle) => {
    e.stopPropagation();
    if (!single || !singleBox || single.locked) return;
    drag.current = {
      kind: "resize",
      handle,
      x0: e.clientX,
      y0: e.clientY,
      start: singleBox,
      id: single.id,
    };
    capturePointer(e);
  };

  const startRotate = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const r = rect();
    if (!single || !singleBox || !r || single.locked) return;
    drag.current = {
      kind: "rotate",
      id: single.id,
      cx: r.left + ((singleBox.x + singleBox.w / 2) / 100) * r.width,
      cy: r.top + ((singleBox.y + singleBox.h / 2) / 100) * r.height,
    };
    capturePointer(e);
  };

  const bounds = selectedBoxes.length > 1 ? boundsOf(selectedBoxes) : null;
  const groupLabel =
    selected.length > 1
      ? selected.every((l) => l.group && l.group === selected[0].group)
        ? `Group · ${selected.length} layers`
        : `${selected.length} selected`
      : null;

  return (
    <div
      ref={boardRef}
      data-testid="editor-artboard"
      className={cn(
        "relative select-none shadow-[0_24px_48px_-16px_rgba(0,0,0,.7)]",
        touch && "touch-none",
      )}
      style={{ width }}
      onPointerDown={onBoardPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <PackCard
        input={input}
        size={size}
        sponsorsOn
        junior={junior}
        theme={theme}
        data={data}
        packId={packId}
        adjustments={doc}
        width={width}
      />

      <div className="absolute inset-0">
        {layers.map((l) => {
          const b = boxOf(l, size);
          if (!b) return null;
          const isSel = selection.includes(l.id);
          const isFlagged = flagged.includes(l.id);
          return (
            <div
              key={l.id}
              data-testid={`layer-${l.id}`}
              aria-label={l.name ?? l.kind}
              className={cn(
                "absolute",
                l.locked ? "pointer-events-none" : "cursor-move",
                isSel &&
                  selected.length > 1 &&
                  "outline outline-[1.5px] outline-[var(--ed-accent)]",
                isFlagged &&
                  !isSel &&
                  "outline outline-2 outline-dashed outline-[var(--ed-danger)]",
              )}
              style={{
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `${b.w}%`,
                height: `${b.h}%`,
                transform: b.rotate ? `rotate(${b.rotate}deg)` : undefined,
              }}
              onPointerDown={(e) => onLayerPointerDown(e, l.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (l.group) onEnterGroup(l.id);
              }}
            />
          );
        })}

        {single && singleBox && (
          <div
            data-testid="selection-box"
            className="pointer-events-none absolute outline outline-2 outline-[var(--ed-accent)]"
            style={{
              left: `${singleBox.x}%`,
              top: `${singleBox.y}%`,
              width: `${singleBox.w}%`,
              height: `${singleBox.h}%`,
              transform: singleBox.rotate ? `rotate(${singleBox.rotate}deg)` : undefined,
            }}
          >
            {!single.locked &&
              HANDLES.map((h) => (
                <span
                  key={h}
                  aria-label={`Resize ${h}`}
                  className={cn(
                    "pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[var(--ed-accent)] bg-white",
                    touch &&
                      "[@media(pointer:coarse)]:h-6 [@media(pointer:coarse)]:w-6 [@media(pointer:coarse)]:rounded-full",
                  )}
                  style={{
                    left: HANDLE_POS[h].left,
                    top: HANDLE_POS[h].top,
                    cursor: HANDLE_POS[h].cursor,
                  }}
                  onPointerDown={(e) => startResize(e, h)}
                />
              ))}
            {!single.locked && (
              <span
                aria-label="Rotate"
                className={cn(
                  "pointer-events-auto absolute left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-[var(--ed-accent)] bg-white",
                  touch && "[@media(pointer:coarse)]:h-7 [@media(pointer:coarse)]:w-7",
                )}
                style={{ top: "calc(100% + 30px)" }}
                onPointerDown={startRotate}
              />
            )}
          </div>
        )}

        {bounds && (
          <div
            data-testid="multi-bounds"
            className="pointer-events-none absolute border border-dashed border-[var(--ed-accent)]"
            style={{
              left: `${bounds.x}%`,
              top: `${bounds.y}%`,
              width: `${bounds.w}%`,
              height: `${bounds.h}%`,
            }}
          >
            <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-[var(--ed-accent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ed-on-accent)]">
              {scalingType ? "Text size applies to all sizes" : groupLabel}
            </span>
            {movable.length > 1 &&
              HANDLES.map((h) => (
                <span
                  key={h}
                  aria-label={`Resize selection ${h}`}
                  className={cn(
                    "pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[var(--ed-accent)] bg-white",
                    touch &&
                      "[@media(pointer:coarse)]:h-6 [@media(pointer:coarse)]:w-6 [@media(pointer:coarse)]:rounded-full",
                  )}
                  style={{
                    left: HANDLE_POS[h].left,
                    top: HANDLE_POS[h].top,
                    cursor: HANDLE_POS[h].cursor,
                  }}
                  onPointerDown={(e) => startGroupResize(e, h)}
                />
              ))}
          </div>
        )}

        {marquee && (
          <div
            data-testid="marquee"
            className="pointer-events-none absolute border border-[var(--ed-accent)] bg-[var(--ed-accent)]/10"
            style={{
              left: `${marquee.x}%`,
              top: `${marquee.y}%`,
              width: `${marquee.w}%`,
              height: `${marquee.h}%`,
            }}
          />
        )}

        {guides.map((g, i) => (
          <div
            key={i}
            data-testid={`guide-${g.axis}`}
            className="pointer-events-none absolute bg-[var(--ed-guide)]"
            style={
              g.axis === "x"
                ? { left: `${clamp(g.at, 0, 100)}%`, top: 0, bottom: 0, width: 1 }
                : { top: `${clamp(g.at, 0, 100)}%`, left: 0, right: 0, height: 1 }
            }
          />
        ))}
      </div>
    </div>
  );
}
