import { useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetGradeLeaderboard, getGetGradeLeaderboardQueryKey } from "@workspace/api-client-react";
import { GradeBadge } from "@/components/grade-badge";

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
  const { data: stats, isLoading } = useGetGradeLeaderboard(decodedGrade, {
    query: { enabled: !!decodedGrade && isValid, queryKey: getGetGradeLeaderboardQueryKey(decodedGrade) },
  });

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
            </tr>
          </thead>
          <tbody>
            {stats?.map(stat => (
              <tr key={stat.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="p-4">
                  <Link href={`/players/${stat.playerId}`} className="font-semibold text-primary hover:underline">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
