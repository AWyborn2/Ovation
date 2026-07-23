import { useEffect, useMemo, useRef, useState } from "react";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import type { ShareCardInput, CardSize } from "@/lib/share-card";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";
import {
  renderPackCard,
  packNativeSize,
  JUNIOR_PANEL,
  type PackTokens,
} from "@/lib/pack-render";

/**
 * Live DOM preview of a Pack A card. Renders the bound template HTML at native
 * 1080-wide size and scales it to the display width via `transform: scale()`
 * (the bundle's own preview technique), so the size toggle switches format
 * natively with no cropping.
 */

// Sensible defaults when a tenant theme has not loaded yet — the Broadcast Dark
// palette (gold on brown/ink).
const DEFAULT_TOKENS: PackTokens = {
  accent: "#FBAC27",
  panel: "#42342B",
  ink: "#101216",
  textLight: "#F5F2E8",
  displayFont: "anton",
};

function tokensFromTheme(theme: ApiCardTheme | undefined | null): PackTokens {
  if (!theme) return DEFAULT_TOKENS;
  return {
    accent: theme.accent || DEFAULT_TOKENS.accent,
    panel: theme.bgPanel || DEFAULT_TOKENS.panel,
    ink: theme.bgDark || DEFAULT_TOKENS.ink,
    textLight: theme.textLight || DEFAULT_TOKENS.textLight,
    // `displayFont` arrives with the U9 themes extension; default until then.
    displayFont:
      (theme as { displayFont?: string }).displayFont || DEFAULT_TOKENS.displayFont,
  };
}

export interface PackCardProps {
  input: ShareCardInput;
  size: CardSize;
  sponsorsOn: boolean;
  theme?: ApiCardTheme | null;
  junior: boolean;
  /** Explicit display width (px). When omitted the card fills its parent. */
  width?: number;
  className?: string;
}

export function PackCard({
  input,
  size,
  sponsorsOn,
  theme,
  junior,
  width,
  className,
}: PackCardProps) {
  const native = packNativeSize(size);
  const tokens = useMemo(() => {
    const base = tokensFromTheme(theme);
    return junior ? { ...base, panel: JUNIOR_PANEL } : base;
  }, [theme, junior]);

  const html = useMemo(
    () => renderPackCard(input, size, sponsorsOn, tokens, junior),
    [input, size, sponsorsOn, tokens, junior],
  );

  // Decorative pack fonts (Anton, Bebas Neue, Teko, Archivo Black, …) load on
  // demand so the DOM preview picks them up.
  useEffect(() => {
    ensureCardFontsLoaded();
  }, []);

  // Fill-parent mode: measure the container width and derive the scale factor.
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    if (width != null) return;
    const el = outerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setMeasured(w);
    });
    ro.observe(el);
    setMeasured(el.clientWidth || null);
    return () => ro.disconnect();
  }, [width]);

  const displayWidth = width ?? measured ?? 0;
  const scale = displayWidth > 0 ? displayWidth / native.w : 0;

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: "relative",
        width: width != null ? `${width}px` : "100%",
        height: width != null ? `${width * (native.h / native.w)}px` : undefined,
        aspectRatio: width != null ? undefined : `${native.w} / ${native.h}`,
        overflow: "hidden",
      }}
    >
      {scale > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${native.w}px`,
            height: `${native.h}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

export default PackCard;
