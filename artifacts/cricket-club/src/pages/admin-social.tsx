import { useEffect } from "react";
import {
  useGetSocialSettings,
  useListSponsors,
  useListCardThemes,
  useListCardAudioTracks,
  getGetSocialSettingsQueryKey,
  getListSponsorsQueryKey,
  getListCardThemesQueryKey,
  getListCardAudioTracksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { TemplatesCard } from "@/components/card-template-builder";
import { LoadingState, QueryError } from "@/components/data-states";
import {
  SettingsCard,
  ThemesCard,
  AudioTracksCard,
  SponsorsCard,
  CaptionTemplatesCard,
} from "@/components/admin-social";
import { AutomationCard } from "@/components/social-queue/automation-card";
import { AutoPostCard } from "@/components/social-queue/auto-post-card";

/**
 * Social Media Studio "Cards" tab: which cards draft themselves and auto-post
 * first, then one card per concern under `components/admin-social/`.
 */
export default function AdminSocial() {
  const qc = useQueryClient();
  const bundle = useGetSocialSettings();
  const sponsorsQ = useListSponsors();
  const themesQ = useListCardThemes();
  const audioTracksQ = useListCardAudioTracks();
  const loaded = !!bundle.data;

  // The queue links here as /admin/social/cards#automation; the card only
  // exists once settings load, so scroll to the hash then.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (loaded && id) document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  }, [loaded]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
    qc.invalidateQueries({ queryKey: getListSponsorsQueryKey() });
  };

  const invalidateThemes = () => {
    qc.invalidateQueries({ queryKey: getListCardThemesQueryKey() });
  };

  const invalidateAudioTracks = () => {
    qc.invalidateQueries({ queryKey: getListCardAudioTracksQueryKey() });
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Which cards draft themselves, how they post, and the themes, sponsors and captions they
          use.
        </p>
      </div>

      {bundle.isError ? (
        <QueryError onRetry={() => bundle.refetch()} />
      ) : bundle.isLoading ? (
        <LoadingState label="Loading social settings…" />
      ) : bundle.data ? (
        <>
          <AutomationCard config={bundle.data.settings.familyConfig} />
          <AutoPostCard settings={bundle.data.settings} />
          <SettingsCard settings={bundle.data.settings} onSaved={invalidate} />
          <ThemesCard themes={themesQ.data ?? []} onChanged={invalidateThemes} />
          <AudioTracksCard tracks={audioTracksQ.data ?? []} onChanged={invalidateAudioTracks} />
          <TemplatesCard />
          <SponsorsCard sponsors={sponsorsQ.data ?? []} onChanged={invalidate} />
          <CaptionTemplatesCard templates={bundle.data.captionTemplates} onSaved={invalidate} />
        </>
      ) : (
        <QueryError onRetry={() => bundle.refetch()} />
      )}
    </div>
  );
}
