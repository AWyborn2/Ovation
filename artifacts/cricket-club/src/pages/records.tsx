import { useCallback, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueries } from "@tanstack/react-query";
import {
  getGetRecordLeadersQueryKey,
  getGetRecordLeadersQueryOptions,
  getGetRecordProgressionQueryKey,
  getGetRecordsQueryKey,
  useGetPartnerships,
  useGetRecordLeaders,
  useGetRecordProgression,
  useGetRecords,
  useGetRecordsDisplaySettings,
  useListCenturies,
  useListFiveWicketHauls,
  useListGrades,
  type PlayerRecord,
  type RecordLeaders,
  type RecordLeaderMetric,
  type RecordLeaderRow,
  type RecordProgressionPoint,
  type Stat,
} from "@workspace/api-client-react";
import { Container, Eyebrow, PageStack } from "@/components/broadcast";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { SeasonBar } from "@/components/stats-charts";
import { parseSeasonYear, seasonLabel, useStatsView } from "@/lib/use-stats-view";
import { cn } from "@/lib/utils";
import {
  ALL_GRADES,
  LEADER_METRICS,
  bestStandPerWicket,
  buildRecordWatch,
  centuriesHeatmap,
  defaultGradeTab,
  fiveForsTimeline,
  fullName,
  gradeParam,
  isActive,
  pairLabel,
  rangeParams,
  type ProgressionKind,
} from "./records/model";
import { RecordCards, type RecordCardData } from "./records/record-cards";
import { RecordWatch } from "./records/record-watch";
import { RecordProgression } from "./records/progression";
import { CareerLeaders } from "./records/leaders";
import { Partnerships } from "./records/partnerships";
import { HundredsHeatmap } from "./records/hundreds-heatmap";
import { FiveForsTimeline } from "./records/five-fors";

/** Rows the record-watch rules scan per leaderboard. */
const WATCH_DEPTH = 25;

/** Folds the five watch leaderboards into one stable object (useQueries combine). */
function combineWatch(results: Array<{ data?: RecordLeaders; isLoading: boolean }>): {
  leaders: Partial<Record<RecordLeaderMetric, RecordLeaderRow[] | undefined>>;
  loading: boolean;
} {
  return {
    leaders: Object.fromEntries(
      LEADER_METRICS.map((m, i) => [m.key, results[i]?.data?.entries]),
    ) as Partial<Record<RecordLeaderMetric, RecordLeaderRow[] | undefined>>,
    loading: results.some((r) => r.isLoading),
  };
}

const fmt = (n: number) => n.toLocaleString("en-AU");

/** "Held 6 yrs" from the season a record was set, relative to the latest season. */
function tenure(season: number | null | undefined, current: number | null): string | null {
  if (season == null || current == null) return null;
  const years = current - season;
  if (years <= 0) return "New";
  return `Held ${years} ${years === 1 ? "yr" : "yrs"}`;
}

/** The grade tab lives in the URL (`?grade=`) so links reproduce the view. */
function useGradeParam(): [string | null, (grade: string) => void] {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const grade = useMemo(() => {
    const raw = new URLSearchParams(search).get("grade");
    return raw && raw.trim() ? raw.trim() : null;
  }, [search]);
  const setGrade = useCallback(
    (next: string) => {
      const params = new URLSearchParams(search);
      params.set("grade", next);
      navigate(`${location}?${params.toString()}`, { replace: true });
    },
    [search, location, navigate],
  );
  return [grade, setGrade];
}

/** Single-innings record for a card: the progression's final point in Career. */
function inningsCard(
  key: string,
  label: string,
  field: "highScore" | "bestBowling",
  stat: Stat | null | undefined,
  finalPoint: RecordProgressionPoint | undefined,
  career: boolean,
  current: number | null,
): RecordCardData {
  if (career && finalPoint) {
    const season = finalPoint.dated ? finalPoint.season : null;
    return {
      key,
      label,
      value: finalPoint.value,
      holder: fullName(finalPoint.givenName, finalPoint.surname),
      holderId: finalPoint.playerId || null,
      context:
        [finalPoint.grade, season != null ? seasonLabel(season) : null]
          .filter(Boolean)
          .join(" · ") || null,
      badge: tenure(season, current),
    };
  }
  const value = stat?.[field];
  if (!stat || !value) {
    return { key, label, value: null, holder: null, holderId: null, context: null, badge: null };
  }
  return {
    key,
    label,
    value,
    holder: fullName(stat.givenName, stat.surname),
    holderId: stat.playerId || null,
    context:
      [stat.grade, stat.season != null ? seasonLabel(stat.season) : null]
        .filter(Boolean)
        .join(" · ") || null,
    badge: career ? tenure(stat.season, current) : null,
  };
}

