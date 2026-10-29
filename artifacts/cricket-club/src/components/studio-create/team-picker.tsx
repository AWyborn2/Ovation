/**
 * Create → "Which team?" for a senior Team List (studio-create-consolidation
 * S2): every upcoming senior fixture, each badged with where its names come
 * from (Selection Hub, PlayHQ, Draft, or Fill in by hand). Picking one fills
 * the card from the server's content builder, as Create a card's fixture
 * prefill does (fill-in players excluded).
 */
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getFixtureTeamList,
  getGetFixtureTeamListQueryKey,
  getSocialTeamListPrefill,
  useListFixtures,
  type Fixture,
} from "@workspace/api-client-react";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { LoadingState } from "@/components/data-states";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { fmtFixtureWhen } from "./format";
import { TEAM_SOURCE_LABELS, teamSourceOf, type TeamSource } from "./model";
import { OptionRow } from "./option-row";

export function TeamPicker({
  onPick,
}: {
  /** The card the team's fixture fills, as the server builds it. */
  onPick: (input: Record<string, unknown>) => void;
}) {
  const params = useMemo(() => ({ upcomingOnly: true }), []);
  const fixturesQ = useListFixtures(params);
  // Junior teams are made with Juniors on, from the junior tables only.
  const fixtures = useMemo(
    () =>
      ((fixturesQ.data ?? []) as Fixture[])
        .filter((f) => !isJuniorGradeLabel(f.grade))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [fixturesQ.data],
  );
  const listsQ = useQueries({
    queries: fixtures.map((f) => ({
      queryKey: getGetFixtureTeamListQueryKey(f.id),
      queryFn: () => getFixtureTeamList(f.id),
    })),
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (fixtureId: number) => {
    setBusy(fixtureId);
    setError(null);
    try {
      const prefill = await getSocialTeamListPrefill(fixtureId);
      onPick(prefill.input as Record<string, unknown>);
    } catch (e) {
      setError(handleAdminMutationError(e) ?? "Couldn't load that team.");
    } finally {
      setBusy(null);
    }
  };

  if (fixturesQ.isLoading) return <LoadingState label="Loading fixtures…" />;
  if (fixtures.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No upcoming senior fixtures. Fixtures come from PlayHQ, or add one under Settings →
        Fixtures.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="flex max-w-3xl flex-col gap-2">
        {fixtures.map((f, i) => {
          const q = listsQ[i];
          const source: TeamSource | null = q?.isSuccess ? teamSourceOf(q.data ?? null) : null;
          const players = q?.data?.players.length ?? 0;
          return (
            <OptionRow
              key={f.id}
              label={`${f.grade} v ${f.opponentName}`}
              detail={[
                fmtFixtureWhen(f.startAt),
                source === "none" ? "No list yet" : players ? `${players} players` : null,
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
