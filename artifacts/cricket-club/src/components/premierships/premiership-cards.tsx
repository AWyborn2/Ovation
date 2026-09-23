import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import type { Premiership } from "@workspace/api-client-react";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { useSearchParamState } from "@/lib/use-search-param";
import { CardsSkeleton, FilterChips } from "@/components/broadcast";
import { QueryError } from "@/components/data-states";
import { cn } from "@/lib/utils";

/** Fill-in players (id >= 90000) have no profile page to link to. */
const FILL_IN_MIN_ID = 90000;

const RESULT_VERB = /\s(def\.?|defeated|d\.|beat)\s/i;

/** Split "Halls Head 4/191 def Rockingham 185" around its verb for styling. */
export function splitResult(result: string): [string, string, string] | null {
  const m = RESULT_VERB.exec(result);
  if (!m || m.index === undefined) return null;
  return [result.slice(0, m.index), m[1], result.slice(m.index + m[0].length)];
}

function fmtDate(d: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
  if (!m) return d ?? null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A premiership honour card: year, grade pill, venue · date, the result line
 * (verb de-emphasised), the full named side (captain marked, players linked to
 * their profiles) and man of the match. Links to the match when one is recorded.
 */
export function PremiershipCard({ p }: { p: Premiership }) {
  const [, navigate] = useLocation();
  const captain = p.players.find((pl) => pl.isCaptain)?.name ?? null;
  // The named side in batting order (unordered names keep their listed order).
  const team = useMemo(
    () =>
      p.players
        .map((pl, i) => ({ pl, i }))
        .sort(
          (a, b) =>
            (a.pl.battingOrder ?? Number.MAX_SAFE_INTEGER) -
              (b.pl.battingOrder ?? Number.MAX_SAFE_INTEGER) || a.i - b.i,
        )
        .map(({ pl }) => pl),
    [p.players],
  );
  const parts = p.result ? splitResult(p.result) : null;
  const clickable = p.matchId != null;
  const meta = [p.venue, fmtDate(p.matchDate)].filter(Boolean).join(" · ");
  return (
    <article
      role={clickable ? "link" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => navigate(`/matches/${p.matchId}`) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter") navigate(`/matches/${p.matchId}`);
            }
          : undefined
      }
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4 transition-[transform,border-color,box-shadow] duration-200",
        clickable &&
          "cursor-pointer hover:-translate-y-[3px] hover:border-primary hover:shadow-[var(--shadow-pop)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
      data-testid="premiership-card"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-serif text-[40px] font-bold leading-none text-primary-text tabular-nums">
          {p.year}
        </span>
        <span className="inline-flex h-6 items-center rounded-full border px-2.5 text-[11.5px] font-bold">
          {p.grade}
        </span>
      </div>
      {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      {p.result && (
        <div className="font-semibold leading-snug">
          {parts ? (
            <>
              {parts[0]} <span className="font-normal text-muted-foreground">{parts[1]}</span>{" "}
              {parts[2]}
            </>
          ) : (
            p.result
          )}
        </div>
      )}
      {team.length > 0 && (
        <div className="border-t pt-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Team
          </div>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" data-testid="premiership-team">
            {team.map((pl) => (
              <li key={pl.id} className="leading-snug [overflow-wrap:anywhere]">
                {pl.playerId != null && pl.playerId < FILL_IN_MIN_ID ? (
                  <Link
                    href={`/players/${pl.playerId}`}
                    // Don't also trigger the card's own match navigation.
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="hover:text-primary-text hover:underline"
                  >
                    {pl.name}
                  </Link>
                ) : (
                  pl.name
                )}
                {pl.isCaptain && <span className="font-semibold text-primary-text"> (c)</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {(p.mom || (captain && team.length === 0)) && (
        <dl className="mt-auto grid grid-cols-2 gap-2 border-t pt-2 text-xs">
          {captain && team.length === 0 && (
            <div>
              <dt className="text-muted-foreground">Captain</dt>
              <dd className="font-semibold">{captain}</dd>
            </div>
          )}
          {p.mom && (
            <div>
              <dt className="text-muted-foreground">Man of the match</dt>
              <dd className="font-semibold">{p.mom}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}

/**
 * Premiership card grid with URL-synced grade chips (`?grade=`) and a count.
 */
export function PremiershipGrid({
  premierships,
  isLoading,
  isError,
  onRetry,
  paramName = "grade",
}: {
  premierships: Premiership[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  paramName?: string;
}) {
  const [grade, setGrade] = useSearchParamState(paramName, "all");
  const all = useMemo(
    () => [...(premierships ?? [])].sort((a, b) => b.year - a.year),
    [premierships],
  );
  const grades = useMemo(() => sortGradesBySeniority(new Set(all.map((p) => p.grade))), [all]);
  const shown = grade === "all" ? all : all.filter((p) => p.grade === grade);

  if (isError) return <QueryError onRetry={onRetry} />;
  if (isLoading) return <CardsSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          label="Grade"
          value={grade}
          onChange={setGrade}
          options={[{ value: "all", label: "All" }, ...grades.map((g) => ({ value: g, label: g }))]}
        />
        <span className="text-sm text-muted-foreground" data-testid="premiership-count">
          {shown.length} premiership{shown.length === 1 ? "" : "s"} shown
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No premierships recorded{grade === "all" ? " yet" : ` for ${grade}`}.
        </div>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))]">
          {shown.map((p) => (
            <PremiershipCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
