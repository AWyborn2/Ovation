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

/** Social Media Studio settings: one card per concern under `components/admin-social/`. */
export default function AdminSocial() {
  const qc = useQueryClient();
  const bundle = useGetSocialSettings();
  const sponsorsQ = useListSponsors();
  const themesQ = useListCardThemes();
  const audioTracksQ = useListCardAudioTracks();

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
        <p className="text-muted-foreground mt-1">
          Branded share-card factory for Instagram, Facebook, TikTok and X.
        </p>
      </div>

      {bundle.isError ? (
        <QueryError onRetry={() => bundle.refetch()} />
      ) : bundle.isLoading ? (
        <LoadingState label="Loading social settings…" />
      ) : bundle.data ? (
        <>
          <SettingsCard settings={bundle.data.settings} onSaved={invalidate} />
          <ThemesCard themes={themesQ.data ?? []} onChanged={invalidateThemes} />
          <AudioTracksCard tracks={audioTracksQ.data ?? []} onChanged={invalidateAudioTracks} />
          <TemplatesCard />
          <SponsorsCard sponsors={sponsorsQ.data ?? []} onChanged={invalidate} />
          <CaptionTemplatesCard
            templates={bundle.data.captionTemplates}
            onSaved={invalidate}
          />
        </>
      ) : (
        <QueryError onRetry={() => bundle.refetch()} />
      )}
    </div>
  );
}
