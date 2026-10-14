import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetShirtNumberSettings,
  useUpdateShirtNumberSettings,
  getGetShirtNumberSettingsQueryKey,
} from "@workspace/api-client-react";
import type { ShirtNumberSettingsUpdate } from "@workspace/api-client-react";
import { LoadingState, QueryError } from "@/components/data-states";
import { invalidateTeamListCarouselSources } from "@/lib/team-list-carousel-cache";
import {
  ShirtNumberRegister,
  ShirtNumberSettingsPanel,
  SeniorPersonPicker,
  errorMessage,
  seniorShirtNumberApi,
} from "@/components/shirt-numbers";

/**
 * Season shirt numbers (U6): the feature switch and policies, then, while the
 * feature is on, the senior register for a season with uploads and review.
 */
export default function AdminShirtNumbers() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading, isError, refetch } = useGetShirtNumberSettings();
  const update = useUpdateShirtNumberSettings();
  const [error, setError] = useState<string | null>(null);

  const onChange = (patch: ShirtNumberSettingsUpdate) => {
    setError(null);
    update.mutate(
      { data: patch },
      {
        onSuccess: (next) => {
          queryClient.setQueryData(getGetShirtNumberSettingsQueryKey(), next);
          void invalidateTeamListCarouselSources(queryClient);
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isLoading || !settings) return <LoadingState />;

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Playing shirt numbers for each season. They are separate from A Grade cap numbers, which
        never change.
      </p>
      <ShirtNumberSettingsPanel
        settings={settings}
        onChange={onChange}
        pending={update.isPending}
        error={error}
      />
      {settings.enabled && (
        <ShirtNumberRegister
          api={seniorShirtNumberApi}
          settings={settings}
          PersonPicker={SeniorPersonPicker}
        />
      )}
    </div>
  );
}
