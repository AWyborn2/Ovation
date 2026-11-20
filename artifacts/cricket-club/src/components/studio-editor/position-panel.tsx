/**
 * Position (New Studio, Nov 2026): one place to arrange layers, opened from
 * the left rail or from the contextual toolbar above the canvas, in the panel
 * beside the rail (it never covers the canvas).
 *
 * - Arrange: stacking order (forward, backward, to front, to back), align to
 *   the page (or to each other for two or more), space evenly, match size,
 *   and the selected layer's X, Y, W and H at the size on show.
 * - Layers: the page's layers, top-most first, with All or only those
 *   Overlapping the selected layer. Drag a row to restack it, click to select,
 *   the eye and lock per row, and Edit for its own settings.
 */
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
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  type LucideIcon,
} from "lucide-react";
import type { FreeLayer } from "@/lib/pack-render";
import { cn } from "@/lib/utils";
import type { Alignment, MatchDimension, MatchReference } from "./arrange";
import type { ReorderMove } from "./document";
import { boxesOverlap, LayersTree, type LayersTreeProps } from "./layers-drawer";

export type PositionTab = "arrange" | "layers";

/** A box in the size's own pixels (1080 × 1350 for Portrait). */
export type PixelBox = { x: number; y: number; w: number; h: number };

const ORDER: { move: ReorderMove; label: string; icon: LucideIcon }[] = [
  { move: "forward", label: "Forward", icon: ArrowUp },
  { move: "backward", label: "Backward", icon: ArrowDown },
  { move: "front", label: "To front", icon: ArrowUpToLine },
  { move: "back", label: "To back", icon: ArrowDownToLine },
];

const ALIGNS: { value: Alignment; label: string; icon: LucideIcon }[] = [
  { value: "left", label: "Left", icon: AlignStartVertical },
  { value: "center", label: "Centre", icon: AlignCenterVertical },
  { value: "right", label: "Right", icon: AlignEndVertical },
  { value: "top", label: "Top", icon: AlignStartHorizontal },
  { value: "middle", label: "Middle", icon: AlignCenterHorizontal },
  { value: "bottom", label: "Bottom", icon: AlignEndHorizontal },
];

const MATCHES: { value: MatchDimension; label: string }[] = [
  { value: "width", label: "Width" },
  { value: "height", label: "Height" },
  { value: "both", label: "Size" },
];

const legend = "text-xs font-semibold uppercase tracking-wide text-[var(--ed-ink2)]";
const tile =
  "flex h-9 items-center gap-2 rounded-lg border border-[var(--ed-line)] px-2 text-sm font-semibold hover:bg-[var(--ed-card)] disabled:pointer-events-none disabled:opacity-35";
const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-xs font-semibold",
    on
      ? "border-[var(--ed-accent)] bg-[var(--ed-card)]"
      : "border-[var(--ed-line)] hover:bg-[var(--ed-card)]",
  );

export type PositionPanelProps = {
  /** How many layers are selected. */
  selected: number;
  /** How many arrangeable units (a group counts once) the selection holds. */
  count: number;
  onReorder: (move: ReorderMove) => void;
  onAlign: (to: Alignment) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onMatch: (dim: MatchDimension, ref: MatchReference) => void;
  /** The one selected layer's box at the size on show, in pixels; null otherwise. */
  box: PixelBox | null;
  /** The one selected layer is locked: its box can't change. */
  locked?: boolean;
  /** A new box for the one selected layer, in pixels. */
  onBox: (next: PixelBox) => void;
  /** The layers tree, as the page lists it. */
  tree: Omit<LayersTreeProps, "keep">;
  /** The selected layer's box (any units), for the Overlapping filter. */
  selectedBox: { x: number; y: number; w: number; h: number } | null;
  /** The selected layer's id, kept in the Overlapping list. */
  selectedId: string | null;
  /** The box of any layer at the size on show (children included). */
  boxOf: (l: FreeLayer) => { x: number; y: number; w: number; h: number } | null;
  /** The tab it opens on. */
  initialTab?: PositionTab;
};

export function PositionPanel(props: PositionPanelProps) {
  const [tab, setTab] = useState<PositionTab>(props.initialTab ?? "arrange");
  const tabs: { id: PositionTab; label: string }[] = [
    { id: "arrange", label: "Arrange" },
    { id: "layers", label: "Layers" },
  ];
  return (
    <div className="space-y-3" data-testid="position-panel">
      <div
        role="tablist"
        aria-label="Position"
        className="flex gap-1 border-b border-[var(--ed-line)]"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`position-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`position-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold",
              tab === t.id
                ? "border-[var(--ed-accent)] text-[var(--ed-ink)]"
                : "border-transparent text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`position-${tab}`}
        aria-labelledby={`position-tab-${tab}`}
        aria-label={tab === "arrange" ? "Arrange" : "Layers"}
      >
        {tab === "arrange" ? <ArrangeTab {...props} /> : <LayersTab {...props} />}
      </div>
    </div>
  );
}

