import { useMemo, useState } from "react";
import {
  getGetGradeDistributionQueryKey,
  getGetPlayerMatchesQueryKey,
  getGetPlayerQueryKey,
  getGetPlayerSeasonsQueryKey,
  useGetGradeDistribution,
  useGetPlayer,
  useGetPlayerMatches,
  useGetPlayerSeasons,
} from "@workspace/api-client-react";
import { ArrowLeftRight } from "lucide-react";
import { Container, FullBleedPage, PageHeader, PageStack } from "@/components/broadcast";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryError } from "@/components/data-states";
import { SeasonBar } from "@/components/stats-charts/season-bar";
import {
  careerRace,
  filterMatches,
  filterSeasonRows,
  isCareer,
  nemesis,
  NO_BOWLING_REASON,
  oppositionTable,
} from "@/lib/stats-analytics";
import { useStatsView, type Discipline } from "@/lib/use-stats-view";
import {
  SLOTS,
  coverageNotes,
  effectiveOppMetric,
  mostPlayedGrade,
  oppositionMatrix,
  seasonBars,
  seasonTotals,
  swapFirstTwo,
  taleOfTheTape,
  verdict as computeVerdict,
  type OppMetric,
  type Slot,
} from "./compare/compare-data";
import { useComparePlayers } from "./compare/use-compare-players";
import { PlayerCards } from "./compare/player-cards";
import { VerdictBar } from "./compare/verdict";
import { CompareRadar } from "./compare/radar";
import { TaleOfTheTape } from "./compare/tape";
import { SelectionHelper } from "./compare/selection-helper";
import { OppositionMatrix } from "./compare/opposition";
import { CareerRace } from "./compare/race";
import { SeasonBySeason } from "./compare/seasons";
import { SLOT_TOKENS, type ComparedPlayer } from "./compare/shared";

/** Every query one compared slot needs; disabled while the slot is empty. */
function useSlotData(id: number | null) {
  const enabled = id != null;
  const pid = id ?? 0;
  const player = useGetPlayer(pid, { query: { enabled, queryKey: getGetPlayerQueryKey(pid) } });
  const seasons = useGetPlayerSeasons(pid, {
    query: { enabled, queryKey: getGetPlayerSeasonsQueryKey(pid) },
  });
  const matches = useGetPlayerMatches(pid, {
    query: { enabled, queryKey: getGetPlayerMatchesQueryKey(pid) },
  });
  return {
    player,
    seasons,
    matches,
    loading: enabled && (player.isLoading || seasons.isLoading || matches.isLoading),
    failed: [player, seasons, matches].find((q) => q.isError) ?? null,
  };
}

const RANGE_CARD_ROW =
  "grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]";

