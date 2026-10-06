import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { DropTarget } from "./apply-move";

/**
 * Pointer-events drag and drop for the Selection Hub — no
 * DnD dependency, and it works for mouse, pen and touch. Ported from the
 * approved prototype:
 *
 * - a drag starts after the pointer moves 6px; on touch it only starts from
 *   the chip's grip (`[data-drag-grip]`), so lists still scroll;
 * - a ghost copy of the chip follows the pointer; the source chip dims;
 * - drop zones are elements carrying `data-drop="slot" | "side" | "pool"`
 *   (plus `data-side-id` / `data-index`); the zone under the pointer gets
 *   `data-drop-state="ok"` or `"no"` from `check`;
 * - the window and the given scroll container auto-scroll near their edges;
 * - Escape cancels.
 *
 * A drop over a zone `check` refuses with a message still calls `onDrop`, so
 * the page can explain the refusal; a drop over nothing does nothing.
 */

export type DragVerdict = { ok: true } | { ok: false; message: string };

type Options = {
  check: (memberId: number, target: DropTarget) => DragVerdict;
  onDrop: (memberId: number, target: DropTarget) => void;
  onCancel?: () => void;
  /** A scrolling list (the pool) that should auto-scroll while dragging over its edges. */
  scrollContainer?: RefObject<HTMLElement | null>;
};

type Drag = {
  memberId: number;
  el: HTMLElement;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  live: boolean;
  ghost: HTMLElement | null;
  target: DropTarget | null;
  raf: number;
};

const START_DISTANCE = 6;
const EDGE = 70;

function targetOf(zone: HTMLElement): DropTarget | null {
  const kind = zone.dataset.drop;
  if (kind === "pool") return { kind: "pool" };
  const sideId = Number(zone.dataset.sideId);
  if (!Number.isFinite(sideId)) return null;
  if (kind === "side") return { kind: "side", sideId };
  if (kind === "slot") {
    const index = Number(zone.dataset.index);
    return Number.isFinite(index) ? { kind: "slot", sideId, index } : null;
  }
  return null;
}

function clearMarks() {
  document
    .querySelectorAll<HTMLElement>("[data-drop-state]")
    .forEach((n) => n.removeAttribute("data-drop-state"));
}

export function usePointerDrag(options: Options) {
  const opts = useRef(options);
  opts.current = options;
  const drag = useRef<Drag | null>(null);
  const suppress = useRef(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const detach = useRef<() => void>(() => {});

  const hitTest = useCallback(() => {
    const d = drag.current;
    if (!d?.live) return;
    clearMarks();
    d.target = null;
    d.ghost?.removeAttribute("data-bad");
    const el = document.elementFromPoint(d.x, d.y);
    const zone = el instanceof Element ? el.closest<HTMLElement>("[data-drop]") : null;
    if (!zone) return;
    const target = targetOf(zone);
    if (!target) return;
    const verdict = opts.current.check(d.memberId, target);
    if (verdict.ok) {
      zone.setAttribute("data-drop-state", "ok");
      d.target = target;
    } else if (verdict.message) {
      zone.setAttribute("data-drop-state", "no");
      d.ghost?.setAttribute("data-bad", "true");
      d.target = target;
    }
  }, []);

  const positionGhost = useCallback(() => {
    const d = drag.current;
    if (!d?.ghost) return;
    d.ghost.style.transform = `translate(${d.x - 24}px, ${d.y - 18}px) rotate(-1.5deg)`;
  }, []);

  const endDrag = useCallback(() => {
    const d = drag.current;
    if (d) {
      cancelAnimationFrame(d.raf);
      d.ghost?.remove();
    }
    document.body.style.removeProperty("cursor");
    clearMarks();
    setDraggingId(null);
  }, []);

  const startDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    d.live = true;
    const ghost = d.el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("data-drag-ghost", "true");
    Object.assign(ghost.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      zIndex: "60",
      pointerEvents: "none",
      width: `${Math.min(d.el.offsetWidth || 260, 300)}px`,
      opacity: "0.96",
      boxShadow: "var(--shadow-pop)",
      transformOrigin: "20px 20px",
    });
    document.body.appendChild(ghost);
    d.ghost = ghost;
    document.body.style.cursor = "grabbing";
    setDraggingId(d.memberId);

    const loop = () => {
      const cur = drag.current;
      if (!cur?.live) return;
      const y = cur.y;
      if (y < EDGE) window.scrollBy(0, -Math.ceil((EDGE - y) / 5));
      else if (y > window.innerHeight - EDGE) {
        window.scrollBy(0, Math.ceil((y - window.innerHeight + EDGE) / 5));
      }
      const pb = opts.current.scrollContainer?.current;
      if (pb) {
        const r = pb.getBoundingClientRect();
        if (cur.x > r.left && cur.x < r.right) {
          if (y > r.top && y < r.top + 40) pb.scrollTop -= 8;
          else if (y < r.bottom && y > r.bottom - 40) pb.scrollTop += 8;
        }
      }
      hitTest();
      cur.raf = requestAnimationFrame(loop);
    };
    d.raf = requestAnimationFrame(loop);
  }, [hitTest]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>, memberId: number) => {
      if (e.button !== 0 || drag.current) return;
      // Touch drags start from the grip, so the lists still scroll.
      if (e.pointerType === "touch" && !(e.target as Element).closest?.("[data-drag-grip]")) {
        return;
      }
      if (e.pointerType === "touch") e.preventDefault();
      drag.current = {
        memberId,
        el: e.currentTarget,
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        x: e.clientX,
        y: e.clientY,
        live: false,
        ghost: null,
        target: null,
        raf: 0,
      };

      const onMove = (ev: globalThis.PointerEvent) => {
        const d = drag.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        d.x = ev.clientX;
        d.y = ev.clientY;
        if (!d.live) {
          if (Math.hypot(d.x - d.x0, d.y - d.y0) < START_DISTANCE) return;
          startDrag();
        }
        ev.preventDefault();
        positionGhost();
        hitTest();
      };
      const finish = () => {
        detach.current();
        drag.current = null;
      };
      const onUp = (ev: globalThis.PointerEvent) => {
        const d = drag.current;
        if (!d || ev.pointerId !== d.pointerId) return;
        if (d.live) {
          const target = d.target;
          endDrag();
          // The click that follows a drag must not open the Move dialog.
          suppress.current = true;
          setTimeout(() => (suppress.current = false), 0);
          if (target) opts.current.onDrop(d.memberId, target);
        }
        finish();
      };
      const onCancel = () => {
        if (drag.current?.live) endDrag();
        finish();
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape" && drag.current?.live) {
          endDrag();
          finish();
          opts.current.onCancel?.();
        }
      };
      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
      document.addEventListener("keydown", onKey);
      detach.current = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        document.removeEventListener("keydown", onKey);
        detach.current = () => {};
      };
    },
    [endDrag, hitTest, positionGhost, startDrag],
  );

  useEffect(
    () => () => {
      detach.current();
      if (drag.current?.live) endDrag();
      drag.current = null;
    },
    [endDrag],
  );

  /** True for the click event that ends a drag; the chip should ignore it. */
  const shouldSuppressClick = useCallback(() => suppress.current, []);

  return { onPointerDown, draggingId, shouldSuppressClick };
}
