import { Image as ImageIcon, List, Plus, Type } from "lucide-react";
import { kindFields } from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { fieldTextLayer, logoLayer, photoLayer, rowsLayer, templateFields } from "./template-ops";

const row =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-3 py-2 text-left text-sm hover:border-[var(--ed-accent)]";

/**
 * Live data for a card kind template (R3, R5): every field the kind offers.
 * With a text box selected, a field is inserted into it as a `{{field}}`
 * token; otherwise it is added as a new text box. Also the card photo, the
 * club crest and, for list cards, the list element.
 */
export function FieldsPanel({
  kind,
  size,
  values,
  textSelected,
  onInsert,
  onAdd,
}: {
  kind: string;
  size: CardSize;
  /** Current preview values, shown beside each field. */
  values: Record<string, string>;
  /** Whether a text box is selected (fields then insert into it). */
  textSelected: boolean;
  onInsert: (key: string) => void;
  onAdd: (layer: FreeLayer) => void;
}) {
  const cat = kindFields(kind);
  if (!cat) return <p className="text-sm text-[var(--ed-ink2)]">This card has no live fields.</p>;
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--ed-ink2)]">
          Fields
        </h3>
        <p className="mb-2 text-xs text-[var(--ed-ink2)]">
          {textSelected
            ? "Click a field to insert it into the selected text box."
            : "Click a field to add it as a text box, or select a text box first to insert it."}
        </p>
        <ul className="flex flex-col gap-1.5">
          {templateFields(kind).map((f) => (
            <li key={f.key}>
              <button
                type="button"
                className={row}
                aria-label={`${textSelected ? "Insert" : "Add"} ${f.label}`}
                onClick={() =>
                  textSelected ? onInsert(f.key) : onAdd(fieldTextLayer(f.key, f.label, size))
                }
              >
                <span className="flex shrink-0 items-center gap-2">
                  <Type className="h-4 w-4 shrink-0 text-[var(--ed-ink2)]" aria-hidden />
                  <span className="font-semibold">{f.label}</span>
                </span>
                <span className="min-w-0 truncate text-xs text-[var(--ed-ink2)]">
                  {values[f.key] || "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--ed-ink2)]">
          Images
        </h3>
        <div className="flex flex-col gap-1.5">
          <button type="button" className={row} onClick={() => onAdd(photoLayer(size))}>
            <span className="flex items-center gap-2 font-semibold">
              <ImageIcon className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden /> Card photo
            </span>
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={row} onClick={() => onAdd(logoLayer(size))}>
            <span className="flex items-center gap-2 font-semibold">
              <ImageIcon className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden /> Club logo
            </span>
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--ed-ink2)]">
          Junior cards never show the photo, whatever the template holds.
        </p>
      </section>
      {cat.repeats.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--ed-ink2)]">
            Lists
          </h3>
          <div className="flex flex-col gap-1.5">
            {cat.repeats.map((r) => (
              <button
                key={r.key}
                type="button"
                className={row}
                onClick={() => onAdd(rowsLayer(r, size))}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <List className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden /> {r.label}
                </span>
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--ed-ink2)]">
            Style one row; it repeats for every row. Rows that don&apos;t fit go on extra slides.
          </p>
        </section>
      )}
    </div>
  );
}
