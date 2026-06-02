import { useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  useListCaps,
  getListCapsQueryKey,
} from "@workspace/api-client-react";
import { GradeBadge } from "@/components/grade-badge";
import { ShareButton } from "@/components/share-card-modal";

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
  const { data: stats, isLoading } = useGetGradeLeaderboard(decodedGrade, {
    query: { enabled: !!decodedGrade && isValid, queryKey: getGetGradeLeaderboardQueryKey(decodedGrade) },
  });
  const { data: caps } = useListCaps({ query: { enabled: isAGrade, queryKey: getListCapsQueryKey() } });

  const unstattedCaps = useMemo(() => {
    if (!isAGrade || !caps) return [];
    const statsPlayerIds = new Set((stats ?? []).map((s) => s.playerId));
    return caps
      .filter((c) => c.playerId == null || !statsPlayerIds.has(c.playerId))
      .map((c) => {
        const { givenName, surname } = splitCapName(c.name);
        return { id: c.id, capNumber: c.capNumber, givenName, surname, playerId: c.playerId };
      })
      .sort((a, b) =>
        a.surname.localeCompare(b.surname) || a.givenName.localeCompare(b.givenName),
      );
  }, [isAGrade, caps, stats]);

  if (!isValid) return <div className="p-8 text-center text-muted-foreground">Redirecting…</div>;
  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <GradeBadge grade={decodedGrade} size="lg" />
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">{decodedGrade}</h1>
          <p className="text-muted-foreground mt-1">Leaderboard and player statistics.</p>
        </div>
      </div>

      {isAGrade && (
        <div className="bg-muted/40 border-l-4 border-primary/60 rounded-md p-4 text-sm leading-snug">
          <p className="text-foreground/90">
            <span className="font-semibold">Note:</span> Prior to MyCricket and PlayHQ, the club did
            not record stats for players who played fewer than 10 games. Capped players without
            recorded stats below are listed for completeness — they played between 1 and 9 A Grade
            games for the club.
          </p>
        </div>
      )}

      <div className="bg-card border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-4">Player</th>
              <th className="text-right font-medium p-4">Mat</th>
              <th className="text-right font-medium p-4">Inn</th>
              <th className="text-right font-medium p-4">NO</th>
              <th className="text-right font-medium p-4">Runs</th>
              <th className="text-right font-medium p-4">HS</th>
              <th className="text-right font-medium p-4">Avg</th>
              <th className="text-right font-medium p-4">100s</th>
              <th className="text-right font-medium p-4">50s</th>
              <th className="text-right font-medium p-4">Wkts</th>
              <th className="text-right font-medium p-4">Runs</th>
              <th className="text-right font-medium p-4">Avg</th>
              <th className="text-right font-medium p-4">BB</th>
              <th className="text-right font-medium p-4">5WI</th>
              <th className="text-right font-medium p-4">Share</th>
            </tr>
          </thead>
          <tbody>
            {stats?.map(stat => (
              <tr key={stat.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="p-4">
                  <Link href={`/players/${stat.playerId}`} className="font-semibold text-foreground hover:text-primary hover:underline">
                    {stat.surname}, {stat.givenName}
                  </Link>
                </td>
                <td className="p-4 text-right font-mono">{stat.games || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.innings || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.notOuts || "-"}</td>
                <td className="p-4 text-right font-mono font-bold">{stat.runs || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.highScore || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.batAvg?.toFixed(2) || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.hundreds || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.fifties || "-"}</td>
                <td className="p-4 text-right font-mono font-bold">{stat.wickets || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.runsConceded || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.bowlAvg?.toFixed(2) || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.bestBowling || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.fiveWickets || "-"}</td>
                <td className="p-4 text-right">
                  <ShareButton
                    input={{
                      kind: "gradeLeader",
                      grade: decodedGrade,
                      category: (stat.wickets ?? 0) >= (stat.runs ?? 0) / 10 ? "Wickets" : "Runs",
                      playerName: `${stat.givenName} ${stat.surname}`.trim(),
                      value: (stat.wickets ?? 0) >= (stat.runs ?? 0) / 10 ? stat.wickets ?? 0 : stat.runs ?? 0,
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
                  className="font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {c.surname ? `${c.surname}, ${c.givenName}` : c.givenName}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">
                  {c.surname ? `${c.surname}, ${c.givenName}` : c.givenName}
                </span>
              );
              return (
                <tr key={`cap-${c.id}`} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-4">{nameNode}</td>
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
    </div>
  );
}
