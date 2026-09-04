import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ThemeStyle } from "./use-theme-style";

// Curated display-font choices for the Pack A `--disp` token (U9 / KTD6). The
// values match `card_themes.displayFont`; "anton" is the default family.
const DISPLAY_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "anton", label: "Anton (default)" },
  { value: "bebas", label: "Bebas Neue" },
  { value: "oswald", label: "Oswald" },
  { value: "teko", label: "Teko" },
  { value: "archivo", label: "Archivo Black" },
];

/** Per-card style token overrides (accent / panel / display font) + save-as-theme. */
export function StylePanel({ style, hashtag }: { style: ThemeStyle; hashtag: string }) {
  const {
    styleAccent,
    setStyleAccent,
    stylePanel,
    setStylePanel,
    styleFont,
    setStyleFont,
    effAccent,
    effPanel,
    effFont,
    saveThemeName,
    setSaveThemeName,
    saveAsDefault,
    setSaveAsDefault,
    saveThemeError,
    createTheme,
    handleSaveTheme,
  } = style;
  return (
    <div className="space-y-2.5 rounded border px-3 py-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Style</Label>
        {(styleAccent || stylePanel || styleFont) && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={() => {
              setStyleAccent(null);
              setStylePanel(null);
              setStyleFont(null);
            }}
          >
            Reset to theme
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="style-accent" className="text-xs">
            Accent
          </Label>
          <div className="flex items-center gap-2">
            <input
              id="style-accent"
              type="color"
              value={effAccent}
              onChange={(e) => setStyleAccent(e.target.value)}
              className="h-8 w-10 rounded border bg-card p-0.5"
            />
            <span className="text-xs text-muted-foreground">{effAccent}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="style-panel" className="text-xs">
            Panel
          </Label>
          <div className="flex items-center gap-2">
            <input
              id="style-panel"
              type="color"
              value={effPanel}
              onChange={(e) => setStylePanel(e.target.value)}
              className="h-8 w-10 rounded border bg-card p-0.5"
            />
            <span className="text-xs text-muted-foreground">{effPanel}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="style-font" className="text-xs">
          Display font
        </Label>
        <select
          id="style-font"
          value={effFont}
          onChange={(e) => setStyleFont(e.target.value)}
          className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
        >
          {DISPLAY_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {hashtag && (
        <p className="text-xs text-muted-foreground">
          Hashtag footer: <span className="font-mono">{hashtag}</span>
        </p>
      )}

      <div className="space-y-1.5 border-t pt-2">
        <Label htmlFor="save-theme-name" className="text-xs">
          Save these tokens as a theme
        </Label>
        <input
          id="save-theme-name"
          type="text"
          value={saveThemeName}
          placeholder="Theme name"
          onChange={(e) => setSaveThemeName(e.target.value)}
          className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(e) => setSaveAsDefault(e.target.checked)}
          />
          Set as tenant default
        </label>
        {saveThemeError && <p className="text-xs text-destructive">{saveThemeError}</p>}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={createTheme.isPending}
          onClick={handleSaveTheme}
        >
          {createTheme.isPending ? "Saving…" : "Save as theme"}
        </Button>
      </div>
    </div>
  );
}
