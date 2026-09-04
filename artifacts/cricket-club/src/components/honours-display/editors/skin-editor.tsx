import { Check, Trash2 } from "lucide-react";
import type { HonourSkin } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ColourField } from "./colour-field";
import { BackgroundPicker } from "./background-picker";
import { FONT_OPTIONS } from "./constants";

/** Editor card for a single admin-authored skin/theme. */
export function SkinEditor({
  skin,
  isDefault,
  onPatch,
  onRemove,
  onSetDefault,
}: {
  skin: HonourSkin;
  isDefault: boolean;
  onPatch: (patch: Partial<HonourSkin>) => void;
  onRemove: () => void;
  onSetDefault: () => void;
}) {
  const colours: { key: keyof HonourSkin; label: string }[] = [
    { key: "background", label: "Page background" },
    { key: "boardBg", label: "Board surface" },
    { key: "ink", label: "Text" },
    { key: "muted", label: "Muted text" },
    { key: "accent", label: "Accent" },
    { key: "accentInk", label: "Text on accent" },
  ];
  return (
    <div
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
      data-testid={`skin-editor-${skin.id}`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 flex-1 min-w-[12rem]">
          <span className="text-xs font-medium text-muted-foreground">
            Theme name
          </span>
          <Input
            value={skin.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            data-testid={`skin-name-${skin.id}`}
          />
        </label>
        {isDefault ? (
          <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-medium">
            Club default
          </span>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onSetDefault}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Set default
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onRemove}
          data-testid={`skin-remove-${skin.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {colours.map((c) => (
          <ColourField
            key={c.key}
            label={c.label}
            value={(skin[c.key] as string) ?? ""}
            onChange={(v) => onPatch({ [c.key]: v } as Partial<HonourSkin>)}
            testId={`skin-${skin.id}-${c.key}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Title font
          </span>
          <select
            className="w-full px-2 py-1.5 rounded border bg-card text-sm"
            value={
              FONT_OPTIONS.some((f) => f.value === skin.font)
                ? skin.font
                : "Georgia, serif"
            }
            onChange={(e) => onPatch({ font: e.target.value })}
            data-testid={`skin-font-${skin.id}`}
          >
            {FONT_OPTIONS.filter((f) => f.value).map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
            <option value="Georgia, serif">Georgia (serif)</option>
          </select>
        </label>
        <BackgroundPicker
          value={skin.backgroundImage}
          onChange={(bg) => onPatch({ backgroundImage: bg })}
          testId={`skin-bg-${skin.id}`}
        />
      </div>

      {/* Mini swatch preview of the theme. */}
      <div
        className="rounded-md p-3 flex items-center gap-3"
        style={{ background: skin.background, color: skin.ink }}
      >
        <span
          className="h-8 w-8 rounded-full grid place-items-center text-xs font-bold"
          style={{ background: skin.accent, color: skin.accentInk }}
        >
          HH
        </span>
        <div
          className="flex-1 rounded px-2 py-1.5 text-sm"
          style={{ background: skin.boardBg }}
        >
          <span style={{ fontFamily: skin.font }}>Sample board heading</span>
          <span className="ml-2 text-xs" style={{ color: skin.muted }}>
            subtitle
          </span>
        </div>
      </div>
    </div>
  );
}