export default function Compare() {
  const { slots, setSlots } = useComparePlayers();
  const { view, setView, label: rangeLabel } = useStatsView();
  const range = useMemo(() => ({ from: view.from, to: view.to }), [view.from, view.to]);
  const d = view.d;

  const slotData = { a: useSlotData(slots.a), b: useSlotData(slots.b), c: useSlotData(slots.c) };

  const players: ComparedPlayer[] = SLOTS.flatMap((slot) => {
    const id = slots[slot];
    if (id == null) return [];
    const q = slotData[slot];
    const detail = q.player.data;
    return [
      {
        slot,
        id,
        name: detail ? `${detail.givenName} ${detail.surname}` : `Player ${slot.toUpperCase()}`,
        short: detail?.surname ?? slot.toUpperCase(),
        token: SLOT_TOKENS[slot],
        detail,
        seasons: q.seasons.data ?? [],
        matches: q.matches.data ?? [],
      },
    ];
  });
  const ready = players.length >= 2;
  const loading = SLOTS.some((s) => slotData[s].loading);
  const failed = SLOTS.map((s) => slotData[s].failed).find(Boolean) ?? null;

  const seasonLists = players.map((p) => p.seasons);
  const matchLists = players.map((p) => p.matches);
  const allSeasons = seasonLists.flat().map((r) => r.season);

  // Season-level views.
  const inRange = seasonLists.map((rows) => filterSeasonRows(rows, range));
  const totals = inRange.map((rows) => seasonTotals(rows));
  const tape = taleOfTheTape(totals, d);
  const verdict = computeVerdict(tape, players.length);

  // Radar: the compared players' most-played grade over the range.
  const radarGrade = mostPlayedGrade(seasonLists, range);
  const distParams = {
    ...(view.from != null ? { fromSeason: view.from } : {}),
    ...(view.to != null ? { toSeason: view.to } : {}),
  };
  const distribution = useGetGradeDistribution(radarGrade ?? "", distParams, {
    query: {
      enabled: ready && radarGrade != null,
      queryKey: getGetGradeDistributionQueryKey(radarGrade ?? "", distParams),
    },
  });
  const radarTotals = inRange.map((rows) =>
    seasonTotals(rows.filter((r) => r.grade === radarGrade)),
  );

  // Per-match views.
  const matchesInRange = matchLists.map((rows) => filterMatches(rows, range));
  const coverageNote = coverageNotes(
    players.map((p) => p.name),
    seasonLists,
    matchLists,
  );
  // The opposition metric resets to outs / wk whenever the discipline flips
  // (state adjusted during render, so the stale metric never paints).
  const [oppChoice, setOppChoice] = useState<{ d: Discipline; metric: OppMetric } | null>(null);
  if (oppChoice && oppChoice.d !== d) setOppChoice(null);
  const oppMetric = effectiveOppMetric(oppChoice, d);
  const tables = matchesInRange.map((rows) => oppositionTable(rows));
  const matrix = oppositionMatrix(
    tables,
    players.map((p) => p.name),
    oppMetric,
  );
  const noOppBowling = d === "bowl" && tables.every((t) => t.every((r) => r.bowlingMatches === 0));
  const oppEmpty =
    matrix.length === 0
      ? "No scorecards recorded in this range"
      : noOppBowling
        ? NO_BOWLING_REASON
        : null;
  const nemeses = matchesInRange.map((rows) => nemesis(rows));
  const race = careerRace(
    players.map((p) => ({ key: p.slot, matches: p.matches, seasons: p.seasons })),
    d,
    range,
  );
  const bars = seasonBars(seasonLists, d, range);

  const onPick = (slot: Slot, id: number | null) => setSlots({ [slot]: id });
  const setDiscipline = (next: Discipline) => setView({ d: next });

  return (
    <FullBleedPage>
      <SeasonBar seasons={allSeasons} />
      <Container className="py-[var(--gap-section)]">
        <PageStack>
          <PageHeader
            eyebrow="Compare up to three players"
            title="Head-to-head"
            subtitle={`Senior · ${rangeLabel}`}
            actions={
              <Button
                variant="outline"
                onClick={() => setSlots(swapFirstTwo(slots))}
                disabled={slots.a == null && slots.b == null}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Swap first two
              </Button>
            }
          />

          <PlayerCards
            slots={slots}
            details={{
              a: slotData.a.player.data,
              b: slotData.b.player.data,
              c: slotData.c.player.data,
            }}
            onPick={onPick}
          />

          {failed ? (
            <QueryError
              message="One of the players couldn’t be loaded. Please try again."
              onRetry={() => void failed.refetch()}
            />
          ) : !ready ? (
            <EmptyState
              title="Pick two players to compare"
              message="Select two players to see a head-to-head comparison. Add a third to make it a three-way."
            />
          ) : (
            <>
              <VerdictBar verdict={verdict} players={players} />
              <div className={RANGE_CARD_ROW}>
                <CompareRadar
                  players={players}
                  totals={radarTotals}
                  best={distribution.data?.best}
                  grade={radarGrade}
                  rangeLabel={rangeLabel}
                  d={d}
                  loading={loading || distribution.isLoading}
                  error={distribution.isError}
                />
                <TaleOfTheTape
                  rows={tape}
                  players={players}
                  rangeLabel={rangeLabel}
                  loading={loading}
                />
              </div>
            </>
          )}

          <SelectionHelper slots={slots} onAdd={(slot, id) => setSlots({ [slot]: id })} />

          {ready && !failed && (
            <>
              <OppositionMatrix
                players={players}
                rows={matrix}
                metric={oppMetric}
                onMetric={(metric) => setOppChoice({ d, metric })}
                d={d}
                onDiscipline={setDiscipline}
                nemeses={nemeses}
                rangeLabel={rangeLabel}
                coverageNote={coverageNote}
                emptyReason={oppEmpty}
                loading={loading}
              />
              <CareerRace
                players={players}
                race={race}
                d={d}
                onDiscipline={setDiscipline}
                isCareer={isCareer(range)}
                coverageNote={coverageNote}
                loading={loading}
              />
              <SeasonBySeason players={players} rows={bars} d={d} loading={loading} />
            </>
          )}
        </PageStack>
      </Container>
    </FullBleedPage>
  );
}
