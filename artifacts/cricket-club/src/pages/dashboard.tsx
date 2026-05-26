import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Activity, Target } from "lucide-react";
import { Link } from "wouter";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard();

  if (isLoading) {
    return <div className="space-y-6 animate-pulse">
      <div className="h-64 bg-card rounded-lg border-2 border-border"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-card rounded-lg"></div>)}
      </div>
    </div>;
  }

  if (!dashboard) return null;

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <Card className="overflow-hidden border-2 border-primary/20 relative isolate shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-card/90 to-card/40 z-10" />
        <CardContent className="p-0 relative z-20">
          <div className="flex flex-col md:flex-row items-center">
            <div className="p-8 md:p-12 flex-1 space-y-6">
              <h1 className="text-4xl md:text-6xl font-serif font-bold text-primary uppercase tracking-tight leading-none drop-shadow-md">
                Halls Head<br />Cricket Club
              </h1>
              <div className="inline-block bg-primary text-primary-foreground font-serif font-bold px-4 py-1 tracking-widest uppercase">
                EST 1991
              </div>
              <p className="text-xl text-foreground/90 max-w-lg font-sans">
                Statistics, records, and honours from 1991 to today.
              </p>
              <div className="pt-4">
                <Link href="/players" className="inline-flex items-center justify-center rounded-md text-sm font-bold uppercase tracking-wider ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 shadow-md">
                  View Players
                </Link>
              </div>
            </div>
            <div className="p-8 hidden md:block">
              <img src={logoUrl} alt="HHCC Logo" className="w-64 h-64 object-contain drop-shadow-2xl" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-t-4 border-t-primary shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-serif uppercase tracking-wider text-muted-foreground">Total Players</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono text-primary">{dashboard.totalPlayers.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-primary shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-serif uppercase tracking-wider text-muted-foreground">Total Games</CardTitle>
            <Activity className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono text-primary">{dashboard.totalGames.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-primary shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-serif uppercase tracking-wider text-muted-foreground">Runs Scored</CardTitle>
            <Target className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono text-primary">{dashboard.totalRuns.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-primary shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium font-serif uppercase tracking-wider text-muted-foreground">Wickets Taken</CardTitle>
            <Trophy className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono text-primary">{dashboard.totalWickets.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-2 shadow-md">
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="font-serif uppercase tracking-wider">Grade Summaries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="text-left font-serif uppercase tracking-wider text-primary p-4">Grade</th>
                    <th className="text-right font-serif uppercase tracking-wider text-primary p-4">Players</th>
                    <th className="text-right font-serif uppercase tracking-wider text-primary p-4">Games</th>
                    <th className="text-right font-serif uppercase tracking-wider text-primary p-4">Runs</th>
                    <th className="text-right font-serif uppercase tracking-wider text-primary p-4">Wickets</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.gradeSummaries?.map((gs, i) => (
                    <tr key={gs.grade} className={`border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${i % 2 === 0 ? 'bg-card/50' : ''}`}>
                      <td className="p-4">
                        <Link href={`/grades/${encodeURIComponent(gs.grade)}`} className="font-bold text-foreground hover:text-primary transition-colors uppercase tracking-wide">
                          {gs.grade}
                        </Link>
                      </td>
                      <td className="text-right font-mono p-4 text-foreground/80">{gs.players}</td>
                      <td className="text-right font-mono p-4 text-foreground/80">{gs.games}</td>
                      <td className="text-right font-mono p-4 text-foreground/80">{gs.runs}</td>
                      <td className="text-right font-mono p-4 text-foreground/80">{gs.wickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-secondary to-card border-primary/30 shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
            <CardHeader>
              <CardTitle className="font-serif uppercase tracking-wider text-primary flex items-center gap-2">
                <Target className="h-5 w-5" /> Top Run Scorer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/players/${dashboard.topRunScorer.id}`} className="block group/link">
                <div className="text-3xl font-serif font-bold text-foreground group-hover/link:text-primary transition-colors uppercase leading-tight">
                  {dashboard.topRunScorer.givenName}<br />{dashboard.topRunScorer.surname}
                </div>
                <div className="text-2xl font-mono mt-4 text-primary bg-background/50 inline-block px-3 py-1 rounded border border-primary/20">
                  {dashboard.topRunScorer.totalRuns?.toLocaleString()} <span className="text-sm font-sans text-muted-foreground uppercase tracking-widest">runs</span>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-secondary to-card border-primary/30 shadow-lg relative overflow-hidden group">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/10 rounded-full -mr-16 -mb-16 blur-2xl group-hover:bg-primary/20 transition-all duration-500"></div>
            <CardHeader>
              <CardTitle className="font-serif uppercase tracking-wider text-primary flex items-center gap-2">
                <Trophy className="h-5 w-5" /> Top Wicket Taker
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/players/${dashboard.topWicketTaker.id}`} className="block group/link">
                <div className="text-3xl font-serif font-bold text-foreground group-hover/link:text-primary transition-colors uppercase leading-tight">
                  {dashboard.topWicketTaker.givenName}<br />{dashboard.topWicketTaker.surname}
                </div>
                <div className="text-2xl font-mono mt-4 text-primary bg-background/50 inline-block px-3 py-1 rounded border border-primary/20">
                  {dashboard.topWicketTaker.totalWickets?.toLocaleString()} <span className="text-sm font-sans text-muted-foreground uppercase tracking-widest">wkts</span>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
