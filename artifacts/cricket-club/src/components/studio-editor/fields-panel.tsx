import { useState } from "react";
import { Image as ImageIcon, List, Plus, Search, Type } from "lucide-react";
import {
  isPerformanceRepeat,
  kindFields,
  pageTokens,
  type KindRepeat,
  type PageKey,
  type TokenGroup,
  type RowsPick,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { PickControls } from "./rows-panel";
import {
  fieldTextLayer,
  imageTokenLayer,
  logoLayer,
  photoLayer,
  rowsLayer,
  templateFields,
} from "./template-ops";

const row =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-3 py-2 text-left text-sm hover:border-[var(--ed-accent)]";

/** The field groups, in the panel's order; a card's own fields come first. */
const GROUPS: { group: TokenGroup | undefined; label: string }[] = [
  { group: undefined, label: "This card" },
  { group: "opposition", label: "Opposition" },
  { group: "match", label: "Match" },
  { group: "club", label: "Club" },
];

/** The images the panel always offers itself (the card photo, the club crest). */
const OWN_IMAGES = new Set(["photo", "clubLogo"]);

/**
 * Asked straight away when a performance list is added (full draft editor
 * plan, D4): whose, how many, sorted how and which count. Skip adds it
 * unfiltered (both teams, every performance, scorecard order).
 */
function AddListChooser({
  repeat,
  clubLabel,
  onAdd,
  onSkip,
}: {
  repeat: KindRepeat;
  clubLabel?: string;
  onAdd: (pick: RowsPick) => void;
  onSkip: () => void;
}) {
  const [pick, setPick] = useState<RowsPick>({});
  return (
    <div
      role="group"
      aria-label={`Set up ${repeat.label}`}
      className="rounded-lg border border-[var(--ed-accent)] bg-[var(--ed-panel)] p-3 text-sm"
    >
      <p className="text-xs font-semibold">Which performances should this list show?</p>
      <PickControls
        repeat={repeat.key}
        pick={pick}
        clubLabel={clubLabel}
        onPick={(patch) =>
          setPick((p) => {
            const next = { ...p, ...patch };
            for (const k of Object.keys(next) as Array<keyof RowsPick>)
              if (next[k] === undefined) delete next[k];
            return next;
          })
        }
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAdd(pick)}
          className="rounded-full bg-[var(--ed-accent)] px-3 py-1.5 text-xs font-bold text-[var(--ed-on-accent)]"
        >
          Add list
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-[var(--ed-line)] px-3 py-1.5 text-xs"
        >
          Skip, show all
        </button>
      </div>
    </div>
  );
}

/**
 * Every live field, image and list a card's page has (full draft editor plan,
 * stage 3): the page's own catalogue (`pageTokens`: a result's innings
 * scores, the winner, venue and competition, each team's crest, the batting,
 * bowling and pairs lists), else the kind's fields.
 *
 * Live data for a card kind template (R3, R5): every field the kind offers.
 * With a text box selected, a field is inserted into it as a `{{field}}`
 * token; otherwise it is added as a new text box. Also the card photo, the
 * club crest and, for list cards, the list element.
 */
export function FieldsPanel({
  kind,
  page,
  size,
  values,
  textSelected,
  onInsert,
  onAdd,
}: {
  kind: string;
  /** The page on show; its own catalogue when it has one. */
  page?: PageKey;
  size: CardSize;
  /** Current preview values, shown beside each field. */
  values: Record<string, string>;
  /** Whether a text box is selected (fields then insert into it). */
  textSelected: boolean;
  onInsert: (key: string) => void;
  onAdd: (layer: FreeLayer) => void;
}) {
  const [query, setQuery] = useState("");
  // The performance list being set up before it's added (D4), if any.
  const [choosing, setChoosing] = useState<string | null>(null);
  const pageCat = page ? pageTokens(kind, page) : null;
  const cat = pageCat ?? kindFields(kind);
  if (!cat) return <p className="text-sm text-[var(--ed-ink2)]">This card has no live fields.</p>;
  const fields: { key: string; label: string; group?: TokenGroup }[] =
    pageCat?.fields ?? templateFields(kind);
  const images = (pageCat?.images ?? []).filter((i) => !OWN_IMAGES.has(i.key));
  const q = query.trim().toLowerCase();
  const shown = q
    ? fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
    : fields;
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
        {fields.length > 8 && (
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--ed-ink2)]" aria-hidden />
            <input
              type="search"
              aria-label="Search fields"
              placeholder="Search fields"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        {shown.length === 0 && (
          <p className="text-xs text-[var(--ed-ink2)]">No field matches “{query}”.</p>
        )}
        {GROUPS.map(({ group, label }) => {
          const inGroup = shown.filter((f) => f.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={label} className="mb-3">
              {inGroup.length < shown.length && (
                <h4 className="mb-1 text-[11px] font-semibold text-[var(--ed-ink2)]">{label}</h4>
              )}
              <ul className="flex flex-col gap-1.5">
                {inGroup.map((f) => (
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
            </div>
          );
        })}
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
          {images.map((i) => (
            <button
              key={i.key}
              type="button"
              className={row}
              aria-label={`Add ${i.label}`}
              onClick={() => onAdd(imageTokenLayer(i.key, i.label, size))}
            >
              <span className="flex items-center gap-2 font-semibold">
                <ImageIcon className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden /> {i.label}
              </span>
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          ))}
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
              <div key={r.key} className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className={row}
                  aria-expanded={isPerformanceRepeat(r.key) ? choosing === r.key : undefined}
                  onClick={() =>
                    isPerformanceRepeat(r.key)
                      ? setChoosing(choosing === r.key ? null : r.key)
                      : onAdd(rowsLayer(r, size))
                  }
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <List className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden /> {r.label}
                  </span>
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
                {choosing === r.key && (
                  <AddListChooser
                    repeat={r}
                    clubLabel={values["club.short"]}
                    onAdd={(pick) => {
                      setChoosing(null);
                      onAdd(rowsLayer(r, size, pick));
                    }}
                    onSkip={() => {
                      setChoosing(null);
                      onAdd(rowsLayer(r, size));
                    }}
                  />
                )}
              </div>
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
