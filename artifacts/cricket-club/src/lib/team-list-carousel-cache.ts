import type { QueryClient } from "@tanstack/react-query";
import { getGetWeekendCarouselSourcesQueryKey } from "@workspace/api-client-react";

/** Mark all date ranges stale, but never mix senior register edits into juniors. */
export function invalidateTeamListCarouselSources(client: QueryClient) {
  return client.invalidateQueries({
    queryKey: getGetWeekendCarouselSourcesQueryKey(),
    predicate: (query) =>
      (query.queryKey[1] as { setType?: string } | undefined)?.setType === "teamList",
  });
}
