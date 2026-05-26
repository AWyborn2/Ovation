import { useParams, Link } from "wouter";
import { useGetGradeLeaderboard, getGetGradeLeaderboardQueryKey } from "@workspace/api-client-react";

export default function GradeLeaderboard() {
  const { grade } = useParams<{ grade: string }>();
  const decodedGrade = decodeURIComponent(grade);
  const { data: stats, isLoading } = useGetGradeLeaderboard(decodedGrade, { query: { enabled: !!decodedGrade, queryKey: getGetGradeLeaderboardQueryKey(decodedGrade) } });

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">{decodedGrade} Grade</h1>
        <p className="text-muted-foreground mt-1">Leaderboard and player statistics.</p>
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
