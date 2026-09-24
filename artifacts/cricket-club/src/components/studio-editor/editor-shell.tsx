import type { ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ChevronsLeft,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Save,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { CardSize } from "@/lib/share-card";
import { cn } from "@/lib/utils";

export const FORMATS: { value: CardSize; label: string; dims: string }[] = [
  { value: "square", label: "Square", dims: "1080 × 1080" },
  { value: "portrait", label: "Portrait", dims: "1080 × 1350" },
  { value: "story", label: "Story", dims: "1080 × 1920" },
  { value: "landscape", label: "Landscape", dims: "1200 × 630" },
];

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg text-[var(--ed-ink2)] transition-colors hover:bg-[var(--ed-card)] hover:text-[var(--ed-ink)] disabled:pointer-events-none disabled:opacity-35";

/** Top bar: back, resize, undo/redo, save state, title + status, and the primary action. */
export function EditorTopBar({
  title,
  status,
  format,
  onFormat,
  inheritedFormats,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  dirty,
  saving,
  onSave,
  actions,
}: {
  title: string;
  status: ReactNode;
  format: CardSize;
  onFormat: (f: CardSize) => void;
  /** Formats still using another format's layout (flagged for review). */
  inheritedFormats: CardSize[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Extra buttons before Save (e.g. Save as template). */
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--ed-line)] bg-[var(--ed-panel)] px-3">
      <Link
        href="/admin/social/queue"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-[var(--ed-card)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Studio
      </Link>
      <span className="mx-1 h-6 w-px bg-[var(--ed-line)]" aria-hidden />
      <label className="flex items-center gap-1.5 text-sm">
        <Maximize2 className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden />
        <span className="sr-only">Format</span>
        <select
          aria-label="Format"
          value={format}
          onChange={(e) => onFormat(e.target.value as CardSize)}
          className="h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm font-semibold"
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
              {inheritedFormats.includes(f.value) ? " · review" : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={iconBtn}
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconBtn}
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <span className="hidden text-xs text-[var(--ed-ink2)] xl:inline">
        {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
      </span>

      <div className="mx-auto flex min-w-[150px] items-center gap-2 overflow-hidden px-2">
        <span className="max-w-[300px] truncate font-serif text-lg font-bold uppercase">
          {title}
        </span>
        {status}
      </div>

      {actions}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--ed-accent)] px-4 text-sm font-bold text-[var(--ed-on-accent)] transition-opacity disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
        Save
      </button>
    </header>
  );
}

export type RailItem = { id: string; label: string; icon: LucideIcon };

/** Left rail (76px); clicking the active item collapses the panel. */
export function EditorRail({
  items,
  active,
  onSelect,
}: {
  items: RailItem[];
  active: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <nav
      aria-label="Editor tools"
      className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-[var(--ed-line)] bg-[var(--ed-panel)] py-2"
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : it.id)}
            className={cn(
              "flex w-[64px] flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition-colors",
              on
                ? "bg-[var(--ed-card)] text-[var(--ed-ink)]"
                : "text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]",
            )}
          >
            <it.icon
              className={cn("h-[22px] w-[22px]", on && "text-[var(--ed-accent)]")}
              aria-hidden
            />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

/** The 340px side panel. */
export function EditorPanel({
  title,
  onCollapse,
  children,
}: {
  title: string;
  onCollapse: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-r border-[var(--ed-line)] bg-[var(--ed-panel)]">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
        <h2 className="font-serif text-[22px] font-extrabold uppercase leading-none">{title}</h2>
        <button type="button" className={iconBtn} onClick={onCollapse} aria-label="Collapse panel">
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">{children}</div>
    </aside>
  );
}

/** Bottom bar: layers drawer toggle and zoom (50–160%). */
export function EditorBottomBar({
  zoom,
  onZoom,
  layersOpen,
  onToggleLayers,
}: {
  zoom: number;
  onZoom: (z: number) => void;
  layersOpen: boolean;
  onToggleLayers: () => void;
}) {
  const set = (z: number) => onZoom(Math.min(160, Math.max(50, Math.round(z))));
  return (
    <footer className="flex h-14 shrink-0 items-center justify-end gap-3 border-t border-[var(--ed-line)] bg-[var(--ed-panel)] px-4">
      <button
        type="button"
        onClick={onToggleLayers}
        aria-pressed={layersOpen}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-3 text-sm font-semibold",
          layersOpen && "bg-[var(--ed-card)]",
        )}
      >
        <Layers className="h-4 w-4" aria-hidden /> Layers
      </button>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--ed-line)] px-2 py-1">
        <button
          type="button"
          className={iconBtn}
          onClick={() => set(zoom - 10)}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={50}
          max={160}
          value={zoom}
          onChange={(e) => set(Number(e.target.value))}
          className="w-28 accent-[var(--ed-accent)]"
        />
        <button
          type="button"
          className={iconBtn}
          onClick={() => set(zoom + 10)}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="w-11 text-right text-sm tabular-nums">{zoom}%</span>
      </div>
    </footer>
  );
}