function ArrangeTab({
  selected,
  count,
  onReorder,
  onAlign,
  onDistribute,
  onMatch,
  box,
  locked,
  onBox,
}: PositionPanelProps) {
  const [ref, setRef] = useState<MatchReference>("first");
  if (selected === 0) {
    return (
      <p className="text-sm text-[var(--ed-ink2)]">
        Select a layer on the canvas, or in the Layers tab, to arrange it.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className={legend}>Layer order</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {ORDER.map((o) => (
            <button
              key={o.move}
              type="button"
              className={tile}
              aria-label={
                o.move === "forward"
                  ? "Bring forward"
                  : o.move === "backward"
                    ? "Send backward"
                    : o.move === "front"
                      ? "Bring to front"
                      : "Send to back"
              }
              onClick={() => onReorder(o.move)}
            >
              <o.icon className="h-4 w-4" aria-hidden /> {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5" disabled={count === 0}>
        <legend className={legend}>{count > 1 ? "Align to each other" : "Align to page"}</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {ALIGNS.map((a) => (
            <button
              key={a.value}
              type="button"
              className={tile}
              aria-label={
                count > 1
                  ? (
                      {
                        left: "Align left edges",
                        center: "Align centres",
                        right: "Align right edges",
                        top: "Align top edges",
                        middle: "Align middles",
                        bottom: "Align bottom edges",
                      } as const
                    )[a.value]
                  : `Align ${a.label.toLowerCase()} of page`
              }
              onClick={() => onAlign(a.value)}
            >
              <a.icon className="h-4 w-4" aria-hidden /> {a.label}
            </button>
          ))}
        </div>
        {count > 1 && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={tile}
              aria-label="Space evenly across"
              disabled={count < 3}
              onClick={() => onDistribute("horizontal")}
            >
              <AlignHorizontalDistributeCenter className="h-4 w-4" aria-hidden /> Space across
            </button>
            <button
              type="button"
              className={tile}
              aria-label="Space evenly down"
              disabled={count < 3}
              onClick={() => onDistribute("vertical")}
            >
              <AlignVerticalDistributeCenter className="h-4 w-4" aria-hidden /> Space down
            </button>
          </div>
        )}
      </fieldset>

      {count > 1 && (
        <fieldset className="space-y-1.5">
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
                className="flex-1 rounded-lg border border-[var(--ed-line)] py-1.5 text-sm font-semibold hover:bg-[var(--ed-card)]"
                onClick={() => onMatch(m.value, ref)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {box && (
        <fieldset className="space-y-1.5" disabled={locked}>
          <legend className={legend}>Size and position (px)</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <BoxInput
                key={k}
                label={{ x: "X", y: "Y", w: "W", h: "H" }[k]}
                name={{ x: "X position", y: "Y position", w: "Width", h: "Height" }[k]}
                value={box[k]}
                min={k === "w" || k === "h" ? 1 : undefined}
                onChange={(v) => onBox({ ...box, [k]: v })}
              />
            ))}
          </div>
          {locked && (
            <p className="text-xs text-[var(--ed-ink2)]">
              This layer is locked. Unlock it to move it.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}

/** A number box that commits on Enter or when it loses focus, so typing is one change. */
function BoxInput({
  label,
  name,
  value,
  min,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  const shown = String(Math.round(value));
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(n)) return;
    const v = min !== undefined ? Math.max(min, n) : n;
    if (Math.round(v) !== Math.round(value)) onChange(v);
  };
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ed-ink2)]">
      <span className="w-4">{label}</span>
      <input
        type="number"
        aria-label={name}
        value={draft ?? shown}
        min={min}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-8 w-full min-w-0 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm text-[var(--ed-ink)]"
      />
    </label>
  );
}

function LayersTab({ tree, selectedBox, selectedId, boxOf }: PositionPanelProps) {
  const [filter, setFilter] = useState<"all" | "overlapping">("all");
  const keep =
    filter === "overlapping" && selectedBox
      ? (l: FreeLayer) => {
          if (l.id === selectedId) return true;
          const b = boxOf(l);
          return !!b && boxesOverlap(b, selectedBox);
        }
      : undefined;
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Show layers" className="flex gap-1.5">
        <button
          type="button"
          aria-pressed={filter === "all"}
          className={chip(filter === "all")}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={filter === "overlapping"}
          className={chip(filter === "overlapping")}
          onClick={() => setFilter("overlapping")}
        >
          Overlapping
        </button>
      </div>
      {filter === "overlapping" && !selectedBox ? (
        <p className="text-sm text-[var(--ed-ink2)]">
          Select a layer to list the layers that overlap it.
        </p>
      ) : tree.layers.length === 0 ? (
        <p className="text-sm text-[var(--ed-ink2)]">
          No layers on this page yet. Add some from Fields, Text or Elements.
        </p>
      ) : (
        <>
          <LayersTree {...tree} keep={keep} />
          {tree.onMove && (
            <p className="text-xs text-[var(--ed-ink2)]">
              Top of the list is in front. Drag a layer up or down to restack it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
