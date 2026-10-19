import type { SelectionMemberStatus } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

/**
 * A picked player's slot status, in three tiers (ADR-008, Ash 19 Oct 2026):
 * yellow while still to confirm (no reply or Maybe), green for Yes, red for
 * No (away and withdrawn included). Worked out from the member's reply when
 * the board loads, never stored. With availability off nobody has replied, so
 * every slot is yellow until an admin records a status. Colour is never the
 * only cue: each tier has a glyph and words too.
 */
export type StatusTier = "confirm" | "in" | "out";

export function statusTier(status: SelectionMemberStatus): StatusTier {
  if (status === "yes") return "in";
  if (status === "no") return "out";
  return "confirm";
}

export const TIER: Record<
  StatusTier,
  { label: string; glyph: string; chip: string; swatch: string }
> = {
  confirm: {
    label: "To confirm",
    glyph: "?",
    chip: "border-amber-500 bg-amber-500/10",
    swatch: "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  in: {
    label: "Available",
    glyph: "✓",
    chip: "border-[var(--win-fg)] bg-[var(--win-bg)]",
    swatch: "border-[var(--win-fg)] bg-[var(--win-bg)] text-[var(--win-fg)]",
  },
  out: {
    label: "Unavailable",
    glyph: "✕",
    chip: "border-[var(--loss-fg)] bg-[var(--loss-bg)]",
    swatch: "border-[var(--loss-fg)] bg-[var(--loss-bg)] text-[var(--loss-fg)]",
  },
};

/** The words a screen reader hears for a picked player's tier. */
export function tierText(status: SelectionMemberStatus): string {
  const tier = statusTier(status);
  if (tier !== "confirm") return TIER[tier].label.toLowerCase();
  return status === "maybe" ? "to confirm (said Maybe)" : "to confirm (no reply)";
}

/** The key to the slot colours, shown above the sides. */
export function StatusTierLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label="Slot colours"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]", className)}
    >
      {(["confirm", "in", "out"] as const).map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className={cn(
              "grid h-[16px] w-[16px] place-items-center rounded-full border text-[10px] font-bold leading-none",
              TIER[t].swatch,
            )}
          >
            {TIER[t].glyph}
          </span>
          {t === "confirm" ? "To confirm (no reply or Maybe)" : TIER[t].label}
        </li>
      ))}
    </ul>
  );
}
