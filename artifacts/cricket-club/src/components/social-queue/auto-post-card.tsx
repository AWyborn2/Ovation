import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  getListSocialDraftsQueryKey,
  getGetPendingSocialDraftCountQueryKey,
  type SocialSettings,
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { SaveBar, SettingsCard, SettingsRow } from "@/components/admin-ui";

type Form = { enabled: boolean; hours: string; email: string };

const fromSettings = (s: SocialSettings | undefined): Form => ({
  enabled: s?.autoPostEnabled ?? false,
  hours: String(s?.autoPostWindowHours ?? 12),
  email: s?.notificationEmail ?? "",
});

/**
 * Auto-post (R9): with it on, a draft nobody has reviewed moves to Ready once
 * its window has passed since its own import, and the club is told in the
 * app and by email. Posting to social platforms comes later (Meta).
 */
export function AutoPostCard({ settings }: { settings: SocialSettings | undefined }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => fromSettings(settings));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(fromSettings(settings)), [settings]);

  const saved = fromSettings(settings);
  const dirty =
    form.enabled !== saved.enabled || form.hours !== saved.hours || form.email !== saved.email;

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
        qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
      },
      onError: () => setError("Couldn't save. Check the window (1–168 hours) and the email."),
    },
  });

  const save = () => {
    const hours = Number(form.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      setError("The window must be between 1 and 168 hours.");
      return;
    }
    update.mutate({
      data: {
        autoPostEnabled: form.enabled,
        autoPostWindowHours: hours,
        notificationEmail: form.email.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Auto-post"
        description="Move unreviewed drafts to Ready after a set time, and let you know."
      >
        <SettingsRow
          label="Move drafts to Ready automatically"
          helper="When off, drafts wait for you."
          htmlFor="auto-post-enabled"
        >
          <Switch
            id="auto-post-enabled"
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
            disabled={!settings}
            aria-label="Move drafts to Ready automatically"
          />
        </SettingsRow>
        <SettingsRow
          label="Review window"
          helper="Hours after each draft's own import"
          htmlFor="auto-post-hours"
        >
          <Input
            id="auto-post-hours"
            type="number"
            min={1}
            max={168}
            value={form.hours}
            onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
            className="h-9 w-24"
          />
        </SettingsRow>
        <SettingsRow
          label="Notification email"
          helper="Leave empty for in-app notifications only"
          htmlFor="auto-post-email"
        >
          <Input
            id="auto-post-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="studio@club.example"
            className="h-9 w-64"
          />
        </SettingsRow>
      </SettingsCard>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        onSave={save}
        onReset={() => {
          setForm(saved);
          setError(null);
        }}
      />
    </div>
  );
}
