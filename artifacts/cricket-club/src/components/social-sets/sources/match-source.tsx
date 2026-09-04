import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMatches,
  useGetMatch,
  getGetMatchQueryKey,
  getGetMatchQueryOptions,
  type MatchSummary as MatchSummaryDto,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { matchToSummaryInput, seasonLabel } from "@/lib/match-summary";
import type { ShareCardInput } from "@/lib/share-card";
import { GRADES, selectClass } from "../model";

/** Pick one match (or every match in a round) as match-summary slides. */
export function MatchSource({
  onAdd,
  onAddMany,
}: {
  onAdd: (i: ShareCardInput) => void;
  onAddMany: (inputs: ShareCardInput[]) => void;
}) {
  const qc = useQueryClient();
  const [grade, setGrade] = useState(GRADES[0]);
  const [season, setSeason] = useState<number | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [batching, setBatching] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const matchesQ = useListMatches({ grade });
  const matches = (matchesQ.data ?? []) as MatchSummaryDto[];
  const seasons = useMemo(() => {
    const set = new Set<number>();
    matches.forEach((m) => set.add(m.season));
    return [...set].sort((a, b) => b - a);
  }, [matches]);
  const effectiveSeason = season ?? seasons[0] ?? null;
  const filtered = useMemo(
    () => matches.filter((m) => m.season === effectiveSeason),
    [matches, effectiveSeason],
  );
  // Distinct rounds in the selected grade/season, for the batch "add all in
  // round" action.
  const rounds = useMemo(() => {
    const set = new Set<number>();
    filtered.forEach((m) => {
      if (m.round != null) set.add(m.round);
    });
    return [...set].sort((a, b) => a - b);
  }, [filtered]);
  const effectiveRound = round ?? rounds[0] ?? null;
  const roundMatches = useMemo(
    () => filtered.filter((m) => m.round === effectiveRound),
    [filtered, effectiveRound],
  );
  const detailQ = useGetMatch(matchId ?? 0, {
    query: {
      enabled: matchId != null,
      queryKey: getGetMatchQueryKey(matchId ?? 0),
    },
  });

  const matchLabel = (m: MatchSummaryDto) => {
    const round = m.stage ?? (m.round != null ? `Round ${m.round}` : "Match");
    return `${round} — vs ${m.opponent ?? "Unknown"}${m.result ? ` (${m.result})` : ""}`;
  };

  // Fetch every match detail in the selected round (via the shared query cache,
  // so already-viewed matches are free), map each to a summary card, and
  // batch-append. The `POST /card-sets` endpoint already accepts a full slide
  // array, so this needs no schema/endpoint change.
  const addRound = async () => {
    if (roundMatches.length === 0) return;
    setBatching(true);
    setBatchError(null);
    try {
      const details = await Promise.all(
        roundMatches.map((m) => qc.fetchQuery(getGetMatchQueryOptions(m.id))),
      );
      onAddMany(details.map((d) => matchToSummaryInput(d)));
    } catch (e) {
      console.error("Batch add (round) failed", e);
      setBatchError(e instanceof Error ? e.message : "Could not load every match in this round.");
    } finally {
      setBatching(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select
          className={selectClass}
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            setSeason(null);
            setMatchId(null);
          }}
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={effectiveSeason ?? ""}
          disabled={seasons.length === 0}
          onChange={(e) => {
            setSeason(e.target.value ? Number(e.target.value) : null);
            setMatchId(null);
          }}
        >
          {seasons.length === 0 && <option value="">No matches</option>}
          {seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={matchId ?? ""}
          disabled={filtered.length === 0}
          onChange={(e) => setMatchId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{filtered.length === 0 ? "No matches" : "Select a match…"}</option>
          {filtered.map((m) => (
            <option key={m.id} value={m.id}>
              {matchLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => detailQ.data && onAdd(matchToSummaryInput(detailQ.data))}
          disabled={matchId == null || detailQ.isLoading || !detailQ.data}
        >
          {detailQ.isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add match slide
        </Button>
      </div>

      {/* Batch: add every match in a round at once. */}
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <select
          className={selectClass}
          value={effectiveRound ?? ""}
          disabled={rounds.length === 0}
          onChange={(e) => setRound(e.target.value ? Number(e.target.value) : null)}
        >
          {rounds.length === 0 && <option value="">No rounds</option>}
          {rounds.map((r) => (
            <option key={r} value={r}>
              Round {r}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={addRound}
          disabled={batching || roundMatches.length === 0}
        >
          {batching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Add all in Round {effectiveRound ?? "—"} ({roundMatches.length})
        </Button>
      </div>
      {batchError && <p className="text-sm text-destructive">{batchError}</p>}
    </div>
  );
}
