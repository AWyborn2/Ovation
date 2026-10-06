import { useMemo } from "react";
import { useListFixtures } from "@workspace/api-client-react";
import { useClubGrades } from "@/hooks/use-club-grades";
import { gradeMatchKey } from "@/lib/share-card/sponsor-limit";

/**
 * Sponsor per team: the grades whose team-list cards carry this sponsor as
 * their one logo. Offers the club's grades and every grade on its fixtures
 * (the labels team lists carry), once each; an empty selection = no team.
 */
export function TeamSponsorPicker({
  value,
  onChange,
}: {
  value: string[] | null | undefined;
  onChange: (next: string[]) => void;
}) {
  const { grades } = useClubGrades();
  const fixturesQ = useListFixtures();
  const options = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const g of [...(value ?? []), ...grades, ...(fixturesQ.data ?? []).map((f) => f.grade)]) {
      const key = gradeMatchKey(g);
      if (key && !byKey.has(key)) byKey.set(key, g);
    }
    return [...byKey.values()];
  }, [value, grades, fixturesQ.data]);

  const selected = new Set((value ?? []).map(gradeMatchKey));
  const toggle = (grade: string) => {
    const key = gradeMatchKey(grade);
    const next = selected.has(key)
      ? (value ?? []).filter((g) => gradeMatchKey(g) !== key)
      : [...(value ?? []), grade];
    onChange(next);
  };
  const chip = (active: boolean) =>
    `text-xs px-2 py-0.5 rounded-full border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
    }`;

  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No grades yet. Add fixtures first.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((g) => (
        <button
          key={g}
          type="button"
          aria-pressed={selected.has(gradeMatchKey(g))}
          className={chip(selected.has(gradeMatchKey(g)))}
          onClick={() => toggle(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );
}
