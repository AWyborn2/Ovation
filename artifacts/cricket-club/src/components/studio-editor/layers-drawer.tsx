import {
  Award,
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  Group,
  Image as ImageIcon,
  ImagePlus,
  LayoutTemplate,
  List,
  Lock,
  PenTool,
  Shapes,
  SlidersHorizontal,
  Square,
  Sticker,
  Type,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { layerOnSize } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { cn } from "@/lib/utils";
import { childrenOf } from "./document";
import { isRowCell, rowCellLayers } from "./scope";

const ICON: Record<FreeLayer["kind"], LucideIcon> = {
  text: Type,
  shape: Shapes,
  image: ImageIcon,
  medal: Award,
  sticker: Sticker,
  chart: BarChart3,
  element: LayoutTemplate,
  photo: ImagePlus,
  rows: List,
  vector: PenTool,
  group: Group,
};

/** A layer's icon; a kind this build doesn't know (a newer document) gets a plain square. */
export const iconFor = (kind: string): LucideIcon =>
  (ICON as Record<string, LucideIcon | undefined>)[kind] ?? Square;

const LABEL: Partial<Record<FreeLayer["kind"], string>> = {
  vector: "Graphic",
  group: "Group",
};

/** A layer's name: its own, or what kind of layer it is. */
export const layerName = (l: FreeLayer): string => l.name ?? LABEL[l.kind] ?? l.kind;

/** "opposition.homeAway" → "Opposition home away": a field key read aloud. */
const readableKey = (key: string): string => {
  const words = key
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * A text layer's content as the Layers list shows it: each live field
 * (`{{key}}`) by its label, so "{{opposition.name}}" reads "Opposition name".
 */
export function contentLabel(content: string, labels: Record<string, string> = {}): string {
  return content.replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (_m, key: string) => labels[key] ?? readableKey(key),
  );
}

type Mods = { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };

/** What a row opens to: a group's children, or a list's cells. */
const kidsOf = (l: FreeLayer): FreeLayer[] =>
  l.kind === "rows" ? rowCellLayers(l) : childrenOf(l);

/** The groups from the top of `layers` down to the one with `id` (which is included). */
function pathTo(layers: FreeLayer[], id: string | null): string[] {
  if (!id) return [];
  for (const l of layers) {
    if (l.id === id) return [l.id];
    const below = pathTo(kidsOf(l), id);
    if (below.length) return [l.id, ...below];
  }
  return [];
}

/** Where a dragged row lands: drawn just above (on top of) or just below `target`. */
export type LayerDrop = {
  id: string;
  parent: string | null;
  target: string;
  place: "above" | "below";
};

export type LayersTreeProps = {
  layers: FreeLayer[];
  selection: string[];
  /**
   * `replace` for a plain click, `toggle` for ctrl/cmd, `add` for a shift
   * range; `parent` is the group the rows are in (null at the top).
   */
  onSelect: (ids: string[], mode: "replace" | "toggle" | "add", parent: string | null) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  /** The size being edited: children not on it are left out, as top-level layers are. */
  size?: CardSize;
  /** The group being edited inside, if any. */
  scope?: string | null;
  /** Labels for live-field keys, so text layers read by field, not by token. */
  fieldLabels?: Record<string, string>;
  /** Drag a row among its own group's rows to restack it. */
  onMove?: (drop: LayerDrop) => void;
  /** Open a layer's own settings (it is selected too). */
  onEdit?: (id: string, parent: string | null) => void;
  /** Only rows that pass, or hold a row that passes, are listed; all when absent. */
  keep?: (l: FreeLayer) => boolean;
};

/**
 * The layers tree (Social Studio U16): free layers top-most first, each with
 * its type icon, name, and eye and lock buttons. Clicking a row selects it;
 * ctrl- (or cmd-) click adds or removes it, shift-click selects the run of
 * rows from the last one clicked. With `onMove`, a row drags among its own
 * group's rows to restack it (a list's cells keep the list's order).
 *
 * Groups and stacks open to show their children, indented (editable-elements
 * A2), and lists open to their row cells (A3); the group or list being edited
 * inside (`scope`) starts open. Selecting a child reports its group or list
 * as `parent`, so the editor can go inside it. A shift run stays within one
 * group.
 */
export function LayersTree({
  layers,
  selection,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  size,
  scope = null,
  fieldLabels,
  onMove,
  onEdit,
  keep,
}: LayersTreeProps) {
  const anchor = useRef<string | null>(null);
  // Open groups; going inside a group opens it and the groups around it.
  const [opened, setOpened] = useState<Set<string>>(() => new Set(pathTo(layers, scope)));
  const [dragging, setDragging] = useState<{ id: string; parent: string | null } | null>(null);
  const [over, setOver] = useState<{ target: string; place: "above" | "below" } | null>(null);
  const scopeKey = pathTo(layers, scope).join(" ");
  useEffect(() => {
    if (scopeKey) setOpened((o) => new Set([...o, ...scopeKey.split(" ")]));
  }, [scopeKey]);
  const isOpen = (id: string) => opened.has(id);
  const toggleOpen = (id: string) =>
    setOpened((o) => {
      const next = new Set(o);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const passes = (l: FreeLayer): boolean => !keep || keep(l) || kidsOf(l).some(passes);
  const shown = (list: FreeLayer[]) =>
    [...list].reverse().filter((l) => (!size || layerOnSize(l, size)) && passes(l));
  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };
  const placeAt = (e: DragEvent<HTMLElement>): "above" | "below" => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "above" : "below";
  };

  const pick = (id: string, siblings: FreeLayer[], parent: string | null, e: Mods) => {
    const from = anchor.current ? siblings.findIndex((r) => r.id === anchor.current) : -1;
    if (e.shiftKey && from >= 0) {
      const to = siblings.findIndex((r) => r.id === id);
      const [a, b] = from < to ? [from, to] : [to, from];
      onSelect(
        siblings.slice(a, b + 1).map((r) => r.id),
        "add",
        parent,
      );
      return;
    }
    anchor.current = id;
    onSelect([id], e.ctrlKey || e.metaKey || e.shiftKey ? "toggle" : "replace", parent);
  };

  const renderRows = (list: FreeLayer[], parent: string | null, depth: number) => {
    const rows = shown(list);
    return rows.map((l) => {
      const Icon = iconFor(l.kind);
      const name = layerName(l);
      const on = selection.includes(l.id);
      const kids = kidsOf(l);
      const cell = isRowCell(l);
      const open = kids.length > 0 && isOpen(l.id);
      const movable = !!onMove && !cell;
      // A row takes a drop from a row dragged among the same group's rows.
      const target = !!dragging && dragging.parent === parent && dragging.id !== l.id;
      return (
        <li
          key={l.id}
          draggable={movable || undefined}
          onDragStart={(e) => {
            if (!movable) return;
            e.stopPropagation();
            setDragging({ id: l.id, parent });
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", l.id);
          }}
          onDragEnd={endDrag}
          onDragOver={(e) => {
            if (!target) return;
            e.preventDefault();
            e.stopPropagation();
            setOver({ target: l.id, place: placeAt(e) });
          }}
          onDrop={(e) => {
            if (!target || !dragging || !onMove) return;
            e.preventDefault();
            e.stopPropagation();
            onMove({ id: dragging.id, parent, target: l.id, place: placeAt(e) });
            endDrag();
          }}
        >
          <div
            className={cn(
              "relative flex items-center gap-2 rounded-lg py-1.5 pr-2",
              on ? "bg-[var(--ed-card)]" : "hover:bg-[var(--ed-card)]/60",
              dragging?.id === l.id && "opacity-40",
            )}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            {target && over?.target === l.id && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-2 right-2 h-0.5 rounded bg-[var(--ed-accent)]",
                  over.place === "above" ? "top-0" : "bottom-0",
                )}
              />
            )}
            {kids.length > 0 ? (
              <button
                type="button"
                aria-label={open ? `Close ${name}` : `Open ${name}`}
                aria-expanded={open}
                className="-ml-1 rounded p-0.5 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                onClick={() => toggleOpen(l.id)}
              >
                <ChevronRight
                  className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
                />
              </button>
            ) : (
              depth > 0 && <span className="w-3.5 shrink-0" aria-hidden />
            )}
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              aria-pressed={on}
              onClick={(e) => pick(l.id, rows, parent, e)}
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--ed-ink2)]" aria-hidden />
              <span className={cn("truncate", l.hidden && "opacity-50")}>
                {l.name ?? (l.content ? contentLabel(l.content, fieldLabels) : name)}
              </span>
            </button>
            {onEdit && (
              <button
                type="button"
                aria-label={`Edit ${name}`}
                title="Edit"
                className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                onClick={() => onEdit(l.id, parent)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            )}
            {/* A list's cell is part of every row: it's hidden or locked with its list. */}
            {!cell && (
              <>
                <button
                  type="button"
                  aria-label={l.hidden ? `Show ${name}` : `Hide ${name}`}
                  className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                  onClick={() => onToggleHidden(l.id)}
                >
                  {l.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  aria-label={l.locked ? `Unlock ${name}` : `Lock ${name}`}
                  className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                  onClick={() => onToggleLocked(l.id)}
                >
                  {l.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
              </>
            )}
          </div>
          {open && (
            <ul role="group" aria-label={`In ${name}`} className="space-y-1 pt-1">
              {renderRows(kids, l.id, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  };

  return (
    <ul aria-label="Layer list" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
      {renderRows(layers, null, 0)}
    </ul>
  );
}

/**
 * The layers drawer: the layers tree at the side of the canvas, as the older
 * card editor shows it. The New Studio editors list layers in Position →
 * Layers instead, in the panel beside the rail.
 */
export function LayersDrawer({
  onClose,
  ...tree
}: Omit<LayersTreeProps, "onMove" | "onEdit" | "keep"> & { onClose: () => void }) {
  return (
    <aside
      aria-label="Layers"
      className="absolute bottom-0 right-0 top-0 z-20 flex w-[320px] flex-col border-l border-[var(--ed-line)] bg-[var(--ed-panel)]"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-serif text-[22px] font-extrabold uppercase leading-none">Layers</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close layers"
          className="rounded-lg p-1.5 text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {tree.layers.length === 0 ? (
        <p className="px-4 text-sm text-[var(--ed-ink2)]">
          No added layers yet. The card's own text and images are in the Content panel.
        </p>
      ) : (
        <LayersTree {...tree} />
      )}
    </aside>
  );
}

/**
 * One level of a page (its top level, or a group's children) with layer `id`
 * restacked just above or just below its sibling `target`. Later in the list
 * is drawn on top, so "above" puts it after the target.
 */
export function moveLayerNear(
  layers: FreeLayer[],
  id: string,
  target: string,
  place: "above" | "below",
): FreeLayer[] {
  const moving = layers.find((l) => l.id === id);
  if (!moving || id === target || !layers.some((l) => l.id === target)) return layers;
  const rest = layers.filter((l) => l.id !== id);
  const at = rest.findIndex((l) => l.id === target);
  rest.splice(place === "above" ? at + 1 : at, 0, moving);
  return rest;
}

/** Whether two boxes share some area (touching edges don't count). */
export function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
