import { useListGrades } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";

export default function Grades() {
  const { data, isLoading } = useListGrades();

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ordered.map((grade) => (
          <Link key={grade.grade} href={`/grades/${encodeURIComponent(grade.grade)}`}>
            <Card className="hover:border-primary transition-colors cursor-pointer group">
              <CardHeader className="flex flex-row items-center gap-4">
                <GradeBadge grade={grade.grade} size="lg" />
                <CardTitle className="group-hover:text-primary transition-colors">{grade.grade}</CardTitle>
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
    </div>
  );
}
