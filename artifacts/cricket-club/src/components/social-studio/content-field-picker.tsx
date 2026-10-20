import {
  CONTENT_PRESETS,
  CONTENT_PRESET_LABELS,
  contentFields,
  type ContentKind,
  type ContentPreset,
  type ContentSlide,
} from "@workspace/scorecard/card-content";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const SLIDE_LABELS: Record<ContentSlide, string> = {
  title: "Title page",
  fixture: "Each fixture",
  sponsors: "Sponsors page",
};

const PRESET_HINTS: Record<ContentPreset, string> = {
  minimal: "The essentials only",
  standard: "Your cards as they are today",
  full: "Everything, including extra match facts as they arrive",
};

/**
 * Presets plus per-field switches for one content kind (ADR-010). Core fields
 * are always shown and can't be switched off; optional ones follow the preset
 * until switched. Used by the club's settings and a carousel's override.
 */
export function ContentFieldPicker({
  kind,
  preset,
  visible,
  onPreset,
  onToggle,
  disabled = false,
  idPrefix,
  presetOptions,
}: {
  kind: ContentKind;
  /** The preset shown as chosen; null when the picker shows "the club's setting". */
  preset: ContentPreset | null;
  visible: ReadonlySet<string>;
  onPreset: (preset: ContentPreset | null) => void;
  onToggle: (key: string, on: boolean) => void;
  disabled?: boolean;
  idPrefix: string;
  /** An extra first option (the carousel's "Club setting"). */
  presetOptions?: { clubLabel: string };
}) {
  const fields = contentFields(kind);
  const slides = [...new Set(fields.map((f) => f.slide))];
  const choices: Array<{ value: ContentPreset | null; label: string; hint: string }> = [
    ...(presetOptions
      ? [{ value: null, label: presetOptions.clubLabel, hint: "Your club's content settings" }]
      : []),
    ...CONTENT_PRESETS.map((p) => ({
      value: p,
      label: CONTENT_PRESET_LABELS[p],
      hint: PRESET_HINTS[p],
    })),
  ];
  return (
    <div className="space-y-4">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Preset</legend>
        <div className="flex flex-wrap gap-1" role="radiogroup">
          {choices.map((c) => (
            <Button
              key={c.value ?? "club"}
              type="button"
              size="sm"
              role="radio"
              aria-checked={preset === c.value}
              title={c.hint}
              variant={preset === c.value ? "default" : "outline"}
              disabled={disabled}
              onClick={() => onPreset(c.value)}
              data-testid={`${idPrefix}-preset-${c.value ?? "club"}`}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        {slides.map((slide) => (
          <fieldset key={slide} className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{SLIDE_LABELS[slide]}</legend>
            {fields
              .filter((f) => f.slide === slide)
              .map((f) => {
                const id = `${idPrefix}-field-${f.key}`;
                const core = f.tier === "core";
                return (
                  <div key={f.key} className="flex items-center justify-between gap-2">
                    <label htmlFor={id} className="text-sm">
                      {f.label}
                      {core && <span className="ml-1 text-xs text-muted-foreground">always</span>}
                    </label>
                    <Switch
                      id={id}
                      checked={visible.has(f.key)}
                      disabled={disabled || core}
                      onCheckedChange={(on) => onToggle(f.key, on)}
                      data-testid={id}
                    />
                  </div>
                );
              })}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
