import {
  Award,
  BarChart3,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  Shapes,
  Sticker,
  Type,
  Unlock,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FreeLayer } from "@/lib/pack-render";
import { cn } from "@/lib/utils";

const ICON: Record<FreeLayer["kind"], LucideIcon> = {
  text: Type,
  shape: Shapes,
  image: ImageIcon,
  medal: Award,
  sticker: Sticker,
  chart: BarChart3,
};

/**
 * The layers drawer (Social Studio U16): free layers top-most first, each with
 * its type icon, name, and eye and lock buttons. Clicking a row selects it.
 */
export function LayersDrawer({
  layers,
  selection,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onClose,
}: {
  layers: FreeLayer[];
  selection: string[];
  onSelect: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onClose: () => void;
}) {
  const rows = [...layers].reverse();
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
      {rows.length === 0 ? (
        <p className="px-4 text-sm text-[var(--ed-ink2)]">
          No added layers yet. The card's own text and images are in the Content panel.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {rows.map((l) => {
            const Icon = ICON[l.kind];
            const on = selection.includes(l.id);
            return (
              <li
                key={l.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5",
                  on ? "bg-[var(--ed-card)]" : "hover:bg-[var(--ed-card)]/60",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                  onClick={() => onSelect(l.id)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--ed-ink2)]" aria-hidden />
                  <span className={cn("truncate", l.hidden && "opacity-50")}>
                    {l.name ?? l.content ?? l.kind}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={l.hidden ? `Show ${l.name ?? l.kind}` : `Hide ${l.name ?? l.kind}`}
                  className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                  onClick={() => onToggleHidden(l.id)}
                >
                  {l.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  aria-label={l.locked ? `Unlock ${l.name ?? l.kind}` : `Lock ${l.name ?? l.kind}`}
                  className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                  onClick={() => onToggleLocked(l.id)}
                >
                  {l.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
