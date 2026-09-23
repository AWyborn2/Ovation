import { useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  useListCaps,
  getListCapsQueryKey,
  useListClubRoles,
} from "@workspace/api-client-react";
import { GradeBadge } from "@/components/grade-badge";
import { ShareButton } from "@/components/share-button";
import { QueryError } from "@/components/data-states";
import { Container, Eyebrow, RowsSkeleton } from "@/components/broadcast";

const STAT_COLUMN_COUNT = 13;

function splitCapName(full: string): { givenName: string; surname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { givenName: full.trim(), surname: "" };
  const surname = parts[parts.length - 1];
  const givenName = parts.slice(0, -1).join(" ");
  return { givenName, surname };
}

export default function GradeLeaderboard() {
  const { grade } = useParams<{ grade: string }>();
  const decodedGrade = decodeURIComponent(grade);
  const [, setLocation] = useLocation();

  // CLUB TOTAL is an aggregate row, not a real grade — redirect away.
  useEffect(() => {
    if (decodedGrade === "CLUB TOTAL") {
      setLocation("/grades");
    }
  }, [decodedGrade, setLocation]);

  const isValid = decodedGrade !== "CLUB TOTAL";
  const isAGrade = decodedGrade === "A Grade";
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useGetGradeLeaderboard(decodedGrade, undefined, {
    query: {
      enabled: !!decodedGrade && isValid,
      queryKey: getGetGradeLeaderboardQueryKey(decodedGrade),
    },
  });
  const { data: caps } = useListCaps({
    query: { enabled: isAGrade, queryKey: getListCapsQueryKey() },
  });
  const { data: clubRoles } = useListClubRoles();

  const captainHistory = useMemo(() => {
    return (clubRoles ?? [])
      .filter((r) => r.role === "Grade Captain" && r.grade === decodedGrade)
      .sort((a, b) => b.season - a.season || a.displayOrder - b.displayOrder);
  }, [clubRoles, decodedGrade]);

  const unstattedCaps = useMemo(() => {
    if (!isAGrade || !caps) return [];
    const statsPlayerIds = new Set((stats ?? []).map((s) => s.playerId));
    return caps
      .filter((c) => c.playerId == null || !statsPlayerIds.has(c.playerId))
      .map((c) => {
        const { givenName, surname } = splitCapName(c.name);
        return { id: c.id, capNumber: c.capNumber, givenName, surname, playerId: c.playerId };
      })
      .sort((a, b) => a.surname.localeCompare(b.surname) || a.givenName.localeCompare(b.givenName));
  }, [isAGrade, caps, stats]);

  if (!isValid) return <div className="p-8 text-center text-muted-foreground">Redirecting…</div>;
  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isLoading) return <RowsSkeleton rows={10} />;

  return (
    <Container page className="space-y-6 py-[var(--gap-section)]">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
        <Link href="/grades" className="hover:text-foreground">
          Grades
        </Link>
        <span className="mx-1.5" aria-hidden>
          /
        </span>
        <span className="text-foreground">{decodedGrade}</span>
      </nav>
      <div className="flex items-end gap-4">
        <GradeBadge grade={decodedGrade} size="lg" />
        <div className="space-y-2">
          <Eyebrow accent>Leaderboard</Eyebrow>
          <h1 className="text-[clamp(38px,4.6vw,64px)] leading-none">{decodedGrade}</h1>
          <p className="text-muted-foreground">Career statistics for everyone who has played.</p>
        </div>
      </div>

      {isAGrade && (
        <div className="rounded-lg border border-l-4 border-l-primary bg-card p-4 text-sm leading-snug">
          <p className="text-foreground/90">
            <span className="font-semibold">Note:</span> Prior to MyCricket and PlayHQ, the club did
            not record stats for players who played fewer than 10 games. Capped players without
            recorded stats below are listed for completeness — they played between 1 and 9 A Grade
            games for the club.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] text-sm bc-sticky-first">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="text-left font-semibold px-3 h-10">Player</th>
              <th className="text-right font-semibold px-3 h-10">Mat</th>
              <th className="text-right font-semibold px-3 h-10">Inn</th>
              <th className="text-right font-semibold px-3 h-10">NO</th>
              <th className="text-right font-semibold px-3 h-10">Runs</th>
              <th className="text-right font-semibold px-3 h-10">HS</th>
              <th className="text-right font-semibold px-3 h-10">Avg</th>
              <th className="text-right font-semibold px-3 h-10">100s</th>
              <th className="text-right font-semibold px-3 h-10">50s</th>
              <th className="text-right font-semibold px-3 h-10">Wkts</th>
              <th className="text-right font-semibold px-3 h-10">Runs</th>
              <th className="text-right font-semibold px-3 h-10">Avg</th>
              <th className="text-right font-semibold px-3 h-10">BB</th>
              <th className="text-right font-semibold px-3 h-10">5WI</th>
              <th className="text-right font-semibold px-3 h-10">Share</th>
            </tr>
          </thead>
          <tbody>
            {stats?.map((stat) => (
              <tr key={stat.id} className="border-t transition-colors hover:bg-muted">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/players/${stat.playerId}`}
                    className="font-semibold text-foreground hover:text-primary-text hover:underline"
                  >
                    {stat.surname}, {stat.givenName}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.games || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.innings || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.notOuts || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                  {stat.runs || "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.highScore || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {stat.batAvg?.toFixed(2) || "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.hundreds || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.fifties || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                  {stat.wickets || "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.runsConceded || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {stat.bowlAvg?.toFixed(2) || "-"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.bestBowling || "-"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{stat.fiveWickets || "-"}</td>
                <td className="p-4 text-right">
                  <ShareButton
                    input={{
                      kind: "gradeLeader",
                      grade: decodedGrade,
                      category: (stat.wickets ?? 0) >= (stat.runs ?? 0) / 10 ? "Wickets" : "Runs",
                      playerName: `${stat.givenName} ${stat.surname}`.trim(),
                      value:
                        (stat.wickets ?? 0) >= (stat.runs ?? 0) / 10
                          ? (stat.wickets ?? 0)
                          : (stat.runs ?? 0),
                    }}
                    appPath={`/players/${stat.playerId}`}
                    playerId={stat.playerId}
                    variant="ghost"
                    label=""
                  />
                </td>
              </tr>
            ))}
            {unstattedCaps.map((c) => {
              const nameNode = c.playerId ? (
                <Link
                  href={`/players/${c.playerId}`}
                  className="font-semibold text-foreground hover:text-primary-text hover:underline"
                >
                  {c.surname ? `${c.surname}, ${c.givenName}` : c.givenName}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">
                  {c.surname ? `${c.surname}, ${c.givenName}` : c.givenName}
                </span>
              );
              return (
                <tr key={`cap-${c.id}`} className="border-t transition-colors hover:bg-muted">
                  <td className="px-3 py-2.5">{nameNode}</td>
                  <td colSpan={STAT_COLUMN_COUNT + 1} className="p-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                      No A Grade stats available
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {captainHistory.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 md:px-6 py-3 font-serif text-[22px] font-bold uppercase leading-none">
            {decodedGrade} Captains
          </div>
          <div className="p-4 md:p-6">
            <div className="divide-y divide-border/60">
              {captainHistory.map((c) => (
                <div key={c.id} className="flex items-baseline gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className="tabular-nums font-bold text-primary-text w-20 shrink-0">
                    {formatSeasonRange(c.season)}
                  </span>
                  <span>
                    {c.playerId != null || c.nonPlayerId != null ? (
                      <Link
                        href={
                          c.playerId != null ? `/players/${c.playerId}` : `/people/${c.nonPlayerId}`
                        }
                        className="font-semibold text-primary-text hover:underline"
                      >
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground">{c.name}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}

function formatSeasonRange(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}
