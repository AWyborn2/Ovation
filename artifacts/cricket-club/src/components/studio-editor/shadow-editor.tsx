/**
 * The shadow editor (B3): a layer's box shadows, text shadows or drop shadows,
 * several of each (up to `MAX_SHADOWS`), each with its offset, blur and colour,
 * and a box shadow's spread and inset. A shadow starts as a drop shadow or a
 * glow in the club's colour. Lengths are percent of the artboard width.
 */
import { Plus, X } from "lucide-react";
import {
  MAX_SHADOWS,
  V2_RANGES,
  type TemplateBoxShadow,
  type TemplateTextShadow,
} from "@workspace/scorecard/kind-templates";
import { btn, ColourField, NumberField } from "./design-controls";

/** A box shadow; text and drop shadows are the same without spread and inset. */
type Shadow = TemplateBoxShadow;

/** What a new shadow starts as. */
export const SHADOW_STARTS = {
  shadow: { x: 0, y: 0.5, blur: 1.5, color: "#00000080" },
  glow: { x: 0, y: 0, blur: 2, color: "var(--gold)" },
} satisfies Record<string, TemplateTextShadow>;

const [offMin, offMax] = V2_RANGES.shadowOffset;
const [blurMin, blurMax] = V2_RANGES.shadowBlur;

export function ShadowListEditor({
  name,
  value,
  onChange,
  box = false,
}: {
  /** What the list is called ("Box shadow", "Text shadow", "Glow"). */
  name: string;
  value: Shadow[] | undefined;
  onChange: (list: Shadow[] | undefined) => void;
  /** Box shadows also have a spread and can be inset. */
  box?: boolean;
}) {
  const list = Array.isArray(value) ? value : [];
  const set = (next: Shadow[]) => onChange(next.length ? next : undefined);
  const patch = (i: number, p: Partial<Shadow>) =>
    set(list.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const full = list.length >= MAX_SHADOWS;
  const lower = name.toLowerCase();
  return (
    <div className="space-y-1" role="group" aria-label={name}>
      {list.length > 0 && (
        <ol aria-label={`${name} list`} className="space-y-2">
          {list.map((s, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <ColourField
                name={`${name} ${i + 1}`}
                value={s.color}
                onChange={(color) => patch(i, { color: color ?? s.color })}
              />
              <NumberField
                name="Across"
                value={s.x}
                min={offMin}
                max={offMax}
                step={0.1}
                onChange={(x) => patch(i, { x: x ?? 0 })}
              />
              <NumberField
                name="Down"
                value={s.y}
                min={offMin}
                max={offMax}
                step={0.1}
                onChange={(y) => patch(i, { y: y ?? 0 })}
              />
              <NumberField
                name="Blur"
                value={s.blur}
                min={blurMin}
                max={blurMax}
                step={0.1}
                onChange={(blur) => patch(i, { blur: blur ?? 0 })}
              />
              {box && (
                <>
                  <NumberField
                    name="Spread"
                    value={s.spread}
                    min={offMin}
                    max={offMax}
                    step={0.1}
                    onChange={(spread) => patch(i, { spread })}
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={!!s.inset}
                      onChange={(e) => patch(i, { inset: e.target.checked || undefined })}
                    />
                    Inside
                  </label>
                </>
              )}
              <button
                type="button"
                className={btn}
                aria-label={`Remove ${lower} ${i + 1}`}
                onClick={() => set(list.filter((_, j) => j !== i))}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      <span className="flex flex-wrap gap-1">
        {(
          [
            ["shadow", "shadow"],
            ["glow", "glow"],
          ] as const
        ).map(([start, word]) => (
          <button
            key={start}
            type="button"
            className={`${btn} flex items-center gap-1`}
            aria-label={`${name}: add ${word}`}
            disabled={full}
            onClick={() => set([...list, { ...SHADOW_STARTS[start] }])}
          >
            <Plus className="h-3 w-3" aria-hidden /> Add {word}
          </button>
        ))}
      </span>
    </div>
  );
}
