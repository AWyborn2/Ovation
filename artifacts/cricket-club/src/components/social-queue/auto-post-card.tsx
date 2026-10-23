import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
  getListSocialDraftsQueryKey,
  getGetPendingSocialDraftCountQueryKey,
  useGetMetaConnection,
  getGetMetaConnectionQueryKey,
  type SocialSettings,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { SaveBar, SettingsCard, SettingsRow } from "@/components/admin-ui";

type Form = {
  enabled: boolean;
  hours: string;
  email: string;
  publish: boolean;
  freshness: string;
};

const fromSettings = (s: SocialSettings | undefined): Form => ({
  enabled: s?.autoPostEnabled ?? false,
  hours: String(s?.autoPostWindowHours ?? 12),
  email: s?.notificationEmail ?? "",
  publish: s?.autoPublishEnabled ?? false,
  freshness: String(s?.autoPublishFreshnessHours ?? 24),
});

/**
 * Auto-post (R9): with it on, a draft nobody has reviewed moves to Ready once
 * its window has passed since its own import, and the club is told in the
 * app and by email. With Facebook and Instagram connected, auto-publish posts
 * fresh drafts there instead (Meta publishing R4, R5).
 */
export function AutoPostCard({ settings }: { settings: SocialSettings | undefined }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => fromSettings(settings));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(fromSettings(settings)), [settings]);
  const conn = useGetMetaConnection({ query: { queryKey: getGetMetaConnectionQueryKey() } });
  const canPublish = !!conn.data?.available && conn.data.status === "connected";
  // With the posting calendar on, a card's posting time replaces the review
  // window, and the calendar's age limit replaces the cut-off.
  const calendarOn = !!settings?.postingSchedule?.enabled;

  const saved = fromSettings(settings);
  const dirty =
    form.enabled !== saved.enabled ||
    form.hours !== saved.hours ||
    form.email !== saved.email ||
    form.publish !== saved.publish ||
    form.freshness !== saved.freshness;

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
        qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
      },
      onError: () =>
        setError(
          "Couldn't save. Check the window, the cut-off and the email, and that Meta is connected.",
        ),
    },
  });

  const save = () => {
    const hours = Number(form.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      setError("The window must be between 1 and 168 hours.");
      return;
    }
    const freshness = Number(form.freshness);
    if (!Number.isInteger(freshness) || freshness < 1 || freshness > 336) {
      setError("The auto-publish cut-off must be between 1 and 336 hours.");
      return;
    }
    const publish = form.enabled && form.publish;
    if (publish && !calendarOn && freshness < hours) {
      setError("The auto-publish cut-off must be at least the review window.");
      return;
    }
    update.mutate({
      data: {
        autoPostEnabled: form.enabled,
        autoPostWindowHours: hours,
        notificationEmail: form.email.trim() || null,
        autoPublishEnabled: publish,
        autoPublishFreshnessHours: freshness,
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
        {calendarOn && (
          <p className="text-sm text-muted-foreground" role="note">
            Your posting calendar is on: each card moves to Ready, or publishes, at its posting time
            instead of after a review window. Cards older than the calendar&rsquo;s age limit are
            dropped. Change both in the queue&rsquo;s Posting schedule.
          </p>
        )}
        {!calendarOn && (
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
        )}
        <SettingsRow
          label="Publish automatically to Facebook and Instagram"
          helper={
            canPublish
              ? calendarOn
                ? "Approved cards post at their posting time instead of waiting in Ready. Junior cards never do."
                : "Fresh drafts post at the end of their window instead of waiting in Ready. Junior cards never do."
              : "Connect Facebook and Instagram first."
          }
          htmlFor="auto-publish-enabled"
        >
          <Switch
            id="auto-publish-enabled"
            checked={form.enabled && form.publish}
            onCheckedChange={(publish) => setForm((f) => ({ ...f, publish }))}
            disabled={!settings || !form.enabled || (!canPublish && !form.publish)}
            aria-label="Publish automatically to Facebook and Instagram"
          />
        </SettingsRow>
        {!calendarOn && (
          <SettingsRow
            label="Only if imported within"
            helper="Hours since the draft's first import. Older drafts wait in Ready."
            htmlFor="auto-publish-freshness"
          >
            <Input
              id="auto-publish-freshness"
              type="number"
              min={1}
              max={336}
              value={form.freshness}
              onChange={(e) => setForm((f) => ({ ...f, freshness: e.target.value }))}
              className="h-9 w-24"
            />
          </SettingsRow>
        )}
        <SettingsRow
          label="Admin notices email"
          helper={
            <>
              Selection and PlayHQ sync notices. Leave empty for in-app only. Cards to post are
              emailed to your{" "}
              <Link href="/admin/social/email-lists" className="underline">
                social email lists
              </Link>
              .
            </>
          }
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
