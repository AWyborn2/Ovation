import {
  useGetJuniorsOverview,
  useGetShirtNumberSettings,
  useListJuniorShirtNumbers,
} from "@workspace/api-client-react";
import { EmptyState, LoadingState, QueryError } from "@/components/data-states";
import { ShirtNumberRegister } from "./register";
import { JuniorPersonPicker } from "./person-picker";
import { currentSeasonStartYear, seasonLabel } from "./season";
import { juniorShirtNumberApi } from "./junior-api";

/**
 * The Juniors section of People → Shirt numbers (plan U10, R17): the juniors register
 * for a season, with uploads, review and season start. Its own table and routes
 * (/api/juniors/* only), never blended with the senior registers; the page only shows
 * them side by side. The feature switch and policies are shared and set at the top of
 * the page. Clubs without junior data (central PCA clubs) have no junior players, so
 * the register is hidden for them, unless junior PlayHQ sync is on: then numbers can be
 * uploaded and held before the season's juniors arrive (`juniorsAvailable`).
 */
export function JuniorShirtNumbersSection() {
  const settings = useGetShirtNumberSettings();
  const overview = useGetJuniorsOverview();
  const noPlayers = overview.data?.totals.players === 0;
  // Only asked when the club has no junior players yet: is junior sync bringing them?
  const availability = useListJuniorShirtNumbers(undefined, {
    query: {
      queryKey: ["junior-shirt-numbers-available"],
      enabled: noPlayers && !!settings.data?.enabled,
    },
  });

  if (settings.isError) return <QueryError onRetry={() => settings.refetch()} />;
  if (overview.isError) return <QueryError onRetry={() => overview.refetch()} />;
  if (settings.isLoading || !settings.data || overview.isLoading || !overview.data) {
    return <LoadingState />;
  }

  if (noPlayers && settings.data.enabled) {
    if (availability.isError) return <QueryError onRetry={() => availability.refetch()} />;
    if (availability.isLoading || !availability.data) return <LoadingState />;
  }
  if (noPlayers && !(settings.data.enabled && availability.data?.juniorsAvailable)) {
    return (
      <EmptyState
        title="No junior players"
        message="Junior shirt numbers need the club's junior players, and this club has none yet."
      />
    );
  }

  if (!settings.data.enabled) {
    return (
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Shirt numbers are turned off for this club. Turn them on above to keep a juniors register.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="m-0 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-text">
          Current season {seasonLabel(currentSeasonStartYear())}
        </p>
        <p className="max-w-[75ch] text-[15px] text-muted-foreground">
          Junior playing numbers for each season, kept separate from the senior registers and shown
          only on junior player profiles. Duplicate and rollover rules are shared and set above.
        </p>
      </div>
      <ShirtNumberRegister
        api={juniorShirtNumberApi}
        settings={settings.data}
        PersonPicker={JuniorPersonPicker}
        requirePerson
      />
    </div>
  );
}
