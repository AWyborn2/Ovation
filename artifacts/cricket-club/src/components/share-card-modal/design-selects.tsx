import { Label } from "@/components/ui/label";
import type { CardTemplate, CardTheme as ApiCardTheme } from "@workspace/api-client-react";

/** BYO layout template picker (built-in design vs a custom template). */
export function LayoutSelect({
  layoutId,
  setLayoutId,
  setLayoutTouched,
  applicableTemplates,
}: {
  layoutId: number | null;
  setLayoutId: (id: number | null) => void;
  setLayoutTouched: (v: boolean) => void;
  applicableTemplates: CardTemplate[];
}) {
  return (
    <div className="space-y-1.5 rounded border px-3 py-2">
      <Label htmlFor="layout-select" className="text-sm">
        Layout
      </Label>
      <select
        id="layout-select"
        value={layoutId ?? ""}
        onChange={(e) => {
          setLayoutTouched(true);
          setLayoutId(e.target.value === "" ? null : Number(e.target.value));
        }}
        className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
      >
        <option value="">Built-in design</option>
        {applicableTemplates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Card theme picker (hidden for junior cards and when a template is chosen). */
export function ThemeSelect({
  themes,
  selectedThemeId,
  setSelectedThemeId,
}: {
  themes: ApiCardTheme[];
  selectedThemeId: number | null;
  setSelectedThemeId: (id: number) => void;
}) {
  return (
    <div className="space-y-1.5 rounded border px-3 py-2">
      <Label htmlFor="theme-select" className="text-sm">
        Card theme
      </Label>
      <select
        id="theme-select"
        value={selectedThemeId ?? ""}
        onChange={(e) => setSelectedThemeId(Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
