import { Eye, EyeOff, RotateCcw } from "lucide-react";
import type { FreeLayer, PackImageSlot, PhotoAdjust } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { isSponsorSlot } from "@/lib/pack-render/adjustments";
import { cn } from "@/lib/utils";
import { newId, type EditorDoc } from "./document";

const input =
  "h-9 w-full rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2.5 text-sm text-[var(--ed-ink)] placeholder:text-[var(--ed-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ed-accent)]";
const section =
  "mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ed-ink2)]";

/**
 * The card's own content (Social Studio U16): every template text field with
 * its override and a hide toggle, image slots with hide toggles, and the
 * photo's focus point and zoom for the current format.
 */
export function ContentPanel({
  doc,
  fields,
  values,
  slots,
  size,
  photo,
  onField,
  onToggleHidden,
  onPhoto,
}: {
  doc: EditorDoc;
  fields: { key: string; label: string }[];
  /** What each field shows before overrides. */
  values: Record<string, string>;
  slots: PackImageSlot[];
  size: CardSize;
  photo: PhotoAdjust;
  onField: (key: string, value: string | null) => void;
  onToggleHidden: (key: string) => void;
  onPhoto: (p: PhotoAdjust) => void;
}) {
  const hidden = new Set(doc.hidden ?? []);
  return (
    <div>
      <p className={section}>Text</p>
      <div className="space-y-3">
        {fields.map((f) => {
          const overridden = doc.fields?.[f.key] !== undefined;
          const isHidden = hidden.has(`field:${f.key}`);
          return (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`field-${f.key}`} className="text-xs text-[var(--ed-ink2)]">
                  {f.label}
                </label>
                <div className="flex items-center gap-1">
                  {overridden && (
                    <button
                      type="button"
                      className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                      aria-label={`Reset ${f.label}`}
                      title="Use the card's own text"
                      onClick={() => onField(f.key, null)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]"
                    aria-label={isHidden ? `Show ${f.label}` : `Hide ${f.label}`}
                    onClick={() => onToggleHidden(`field:${f.key}`)}
                  >
                    {isHidden ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <input
                id={`field-${f.key}`}
                className={cn(input, isHidden && "opacity-50")}
                value={doc.fields?.[f.key] ?? values[f.key] ?? ""}
                onChange={(e) => onField(f.key, e.target.value)}
              />
            </div>
          );
        })}
      </div>

      {slots.length > 0 && (
        <>
          <p className={section}>Images</p>
          <ul className="space-y-1">
            {slots.map((s) => {
              const isHidden = hidden.has(`slot:${s.key}`);
              const locked = !!doc.sponsorLock && isSponsorSlot(s.key);
              return (
                <li
                  key={s.key}
                  className="flex items-center justify-between rounded-lg bg-[var(--ed-card)] px-3 py-2 text-sm"
                >
                  <span className={cn(isHidden && "opacity-50")}>{s.label}</span>
                  <button
                    type="button"
                    aria-label={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
                    disabled={locked}
                    title={
                      locked
                        ? "The sponsor strip is locked. Turn it off in the Brand panel."
                        : undefined
                    }
                    className="rounded p-1 text-[var(--ed-ink2)] hover:text-[var(--ed-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => onToggleHidden(`slot:${s.key}`)}
                  >
                    {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {slots.some((s) => s.key === "photo") && (
        <>
          <p className={section}>Photo · {size}</p>
          <div className="space-y-2 text-sm">
            {(
              [
                ["Focus left–right", "focalX", 0, 1, 0.01],
                ["Focus top–bottom", "focalY", 0, 1, 0.01],
                ["Zoom", "zoom", 1, 3, 0.05],
              ] as const
            ).map(([label, key, min, max, step]) => (
              <label key={key} className="flex items-center gap-3">
                <span className="w-32 text-xs text-[var(--ed-ink2)]">{label}</span>
                <input
                  type="range"
                  aria-label={label}
                  min={min}
                  max={max}
                  step={step}
                  value={photo[key]}
                  onChange={(e) => onPhoto({ ...photo, [key]: Number(e.target.value) })}
                  className="flex-1 accent-[var(--ed-accent)]"
                />
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const TEXT_PRESETS = [
  { label: "Add a heading", size: 9, weight: 800, content: "HEADING" },
  { label: "Add a subheading", size: 5, weight: 700, content: "Subheading" },
  { label: "Add body text", size: 3.2, weight: 500, content: "Body text" },
];

/** Text presets that add a free text layer to the current format. */
export function TextPanel({ size, onAdd }: { size: CardSize; onAdd: (layer: FreeLayer) => void }) {
  return (
    <div className="mt-3 space-y-2">
      {TEXT_PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() =>
            onAdd({
              id: newId(),
              kind: "text",
              name: p.content,
              content: p.content,
              style: { fontSize: p.size, fontWeight: p.weight },
              geometry: { [size]: { x: 15, y: 40, w: 70, h: p.size * 2 } },
              editedAt: { [size]: Date.now() },
            })
          }
          className="flex w-full items-center rounded-lg bg-[var(--ed-card)] px-3 py-3 text-left hover:ring-1 hover:ring-[var(--ed-accent)]"
          style={{ fontSize: Math.max(13, p.size * 2.2), fontWeight: p.weight }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

const SHAPES = [
  { label: "Square", radius: 0, w: 30, h: 30 },
  { label: "Rounded", radius: 24, w: 30, h: 30 },
  { label: "Circle", radius: 9999, w: 30, h: 30 },
  { label: "Pill", radius: 9999, w: 45, h: 10 },
  { label: "Bar", radius: 0, w: 100, h: 8 },
];

/** Basic shapes that add a free shape layer (the full element library is U17). */
export function ElementsPanel({
  size,
  onAdd,
}: {
  size: CardSize;
  onAdd: (layer: FreeLayer) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {SHAPES.map((s) => (
        <button
          key={s.label}
          type="button"
          aria-label={`Add ${s.label.toLowerCase()}`}
          onClick={() =>
            onAdd({
              id: newId(),
              kind: "shape",
              name: s.label,
              style: { radius: s.radius },
              geometry: { [size]: { x: (100 - s.w) / 2, y: (100 - s.h) / 2, w: s.w, h: s.h } },
              editedAt: { [size]: Date.now() },
            })
          }
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg bg-[var(--ed-card)] text-xs text-[var(--ed-ink2)] hover:ring-1 hover:ring-[var(--ed-accent)]"
        >
          <span
            className="block h-8 w-8 bg-[var(--ed-accent)]"
            style={{
              borderRadius: Math.min(s.radius, 16),
              width: s.w > 40 ? 40 : 32,
              height: s.h < 15 ? 12 : 32,
            }}
          />
          {s.label}
        </button>
      ))}
    </div>
  );
}
