import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getGetWeekendCarouselSourcesQueryKey } from "@workspace/api-client-react";
import { invalidateTeamListCarouselSources } from "./team-list-carousel-cache";

describe("playing-number cache invalidation", () => {
  it("invalidates every team-list date range, without invalidating other carousel types", async () => {
    const client = new QueryClient();
    const keys = ["teamList", "teamList", "results", "matchDay"].map((setType, i) =>
      getGetWeekendCarouselSourcesQueryKey({
        setType: setType as "teamList",
        from: `2026-10-${10 + i}`,
        to: `2026-10-${12 + i}`,
      }),
    );
    keys.forEach((key) => client.setQueryData(key, {}));
    try {
      await invalidateTeamListCarouselSources(client);
      expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
        true,
        true,
        false,
        false,
      ]);
    } finally {
      client.clear();
    }
  });
});
