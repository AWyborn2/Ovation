import type { SelectionSide } from "@workspace/api-client-react";
import { Columns3, LayoutGrid, Lock } from "lucide-react";
import { XI_SIZE } from "@workspace/scorecard/selection-shape";
import { cn } from "@/lib/utils";
import { sideLabel } from "./apply-move";
import { MAX_FOCUS, type HubView } from "./use-hub-view";

/** "A Grade" → "A", "Female B Grade" → "Female B"; other labels unchanged. */
export const shortGrade = (side: SelectionSide) => sideLabel(side).replace(/\s+grade$/i, "");

/**
 * Why a side still needs a selector's attention: no captain or keeper, over the
 * overseas cap, or a picked player said they're unavailable. Empty when fine.
 */
export function sideAttention(side: SelectionSide): string[] {
  const w = side.warnings;
  const bits: string[] = [];
  if (w.noCaptain) bits.push("no captain");
  if (w.noKeeper) bits.push("no keeper");
  if (side.overseas?.over) bits.push("over the overseas cap");
  if (w.saidNo) bits.push(`${w.saidNo} said unavailable`);
  return bits;
}

/**
 * One chip per side in the club's grade order, choosing which sides Focus
 * shows (up to three), plus the Focus / Board switch. In Board, a chip jumps
 * to Focus on that grade.
 */
export function GradeChipBar({
  sides,
  view,
  focused,
  onToggle,
  onFocusOnly,
  onView,
}: {
  sides: readonly SelectionSide[];
  view: HubView;
  focused: readonly number[];
  onToggle: (id: number) => void;
  onFocusOnly: (id: number) => void;
  onView: (view: HubView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="grade-chip-bar">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {view === "focus" ? `On screen (up to ${MAX_FOCUS})` : "Jump to focus"}
      </span>
      {sides.map((side) => {
        const on = view === "focus" && focused.includes(side.id);
        const final = side.state === "final";
        const attention = sideAttention(side);
        const label = sideLabel(side);
        return (
          <button
            key={side.id}
            type="button"
            aria-pressed={view === "focus" ? on : undefined}
            title={attention.length ? `${label}: ${attention.join(", ")}` : label}
            onClick={() => (view === "focus" ? onToggle(side.id) : onFocusOnly(side.id))}
            className={cn(
              "inline-flex h-[34px] items-center gap-[7px] rounded-full border px-3 text-[13px] font-semibold transition-colors hover:border-primary",
              on
                ? "border-primary bg-primary/15 text-primary-text"
                : "border-border bg-card text-foreground",
            )}
          >
            {final && <Lock className="h-3 w-3 text-[var(--win-fg)]" aria-label="Final" />}
            {shortGrade(side)}
            <span
              className={cn("font-mono text-[11.5px] tabular-nums", !on && "text-muted-foreground")}
            >
              {side.warnings.filled}/{XI_SIZE}
            </span>
            {attention.length > 0 && (
              <span
                className="h-[7px] w-[7px] rounded-full bg-[var(--loss-fg)]"
                aria-label="Needs attention"
              />
            )}
          </button>
        );
      })}
      <span className="flex-1" />
      <div
        role="group"
        aria-label="Layout"
        className="flex gap-0.5 rounded-[10px] border border-border bg-card p-[3px]"
      >
        {(["focus", "board"] as const).map((v) => {
          const Icon = v === "focus" ? Columns3 : LayoutGrid;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => onView(v)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-semibold transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {v === "focus" ? "Focus" : "Board"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
