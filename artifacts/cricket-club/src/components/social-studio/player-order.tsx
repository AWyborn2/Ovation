import {
  TEAM_LIST_ORDERS,
  TEAM_LIST_ORDER_HINTS,
  TEAM_LIST_ORDER_LABELS,
  type TeamListOrder,
} from "@workspace/scorecard/card-content";
import { cn } from "@/lib/utils";

/**
 * A Team List's player order (build decision 16): As selected, Shirt number
 * or Alphabetical. Self-contained, so the club's default (Settings → What
 * cards show → Team List), a carousel (Create's look step) and a single card
 * (the editor's Card panel) use the same control. A withheld junior is always
 * last whatever is chosen, and the control says so.
 */
export function PlayerOrderControl({
  id,
  value,
  onChange,
  label = "Player order",
  hint,
  disabled = false,
  compact = false,
}: {
  id: string;
  value: TeamListOrder;
  onChange: (next: TeamListOrder) => void;
  label?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
  /** The editor's narrow panel: options stacked. */
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5" data-testid={`${id}-player-order`}>
      <p id={`${id}-label`} className="text-sm font-medium">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className={cn("flex gap-2", compact ? "flex-col" : "flex-wrap")}
      >
        {TEAM_LIST_ORDERS.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            disabled={disabled}
            onClick={() => value !== o && onChange(o)}
            data-testid={`${id}-player-order-${o}`}
            title={TEAM_LIST_ORDER_HINTS[o]}
            className={cn(
              "rounded-md border px-3 py-1.5 text-left text-sm disabled:opacity-50",
              value === o
                ? "border-primary bg-primary/10 font-medium ring-1 ring-primary"
                : "border-border",
            )}
          >
            {TEAM_LIST_ORDER_LABELS[o]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {TEAM_LIST_ORDER_HINTS[value]} A private junior player is always listed last.
        {hint ? <> {hint}</> : null}
      </p>
    </div>
  );
}
