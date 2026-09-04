import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { EditorLayer } from "@/lib/share-card";
import { clamp, SNAP } from "./utils";

/**
 * The live card preview with drag-to-move / drag-to-resize overlays, snapping
 * guides, wheel-to-zoom on the headshot, and sticker drop handling.
 */
export function EditorCanvas({
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
  const drag = useRef<{
    mode: "move" | "resize";
    px: number;
    py: number;
    x: number;
    y: number;
    w: number;
    h: number;
    vAnchor: "top" | "bottom";
  } | null>(null);

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
    } else if (l.shape === "circle") {
      // Circular layers (photo/badge) are always drawn as a perfect circle
      // (ctx.arc) — an independent w/h resize would stretch them into an
      // ellipse, so lock both axes to whichever delta is larger.
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      const size = clamp(d.w + delta, 0.03, Math.min(W / 1080 - d.x, 2));
      onChange(l.id, { w: size, h: size });
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
          style={{ left: `${((vx * 1080) / W) * 100}%` }}
        />
      ))}
      {guides.hy.map((hy, i) => (
        <div
          key={`h${i}`}
          className="pointer-events-none absolute left-0 right-0 h-px bg-primary"
          style={{ top: `${((hy * 1080) / H) * 100}%` }}
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
