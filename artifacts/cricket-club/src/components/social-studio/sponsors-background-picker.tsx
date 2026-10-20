import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSocialSettingsQueryKey,
  getListClubPhotosQueryKey,
  useListClubPhotos,
  useUpdateSocialSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";

/**
 * The photo behind the match day sponsors page (ADR-010 P6): one of the
 * club's club-wide library photos, shown when "Background photo" is on.
 * Saves as soon as one is picked; the API accepts only the club's own
 * club-wide photos.
 */
export function SponsorsBackgroundPicker({ selectedId }: { selectedId: number | null }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const params = { ungraded: true };
  const photosQ = useListClubPhotos(params, {
    query: { queryKey: getListClubPhotosQueryKey(params) },
  });
  const update = useUpdateSocialSettings({
    mutation: {
      onSuccess: () => {
        setError(null);
        void queryClient.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
      },
      onError: (e) => setError(handleAdminMutationError(e)),
    },
  });
  const pick = (id: number | null) => {
    if (id === selectedId || update.isPending) return;
    update.mutate({ data: { sponsorsBackgroundPhotoId: id } });
  };
  const photos = photosQ.data ?? [];

  return (
    <fieldset className="space-y-2 rounded-md border p-3" data-testid="sponsors-background">
      <legend className="px-1 text-sm font-medium">Sponsors page background</legend>
      <p className="text-xs text-muted-foreground">
        Shown behind the sponsors page when &ldquo;Background photo&rdquo; is on. Pick from your
        club-wide photos.
      </p>
      {photosQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading photos…
        </p>
      ) : photosQ.isError ? (
        <p className="text-sm text-destructive">Couldn&rsquo;t load your photos.</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No club-wide photos yet. Add some in the photo library.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === selectedId}
              aria-label={`Use photo ${p.id}`}
              disabled={update.isPending}
              onClick={() => pick(p.id)}
              className={`h-16 w-24 overflow-hidden rounded border-2 ${
                p.id === selectedId ? "border-primary" : "border-transparent"
              }`}
            >
              <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={selectedId == null || update.isPending}
          onClick={() => pick(null)}
        >
          No background
        </Button>
        {update.isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
