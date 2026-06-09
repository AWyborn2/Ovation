import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2 } from "lucide-react";
import { saveOrSharePng } from "@/lib/trading-card-export";

const PLAQUE_W = 151;
const PLAQUE_H = 259;
const SWIPE_THRESHOLD = 45;

interface PlaqueLightboxProps<T> {
  /** The full, already-filtered+sorted list the gallery navigates through. */
  items: T[];
  /** Index into `items` of the currently shown plaque. */
  index: number;
  /** Render the plaque for a given item. */
  renderItem: (item: T) => ReactNode;
  /** Move to a different index within `items`. */
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** "gold" tints the controls with the club gold accent (juniors). */
  theme?: "default" | "gold";
  /**
   * When provided, a "Save / Share image" action exports the enlarged plaque
   * (metallic styling intact) as a PNG. Receives the current item and returns
   * the download filename (without extension).
   */
  exportFileName?: (item: T) => string;
}

/**
 * Centered, backdrop-dismissable overlay that shows a single premiership plaque
 * scaled up to a comfortably readable size, with prev/next navigation across the
 * supplied list (on-screen arrows, left/right keyboard arrows, and touch swipe).
 * The plaque rendered inside keeps its real inner links (player pages, Grand
 * Final scorecard) working, and can optionally be saved/shared as a PNG. Used by
 * both the senior and junior premierships boards.
 */
export function PlaqueLightbox<T>({
  items,
  index,
  renderItem,
  onIndexChange,
  onClose,
  theme = "default",
  exportFileName,
}: PlaqueLightboxProps<T>) {
  const [scale, setScale] = useState(1);
  const [exporting, setExporting] = useState(false);
  const plaqueRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const current = items[index];

  useEffect(() => {
    const compute = () => {
      const padding = 48;
      const sw = (window.innerWidth - padding) / PLAQUE_W;
      const sh = (window.innerHeight - padding) / PLAQUE_H;
      setScale(Math.max(1, Math.min(sw, sh, 3.2)));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onIndexChange, index, hasPrev, hasNext]);

  if (!current) return null;

  const accent = theme === "gold" ? "hsl(46 96% 57%)" : "#ffffff";

  const handleExport = async () => {
    const node = plaqueRef.current;
    if (!node || exporting) return;
    setExporting(true);
    try {
      const name = exportFileName?.(current) || "premiership-plaque";
      await saveOrSharePng(node, `${name}.png`);
    } catch (e) {
      console.error("Plaque export failed", e);
    } finally {
      setExporting(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    swiped.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      if (dx < 0 && hasNext) onIndexChange(index + 1);
      else if (dx > 0 && hasPrev) onIndexChange(index - 1);
    }
  };

  // Suppress inner link taps when the gesture was a horizontal swipe.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (swiped.current) {
      e.preventDefault();
      e.stopPropagation();
      swiped.current = false;
    }
  };

  const navBtnStyle = (enabled: boolean) => ({
    width: 48,
    height: 48,
    color: accent,
    background: "rgba(255,255,255,0.08)",
    border: `1px solid ${accent}`,
    fontSize: 28,
    lineHeight: 1,
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.3,
    zIndex: 10,
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "rgba(0,0,0,0.82)" }}
      onClick={onClose}
      data-testid="plaque-lightbox"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex items-center justify-center rounded-full"
        style={{
          width: 44,
          height: 44,
          color: accent,
          background: "rgba(255,255,255,0.08)",
          border: `1px solid ${accent}`,
          fontSize: 26,
          lineHeight: 1,
          cursor: "pointer",
          zIndex: 10,
        }}
        data-testid="button-close-lightbox"
      >
        ×
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasPrev) onIndexChange(index - 1);
        }}
        disabled={!hasPrev}
        aria-label="Previous plaque"
        className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
        style={navBtnStyle(hasPrev)}
        data-testid="button-prev-plaque"
      >
        ‹
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasNext) onIndexChange(index + 1);
        }}
        disabled={!hasNext}
        aria-label="Next plaque"
        className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
        style={navBtnStyle(hasNext)}
        data-testid="button-next-plaque"
      >
        ›
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        onClickCapture={handleClickCapture}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          width: PLAQUE_W,
          height: PLAQUE_H,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          flex: "none",
        }}
        data-testid="plaque-lightbox-content"
      >
        <div ref={plaqueRef}>{renderItem(current)}</div>
      </div>

      {exportFileName && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleExport();
          }}
          disabled={exporting}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{
            color: theme === "gold" ? "#42342B" : "#0f172a",
            background: accent,
            border: `1px solid ${accent}`,
            cursor: exporting ? "default" : "pointer",
            zIndex: 10,
          }}
          data-testid="button-save-plaque"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? "Preparing…" : "Save / Share image"}
        </button>
      )}
    </div>,
    document.body,
  );
}
