import {
  useGetHonourDisplay,
  getGetHonourDisplayQueryKey,
  type HonourDisplayBundle,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { SaveBar } from "@/components/admin-ui";
import { LoadingState, QueryError } from "@/components/data-states";
import { KioskLinkCard } from "@/components/honours-display/editors";
import {
  SkinSection,
  GlobalColoursSection,
  KioskSection,
  SponsorSection,
  PerBoardSection,
  CompositeSection,
  CustomGridSection,
} from "@/components/honours-display/settings";
import { useHonoursDisplaySettings } from "@/components/honours-display/use-honours-display-settings";

/**
 * Admin page: the single skin every honour board renders in + the clubroom TV
 * kiosk configuration. State lives in `useHonoursDisplaySettings`; each card
 * is a section under `components/honours-display/settings/` (plan.md §5.6).
 */
export default function AdminHonoursDisplay() {
  const qc = useQueryClient();
  const bundleQ = useGetHonourDisplay();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[clamp(22px,2.2vw,28px)] leading-none">
          Honour boards display &amp; kiosk
        </h2>
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Pick the single skin every honour board renders in, and configure the auto-rotating
          clubroom TV kiosk. These pages are admin-only: the display lives at{" "}
          <code>/honours-display</code> and the TV mode opens from a short{" "}
          <code>/tv/&lt;code&gt;</code> link you generate below — easy to type into a wall-mounted
          TV. Each board keeps its natural layout — the skin only changes the look.
        </p>
      </div>

      {bundleQ.isError ? (
        <QueryError onRetry={() => bundleQ.refetch()} />
      ) : bundleQ.isLoading ? (
        <LoadingState label="Loading honour display settings…" />
      ) : bundleQ.data ? (
        <SettingsForm
          bundle={bundleQ.data}
          onSaved={() => qc.invalidateQueries({ queryKey: getGetHonourDisplayQueryKey() })}
        />
      ) : (
        <QueryError onRetry={() => bundleQ.refetch()} />
      )}
    </div>
  );
}

function SettingsForm({ bundle, onSaved }: { bundle: HonourDisplayBundle; onSaved: () => void }) {
  const form = useHonoursDisplaySettings(bundle, onSaved);

  return (
    <div className="space-y-6">
      <SkinSection form={form} />
      <GlobalColoursSection form={form} />
      <KioskSection form={form} />
      <SponsorSection form={form} />
      <PerBoardSection form={form} />
      <CompositeSection form={form} />
      <CustomGridSection form={form} />

      {form.error && <div className="text-sm text-destructive">{form.error}</div>}
      <KioskLinkCard token={form.settings.kioskToken ?? null} onChanged={onSaved} />

      <SaveBar
        dirty={form.dirty}
        saving={form.isSaving}
        onSave={form.save}
        onReset={form.reset}
        message={form.error ?? undefined}
      />
    </div>
  );
}
