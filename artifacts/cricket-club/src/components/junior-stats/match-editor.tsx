import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetJuniorMatch,
  getGetJuniorMatchQueryKey,
  getListJuniorStatCorrectionsQueryKey,
  getListJuniorPlayersQueryKey,
  getListJuniorLeaderboardQueryKey,
  getGetJuniorLeaderboardsQueryKey,
  type JuniorBattingLine,
  type JuniorBowlingLine,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { QueryError, EmptyState, LoadingState } from "@/components/data-states";
import { MatchMetaForm } from "./match-meta-form";
import { BattingTable } from "./batting";
import { BowlingTable } from "./bowling";
import { RosterEditor } from "./roster-editor";
import { CorrectionsPanel } from "./corrections-panel";

/**
 * Full editor for one junior match: metadata, per-innings batting/bowling
 * tables, roster and the corrections journal. Every mutation invalidates the
 * match plus the live-derived junior aggregates (`/api/juniors/*` only).
 */
export function JuniorMatchEditor({ matchId, onBack }: { matchId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const {
    data: match,
    isLoading,
    isError,
    refetch,
  } = useGetJuniorMatch(matchId, {
    query: { queryKey: getGetJuniorMatchQueryKey(matchId) },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetJuniorMatchQueryKey(matchId) });
    qc.invalidateQueries({
      queryKey: getListJuniorStatCorrectionsQueryKey({ matchId }),
    });
    // Junior aggregates are computed live from the line tables, so any list or
    // leaderboard the visitor has cached must refetch.
    qc.invalidateQueries({ queryKey: getListJuniorPlayersQueryKey() });
    qc.invalidateQueries({ queryKey: getListJuniorLeaderboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetJuniorLeaderboardsQueryKey() });
  };
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  return (
    <div className="space-y-6">
      <Button size="sm" variant="outline" onClick={onBack}>
        ← Back to match list
      </Button>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading match…" />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !match ? (
        <EmptyState title="Match not found" message="This junior match doesn't exist." />
      ) : (
        <>
          <div>
            <h2 className="text-xl font-serif font-bold text-primary">
              vs {match.opponentName ?? "Unknown"}
            </h2>
            <div className="text-sm text-muted-foreground">
              {match.season ?? ""}
              {match.ageGroup ? ` · ${match.ageGroup}` : ""}
              {match.round ? ` · ${match.round}` : ""}
            </div>
          </div>

          <MatchMetaForm
            match={match}
            onSaved={invalidate}
            onError={onErr}
            clearError={() => setError(null)}
          />

          {match.innings.map((inn) => (
            <InningsEditor
              key={inn.innings}
              matchId={match.id}
              innings={inn.innings}
              battingTeam={inn.battingTeam}
              isHallsHeadBatting={inn.isHallsHead}
              batting={inn.batting}
              bowling={inn.bowling}
              onSaved={invalidate}
              onError={onErr}
              clearError={() => setError(null)}
            />
          ))}

          <RosterEditor
            match={match}
            onSaved={invalidate}
            onError={onErr}
            clearError={() => setError(null)}
          />

          <CorrectionsPanel
            matchId={match.id}
            onReverted={invalidate}
            onError={onErr}
            clearError={() => setError(null)}
          />
        </>
      )}
    </div>
  );
}

function InningsEditor({
  matchId,
  innings,
  battingTeam,
  isHallsHeadBatting,
  batting,
  bowling,
  onSaved,
  onError,
  clearError,
}: {
  matchId: number;
  innings: number;
  battingTeam: string | null | undefined;
  isHallsHeadBatting: boolean;
  batting: JuniorBattingLine[];
  bowling: JuniorBowlingLine[];
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Innings {innings} — {battingTeam ?? "Unknown"} batting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <BattingTable
          matchId={matchId}
          innings={innings}
          lines={batting}
          canAdd={isHallsHeadBatting}
          onSaved={onSaved}
          onError={onError}
          clearError={clearError}
        />
        <BowlingTable
          matchId={matchId}
          innings={innings}
          lines={bowling}
          canAdd={!isHallsHeadBatting}
          onSaved={onSaved}
          onError={onError}
          clearError={clearError}
        />
      </CardContent>
    </Card>
  );
}
