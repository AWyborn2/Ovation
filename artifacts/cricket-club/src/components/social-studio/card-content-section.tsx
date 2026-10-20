import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSocialSettingsQueryKey,
  useGetSocialSettings,
  useUpdateSocialSettings,
} from "@workspace/api-client-react";
import {
  readCardContentSettings,
  resolveVisibleFields,
  type ContentKindSettings,
  type ContentPreset,
} from "@workspace/scorecard/card-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ContentFieldPicker } from "./content-field-picker";
import { SponsorsBackgroundPicker } from "./sponsors-background-picker";

/** A preset change starts its field choices afresh; a toggle back to the preset's own value clears it. */
export function choose(
  current: Pick<ContentKindSettings, "preset" | "fields">,
  change: { preset: ContentPreset } | { key: string; on: boolean },
): Pick<ContentKindSettings, "preset" | "fields"> {
  if ("preset" in change) return { preset: change.preset, fields: {} };
  const base = resolveVisibleFields("matchDay", { preset: current.preset, fields: {} });
  const fields = { ...current.fields };
  if (base.has(change.key) === change.on) delete fields[change.key];
  else fields[change.key] = change.on;
  return { preset: current.preset, fields };
}

/**
 * What match day cards show (ADR-010): a preset (Minimal, Standard, Full) and
 * per-field switches on top. Every Weekend Carousel starts from these; a
 * carousel can change them for itself. The junior same-day switch (P3) and the
 * livestream link (P5) join this section when the cards use them; until then
 * their stored values pass through untouched.
 */
export function CardContentSection() {
  const queryClient = useQueryClient();
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const saved = settingsQ.data?.settings;
  const savedContent = useMemo(
    () => readCardContentSettings(saved?.cardContent).matchDay,
    [saved?.cardContent],
  );
  const [draft, setDraft] = useState<ContentKindSettings>(savedContent);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  useEffect(() => setDraft(savedContent), [savedContent]);

  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        setSavedOk(true);
        void queryClient.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });

  const visible = resolveVisibleFields("matchDay", draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedContent);

  const save = () => {
    setError(null);
    setSavedOk(false);
    update.mutate({
      data: { cardContent: { matchDay: draft } },
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="card-content-heading">
      <h2 id="card-content-heading" className="text-lg font-semibold">
        What match day cards show
      </h2>
      <p className="text-sm text-muted-foreground">
        Choose how much each match day card says. Standard is how your cards look today. Every
        weekend carousel starts from this, and you can change it for one carousel when you build it.
      </p>
      {settingsQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : settingsQ.isError ? (
        <p className="text-sm text-destructive">
          Couldn&rsquo;t load your settings. Try again shortly.
        </p>
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <ContentFieldPicker
              kind="matchDay"
              preset={draft.preset}
              visible={visible}
              idPrefix="content-settings"
              disabled={update.isPending}
              onPreset={(preset) => {
                setSavedOk(false);
                if (preset) setDraft({ ...draft, ...choose(draft, { preset }) });
              }}
              onToggle={(key, on) => {
                setSavedOk(false);
                setDraft({ ...draft, ...choose(draft, { key, on }) });
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-3">
              {savedOk && !dirty && (
                <span className="text-sm text-muted-foreground" role="status">
                  Saved
                </span>
              )}
              <Button
                onClick={save}
                disabled={!dirty || update.isPending}
                data-testid="content-settings-save"
              >
                {update.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="mr-2 h-4 w-4" aria-hidden />
                )}
                Save
              </Button>
            </div>
            <SponsorsBackgroundPicker selectedId={saved?.sponsorsBackgroundPhotoId ?? null} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
