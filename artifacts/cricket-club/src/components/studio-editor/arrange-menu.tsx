import { useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Alignment, MatchDimension, MatchReference } from "./arrange";

const ALIGNS: { value: Alignment; label: string; icon: LucideIcon }[] = [
  { value: "left", label: "Align left edges", icon: AlignStartVertical },
  { value: "center", label: "Align centres", icon: AlignCenterVertical },
  { value: "right", label: "Align right edges", icon: AlignEndVertical },
  { value: "top", label: "Align top edges", icon: AlignStartHorizontal },
  { value: "middle", label: "Align middles", icon: AlignCenterHorizontal },
  { value: "bottom", label: "Align bottom edges", icon: AlignEndHorizontal },
];

const MATCHES: { value: MatchDimension; label: string }[] = [
  { value: "width", label: "Width" },
  { value: "height", label: "Height" },
  { value: "both", label: "Size" },
];

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:pointer-events-none disabled:opacity-35";
const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs font-semibold",
    on
      ? "border-[var(--ed-accent)] bg-[var(--ed-card)]"
      : "border-[var(--ed-line)] hover:bg-[var(--ed-card)]",
  );
const legend = "text-xs font-semibold uppercase tracking-wide text-[var(--ed-ink2)]";

/**
 * The toolbar's Arrange menu (studio-editor-multiselect): align to each
 * other (or, for one layer, to the page), distribute three or more, and
 * match width, height or size to the first-selected or the largest layer.
 * Each button is one edit, so one undo step.
 */
export function ArrangeMenu({
  count,
  onAlign,
  onDistribute,
  onMatch,
}: {
  /** How many arrangeable units are selected. */
  count: number;
  onAlign: (to: Alignment) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onMatch: (dim: MatchDimension, ref: MatchReference) => void;
}) {
  const [ref, setRef] = useState<MatchReference>("first");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Arrange"
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:pointer-events-none disabled:opacity-35"
          disabled={count === 0}
        >
          <LayoutGrid className="h-4 w-4" aria-hidden /> Arrange
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="studio-editor w-72 space-y-4 border-[var(--ed-line)] bg-[var(--ed-panel)] text-[var(--ed-ink)]"
      >
        <fieldset className="space-y-1.5">
          <legend className={legend}>{count > 1 ? "Align" : "Align to page"}</legend>
          <div className="flex flex-wrap gap-1">
            {ALIGNS.map((a) => (
              <button
                key={a.value}
                type="button"
                aria-label={a.label}
                title={a.label}
                className={iconBtn}
                onClick={() => onAlign(a.value)}
              >
                <a.icon className="h-4 w-4" />
              </button>
            ))}
            <span className="mx-1 w-px bg-[var(--ed-line)]" aria-hidden />
            <button
              type="button"
              aria-label="Space evenly across"
              title="Space evenly across (3 or more)"
              className={iconBtn}
              disabled={count < 3}
              onClick={() => onDistribute("horizontal")}
            >
              <AlignHorizontalDistributeCenter className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Space evenly down"
              title="Space evenly down (3 or more)"
              className={iconBtn}
              disabled={count < 3}
              onClick={() => onDistribute("vertical")}
            >
              <AlignVerticalDistributeCenter className="h-4 w-4" />
            </button>
          </div>
        </fieldset>

        <fieldset className="space-y-1.5" disabled={count < 2}>
          <legend className={legend}>Match</legend>
          <div className="flex items-center gap-1.5" role="group" aria-label="Match to">
            <span className="text-xs text-[var(--ed-ink2)]">to the</span>
            <button
              type="button"
              aria-pressed={ref === "first"}
              className={chip(ref === "first")}
              onClick={() => setRef("first")}
            >
              First selected
            </button>
            <button
              type="button"
              aria-pressed={ref === "largest"}
              className={chip(ref === "largest")}
              onClick={() => setRef("largest")}
            >
              Largest
            </button>
          </div>
          <div className="flex gap-1.5">
            {MATCHES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-label={`Match ${m.label.toLowerCase()}`}
                className="flex-1 rounded-lg border border-[var(--ed-line)] py-1.5 text-sm font-semibold hover:bg-[var(--ed-card)] disabled:opacity-35"
                onClick={() => onMatch(m.value, ref)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {count < 2 && (
            <p className="text-xs text-[var(--ed-ink2)]">
              Select two or more layers (shift- or ctrl-click) to match them.
            </p>
          )}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
