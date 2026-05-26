import { useGetRecords } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Award } from "lucide-react";

export default function Records() {
  const { data: records, isLoading } = useGetRecords();

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!records) return null;

  const RecordCard = ({ title, value, stat }: { title: string, value: string | number, stat: any }) => (
    <Card className="hover:border-primary transition-colors group">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-serif font-bold text-primary mb-1 group-hover:scale-105 transition-transform origin-left">{value}</div>
        <Link href={`/players/${stat.playerId}`} className="text-sm font-medium hover:underline text-foreground">
          {stat.givenName} {stat.surname}
        </Link>
        <div className="text-xs text-muted-foreground mt-1">{stat.grade} Grade</div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Award className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-serif font-bold">Club Records</h1>
          <p className="text-muted-foreground mt-1">All-time leading performances across all grades.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <RecordCard title="Most Games" value={records.mostGames.games || 0} stat={records.mostGames} />
        <RecordCard title="Most Runs" value={records.mostRuns.runs || 0} stat={records.mostRuns} />
        <RecordCard title="Highest Score" value={records.highestScore.highScore || "-"} stat={records.highestScore} />
        <RecordCard title="Most Fifties" value={records.mostFifties.fifties || 0} stat={records.mostFifties} />
        <RecordCard title="Most Hundreds" value={records.mostHundreds.hundreds || 0} stat={records.mostHundreds} />
        <RecordCard title="Most Wickets" value={records.mostWickets.wickets || 0} stat={records.mostWickets} />
        <RecordCard title="Best Bowling" value={records.bestBowling.bestBowling || "-"} stat={records.bestBowling} />
        <RecordCard title="Most Catches" value={records.mostCatches.catches || 0} stat={records.mostCatches} />
      </div>
    </div>
  );
}
