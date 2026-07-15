import { PRESETS, type BadgePresetId } from "./badge-presets";
import { Check } from "lucide-react";

const BADGE_OPTIONS: Array<{ id: BadgePresetId; label: string }> = [
  { id: "shield", label: "Shield" },
  { id: "ball", label: "Ball" },
  { id: "chevron", label: "Chevron" },
  { id: "pill", label: "Pill" },
];

interface BadgeStylePickerProps {
  value: BadgePresetId;
  onChange: (id: BadgePresetId) => void;
  disabled?: boolean;
}

export function BadgeStylePicker({ value, onChange, disabled }: BadgeStylePickerProps) {
  return (
    <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Badge style">
      {BADGE_OPTIONS.map(({ id, label }) => {
        const Preset = PRESETS[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            disabled={disabled}
            data-testid={`badge-style-${id}`}
            className={`flex flex-col items-center gap-1.5 rounded-md border p-2 transition-colors ${
              value === id ? "border-ring" : "border-border hover:border-muted-foreground"
            }`}
          >
            <span className="relative" style={{ color: "hsl(var(--accent))" }}>
              <Preset label="A" size={40} />
              {value === id && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </span>
            <span className="text-xs font-medium">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
