import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CARD_KIND_OPTIONS, CardKindPicker } from "@/components/card-kind-picker";
import type { CardKind } from "@/lib/share-card";

/** Template-mode form: name, assigned card types and per-type default flags. */
export function TemplateModeFields({
  tplName,
  setTplName,
  tplKinds,
  setTplKinds,
  tplDefaults,
  setTplDefaults,
}: {
  tplName: string;
  setTplName: (v: string) => void;
  tplKinds: CardKind[];
  setTplKinds: (v: CardKind[]) => void;
  tplDefaults: CardKind[];
  setTplDefaults: (update: (d: CardKind[]) => CardKind[]) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Template name</Label>
        <Input
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
          placeholder="e.g. Gold milestone frame"
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Assign to card types</Label>
        <CardKindPicker
          value={tplKinds}
          onChange={(next) => {
            setTplKinds(next);
            setTplDefaults((d) => d.filter((k) => next.includes(k)));
          }}
        />
        <p className="text-[10px] text-muted-foreground">
          Card types this template can be applied to. Empty = available for
          all types.
        </p>
      </div>
      {tplKinds.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Make default for</Label>
          <div className="flex flex-wrap gap-1.5">
            {tplKinds.map((k) => {
              const active = tplDefaults.includes(k);
              const label =
                CARD_KIND_OPTIONS.find((o) => o.value === k)?.label ?? k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setTplDefaults((d) =>
                      active ? d.filter((x) => x !== k) : [...d, k],
                    )
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            A default template is applied automatically to that card type.
            Only one default per type — setting this one replaces any other.
          </p>
        </div>
      )}
    </div>
  );
}
