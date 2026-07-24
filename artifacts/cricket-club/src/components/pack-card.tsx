import { useEffect, useMemo, useRef, useState } from "react";
import type { CardTheme as ApiCardTheme } from "@workspace/api-client-react";
import type { ShareCardInput, CardSize } from "@/lib/share-card";
import { ensureCardFontsLoaded } from "@/lib/card-fonts";
import {
  renderPackCard,
  packNativeSize,
  resolvePackTokens,
  tokensFromCardTheme,
  brandDefaultTokens,
  type PackCardData,
} from "@/lib/pack-render";

/**
 * Live DOM preview of a Pack A card. Renders the bound template HTML at native
 * 1080-wide size and scales it to the display width via `transform: scale()`
 * (the bundle's own preview technique), so the size toggle switches format
 * natively with no cropping.
 */

export interface PackCardProps {
  input: ShareCardInput;
  size: CardSize;
  sponsorsOn: boolean;
  /**
   * The selected card theme. Per-card style-panel overrides (accent / panel /
   * display font) are folded onto this object by the caller before it reaches
   * here, so the same object drives both the live preview and the server still
   * render (KTD6 token resolution: junior > override > theme > brand).
   */
  theme?: ApiCardTheme | null;
  junior: boolean;
  /**
   * Per-render tenant data (logo, club name, hashtags, sponsors, uploaded
   * photo). Threaded verbatim into `renderPackCard` so the pack path carries the
   * same tenant branding the canvas path already gets. Omitted → sample defaults.
   */
  data?: PackCardData | null;
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
  data,
  width,
  className,
}: PackCardProps) {
  const native = packNativeSize(size);
  // Resolve tokens by priority: junior force > theme (with folded overrides) >
  // brand default. The explicit override level lives in `resolvePackTokens`;
  // callers fold per-card overrides into `theme` so the server harness (which
  // only threads `theme`) stays pixel-identical to this preview.
  //
  // The brand default baseline is now derived from the tenant brand colours on
  // `data.brand` (primary → accent, juniors → panel) via `brandDefaultTokens`,
  // falling back to the hard-coded Broadcast-Dark palette for any colour the
  // brand omits. Halls Head's seeded brand reproduces that palette exactly, so
  // HH stays visually identical; other tenants get their own brand colours as
  // the pack's default look before any theme/override is applied.
  const brandColour = data?.brand;
  const tokens = useMemo(
    () =>
      resolvePackTokens({
        brand: brandDefaultTokens(brandColour),
        theme: tokensFromCardTheme(theme),
        junior,
      }),
    [theme, junior, brandColour?.primaryColour, brandColour?.juniorsColour],
  );

  const html = useMemo(
    () => renderPackCard(input, size, sponsorsOn, tokens, junior, data),
    [input, size, sponsorsOn, tokens, junior, data],
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
