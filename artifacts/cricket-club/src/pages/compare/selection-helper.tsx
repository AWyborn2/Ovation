import { useMemo, useState } from "react";
import {
  getGetFixturesResultsLadderQueryKey,
  getGetPlayersVsClubQueryKey,
  useGetFixturesResultsLadder,
  useGetPlayersVsClub,
  useListFixtures,
  useListFixturesResults,
} from "@workspace/api-client-react";
import type { FixturesResultsPage } from "@workspace/api-client-react";
import { CalendarDays } from "lucide-react";
import { FilterChips } from "@/components/broadcast";
import { EmptyState, TableSkeleton } from "@/components/data-states";
import { ChartCard } from "@/components/stats-charts/chart-card";
import { chartColor } from "@/components/stats-charts/chart-tooltip";
import { cn } from "@/lib/utils";
import {
  SLOTS,
  helperBatters,
  helperBowlers,
  helperSlotFor,
  lastResultVs,
  ladderPosition,
  ordinal,
  upcomingFixtures,
  vsClubParams,
  type Slot,
  type Slots,
  type UpcomingFixture,
} from "./compare-data";
import { SLOT_TOKENS } from "./shared";

function fixtureDate(iso: string | null): string {
  if (!iso) return "Date TBC";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

interface HelperRow {
  playerId: number;
  name: string;
  sub: string;
  value: number;
  display: string;
  unit: string;
}

function RankedList({
  title,
  hint,
  rows,
  slots,
  onAdd,
}: {
  title: string;
  hint: string;
  rows: HelperRow[];
  slots: Slots;
  onAdd: (slot: Slot, playerId: number) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <span className="text-[11.5px] text-muted-foreground">{hint}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          Nobody qualifies against this club yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-1" aria-label={title}>
          {rows.map((r, i) => {
            const inSlot = SLOTS.find((s) => slots[s] === r.playerId);
            const target = helperSlotFor(slots, r.playerId);
            return (
              <li
                key={r.playerId}
                data-testid="helper-row"
                className={cn(
                  "grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(48px,120px)_auto_auto] items-center gap-3 rounded-lg px-2 py-2",
                  i === 0 && "bg-[hsl(var(--primary)/0.14)]",
                )}
              >
                <span className="font-serif text-[16px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                    {r.name}
                    {inSlot && (
                      <span
                        aria-label="In the comparison"
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: chartColor(SLOT_TOKENS[inSlot]) }}
                      />
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.sub}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(r.value / max) * 100}%`,
                      background: i < 3 ? chartColor("--chart-a") : chartColor("--bar-mute"),
                    }}
                  />
                </span>
                <span className="text-right">
                  <strong className="font-serif text-[18px] font-extrabold">{r.display}</strong>
                  <span className="block text-[10px] text-muted-foreground">{r.unit}</span>
                </span>
                {target == null ? (
                  <span className="rounded-full border px-2.5 py-1 text-[11.5px] text-muted-foreground">
                    Comparing
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(target, r.playerId)}
                    aria-label={`Compare ${r.name}`}
                    className="rounded-full border border-foreground/30 px-2.5 py-1 text-[11.5px] font-semibold hover:bg-muted"
                  >
                    Compare
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function FixtureDetail({
  fixture,
  slots,
  onAdd,
  results,
}: {
  fixture: UpcomingFixture;
  slots: Slots;
  onAdd: (slot: Slot, playerId: number) => void;
  results: FixturesResultsPage | undefined;
}) {
  const params = vsClubParams(fixture);
  const vs = useGetPlayersVsClub(params ?? {}, {
    query: { enabled: params != null, queryKey: getGetPlayersVsClubQueryKey(params ?? {}) },
  });
  const ladderQ = useGetFixturesResultsLadder(
    { gradeId: fixture.gradeId ?? "" },
    {
      query: {
        enabled: fixture.gradeId != null,
        queryKey: getGetFixturesResultsLadderQueryKey({ gradeId: fixture.gradeId ?? "" }),
      },
    },
  );
  const position = ladderPosition(ladderQ.data, fixture);
  const last = lastResultVs(results, fixture);
  const data = vs.data;

  const batters: HelperRow[] = helperBatters(data).map((b) => ({
    playerId: b.playerId,
    name: `${b.givenName} ${b.surname}`,
    sub: `${b.innings} inns · ${b.runs.toLocaleString("en-AU")} runs`,
    value: b.average ?? 0,
    display: b.average != null ? b.average.toFixed(1) : "–",
    unit: "avg",
  }));
  const bowlers: HelperRow[] = helperBowlers(data).map((b) => ({
    playerId: b.playerId,
    name: `${b.givenName} ${b.surname}`,
    sub: [
      b.average != null ? `avg ${b.average.toFixed(1)}` : null,
      b.bestWickets != null && b.bestRuns != null ? `best ${b.bestWickets}/${b.bestRuns}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    value: b.wickets,
    display: String(b.wickets),
    unit: "wkts",
  }));

  const meta = [
    fixture.round,
    fixtureDate(fixture.startAt),
    fixture.venue,
    fixture.isHome == null ? null : fixture.isHome ? "Home" : "Away",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div
        data-testid="fixture-banner"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 px-4 py-3"
      >
        <div className="min-w-0">
          <div className="font-serif text-[22px] font-extrabold uppercase leading-none">
            v {data?.opponentName ?? fixture.opponentName} · {fixture.grade}
          </div>
          <div className="mt-1 text-[12.5px] text-muted-foreground">{meta}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-[12.5px] text-muted-foreground">
          {position && (
            <span>
              Ladder:{" "}
              <strong className="text-foreground">
                {ordinal(position.rank)} of {position.of}
              </strong>
            </span>
          )}
          {last && (
            <span>
              Last meeting:{" "}
              <strong className="text-foreground">
                {last.outcome ? last.outcome[0].toUpperCase() + last.outcome.slice(1) : "Played"}
              </strong>
              {last.resultText ? ` — ${last.resultText}` : ""}
            </span>
          )}
        </div>
      </div>

      {params == null ? (
        <EmptyState
          title="This opponent isn't linked to a club"
          message={`${fixture.opponentName} has no club link in the fixture, so there's no head-to-head record to rank.`}
          className="py-8"
        />
      ) : vs.isLoading ? (
        <TableSkeleton rows={6} />
      ) : vs.isError ? (
        <EmptyState
          title="Couldn't load the record against this club"
          message="Try again in a moment."
          className="py-8"
        />
      ) : data && !data.resolved ? (
        <EmptyState
          title="No stats match for this opponent"
          message={`We couldn't match ${fixture.opponentName} to a club in the stats database, so there's no record against them to show.`}
          className="py-8"
        />
      ) : (
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
          <RankedList
            title="Batters"
            hint={`Average · min ${data?.minInnings ?? 3} innings`}
            rows={batters}
            slots={slots}
            onAdd={onAdd}
          />
          <RankedList
            title="Bowlers"
            hint="Wickets · then average"
            rows={bowlers}
            slots={slots}
            onAdd={onAdd}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Selection helper: the next three fixtures, and for the picked one the whole
 * squad's career record against that club (all senior grades), ranked. A
 * "Compare" button drops a player into the empty third slot, or replaces B.
 */
export function SelectionHelper({
  slots,
  onAdd,
}: {
  slots: Slots;
  onAdd: (slot: Slot, playerId: number) => void;
}) {
  const fixturesQ = useListFixtures({ upcomingOnly: true });
  const resultsQ = useListFixturesResults();
  const [now] = useState(() => new Date());
  const fixtures = useMemo(
    () => upcomingFixtures(fixturesQ.data, resultsQ.data, now),
    [fixturesQ.data, resultsQ.data, now],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const current = fixtures.find((f) => f.key === picked) ?? fixtures[0] ?? null;
  const loading = fixturesQ.isLoading || resultsQ.isLoading;

  return (
    <ChartCard
      eyebrow="Selection helper"
      title="Upcoming fixtures"
      loading={loading}
      actions={
        fixtures.length > 1 ? (
          <FilterChips
            label="Upcoming fixture"
            options={fixtures.map((f) => ({
              value: f.key,
              label: `${f.round ?? f.grade} v ${f.opponentName}`,
            }))}
            value={current?.key ?? ""}
            onChange={setPicked}
          />
        ) : undefined
      }
    >
      {current ? (
        <FixtureDetail
          key={current.key}
          fixture={current}
          slots={slots}
          onAdd={onAdd}
          results={resultsQ.data}
        />
      ) : (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" aria-hidden />}
          title="No upcoming fixtures"
          message="The selection helper appears once the next fixtures are published."
          className="py-8"
        />
      )}
      <p className="mt-4 text-[12px] text-muted-foreground">
        Coloured dots mark players already in the comparison. Career records against this club, all
        senior grades.
      </p>
    </ChartCard>
  );
}
