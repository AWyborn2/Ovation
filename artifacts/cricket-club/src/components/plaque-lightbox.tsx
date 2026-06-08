import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PLAQUE_W = 151;
const PLAQUE_H = 259;

interface PlaqueLightboxProps {
  children: ReactNode;
  onClose: () => void;
  /** "gold" tints the close control with the club gold accent (juniors). */
  theme?: "default" | "gold";
}

/**
 * Centered, backdrop-dismissable overlay that shows a single premiership plaque
 * scaled up to a comfortably readable size. The plaque rendered inside keeps its
 * real inner links (player pages, Grand Final scorecard) working. Used by both
 * the senior and junior premierships boards.
 */
export function PlaqueLightbox({ children, onClose, theme = "default" }: PlaqueLightboxProps) {
  const [scale, setScale] = useState(1);

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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const closeColor = theme === "gold" ? "hsl(46 96% 57%)" : "#ffffff";

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
          color: closeColor,
          background: "rgba(255,255,255,0.08)",
          border: `1px solid ${closeColor}`,
          fontSize: 26,
          lineHeight: 1,
          cursor: "pointer",
          zIndex: 10,
        }}
        data-testid="button-close-lightbox"
      >
        ×
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: PLAQUE_W,
          height: PLAQUE_H,
          transform: `scale(${scale})`,
          transformOrigin: "center",
          flex: "none",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
