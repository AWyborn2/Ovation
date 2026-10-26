import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useGetHonourDisplay,
  getGetHonourDisplayQueryKey,
  type HonourDisplayBundle,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { SaveBar } from "@/components/admin-ui";
import { LoadingState, QueryError } from "@/components/data-states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * Admin page: the honour boards display and the clubroom TV kiosk, in four
 * tabs (honours kiosk redesign B1). State lives in `useHonoursDisplaySettings`,
 * so switching tabs keeps unsaved changes and one save bar covers every tab;
 * each card is a section under `components/honours-display/settings/`.
 */
export const SETTINGS_TABS = [
  { value: "rotation", label: "Rotation" },
  { value: "look", label: "Look" },
  { value: "sponsors", label: "Sponsors & ads" },
  { value: "tv", label: "TV link" },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

const isSettingsTab = (v: string | null): v is SettingsTab =>
  SETTINGS_TABS.some((t) => t.value === v);

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
          Set what the clubroom TV shows and how it looks. The display lives at{" "}
          <code>/honours-display</code>; the TV opens from a short <code>/tv/&lt;code&gt;</code>{" "}
          link you make on the TV link tab.
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
  // A link can open a tab directly (?tab=look); switching tabs updates the URL.
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [tab, setTab] = useState<SettingsTab>(() => {
    const fromUrl = new URLSearchParams(search).get("tab");
    return isSettingsTab(fromUrl) ? fromUrl : "rotation";
  });
  const openTab = (next: string) => {
    if (!isSettingsTab(next)) return;
    setTab(next);
    const params = new URLSearchParams(search);
    params.set("tab", next);
    navigate(`${location}?${params.toString()}`, { replace: true });
  };

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={openTab}>
        <TabsList aria-label="Kiosk settings">
          {SETTINGS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="rotation" className="mt-6 space-y-6">
          <KioskSection form={form} />
          <PerBoardSection form={form} />
          <CompositeSection form={form} />
          <CustomGridSection form={form} />
        </TabsContent>

        <TabsContent value="look" className="mt-6 space-y-6">
          <SkinSection form={form} />
          <GlobalColoursSection form={form} />
        </TabsContent>

        <TabsContent value="sponsors" className="mt-6 space-y-6">
          <SponsorSection form={form} />
        </TabsContent>

        <TabsContent value="tv" className="mt-6 space-y-6">
          <KioskLinkCard token={form.settings.kioskToken ?? null} onChanged={onSaved} />
        </TabsContent>
      </Tabs>

      {form.error && <div className="text-sm text-destructive">{form.error}</div>}
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
