import type { ShirtNumberSettings, ShirtNumberSettingsUpdate } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { SettingsCard, SettingsRow } from "@/components/admin-ui";

const selectClass = "h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium";

/**
 * The shirt-number feature switch and policies (R1–R3). With the feature off
 * only the switch shows, with a note that the register is kept.
 */
export function ShirtNumberSettingsPanel({
  settings,
  onChange,
  pending = false,
  error,
}: {
  settings: ShirtNumberSettings;
  onChange: (patch: ShirtNumberSettingsUpdate) => void;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <SettingsCard
      title="Shirt number settings"
      description="Playing shirt numbers per season, shown on team lists, player social cards and profiles."
    >
      <SettingsRow
        label="Shirt numbers"
        htmlFor="shirt-numbers-enabled"
        helper={
          settings.enabled
            ? "On: numbers show on team lists, player cards and profiles."
            : "Off: no shirt number shows anywhere. Your register is kept and comes back when you turn this on."
        }
      >
        <Switch
          id="shirt-numbers-enabled"
          checked={settings.enabled}
          disabled={pending}
          onCheckedChange={(enabled) => onChange({ enabled })}
        />
      </SettingsRow>
      {settings.enabled && (
        <>
          <SettingsRow
            label="Duplicate numbers"
            htmlFor="shirt-numbers-duplicates"
            helper="Warn lets two people share a number in a season; block refuses the save."
          >
            <select
              id="shirt-numbers-duplicates"
              className={selectClass}
              value={settings.duplicatePolicy}
              disabled={pending}
              onChange={(e) =>
                onChange({
                  duplicatePolicy: e.target.value as ShirtNumberSettings["duplicatePolicy"],
                })
              }
            >
              <option value="warn">Warn</option>
              <option value="block">Block</option>
            </select>
          </SettingsRow>
          <SettingsRow
            label="New season"
            htmlFor="shirt-numbers-rollover"
            helper="Carry forward gives returning players last season's number (editable); start blank begins each season with no numbers."
          >
            <select
              id="shirt-numbers-rollover"
              className={selectClass}
              value={settings.rolloverPolicy}
              disabled={pending}
              onChange={(e) =>
                onChange({
                  rolloverPolicy: e.target.value as ShirtNumberSettings["rolloverPolicy"],
                })
              }
            >
              <option value="carry">Carry forward</option>
              <option value="blank">Start blank</option>
            </select>
          </SettingsRow>
        </>
      )}
      {error && (
        <p role="alert" className="px-5 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </SettingsCard>
  );
}
