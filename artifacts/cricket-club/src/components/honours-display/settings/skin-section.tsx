import { Paintbrush, Palette, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TEMPLATES } from "../types";
import type { TemplateId } from "../types";
import { SkinEditor } from "../editors";
import type { HonoursDisplayForm } from "../use-honours-display-settings";

const TEMPLATE_BLURB: Record<TemplateId, string> = {
  p1: "Carved heritage timber board with gold lettering.",
  p2: "Painted club-colours plaque in navy & gold.",
  p3: "Frosted glass / etched modern panel.",
  p4: "Clean light card — best on small screens.",
  p5: "Broadcast hero styling on black.",
  p6: "Soft, rounded cards on a light backdrop.",
  p7: "App-style flags with bright accents (light).",
  p8: "App-style flags with bright accents (dark).",
  p9: "Printed acrylic board with a filled colour header row.",
  p10: "Matches the Ovation app — dark charcoal, club gold, serif titles.",
};

/** Skin picker — built-in templates + admin-authored themes. */
export function SkinSection({ form }: { form: HonoursDisplayForm }) {
  const { defaultTemplate, setDefaultTemplate, skins, addSkin, patchSkin, removeSkin } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" /> Skin / theme
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The one skin every board renders in. Each board still uses its own natural layout
          (premierships, team of the decade, lists) — only the look changes. Pick a built-in or
          author your own theme below.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDefaultTemplate(t.id)}
              className={`text-left border rounded-lg p-3 transition ${
                defaultTemplate === t.id
                  ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                  : "hover:border-primary/50"
              }`}
              data-testid={`template-${t.id}`}
            >
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{TEMPLATE_BLURB[t.id]}</div>
            </button>
          ))}
          {skins.map((sk) => (
            <button
              key={sk.id}
              type="button"
              onClick={() => setDefaultTemplate(sk.id)}
              className={`text-left border rounded-lg p-3 transition ${
                defaultTemplate === sk.id
                  ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                  : "hover:border-primary/50"
              }`}
              data-testid={`skin-${sk.id}`}
            >
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border" style={{ background: sk.accent }} />
                <div className="text-sm font-semibold truncate">{sk.name}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Custom theme</div>
            </button>
          ))}
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Paintbrush className="h-4 w-4" /> Your themes
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSkin}
              data-testid="button-add-skin"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New theme
            </Button>
          </div>
          {skins.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No custom themes yet — built-ins p1–p8 are always available.
            </p>
          ) : (
            <div className="space-y-3">
              {skins.map((sk) => (
                <SkinEditor
                  key={sk.id}
                  skin={sk}
                  isDefault={defaultTemplate === sk.id}
                  onPatch={(patch) => patchSkin(sk.id, patch)}
                  onRemove={() => removeSkin(sk.id)}
                  onSetDefault={() => setDefaultTemplate(sk.id)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