function careerCard(
  key: string,
  label: string,
  rec: PlayerRecord | null | undefined,
  leaders: RecordLeaderRow[] | undefined,
  current: number | null,
): RecordCardData {
  if (!rec || !rec.value) {
    return { key, label, value: null, holder: null, holderId: null, context: null, badge: null };
  }
  const row = leaders?.find((r) => r.playerId === rec.playerId);
  const grades = sortGradesBySeniority(rec.grades ?? []);
  return {
    key,
    label,
    value: fmt(rec.value),
    holder: fullName(rec.givenName, rec.surname),
    holderId: rec.playerId || null,
    context: grades.length
      ? grades.slice(0, 3).join(" · ") + (grades.length > 3 ? ` +${grades.length - 3}` : "")
      : null,
    badge: row && isActive(row.lastSeason, current) ? "Active" : null,
  };
}

/**
 * Club records (stats plan U10): record cards, record watch, progression,
 * career leaders, partnerships, hundreds heatmap and five-fors timeline, driven
 * by the grade tabs and the shared season bar (range only — no discipline
 * switch on Records). Every figure comes from the records endpoints and the
 * curated centuries / five-fors / partnerships lists.
 */
export default function Records() {
  const { view, label: rangeText } = useStatsView();
  const career = view.from == null && view.to == null;
  const [urlGrade, setGrade] = useGradeParam();
  const [leaderMetric, setLeaderMetric] = useState<RecordLeaderMetric>("runs");
  const [progKind, setProgKind] = useState<ProgressionKind>("highScore");

  const settingsQ = useGetRecordsDisplaySettings();
  const gradesQ = useListGrades();
  const grades = useMemo(
    () =>
      sortGradesBySeniority(
        (Array.isArray(gradesQ.data) ? gradesQ.data : []).map((g) => g.grade).filter(Boolean),
      ),
    [gradesQ.data],
  );

  // The admin's records display settings pick the landing tab; the URL wins.
  const settingsReady = !settingsQ.isLoading && !gradesQ.isLoading;
  const gradeTab =
    urlGrade ?? (settingsReady ? defaultGradeTab(settingsQ.data ?? null, grades) : null);
  const ready = gradeTab != null;
  const tab = gradeTab ?? ALL_GRADES;
  const scope = tab === ALL_GRADES ? "all grades" : tab;
  const gParams = gradeParam(tab);
  const rParams = rangeParams(view);

  const recordsParams = { ...gParams, ...rParams };
  const recordsQ = useGetRecords(recordsParams, {
    query: { enabled: ready, queryKey: getGetRecordsQueryKey(recordsParams) },
  });
  const hsParams = { kind: "highScore" as const, ...gParams };
  const hsQ = useGetRecordProgression(hsParams, {
    query: { enabled: ready, queryKey: getGetRecordProgressionQueryKey(hsParams) },
  });
  const bbParams = { kind: "bestBowling" as const, ...gParams };
  const bbQ = useGetRecordProgression(bbParams, {
    query: { enabled: ready, queryKey: getGetRecordProgressionQueryKey(bbParams) },
  });
  // Record watch reads career leaderboards (grade-scoped, no range) for every metric.
  const watchQ = useQueries({
    queries: LEADER_METRICS.map((m) => ({
      ...getGetRecordLeadersQueryOptions({ metric: m.key, ...gParams, limit: WATCH_DEPTH }),
      enabled: ready,
    })),
    combine: combineWatch,
  });
  const watchLeaders = watchQ.leaders;
  const leaderParams = { metric: leaderMetric, ...gParams, ...rParams, limit: 8 };
  const leadersQ = useGetRecordLeaders(leaderParams, {
    query: { enabled: ready, queryKey: getGetRecordLeadersQueryKey(leaderParams) },
  });
  const partnershipsQ = useGetPartnerships();
  const centuriesQ = useListCenturies();
  const fiveForsQ = useListFiveWicketHauls();

  const records = recordsQ.data && !Array.isArray(recordsQ.data) ? recordsQ.data : undefined;
  const hsPoints = useMemo(() => hsQ.data?.points ?? [], [hsQ.data]);
  const bbPoints = useMemo(() => bbQ.data?.points ?? [], [bbQ.data]);
  const centuries = useMemo(
    () => (Array.isArray(centuriesQ.data) ? centuriesQ.data : []),
    [centuriesQ.data],
  );
  const fiveFors = useMemo(
    () => (Array.isArray(fiveForsQ.data) ? fiveForsQ.data : []),
    [fiveForsQ.data],
  );
  const partnershipPool = useMemo(
    () => [...(partnershipsQ.data?.records ?? []), ...(partnershipsQ.data?.fiftyPlus ?? [])],
    [partnershipsQ.data],
  );
  // Seasons this page knows about: drives the season bar, the "since" line and
  // the "current season" behind the still-playing and tenure badges.
  const seasons = useMemo(() => {
    const years = new Set<number>();
    const add = (s: string | number | null | undefined) => {
      const y = parseSeasonYear(s);
      if (y != null) years.add(y);
    };
    centuries.forEach((c) => add(c.season));
    fiveFors.forEach((f) => add(f.season));
    partnershipPool.forEach((p) => add(p.season));
    [...hsPoints, ...bbPoints].forEach((p) => add(p.season));
    return [...years].sort((a, b) => a - b);
  }, [centuries, fiveFors, partnershipPool, hsPoints, bbPoints]);
  const currentSeason = useMemo(() => {
    const last = Object.values(watchLeaders)
      .flatMap((rows) => rows ?? [])
      .map((r) => r.lastSeason ?? -Infinity);
    const max = Math.max(seasons[seasons.length - 1] ?? -Infinity, ...last);
    return Number.isFinite(max) ? max : null;
  }, [seasons, watchLeaders]);

  const stands = useMemo(
    () => bestStandPerWicket(partnershipPool, tab, view),
    [partnershipPool, tab, view],
  );
  const cards = useMemo<RecordCardData[]>(() => {
    const top = stands.reduce<(typeof stands)[number] | null>(
      (best, s) => (!best || s.runs > best.runs ? s : best),
      null,
    );
    const standSeason = parseSeasonYear(top?.season);
    return [
      inningsCard(
        "highScore",
        "Highest score",
        "highScore",
        records?.highestScore,
        hsPoints[hsPoints.length - 1],
        career,
        currentSeason,
      ),
      inningsCard(
        "bestBowling",
        "Best bowling",
        "bestBowling",
        records?.bestBowling,
        bbPoints[bbPoints.length - 1],
        career,
        currentSeason,
      ),
      top
        ? {
            key: "stand",
            label: "Highest stand",
            value: String(top.runs),
            holder: pairLabel(top.batsmen),
            holderId: null,
            context:
              [`${top.wicket} wicket`, top.season, tab === ALL_GRADES ? top.grade : null]
                .filter(Boolean)
                .join(" · ") || null,
            badge: career ? tenure(standSeason, currentSeason) : null,
          }
        : {
            key: "stand",
            label: "Highest stand",
            value: null,
            holder: null,
            holderId: null,
            context: null,
            badge: null,
          },
      careerCard("runs", "Career runs", records?.mostRuns, watchLeaders.runs, currentSeason),
      careerCard(
        "wickets",
        "Career wickets",
        records?.mostWickets,
        watchLeaders.wickets,
        currentSeason,
      ),
    ];
  }, [records, hsPoints, bbPoints, stands, career, currentSeason, tab, watchLeaders]);

  const watch = useMemo(
    () => buildRecordWatch(watchLeaders, currentSeason),
    [watchLeaders, currentSeason],
  );
  const heatmap = useMemo(
    () => centuriesHeatmap(centuries, tab, view, sortGradesBySeniority),
    [centuries, tab, view],
  );
  const timeline = useMemo(() => fiveForsTimeline(fiveFors, tab, view), [fiveFors, tab, view]);

  const tabs = [ALL_GRADES, ...grades];
  const since = seasons.length
    ? `Since ${seasonLabel(seasons[0])} · ${seasons[seasons.length - 1] - seasons[0] + 1} seasons`
    : "All-time club records";
  const progQ = progKind === "highScore" ? hsQ : bbQ;
  const loadingCards = !ready || recordsQ.isLoading || (career && (hsQ.isLoading || bbQ.isLoading));

  return (
    <div data-full-bleed="">
      <SeasonBar seasons={seasons} showDiscipline={false} />
      <Container className="py-[var(--gap-section)]">
        <PageStack className="gap-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>{since}</Eyebrow>
              <h1 className="mt-1 font-serif text-[clamp(40px,5vw,64px)] font-black uppercase leading-[0.95]">
                Club records
              </h1>
            </div>
            <div
              role="group"
              aria-label="Grade"
              data-testid="records-grade-tabs"
              className="flex flex-wrap rounded-[10px] border bg-card p-[3px]"
            >
              {tabs.map((g) => {
                const active = g === tab;
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGrade(g)}
                    className={cn(
                      "h-8 rounded-[7px] px-3.5 text-[13px] font-semibold transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g === ALL_GRADES ? "All grades" : g}
                  </button>
                );
              })}
            </div>
          </header>

          <RecordCards cards={cards} loading={loadingCards} />

          <RecordWatch items={watch} loading={!ready || watchQ.loading} scope={scope} />

          <RecordProgression
            kind={progKind}
            onKind={setProgKind}
            points={progKind === "highScore" ? hsPoints : bbPoints}
            loading={!ready || progQ.isLoading}
            error={progQ.isError}
            scope={scope}
          />

          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))]">
            <CareerLeaders
              metric={leaderMetric}
              onMetric={setLeaderMetric}
              rows={leadersQ.data?.entries ?? []}
              loading={!ready || leadersQ.isLoading}
              error={leadersQ.isError}
              currentSeason={currentSeason}
              scope={scope}
              range={rangeText}
            />
            <Partnerships
              stands={stands}
              loading={partnershipsQ.isLoading}
              error={partnershipsQ.isError}
            />
          </div>

          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))]">
            <HundredsHeatmap
              model={heatmap}
              loading={centuriesQ.isLoading}
              error={centuriesQ.isError}
            />
            <FiveForsTimeline
              model={timeline}
              loading={fiveForsQ.isLoading}
              error={fiveForsQ.isError}
            />
          </div>
        </PageStack>
      </Container>
    </div>
  );
}
