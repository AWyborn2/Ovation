import { useMemo } from "react";
import { useListGrades, useListPremierships } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Trophy } from "lucide-react";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { CardGridSkeleton, QueryError, EmptyState } from "@/components/data-states";

export default function Grades() {
  const { data, isLoading, isError, refetch } = useListGrades();
  const { data: premierships } = useListPremierships();

  const premsByGrade = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of premierships ?? []) {
      map.set(p.grade, (map.get(p.grade) ?? 0) + 1);
    }
    return map;
  }, [premierships]);

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isLoading) return <CardGridSkeleton />;

  const grades = (data ?? []).filter((g) => g.grade !== "CLUB TOTAL");
  const order = sortGradesBySeniority(grades.map((g) => g.grade));
  const ordered = order
    .map((name) => grades.find((g) => g.grade === name))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Grades</h1>
        <p className="text-muted-foreground mt-1">Overview of performance across all grades.</p>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          title="No grades yet"
          message="Grade summaries appear here once imports are committed."
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ordered.map((grade) => (
          <Link key={grade.grade} href={`/grades/${encodeURIComponent(grade.grade)}`}>
            <Card className="hover:border-primary transition-colors cursor-pointer group">
              <CardHeader className="flex flex-row items-center gap-4">
                <GradeBadge grade={grade.grade} size="lg" />
                <CardTitle className="group-hover:text-primary transition-colors flex-1">{grade.grade}</CardTitle>
                <div
                  className="flex items-center gap-1.5 text-primary font-bold"
                  title={`${premsByGrade.get(grade.grade) ?? 0} premierships`}
                >
                  <Trophy className="h-5 w-5" />
                  <span className="font-mono text-lg leading-none">
                    {premsByGrade.get(grade.grade) ?? 0}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Players</div>
                    <div className="text-xl font-mono font-medium">{grade.players}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Games</div>
                    <div className="text-xl font-mono font-medium">{grade.games}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Runs</div>
                    <div className="text-xl font-mono font-medium">{grade.runs}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Wickets</div>
                    <div className="text-xl font-mono font-medium">{grade.wickets}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}
