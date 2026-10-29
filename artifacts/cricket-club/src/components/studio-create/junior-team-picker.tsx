/**
 * Create → "Which team?" for a junior Team List (studio-create-consolidation S3):
 * the club's upcoming junior fixtures, each badged with where its names come from.
 * Junior data only, through the `/juniors` routes; picking one fills the card from
 * the junior team-list builder (a private child is "Private Player", and there is no
 * photo until the server picks an allowed one for the draft).
 */
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getGetJuniorFixtureTeamListQueryKey,
  getJuniorFixtureTeamList,
  getJuniorTeamListPrefill,
  useListJuniorFixtures,
  type JuniorFixture,
} from "@workspace/api-client-react";
import { LoadingState } from "@/components/data-states";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { juniorFixtureTitle } from "@/lib/junior-fixtures";
import { fmtFixtureWhen } from "./format";
import { TEAM_SOURCE_LABELS, teamSourceOf, type TeamSource } from "./model";
import { OptionRow } from "./option-row";

export function JuniorTeamPicker({ onPick }: { onPick: (input: Record<string, unknown>) => void }) {
  const fixturesQ = useListJuniorFixtures();
  const fixtures = (fixturesQ.data ?? []) as JuniorFixture[];
  const listsQ = useQueries({
    queries: fixtures.map((f) => ({
      queryKey: getGetJuniorFixtureTeamListQueryKey(f.id),
      queryFn: () => getJuniorFixtureTeamList(f.id),
    })),
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      const prefill = await getJuniorTeamListPrefill(id);
      onPick(prefill.input as Record<string, unknown>);
    } catch (e) {
      setError(handleAdminMutationError(e) ?? "Couldn't load that team.");
    } finally {
      setBusy(null);
    }
  };

  if (fixturesQ.isLoading) return <LoadingState label="Loading junior fixtures…" />;
  if (fixtures.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming junior fixtures. They come from PlayHQ once junior sync is on.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="flex max-w-3xl flex-col gap-2">
        {fixtures.map((f, i) => {
          const q = listsQ[i];
          const list = q?.data?.teamList ?? null;
          const source: TeamSource | null = q?.isSuccess ? teamSourceOf(list) : null;
          return (
            <OptionRow
              key={f.id}
              label={[f.ageGroup, juniorFixtureTitle(f)].filter(Boolean).join(" ")}
              detail={[
                f.startAt ? fmtFixtureWhen(f.startAt) : null,
                source === "none" ? "No list yet" : list ? `${list.players.length} players` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              badge={source ? TEAM_SOURCE_LABELS[source] : undefined}
              highlight={source === "selection"}
              disabled={busy !== null}
              onClick={() => pick(f.id)}
              trailing={
                busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null
              }
            />
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
