import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** "LIVE"-style pill with a pulsing accent dot (e.g. "2025/26 season · Round 14"). */
export function LivePill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--primary))]",
        className,
      )}
    >
      <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-primary bc-pulse" />
      {children}
    </span>
  );
}

/** Glass pill over photography (e.g. the "CAP 242" badge on a portrait). */
export function GlassPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[30px] items-center rounded-full border border-primary/40 bg-[rgba(10,12,16,.55)] px-3 font-serif text-sm font-bold uppercase tracking-[0.04em] text-[hsl(var(--primary))] backdrop-blur-md tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small bordered chip for attributes ("Right-hand bat"). */
export function AttrChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[30px] items-center rounded-full border bg-card px-3 text-[13px] text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export type ResultCode = "W" | "L" | "T" | "D" | "NR";

/** Normalise a free-text result ("Won", "lost", "Tie", "No result") to a code. */
export function resultCode(result?: string | null): ResultCode | null {
  if (!result) return null;
  const r = result.trim().toLowerCase();
  if (r === "w" || r.startsWith("won") || r === "win") return "W";
  if (r === "l" || r.startsWith("lost") || r === "loss") return "L";
  if (r === "t" || r.startsWith("tie")) return "T";
  if (r === "d" || r.startsWith("draw")) return "D";
  if (r === "nr" || r.startsWith("no result") || r.startsWith("abandon")) return "NR";
  return null;
}

/**
 * W/L result pill. `round` = the 28px circle used in result rows; default is a
 * compact 4px-radius tag (ticker). `onPhoto` forces the dark-mode colours at
 * .18 alpha regardless of the page mode (results over the home photo).
 */
export function ResultPill({
  result,
  round,
  onPhoto,
  className,
}: {
  result?: string | null;
  round?: boolean;
  onPhoto?: boolean;
  className?: string;
}) {
  const code = resultCode(result);
  if (!code) return null;
  const tone =
    code === "W"
      ? onPhoto
        ? "bg-[rgba(74,222,128,.18)] text-[#4ADE80]"
        : "bg-[var(--win-bg)] text-[var(--win-fg)]"
      : code === "L"
        ? onPhoto
          ? "bg-[rgba(248,113,113,.18)] text-[#F87171]"
          : "bg-[var(--loss-bg)] text-[var(--loss-fg)]"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-serif text-[13px] font-bold tabular-nums",
        round ? "h-7 w-7 rounded-full" : "h-6 min-w-6 rounded px-1.5",
        tone,
        className,
      )}
      aria-label={
        code === "W"
          ? "Won"
          : code === "L"
            ? "Lost"
            : code === "T"
              ? "Tied"
              : code === "D"
                ? "Drawn"
                : "No result"
      }
    >
      {code}
    </span>
  );
}
