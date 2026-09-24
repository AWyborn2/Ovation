import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip plumbing shared by every stats chart primitive. Marks (bars, dots,
 * cells, legend rows) are keyboard-focusable and show the SAME tooltip on
 * hover and on focus; the text is also the mark's accessible name, so a screen
 * reader announces the figure without the tooltip (R8, KTD7).
 */

export interface ChartTip {
  text: string;
  /** Anchor, in px relative to the chart's positioned container. */
  x: number;
  y: number;
}

/** Colour for a chart series / palette slot, from the kit's CSS tokens. */
export const chartColor = (token: string, alpha?: number): string =>
  alpha == null ? `hsl(var(${token}))` : `hsl(var(${token}) / ${alpha})`;

/** Primary, secondary and tertiary series (Compare players A / B / C). */
export const SERIES_TOKENS = ["--chart-a", "--chart-b", "--chart-c"] as const;
/** Donut / dismissal palette, in legend order. */
export const DONUT_TOKENS = [
  "--donut-1",
  "--donut-2",
  "--donut-3",
  "--donut-4",
  "--donut-5",
  "--donut-6",
] as const;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mql = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mql.matches);
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export interface MarkProps {
  tabIndex: 0;
  "aria-label": string;
  onFocus: (e: FocusEvent<Element>) => void;
  onBlur: () => void;
  onMouseEnter: (e: MouseEvent<Element>) => void;
  onMouseLeave: () => void;
}

export interface ChartTooltipState {
  containerRef: RefObject<HTMLDivElement | null>;
  tip: ChartTip | null;
  /** Spread onto a focusable mark: shows `text` on hover and on focus. */
  markProps: (text: string) => MarkProps;
  hide: () => void;
}

export function useChartTooltip(): ChartTooltipState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const showAt = useCallback((el: Element, text: string) => {
    const box = el.getBoundingClientRect();
    const host = containerRef.current?.getBoundingClientRect();
    setTip({
      text,
      x: box.left - (host?.left ?? 0) + box.width / 2,
      y: box.top - (host?.top ?? 0),
    });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const markProps = useCallback(
    (text: string): MarkProps => ({
      tabIndex: 0,
      "aria-label": text,
      onFocus: (e) => showAt(e.currentTarget, text),
      onBlur: hide,
      onMouseEnter: (e) => showAt(e.currentTarget, text),
      onMouseLeave: hide,
    }),
    [showAt, hide],
  );

  return { containerRef, tip, markProps, hide };
}

/** The floating figure label; rendered inside the chart's relative container. */
export function ChartTooltip({
  tip,
  id,
  className,
}: {
  tip: ChartTip | null;
  id?: string;
  className?: string;
}) {
  if (!tip) return null;
  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border bg-[var(--pop)] px-2.5 py-1.5 text-xs font-medium text-foreground shadow-[var(--shadow-pop)] backdrop-blur",
        className,
      )}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
