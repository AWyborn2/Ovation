import { useEffect, useState } from "react";
import { useUpdateSocialSettings, type SocialSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ENGINES, SIZE_KEYS } from "./constants";

/** Content engines, output sizes, club URL / hashtag and the sponsor + caption toggles. */
export function SettingsCard({
  settings,
  onSaved,
}: {
  settings: SocialSettings;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SocialSettings>(settings);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        onSaved();
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  useEffect(() => setDraft(settings), [settings]);

  const save = () => update.mutate({ data: draft });

  const set = <K extends keyof SocialSettings>(k: K, v: SocialSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engines, sizes and tone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Content engines
          </h3>
          <div className="space-y-2">
            {ENGINES.map((eng) => {
              const key =
                eng.value === "ondemand"
                  ? "engineOnDemand"
                  : eng.value === "milestone"
                    ? "engineMilestone"
                    : eng.value === "roundup"
                      ? "engineRoundUp"
                      : "engineRecap";
              return (
                <div key={eng.value} className="flex items-start justify-between gap-3 border rounded p-3">
                  <div>
                    <div className="font-medium">{eng.label}</div>
                    <div className="text-xs text-muted-foreground">{eng.desc}</div>
                  </div>
                  <Switch
                    checked={(draft[key] as boolean) ?? false}
                    onCheckedChange={(v) => set(key, v as SocialSettings[typeof key])}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
            Output sizes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SIZE_KEYS.map((s) => (
              <div key={s.key} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium text-sm">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.code}</div>
                </div>
                <Switch
                  checked={(draft[s.key] as boolean) ?? false}
                  onCheckedChange={(v) => set(s.key, v as SocialSettings[typeof s.key])}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="clubUrl">Club URL (shown in card footer + caption)</Label>
            <Input
              id="clubUrl"
              value={draft.clubUrl}
              onChange={(e) => set("clubUrl", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clubHashtag">Default hashtag</Label>
            <Input
              id="clubHashtag"
              value={draft.clubHashtag}
              onChange={(e) => set("clubHashtag", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="font-medium text-sm">Sponsors enabled</div>
              <div className="text-xs text-muted-foreground">
                Stamp active sponsor logos on the bottom strip.
              </div>
            </div>
            <Switch
              checked={draft.sponsorsEnabled}
              onCheckedChange={(v) => set("sponsorsEnabled", v)}
            />
          </div>
          <div className="flex items-center justify-between border rounded p-3">
            <div>
              <div className="font-medium text-sm">Auto-generate captions</div>
              <div className="text-xs text-muted-foreground">
                Pre-fill captions per platform from your templates.
              </div>
            </div>
            <Switch
              checked={draft.captionsEnabled}
              onCheckedChange={(v) => set("captionsEnabled", v)}
            />
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
