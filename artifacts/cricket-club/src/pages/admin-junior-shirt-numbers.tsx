import { Link } from "wouter";
import {
  useGetJuniorsOverview,
  useGetShirtNumberSettings,
  useListJuniorShirtNumbers,
} from "@workspace/api-client-react";
import { EmptyState, LoadingState, QueryError } from "@/components/data-states";
import {
  JuniorPersonPicker,
  ShirtNumberRegister,
  currentSeasonStartYear,
  seasonLabel,
} from "@/components/shirt-numbers";
import { juniorShirtNumberApi } from "@/components/shirt-numbers/junior-api";

/**
 * Juniors shirt numbers (plan U10, R17): the juniors register for a season,
 * with uploads, review and season start, kept apart from the senior register.
 * The feature switch and policies are shared with the senior register and are
 * changed on the senior Shirt numbers tab. Clubs without junior data (central
 * PCA clubs) have no junior players, so the register is hidden for them, unless
 * junior PlayHQ sync is on: then numbers can be uploaded and held before the
 * season's juniors arrive (the register says so with `juniorsAvailable`).
 */
export default function AdminJuniorShirtNumbers() {
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

  const settingsLink = (
    <Link href="/admin/people/shirt-numbers" className="font-semibold text-primary-text underline">
      Shirt numbers
    </Link>
  );

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
        Shirt numbers are turned off for this club. Turn them on in {settingsLink} to keep a juniors
        register.
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
          Junior playing numbers for each season, kept separate from the senior register and shown
          only on junior player profiles. Duplicate and rollover rules are shared with the senior
          register and set in {settingsLink}.
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
