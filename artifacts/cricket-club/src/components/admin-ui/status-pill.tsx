import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A status pill (Social Studio KTD13), on existing theme tokens only: neutral
 * (muted), info (primary), success (win), danger (loss), attention (accent).
 */
export type StatusTone = "neutral" | "info" | "success" | "danger" | "attention";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary-text",
  success: "bg-[var(--win-bg)] text-[var(--win-fg)]",
  danger: "bg-[var(--loss-bg)] text-[var(--loss-fg)]",
  attention: "bg-accent/20 text-foreground",
};

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
