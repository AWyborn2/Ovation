import { useMemo } from "react";
import { Link } from "wouter";
import { useListGrades, useListPremierships } from "@workspace/api-client-react";
import { Trophy } from "lucide-react";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { QueryError, EmptyState } from "@/components/data-states";
import {
  CardsSkeleton,
  Container,
  PageHeader,
  PageStack,
  formatStat,
} from "@/components/broadcast";

export default function Grades() {
  const { data, isLoading, isError, refetch } = useListGrades();
  const { data: premierships } = useListPremierships();

  const premsByGrade = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of premierships ?? []) map.set(p.grade, (map.get(p.grade) ?? 0) + 1);
    return map;
  }, [premierships]);

  const grades = (data ?? []).filter((g) => g.grade !== "CLUB TOTAL");
  const ordered = sortGradesBySeniority(grades.map((g) => g.grade))
    .map((name) => grades.find((g) => g.grade === name))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  return (
    <Container page className="py-[var(--gap-section)]">
      <PageStack>
        <PageHeader
          eyebrow="Stats"
          title="Grades"
          subtitle="Leaderboards and totals for every grade the club has fielded."
        />
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <CardsSkeleton />
        ) : ordered.length === 0 ? (
          <EmptyState
            title="No grades yet"
            message="Grade summaries appear here once imports are committed."
          />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
            {ordered.map((g) => {
              const prems = premsByGrade.get(g.grade) ?? 0;
              return (
                <Link
                  key={g.grade}
                  href={`/grades/${encodeURIComponent(g.grade)}`}
                  className="flex flex-col gap-4 rounded-lg border bg-card p-5 bc-lift"
                  data-testid="grade-tile"
                >
                  <div className="flex items-center gap-3">
                    <GradeBadge grade={g.grade} size="md" />
                    <h2 className="flex-1 text-[22px] leading-none">{g.grade}</h2>
                    <span
                      className="inline-flex items-center gap-1 font-serif text-lg font-bold text-primary-text tabular-nums"
                      title={`${prems} premierships`}
                    >
                      <Trophy className="h-4 w-4" aria-hidden />
                      {prems}
                    </span>
                  </div>
                  <dl className="grid grid-cols-4 gap-2">
                    {(
                      [
                        ["Players", g.players],
                        ["Games", g.games],
                        ["Runs", g.runs],
                        ["Wkts", g.wickets],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="font-serif text-xl font-bold tabular-nums">
                          {formatStat(value ?? 0)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              );
            })}
          </div>
        )}
      </PageStack>
    </Container>
  );
}
