import { Copy, Group, Lock, Trash2, Ungroup, Unlock } from "lucide-react";
import type { FreeLayer } from "@/lib/pack-render";
import { cn } from "@/lib/utils";

const btn =
  "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)] disabled:pointer-events-none disabled:opacity-35";

/** Colours offered in the toolbar, all from the pack's own tokens so cards stay on brand. */
const SWATCHES: { label: string; value: string }[] = [
  { label: "Accent", value: "var(--gold)" },
  { label: "Light", value: "inherit" },
  { label: "Dark", value: "var(--ink)" },
  { label: "Panel", value: "var(--panel)" },
];

/**
 * The floating contextual toolbar (Social Studio U16): text content and colour
 * for a text layer, fill for a shape, and always lock / duplicate / delete;
 * group or ungroup for a multi-selection.
 */
export function EditorToolbar({
  selected,
  isGroup,
  onText,
  onColour,
  onLock,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
}: {
  selected: FreeLayer[];
  isGroup: boolean;
  onText: (text: string) => void;
  onColour: (colour: string) => void;
  onLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
}) {
  if (selected.length === 0) {
    return (
      <div className="h-11 px-3 text-sm leading-[44px] text-[var(--ed-ink2)]">
        Select a layer to edit it, or add one from the panel.
      </div>
    );
  }
  const single = selected.length === 1 ? selected[0] : null;
  const locked = selected.every((l) => l.locked);
  return (
    <div
      role="toolbar"
      aria-label="Layer tools"
      className="flex h-11 items-center gap-1 rounded-xl border border-[var(--ed-line)] bg-[var(--ed-panel)] px-1.5 shadow-[0_24px_48px_-16px_rgba(0,0,0,.7)]"
    >
      {single ? (
        <>
          {single.kind === "text" && (
            <input
              aria-label="Text"
              value={single.content ?? ""}
              onChange={(e) => onText(e.target.value)}
              className="h-8 w-44 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm"
            />
          )}
          {(single.kind === "text" || single.kind === "shape") && (
            <div className="flex items-center gap-1 px-1" role="group" aria-label="Colour">
              {SWATCHES.map((s) => {
                const current =
                  single.kind === "text" ? single.style?.color : single.style?.background;
                return (
                  <button
                    key={s.label}
                    type="button"
                    aria-label={s.label}
                    aria-pressed={current === s.value}
                    onClick={() => onColour(s.value)}
                    className={cn(
                      "h-6 w-6 rounded-full border border-[var(--ed-line)]",
                      current === s.value && "ring-2 ring-[var(--ed-accent)]",
                    )}
                    style={{ background: s.value === "inherit" ? "var(--ed-ink)" : s.value }}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <span className="px-2 text-sm font-semibold">
          {isGroup ? `Group · ${selected.length} layers` : `${selected.length} selected`}
        </span>
      )}
      <span className="mx-1 h-6 w-px bg-[var(--ed-line)]" aria-hidden />
      {selected.length > 1 &&
        (isGroup ? (
          <button type="button" className={btn} onClick={onUngroup}>
            <Ungroup className="h-4 w-4" aria-hidden /> Ungroup
          </button>
        ) : (
          <button type="button" className={btn} onClick={onGroup}>
            <Group className="h-4 w-4" aria-hidden /> Group
          </button>
        ))}
      <button
        type="button"
        className={btn}
        onClick={onLock}
        aria-label={locked ? "Unlock" : "Lock"}
      >
        {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
      </button>
      <button type="button" className={btn} onClick={onDuplicate} aria-label="Duplicate">
        <Copy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "text-[var(--ed-danger)]")}
        onClick={onDelete}
        disabled={locked}
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
