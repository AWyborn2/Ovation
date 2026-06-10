import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCaptainVotingBoard,
  useSubmitBallot,
  getGetCaptainVotingBoardQueryKey,
  type VotableAward,
  type VotableGrade,
  type VotableRound,
  type VotableRoundPlayer,
} from "@workspace/api-client-react";
import { CaptainShell } from "@/components/captain-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState, QueryError, EmptyState } from "@/components/data-states";
import { handleCaptainMutationError } from "@/lib/captain-auth";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export default function CaptainPage() {
  return (
    <CaptainShell>
      <VotingBoard />
    </CaptainShell>
  );
}

function VotingBoard() {
  const { data, isLoading, isError, refetch } = useGetCaptainVotingBoard();

  if (isError) {
    return <QueryError onRetry={() => refetch()} />;
  }
  if (isLoading) {
    return <LoadingState label="Loading your rounds…" />;
  }
  const awards = data ?? [];
  if (awards.length === 0) {
    return (
      <EmptyState
        title="No awards open for voting"
        message="Once an admin opens an award for one of your grades and a match scorecard is imported, the rounds will appear here."
      />
    );
  }
  return (
    <div className="space-y-6">
      {awards.map((award) => (
        <AwardVotingCard key={award.configId} award={award} />
      ))}
    </div>
  );
}

function AwardVotingCard({ award }: { award: VotableAward }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {award.awardTitle}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {formatSeason(award.season)}
          </span>
          {!award.votingOpen && (
            <span className="ml-2 align-middle text-xs font-normal rounded bg-muted text-muted-foreground px-2 py-0.5">
              Voting closed
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {award.grades.map((g) => (
          <GradeSection key={g.grade} configId={award.configId} grade={g} />
        ))}
      </CardContent>
    </Card>
  );
}

function GradeSection({ configId, grade }: { configId: number; grade: VotableGrade }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {grade.grade}
      </h4>
      {grade.rounds.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No imported rounds yet.
        </p>
      ) : (
        <div className="space-y-3">
          {grade.rounds
            .slice()
            .sort((a, b) => b.round - a.round)
            .map((round) => (
              <RoundBallot
                key={round.round}
                configId={configId}
                grade={grade.grade}
                round={round}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function RoundBallot({
  configId,
  grade,
  round,
}: {
  configId: number;
  grade: string;
  round: VotableRound;
}) {
  const queryClient = useQueryClient();
  const submit = useSubmitBallot();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<{
    pick1: number | null;
    pick2: number | null;
    pick3: number | null;
  }>({
    pick1: round.ballot?.pick1PlayerId ?? null,
    pick2: round.ballot?.pick2PlayerId ?? null,
    pick3: round.ballot?.pick3PlayerId ?? null,
  });

  const nameOf = (id: number | null) =>
    round.players.find((p) => p.playerId === id)?.name ?? null;

  const reset = () => {
    setPicks({
      pick1: round.ballot?.pick1PlayerId ?? null,
      pick2: round.ballot?.pick2PlayerId ?? null,
      pick3: round.ballot?.pick3PlayerId ?? null,
    });
    setError(null);
  };

  const save = () => {
    setError(null);
    if (picks.pick1 == null || picks.pick2 == null || picks.pick3 == null) {
      setError("Select all three players (3, 2 and 1 votes).");
      return;
    }
    const ids = [picks.pick1, picks.pick2, picks.pick3];
    if (new Set(ids).size !== 3) {
      setError("The three picks must be different players.");
      return;
    }
    submit.mutate(
      {
        data: {
          configId,
          grade,
          round: round.round,
          pick1PlayerId: picks.pick1,
          pick2PlayerId: picks.pick2,
          pick3PlayerId: picks.pick3,
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          queryClient.invalidateQueries({
            queryKey: getGetCaptainVotingBoardQueryKey(),
          });
        },
        onError: (e) => setError(handleCaptainMutationError(e)),
      },
    );
  };

  const hasBallot = round.ballot != null;

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            Round {round.round}
            {round.opponent && (
              <span className="ml-2 font-normal text-muted-foreground">
                vs {round.opponent}
              </span>
            )}
          </div>
          {hasBallot && !open ? (
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-mono font-bold text-primary">3</span>{" "}
              {nameOf(round.ballot!.pick1PlayerId)} ·{" "}
              <span className="font-mono font-bold text-primary">2</span>{" "}
              {nameOf(round.ballot!.pick2PlayerId)} ·{" "}
              <span className="font-mono font-bold text-primary">1</span>{" "}
              {nameOf(round.ballot!.pick3PlayerId)}
            </div>
          ) : (
            !open && (
              <div className="text-sm text-muted-foreground italic mt-1">
                No vote submitted yet.
              </div>
            )
          )}
        </div>
        {!round.locked && !open && (
          <Button size="sm" variant={hasBallot ? "outline" : "default"} onClick={() => setOpen(true)}>
            {hasBallot ? "Edit vote" : "Vote"}
          </Button>
        )}
        {round.locked && (
          <span className="text-xs text-muted-foreground shrink-0">Locked</span>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <PickSelect
            label="3 votes"
            players={round.players}
            value={picks.pick1}
            exclude={[picks.pick2, picks.pick3]}
            onChange={(v) => setPicks((p) => ({ ...p, pick1: v }))}
          />
          <PickSelect
            label="2 votes"
            players={round.players}
            value={picks.pick2}
            exclude={[picks.pick1, picks.pick3]}
            onChange={(v) => setPicks((p) => ({ ...p, pick2: v }))}
          />
          <PickSelect
            label="1 vote"
            players={round.players}
            value={picks.pick3}
            exclude={[picks.pick1, picks.pick2]}
            onChange={(v) => setPicks((p) => ({ ...p, pick3: v }))}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={submit.isPending}>
              {submit.isPending ? "Saving…" : "Save vote"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PickSelect({
  label,
  players,
  value,
  exclude,
  onChange,
}: {
  label: string;
  players: VotableRoundPlayer[];
  value: number | null;
  exclude: (number | null)[];
  onChange: (v: number | null) => void;
}) {
  const excludeSet = new Set(exclude.filter((x): x is number => x != null));
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <span className="text-sm font-bold text-primary">{label}</span>
      <select
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">— Select a player —</option>
        {players.map((p) => (
          <option key={p.playerId} value={p.playerId} disabled={excludeSet.has(p.playerId)}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
