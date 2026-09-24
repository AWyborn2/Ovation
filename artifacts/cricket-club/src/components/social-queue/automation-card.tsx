import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  type SocialFamilyConfig,
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsCard, SettingsRow } from "@/components/admin-ui";
import { FAMILIES, FAMILY_LABEL, type Family } from "./draft-meta";

const FAMILY_HELP: Record<Family, string> = {
  results: "A card for every match result. Junior grades stay off unless you add them below.",
  achievements: "Centuries, five-fors, debuts, caps and career milestones.",
  roundup: "Grade leaders and the weekend wrap after each round.",
  matchday: "Match-day cards two days out, and team lists once the XI is published.",
};

/**
 * The automation switches (R2) — which card families draft themselves after
 * each import, and per-grade exceptions for match results. Lives on the queue
 * page until the Cards settings redesign (U14) gives it a home.
 */
export function AutomationCard({ config }: { config: SocialFamilyConfig | undefined }) {
  const qc = useQueryClient();
  const [grade, setGrade] = useState("");
  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() }),
    },
  });

  const save = (
    familyConfig: Partial<Record<Family, { enabled?: boolean; grades?: Record<string, boolean> }>>,
  ) => update.mutate({ data: { familyConfig } });

  const resultGrades = Object.entries(config?.results.grades ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div id="automation" className="scroll-mt-20">
      <SettingsCard
        title="Automation"
        description="Choose which cards are drafted automatically after each import."
      >
        {FAMILIES.map((family) => (
          <SettingsRow
            key={family}
            label={FAMILY_LABEL[family]}
            helper={FAMILY_HELP[family]}
            htmlFor={`family-${family}`}
          >
            <Switch
              id={`family-${family}`}
              checked={config?.[family].enabled ?? false}
              disabled={!config || update.isPending}
              onCheckedChange={(enabled) => save({ [family]: { enabled } })}
              aria-label={FAMILY_LABEL[family]}
            />
          </SettingsRow>
        ))}
        <SettingsRow
          label="Match results by grade"
          helper="Senior grades draft by default and junior grades don't. Add a grade to switch it on or off."
        >
          <div className="flex max-w-sm flex-col gap-2">
            {resultGrades.map(([g, on]) => (
              <label key={g} className="flex items-center justify-between gap-3 text-sm">
                <span>{g}</span>
                <Switch
                  checked={on}
                  disabled={update.isPending}
                  onCheckedChange={(v) => save({ results: { grades: { [g]: v } } })}
                  aria-label={`Match results for ${g}`}
                />
              </label>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const g = grade.trim();
                if (!g) return;
                save({ results: { grades: { [g]: true } } });
                setGrade("");
              }}
            >
              <Input
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="e.g. Under 15"
                aria-label="Grade to add"
                className="h-9"
              />
              <Button type="submit" size="sm" variant="outline" disabled={!grade.trim()}>
                Add
              </Button>
            </form>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
