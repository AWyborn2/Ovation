import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { ResultPill } from "./pills";

export interface TickerItem {
  id: string | number;
  /** Short grade code shown in accent ("A", "B", "F"). */
  grade: string;
  /** Score line, e.g. "HHCC 6/214 v MAN 188". */
  line: string;
  result?: string | null;
  href: string;
}

/** Seconds of scroll per unique result (8 results → 40s loop). */
export const TICKER_SECONDS_PER_ITEM = 5;

function usePrefersReducedMotion(): boolean {
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

/**
 * Broadcast-style scrolling results strip for the home hero. Items render twice
 * back-to-back for a seamless loop; the duplicate copy is hidden from screen
 * readers and removed from the tab order so each result is announced once.
 * Pauses on hover; under reduced motion it renders one static, scrollable row.
 */
export function ResultsTicker({ items, className }: { items: TickerItem[]; className?: string }) {
  const [, navigate] = useLocation();
  const reduced = usePrefersReducedMotion();
  if (items.length === 0) return null;

  const renderItem = (it: TickerItem, copy: 0 | 1) => (
    <button
      key={`${copy}-${it.id}`}
      type="button"
      onClick={() => navigate(it.href)}
      aria-hidden={copy === 1 ? true : undefined}
      tabIndex={copy === 1 ? -1 : undefined}
      className="flex w-[300px] flex-none items-center gap-3 border-r border-white/10 px-4 py-3 text-left transition-colors hover:bg-white/5"
    >
      <span className="font-serif text-[13px] font-bold text-[hsl(var(--primary))]">
        {it.grade}
      </span>
      <span className="min-w-0 flex-1 truncate font-serif text-[19px] font-semibold uppercase tabular-nums">
        {it.line}
      </span>
      <ResultPill result={it.result} onPhoto />
    </button>
  );

  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-lg border border-white/10 bg-[rgba(15,21,27,.6)] text-white backdrop-blur-[16px]",
        className,
      )}
      data-testid="results-ticker"
    >
      <div className="flex flex-none items-center gap-2 bg-primary px-4 font-serif text-[15px] font-extrabold uppercase tracking-[0.1em] text-[#10151B]">
        <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[#10151B] bc-pulse" />
        Results
      </div>
      {reduced ? (
        <div className="flex min-w-0 flex-1 overflow-x-auto" data-testid="ticker-static">
          {items.map((it) => renderItem(it, 0))}
        </div>
      ) : (
        <div
          className="group min-w-0 flex-1 overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent 0, #000 32px, #000 calc(100% - 48px), transparent 100%)",
          }}
        >
          <div
            className="flex w-max group-hover:[animation-play-state:paused]"
            style={{
              animation: `bc-ticker ${items.length * TICKER_SECONDS_PER_ITEM}s linear infinite`,
            }}
            data-testid="ticker-track"
          >
            {items.map((it) => renderItem(it, 0))}
            {items.map((it) => renderItem(it, 1))}
          </div>
        </div>
      )}
    </div>
  );
}
