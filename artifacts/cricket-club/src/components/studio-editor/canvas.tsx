import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import { PackCard } from "@/components/pack-card";
import type { LayerBox, PackCardData } from "@/lib/pack-render";
import type { CardSize, ShareCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { boxOf, clamp, layersOf, setBoxes, type EditorDoc } from "./document";
import { boundsOf, snapMove, snapRotation, type Guide } from "./guides";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
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

type Drag =
  | { kind: "move"; x0: number; y0: number; start: Record<string, LayerBox> }
  | { kind: "resize"; handle: Handle; x0: number; y0: number; start: LayerBox; id: string }
  | { kind: "rotate"; id: string; cx: number; cy: number };

/**
 * The editor artboard (Social Studio U16): the real pack render of the
 * document underneath, and an interactive overlay for free layers — click to
 * select (the whole group unless inside it), shift-click to multi-select,
 * drag to move with smart guides, handles to resize, and a rotate handle that
 * snaps to 0/±90/180. Changes stream to `onChange(doc, false)` while dragging
 * and commit with `onChange(doc, true)` on release.
 */
export function EditorCanvas({
  doc,
  size,
  width,
  input,
  theme,
  data,
  packId,
  selection,
  onSelect,
  onToggle,
  onEnterGroup,
  onChange,
}: {
  doc: EditorDoc;
  size: CardSize;
  /** Display width of the artboard in px. */
  width: number;
  input: ShareCardInput;
  theme: ApiCardTheme | null;
  data: PackCardData | null;
  packId: string | null;
  selection: string[];
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  onEnterGroup: (id: string) => void;
  onChange: (doc: EditorDoc, commit: boolean) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  const layers = layersOf(doc).filter((l) => !l.hidden);
  const selected = layers.filter((l) => selection.includes(l.id));
  const selectedBoxes = selected.map((l) => boxOf(l, size)).filter((b): b is LayerBox => !!b);
  const single = selected.length === 1 ? selected[0] : null;
  const singleBox = single ? boxOf(single, size) : null;

  const rect = () => boardRef.current?.getBoundingClientRect();
  const toPct = (dxPx: number, dyPx: number) => {
    const r = rect();
    return r ? { dx: (dxPx / r.width) * 100, dy: (dyPx / r.height) * 100 } : { dx: 0, dy: 0 };
  };

  const onLayerPointerDown = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation();
    if (e.shiftKey) {
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
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const sameGroup = (id: string, group: string) =>
    layersOf(doc).find((l) => l.id === id)?.group === group;

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
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
    if (drag.current) onChange(doc, true);
    drag.current = null;
    setGuides([]);
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
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
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
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
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
      className="relative select-none shadow-[0_24px_48px_-16px_rgba(0,0,0,.7)]"
      style={{ width }}
      onPointerDown={() => onSelect(null)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <PackCard
        input={input}
        size={size}
        sponsorsOn
        junior={false}
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
                  className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[var(--ed-accent)] bg-white"
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
                className="pointer-events-auto absolute left-1/2 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border-2 border-[var(--ed-accent)] bg-white"
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
              {groupLabel}
            </span>
          </div>
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
