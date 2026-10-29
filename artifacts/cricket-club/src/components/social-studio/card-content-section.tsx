import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSocialSettingsQueryKey,
  useGetSocialSettings,
  useUpdateSocialSettings,
} from "@workspace/api-client-react";
import {
  CONTENT_KINDS,
  readCardContentSettings,
  resolveVisibleFields,
  type CardContentSettings,
  type ContentKind,
  type ContentKindSettings,
  type ContentPreset,
} from "@workspace/scorecard/card-content";
import { CAROUSEL_LABELS } from "@workspace/scorecard/queued-carousel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ContentFieldPicker } from "./content-field-picker";
import { SponsorsBackgroundPicker } from "./sponsors-background-picker";
import { SponsorsPerSlideSetting } from "./sponsors-per-slide";

/** A preset change starts its field choices afresh; a toggle back to the preset's own value clears it. */
export function choose(
  current: Pick<ContentKindSettings, "preset" | "fields">,
  change: { preset: ContentPreset } | { key: string; on: boolean },
  kind: ContentKind = "matchDay",
): Pick<ContentKindSettings, "preset" | "fields"> {
  if ("preset" in change) return { preset: change.preset, fields: {} };
  const base = resolveVisibleFields(kind, { preset: current.preset, fields: {} });
  const fields = { ...current.fields };
  if (base.has(change.key) === change.on) delete fields[change.key];
  else fields[change.key] = change.on;
  return { preset: current.preset, fields };
}

/** What each kind's choices cover, under its tab. */
const KIND_HINTS: Record<ContentKind, string> = {
  matchDay:
    "Every weekend carousel starts from this, and you can change it for one carousel when you build it.",
  results: "Results carousels.",
  matchSummary:
    "Match result cards, in your queue or made in Create a Card, and match summary carousels.",
  teamList: "Team list cards, in your queue or made in Create a Card, and team list carousels.",
};

/**
 * What the cards show (ADR-010): per card kind (match day, results, match
 * summaries, team lists), a preset (Minimal, Standard, Full) and per-field
 * switches on top. Every carousel and card of the kind starts from these; a
 * match day carousel can change them for itself. The junior same-day switch
 * (P3) puts a junior carousel's games of one day on one slide (Match Day,
 * Results and Match Summaries). The club's livestream link (P5) is set here
 * too: the title page prints it when "Livestream link" is on.
 */
export function CardContentSection() {
  const queryClient = useQueryClient();
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const saved = settingsQ.data?.settings;
  const savedContent = useMemo(
    () => readCardContentSettings(saved?.cardContent),
    [saved?.cardContent],
  );
  const [all, setAll] = useState<CardContentSettings>(savedContent);
  const [kind, setKind] = useState<ContentKind>("matchDay");
  const draft = all[kind];
  const setDraft = (next: ContentKindSettings) => setAll({ ...all, [kind]: next });
  const savedLink = saved?.livestreamUrl ?? "";
  const [link, setLink] = useState(savedLink);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  useEffect(() => setAll(savedContent), [savedContent]);
  useEffect(() => setLink(savedLink), [savedLink]);

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

  const visible = resolveVisibleFields(kind, draft);
  const contentDirty = JSON.stringify(all) !== JSON.stringify(savedContent);
  const linkDirty = link.trim() !== savedLink;
  const dirty = contentDirty || linkDirty;
  // The server takes an https address or nothing.
  const linkInvalid = !!link.trim() && !/^https:\/\/\S+$/i.test(link.trim());

  const save = () => {
    if (linkInvalid) return;
    setError(null);
    setSavedOk(false);
    update.mutate({
      data: {
        // Every kind at once: the server stores the whole set of choices.
        ...(contentDirty ? { cardContent: all } : {}),
        ...(linkDirty ? { livestreamUrl: link.trim() || null } : {}),
      },
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="card-content-heading">
      <h2 id="card-content-heading" className="text-lg font-semibold">
        What your cards show
      </h2>
      <p className="text-sm text-muted-foreground">
        Choose how much each kind of card says. Standard is how your cards look today.
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
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Card kind">
                {CONTENT_KINDS.map((k) => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    role="tab"
                    aria-selected={kind === k}
                    variant={kind === k ? "secondary" : "ghost"}
                    onClick={() => setKind(k)}
                    data-testid={`content-settings-kind-${k}`}
                  >
                    {CAROUSEL_LABELS[k]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{KIND_HINTS[kind]}</p>
            </div>
            <ContentFieldPicker
              kind={kind}
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
                setDraft({ ...draft, ...choose(draft, { key, on }, kind) });
              }}
            />
            <div className="flex items-start justify-between gap-4 border-t pt-4">
              <div className="space-y-1">
                <Label htmlFor="content-settings-junior-day">
                  Junior games on the same day share a slide
                </Label>
                <p className="text-xs text-muted-foreground">
                  Junior match day, results and match summary carousels list each day&rsquo;s games
                  together, as many as fit the card size. Senior games always have a slide each.
                </p>
              </div>
              <Switch
                id="content-settings-junior-day"
                checked={all.matchDay.juniorConsolidateByDay}
                disabled={update.isPending}
                onCheckedChange={(on) => {
                  setSavedOk(false);
                  // One switch for every set: it lives with the match day choices.
                  setAll({ ...all, matchDay: { ...all.matchDay, juniorConsolidateByDay: on } });
                }}
                data-testid="content-settings-junior-day"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content-settings-livestream">Livestream or scores link</Label>
              <Input
                id="content-settings-livestream"
                data-testid="content-settings-livestream"
                type="url"
                inputMode="url"
                placeholder="https://"
                maxLength={500}
                value={link}
                disabled={update.isPending}
                aria-invalid={linkInvalid || undefined}
                aria-describedby="content-settings-livestream-help"
                onChange={(e) => {
                  setSavedOk(false);
                  setLink(e.target.value);
                }}
              />
              <p
                id="content-settings-livestream-help"
                className={`text-xs ${linkInvalid ? "text-destructive" : "text-muted-foreground"}`}
              >
                {linkInvalid
                  ? "Use a link that starts with https://."
                  : "Shown on the title page when Livestream link is on. Leave it empty to show nothing."}
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-3">
              {savedOk && !dirty && (
                <span className="text-sm text-muted-foreground" role="status">
                  Saved
                </span>
              )}
              <Button
                onClick={save}
                disabled={!dirty || linkInvalid || update.isPending}
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
            <SponsorsPerSlideSetting
              saved={saved?.sponsorsPerSlide}
              sponsorCount={settingsQ.data?.activeSponsors?.length ?? 0}
            />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
