/**
 * The gradient editor (B1): a linear or radial gradient with any number of
 * stops (within the format's limits), each a colour at a position, and the
 * gradient's angle, or its shape and centre. Used for a layer's fill and for
 * a text fill (foil).
 */
import { Plus, X } from "lucide-react";
import {
  MAX_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS,
  type TemplateGradient,
} from "@workspace/scorecard/kind-templates";
import { btn, ColourField, field, item, label, NumberField } from "./design-controls";
import { addStop, removeStop, setStop, stopPositions, withType } from "./gradient-ops";

/** Quick angles, in the format's CSS convention (0 is to the top). */
const ANGLES = [
  [180, "Down"],
  [90, "Across"],
  [135, "Diagonal down"],
  [45, "Diagonal up"],
] as const;

export function GradientEditor({
  name,
  value,
  onChange,
}: {
  name: string;
  value: TemplateGradient;
  onChange: (g: TemplateGradient) => void;
}) {
  const at = stopPositions(value.stops);
  return (
    <div className="space-y-2" role="group" aria-label={`${name} gradient`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className={label}>
          Type
          <select
            className={field}
            aria-label={`${name} gradient type`}
            value={value.type}
            onChange={(e) => onChange(withType(value, e.target.value as TemplateGradient["type"]))}
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
        </label>
        {value.type === "linear" ? (
          <>
            <NumberField
              name="Angle"
              value={value.angle ?? 180}
              min={0}
              max={360}
              step={5}
              onChange={(angle) => onChange({ ...value, angle: angle ?? 180 })}
            />
            <span className="flex gap-1">
              {ANGLES.map(([angle, title]) => (
                <button
                  key={angle}
                  type="button"
                  className={btn}
                  aria-label={`${name} ${title.toLowerCase()}`}
                  aria-pressed={(value.angle ?? 180) === angle}
                  title={title}
                  onClick={() => onChange({ ...value, angle })}
                >
                  {angle}°
                </button>
              ))}
            </span>
          </>
        ) : (
          <>
            <label className={label}>
              Shape
              <select
                className={field}
                aria-label={`${name} gradient shape`}
                value={value.shape ?? "ellipse"}
                onChange={(e) =>
                  onChange({ ...value, shape: e.target.value === "circle" ? "circle" : "ellipse" })
                }
              >
                <option value="ellipse">Ellipse</option>
                <option value="circle">Circle</option>
              </select>
            </label>
            <NumberField
              name="Centre across (%)"
              value={value.at?.x ?? 50}
              min={0}
              max={100}
              step={5}
              onChange={(x) => onChange({ ...value, at: { x: x ?? 50, y: value.at?.y ?? 50 } })}
            />
            <NumberField
              name="Centre down (%)"
              value={value.at?.y ?? 50}
              min={0}
              max={100}
              step={5}
              onChange={(y) => onChange({ ...value, at: { x: value.at?.x ?? 50, y: y ?? 50 } })}
            />
          </>
        )}
      </div>
      <ol aria-label={`${name} gradient stops`} className="space-y-1">
        {value.stops.map((stop, i) => (
          <li key={i} className={item}>
            <ColourField
              name={`${name} stop ${i + 1}`}
              value={stop.color}
              onChange={(color) =>
                onChange(setStop(value, i, { color: color ?? value.stops[i]!.color }))
              }
            />
            <NumberField
              name={`Stop ${i + 1} at (%)`}
              value={stop.at ?? at[i]}
              min={0}
              max={100}
              step={5}
              onChange={(pos) => onChange(setStop(value, i, { at: pos ?? at[i] }))}
            />
            <button
              type="button"
              className={btn}
              aria-label={`Remove ${name.toLowerCase()} stop ${i + 1}`}
              disabled={value.stops.length <= MIN_GRADIENT_STOPS}
              onClick={() => onChange(removeStop(value, i))}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={`${btn} flex items-center gap-1`}
        disabled={value.stops.length >= MAX_GRADIENT_STOPS}
        onClick={() => onChange(addStop(value))}
      >
        <Plus className="h-3 w-3" aria-hidden /> Add {name.toLowerCase()} stop
      </button>
    </div>
  );
}
