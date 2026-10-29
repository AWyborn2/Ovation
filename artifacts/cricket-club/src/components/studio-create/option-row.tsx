import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One choice in a Create list: a label, a detail line and an optional badge. */
export function OptionRow({
  label,
  detail,
  badge,
  highlight = false,
  selected = false,
  disabled = false,
  onClick,
  trailing,
}: {
  label: string;
  detail?: string;
  badge?: string;
  /** Draw the badge in the accent colour (the suggested choice, a Selection Hub list). */
  highlight?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 text-left hover:border-primary disabled:opacity-60",
          selected ? "border-primary ring-1 ring-primary" : "border-border",
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{label}</span>
          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge && (
            <span
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
                highlight ? "bg-primary/15 text-primary-text" : "bg-muted text-muted-foreground",
              )}
            >
              {badge}
            </span>
          )}
          {trailing}
        </span>
      </button>
    </li>
  );
}
