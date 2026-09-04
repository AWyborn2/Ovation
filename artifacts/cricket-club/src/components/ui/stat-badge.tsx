import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The design system's stat/status primitives (Ovation UI migration §7):
 *
 * - {@link StatBadge} — a mono, bold, tinted-fill chip for "every number that
 *   matters" (averages, aggregates, milestones).
 * - {@link StatusPill} — an uppercase pill for workflow/match states (live,
 *   pilot/draft, neutral, danger).
 * - {@link LiveIndicator} — a pulsing dot + label for in-progress matches.
 *
 * All fills are translucent accent tints over the card surface — never a solid
 * accent block — and none carry a shadow.
 */

export function StatBadge({
  children,
  tone = "amber",
  className,
}: {
  children: ReactNode;
  tone?: "amber" | "green";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono font-bold text-[11px] px-2 py-0.5 rounded-sm",
        tone === "green"
          ? "text-[hsl(153_56%_52%)] bg-[rgba(63,201,139,0.12)]"
          : "text-primary bg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_PILL_TONES = {
  live: "bg-[rgba(63,201,139,0.12)] text-[hsl(153_56%_52%)]",
  pilot: "bg-[rgba(255,178,56,0.12)] text-primary",
  info: "bg-[rgba(76,140,245,0.12)] text-[hsl(217_89%_63%)]",
  neutral: "bg-muted text-muted-foreground",
  danger: "bg-[rgba(240,101,75,0.12)] text-destructive",
} as const;

export type StatusPillTone = keyof typeof STATUS_PILL_TONES;

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: StatusPillTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider font-sans",
        STATUS_PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveIndicator({
  children = "Live",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <StatusPill tone="live" className={className}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[hsl(153_56%_52%)] animate-pulse" />
      {children}
    </StatusPill>
  );
}
