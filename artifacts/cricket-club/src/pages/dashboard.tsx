import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Activity, Target } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard();

  if (isLoading) {
    return <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-lg"></div>)}
      </div>
    </div>;
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Club Overview</h1>
        <p className="text-muted-foreground mt-1">Season statistics and historic records for Halls Head Cricket Club.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{dashboard.totalPlayers.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Games</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{dashboard.totalGames.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Runs Scored</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{dashboard.totalRuns.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Wickets Taken</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{dashboard.totalWickets.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Grade Summaries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium text-muted-foreground pb-3 pl-2">Grade</th>
                    <th className="text-right font-medium text-muted-foreground pb-3 px-2">Players</th>
                    <th className="text-right font-medium text-muted-foreground pb-3 px-2">Games</th>
                    <th className="text-right font-medium text-muted-foreground pb-3 px-2">Runs</th>
                    <th className="text-right font-medium text-muted-foreground pb-3 pr-2">Wickets</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.gradeSummaries?.map((gs) => (
                    <tr key={gs.grade} className="border-b last:border-0 hover:bg-muted/50 transition-colors group">
                      <td className="py-3 pl-2">
                        <Link href={`/grades/${encodeURIComponent(gs.grade)}`} className="font-semibold text-primary hover:underline">
                          {gs.grade}
                        </Link>
                      </td>
                      <td className="text-right font-mono py-3 px-2">{gs.players}</td>
                      <td className="text-right font-mono py-3 px-2">{gs.games}</td>
                      <td className="text-right font-mono py-3 px-2">{gs.runs}</td>
                      <td className="text-right font-mono py-3 pr-2">{gs.wickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader>
              <CardTitle className="text-primary-foreground">Top Run Scorer</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/players/${dashboard.topRunScorer.id}`} className="block hover:opacity-80 transition-opacity">
                <div className="text-2xl font-serif font-bold">{dashboard.topRunScorer.givenName} {dashboard.topRunScorer.surname}</div>
                <div className="text-xl font-mono mt-2">{dashboard.topRunScorer.totalRuns?.toLocaleString()} runs</div>
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-accent text-accent-foreground">
            <CardHeader>
              <CardTitle className="text-accent-foreground">Top Wicket Taker</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/players/${dashboard.topWicketTaker.id}`} className="block hover:opacity-80 transition-opacity">
                <div className="text-2xl font-serif font-bold">{dashboard.topWicketTaker.givenName} {dashboard.topWicketTaker.surname}</div>
                <div className="text-xl font-mono mt-2">{dashboard.topWicketTaker.totalWickets?.toLocaleString()} wickets</div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
