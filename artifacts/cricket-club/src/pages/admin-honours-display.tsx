import {
  useGetHonourDisplay,
  getGetHonourDisplayQueryKey,
  type HonourDisplayBundle,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <h1 className="text-3xl font-serif font-bold">Honour boards display &amp; kiosk</h1>
        <p className="text-muted-foreground mt-1">
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
      <div className="flex justify-end">
        <Button
          onClick={form.save}
          disabled={form.isSaving}
          data-testid="button-save-honour-display"
        >
          {form.isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save settings
        </Button>
      </div>

      <KioskLinkCard token={form.settings.kioskToken ?? null} onChanged={onSaved} />
    </div>
  );
}
