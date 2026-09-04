import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColourField, FONT_OPTIONS } from "../editors";
import type { HonoursDisplayForm } from "../use-honours-display-settings";

/** Club-wide colour overrides + default title font, layered on the active skin. */
export function GlobalColoursSection({ form }: { form: HonoursDisplayForm }) {
  const { colourOverrides, setColourOverride, defaultFont, setDefaultFont } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Global colours &amp; font</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Club-wide tweaks layered on top of the active skin. Leave a colour blank to keep the
          skin's own colour. These apply everywhere on the display and kiosk.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          <ColourField
            label="Background"
            value={colourOverrides.background ?? ""}
            onChange={(v) => setColourOverride("background", v)}
            testId="override-background"
          />
          <ColourField
            label="Text"
            value={colourOverrides.text ?? ""}
            onChange={(v) => setColourOverride("text", v)}
            testId="override-text"
          />
          <ColourField
            label="Accent"
            value={colourOverrides.accent ?? ""}
            onChange={(v) => setColourOverride("accent", v)}
            testId="override-accent"
          />
          <ColourField
            label="Column headings"
            value={colourOverrides.heading ?? ""}
            onChange={(v) => setColourOverride("heading", v)}
            testId="override-heading"
          />
          <ColourField
            label="Season column"
            value={colourOverrides.season ?? ""}
            onChange={(v) => setColourOverride("season", v)}
            testId="override-season"
          />
        </div>
        <label className="space-y-1 block max-w-sm">
          <span className="text-xs font-medium text-muted-foreground">Default title font</span>
          <select
            className="w-full px-2 py-1.5 rounded border bg-card text-sm"
            value={defaultFont}
            onChange={(e) => setDefaultFont(e.target.value)}
            data-testid="select-default-font"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </CardContent>
    </Card>
  );
}
