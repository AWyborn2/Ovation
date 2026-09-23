import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, MapPin } from "lucide-react";
import {
  useListFixturesResults,
  getListFixturesResultsQueryKey,
  useGetFixturesResultsLadder,
  getGetFixturesResultsLadderQueryKey,
  type PlayhqFixture,
  type PlayhqLadderTeam,
} from "@workspace/api-client-react";
import { EmptyState, ListSkeleton, QueryError } from "@/components/data-states";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { Container, PageHeader, UnderlineTabs } from "@/components/broadcast";

type Tab = "upcoming" | "results" | "ladder";

const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "results", label: "Results" },
  { key: "ladder", label: "Ladder" },
];

/** "Sat 10 Oct, 11:45 am" in the viewer's local time; "TBC" when PlayHQ has no date yet. */
const fmtStart = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date TBC";

const fmtDate = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : "Date TBC";

const isFinished = (m: PlayhqFixture): boolean =>
  m.status === "COMPLETED" || m.status === "ABANDONED";

const OUTCOME_LABEL: Record<NonNullable<PlayhqFixture["outcome"]>, string> = {
  won: "Won",
  lost: "Lost",
  draw: "Draw",
};

function Crest({ fixture }: { fixture: PlayhqFixture }) {
  const url = fixture.opponent?.logoUrl;
  if (!url) {
    return (
      <div
        className="h-9 w-9 rounded-full bg-muted/40 border border-border shrink-0"
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-9 w-9 rounded-full object-contain bg-white border border-border shrink-0"
      data-testid="img-opponent-crest"
    />
  );
}

function FixtureCard({ fixture: m }: { fixture: PlayhqFixture }) {
  const finished = isFinished(m);
  const scoreLine =
    finished && (m.clubScore || m.opponentScore)
      ? `${m.clubScore ?? "–"} v ${m.opponentScore ?? "–"}`
      : null;
  return (
    <div
      className="rounded-lg border bg-card p-4 flex flex-col gap-3"
      data-testid={`fixture-${m.playhqMatchId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {m.grade}
            {m.round ? ` · ${m.round}` : ""}
            {m.matchType ? ` · ${m.matchType}` : ""}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Crest fixture={m} />
            <div className="min-w-0">
              <div className="font-serif text-lg font-bold text-foreground truncate">
                {m.isHome ? "vs" : "@"} {m.opponent?.name ?? "TBC"}
              </div>
              <div className="text-xs text-muted-foreground">{m.isHome ? "Home" : "Away"}</div>
            </div>
          </div>
        </div>
        {m.outcome && (
          <span
            className={`shrink-0 rounded px-2 py-1 text-xs font-bold uppercase tracking-wider ${
              m.outcome === "won"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-foreground"
            }`}
          >
            {OUTCOME_LABEL[m.outcome]}
          </span>
        )}
        {!m.outcome && m.status === "ABANDONED" && (
          <span className="shrink-0 rounded px-2 py-1 text-xs font-bold uppercase tracking-wider bg-muted/40 text-muted-foreground">
            Abandoned
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {finished ? fmtDate(m.startAt) : fmtStart(m.startAt)}
        </span>
        {m.venue && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {m.venue}
            {m.surface && m.surface !== m.venue ? ` · ${m.surface}` : ""}
          </span>
        )}
      </div>

      {finished && (
        <div className="text-sm">
          {scoreLine && <div className="font-semibold text-foreground">{scoreLine}</div>}
          {m.resultText && <div className="text-muted-foreground">{m.resultText}</div>}
          {m.scorecardMatchId != null && (
            <Link
              href={`/matches/${m.scorecardMatchId}`}
              className="inline-block mt-1 text-primary-text underline underline-offset-2 text-sm font-medium"
            >
              View scorecard
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function LadderTable({ name, teams }: { name: string; teams: PlayhqLadderTeam[] }) {
  const showNrr = teams.some((t) => t.netRunRate != null);
  const showQuotient = !showNrr && teams.some((t) => t.quotient != null);
  const fmt = (v: number | null | undefined, digits = 0) => (v == null ? "–" : v.toFixed(digits));
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {name}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2 text-right">P</th>
              <th className="px-3 py-2 text-right">W</th>
              <th className="px-3 py-2 text-right">L</th>
              <th className="px-3 py-2 text-right">T</th>
              <th className="px-3 py-2 text-right">NR</th>
              <th className="px-3 py-2 text-right">Pts</th>
              {showNrr && <th className="px-3 py-2 text-right">NRR</th>}
              {showQuotient && <th className="px-3 py-2 text-right">Quot</th>}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.teamId}
                className={`border-t border-border ${t.isClub ? "bg-primary/10 font-semibold" : ""}`}
                data-testid={t.isClub ? "ladder-row-club" : undefined}
              >
                <td className="px-3 py-2 text-muted-foreground">{t.rank ?? "–"}</td>
                <td className="px-3 py-2 text-foreground">{t.teamName}</td>
                <td className="px-3 py-2 text-right">{fmt(t.played)}</td>
                <td className="px-3 py-2 text-right">{fmt(t.won)}</td>
                <td className="px-3 py-2 text-right">{fmt(t.lost)}</td>
                <td className="px-3 py-2 text-right">{fmt(t.ties)}</td>
                <td className="px-3 py-2 text-right">{fmt(t.noResults)}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(t.points)}</td>
                {showNrr && <td className="px-3 py-2 text-right">{fmt(t.netRunRate, 3)}</td>}
                {showQuotient && <td className="px-3 py-2 text-right">{fmt(t.quotient, 3)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FixturesResults() {
  // "" = the newest season / all grades (the API's defaults).
  const [season, setSeason] = useState("");
  const [grade, setGrade] = useState("");
  const [tab, setTab] = useState<Tab>("upcoming");

  const params = useMemo(
    () => ({ ...(season ? { season } : {}), ...(grade ? { grade } : {}) }),
    [season, grade],
  );
  const { data, isLoading, isError, refetch } = useListFixturesResults(params, {
    query: { queryKey: getListFixturesResultsQueryKey(params) },
  });

  const upcoming = useMemo(() => (data?.matches ?? []).filter((m) => !isFinished(m)), [data]);
  const results = useMemo(
    () =>
      (data?.matches ?? [])
        .filter(isFinished)
        .sort((a, b) => (b.startAt ?? "").localeCompare(a.startAt ?? "")),
    [data],
  );
  const gradeOptions = useMemo(() => sortGradesBySeniority(data?.grades ?? []), [data]);

  // The ladder is per PlayHQ grade; with a grade selected every match shares one.
  const gradeId = grade ? (data?.matches.find((m) => m.grade === grade)?.gradeId ?? "") : "";
  const ladderQ = useGetFixturesResultsLadder(
    { gradeId },
    {
      query: {
        enabled: tab === "ladder" && !!gradeId,
        queryKey: getGetFixturesResultsLadderQueryKey({ gradeId }),
      },
    },
  );

  const seasonLabel = season || data?.latestSeason || "";

  return (
    <Container page className="space-y-6 py-[var(--gap-section)]">
      <PageHeader
        eyebrow="Club"
        title="Fixtures & results"
        subtitle="The club's season as published on PlayCricket, across every senior grade."
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : !data || !data.linked ? (
        <EmptyState
          title="Fixtures aren't linked yet"
          message="This club's PlayCricket page hasn't been connected. Once it is, upcoming fixtures, results and ladders appear here automatically."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Season
              </label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="h-10 rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground min-w-[10rem]"
                data-testid="select-season"
              >
                {data.seasons.map((s) => (
                  <option key={s} value={s === data.latestSeason ? "" : s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Grade
              </label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="h-10 rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground min-w-[10rem]"
                data-testid="select-grade"
              >
                <option value="">All grades</option>
                {gradeOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <UnderlineTabs
            label="Fixtures"
            value={tab}
            onChange={setTab}
            tabs={TABS.map((t) => ({
              value: t.key,
              label:
                t.label +
                (t.key === "upcoming" && upcoming.length ? ` (${upcoming.length})` : "") +
                (t.key === "results" && results.length ? ` (${results.length})` : ""),
            }))}
          />

          {tab === "upcoming" &&
            (upcoming.length === 0 ? (
              <EmptyState
                title="No upcoming fixtures"
                message={`Nothing scheduled${seasonLabel ? ` for ${seasonLabel}` : ""}${grade ? ` in ${grade}` : ""} yet.`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcoming.map((m) => (
                  <FixtureCard key={m.playhqMatchId} fixture={m} />
                ))}
              </div>
            ))}

          {tab === "results" &&
            (results.length === 0 ? (
              <EmptyState
                title="No results yet"
                message={`Results appear here once matches are completed${seasonLabel ? ` in ${seasonLabel}` : ""}.`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((m) => (
                  <FixtureCard key={m.playhqMatchId} fixture={m} />
                ))}
              </div>
            ))}

          {tab === "ladder" &&
            (!gradeId ? (
              <EmptyState
                title="Choose a grade"
                message="Pick a grade above to see its published ladder."
              />
            ) : ladderQ.isError ? (
              <QueryError onRetry={() => ladderQ.refetch()} />
            ) : ladderQ.isLoading ? (
              <ListSkeleton />
            ) : !ladderQ.data || ladderQ.data.ladders.length === 0 ? (
              <EmptyState
                title="No ladder yet"
                message="PlayCricket hasn't published a ladder for this grade yet."
              />
            ) : (
              <div className="space-y-4">
                {ladderQ.data.ladders.map((l) => (
                  <LadderTable key={l.name} name={l.name} teams={l.teams} />
                ))}
              </div>
            ))}
        </>
      )}
    </Container>
  );
}
