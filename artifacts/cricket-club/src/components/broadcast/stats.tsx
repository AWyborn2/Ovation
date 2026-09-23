import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Format a stat for display: thousands separators, "–" for empty. */
export function formatStat(value: number | string | null | undefined): string {
  if (value == null || value === "") return "–";
  return typeof value === "number" ? value.toLocaleString() : value;
}

/** Card tile with an overline label and a big condensed number; lifts on hover. */
export function StatTile({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: number | string | null | undefined;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card px-5 py-[18px] bc-lift", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-serif text-[clamp(30px,3.4vw,44px)] font-bold leading-[1.05] tracking-[-0.01em] tabular-nums">
        {formatStat(value)}
      </div>
    </div>
  );
}

/** Responsive auto-fit grid of stat tiles. */
export function StatTileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Hairline-divided career stat strip (Player detail). */
export function StatStrip({
  items,
  className,
}: {
  items: { label: ReactNode; value: number | string | null | undefined }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-lg border bg-card [grid-template-columns:repeat(auto-fill,minmax(110px,1fr))]",
        className,
      )}
    >
      {items.map((it, i) => (
        <div
          key={i}
          // Hairline dividers drawn outward (right + bottom) and clipped by the
          // container, so a wrapped last row leaves card space, not a grey block.
          className="px-4 py-3 [box-shadow:1px_0_0_hsl(var(--border)),0_1px_0_hsl(var(--border))]"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {it.label}
          </div>
          <div className="font-serif text-[clamp(28px,3vw,40px)] font-bold leading-[1.05] tabular-nums">
            {formatStat(it.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
