import type { GradeDistribution, PlayerMatchLine } from "@workspace/api-client-react";
import { ChartCard, HBarList } from "@/components/stats-charts";
import { scoreDistribution, wicketDistribution } from "@/lib/stats-analytics";
import type { Discipline } from "@/lib/use-stats-view";

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * The club's 50→100 conversion among a grade's qualifiers: hundreds ÷ scores
 * of 50+. Null when no qualifier has passed 50.
 */
export function clubConversion(dist: GradeDistribution | undefined): number | null {
  if (!dist) return null;
  let fifties = 0;
  let hundreds = 0;
  for (const p of dist.players) {
    fifties += p.batting?.fifties ?? 0;
    hundreds += p.batting?.hundreds ?? 0;
  }
  return fifties + hundreds > 0 ? hundreds / (fifties + hundreds) : null;
}

/**
 * Score / wickets-per-innings histogram (five buckets that sum to the range's
 * innings) with the conversion callout: 50→100 for batting (against the club's
 * rate in the same grade when the distribution is loaded), 3+ wicket innings
 * for bowling.
 */
export function DistributionCard({
  matches,
  discipline,
  loading,
  coverageNote,
  gradeDistribution,
}: {
  matches: ReadonlyArray<PlayerMatchLine>;
  discipline: Discipline;
  loading: boolean;
  coverageNote: string | null;
  gradeDistribution?: GradeDistribution;
}) {
  const bowl = discipline === "bowl";
  const bat = bowl ? null : scoreDistribution(matches);
  const bw = bowl ? wicketDistribution(matches) : null;
  const result = bat ?? bw!;
  const buckets = bat?.ok ? bat.data.buckets : bw?.ok ? bw.data.buckets : [];
  const total = bat?.ok ? bat.data.innings : bw?.ok ? bw.data.innings : 0;
  const club = bowl ? null : clubConversion(gradeDistribution);

  return (
    <ChartCard
      eyebrow={`${total ? `${total} ` : ""}${bowl ? "bowling innings" : "innings"}`}
      title={bowl ? "Wickets per innings" : "Scores"}
      note={coverageNote ?? undefined}
      loading={loading}
      empty={!result.ok}
      emptyReason={result.ok ? undefined : result.reason}
      table={{
        columns: ["Bucket", "Innings", "Share"],
        rows: buckets.map((b) => [b.label, b.count, pct(b.share)]),
      }}
    >
      <HBarList
        label={bowl ? "Wickets per innings" : "Score distribution"}
        emphasis="none"
        items={buckets.map((b) => ({
          id: b.key,
          label: b.label,
          value: b.count,
          sub: pct(b.share),
          tip: `${b.label}: ${b.count} of ${total} innings (${pct(b.share)})`,
        }))}
      />
      {bat?.ok && (
        <p
          className="rounded-lg bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground"
          data-testid="conversion"
        >
          {bat.data.conversion == null ? (
            "No score of 50 or more in this range yet."
          ) : (
            <>
              <strong>{pct(bat.data.conversion)} conversion</strong> from 50 to 100 (
              {bat.data.hundreds} of {bat.data.fifties + bat.data.hundreds}).
              {club != null && gradeDistribution && (
                <>
                  {" "}
                  The club {gradeDistribution.grade} rate is {pct(club)}.
                </>
              )}
            </>
          )}
        </p>
      )}
      {bw?.ok && (
        <p
          className="rounded-lg bg-primary/15 px-3.5 py-2.5 text-[13px] text-foreground"
          data-testid="conversion"
        >
          <strong>{bw.data.threePlus}</strong> innings of 3+ wickets ({pct(bw.data.threePlusRate)}{" "}
          of bowling innings).
        </p>
      )}
    </ChartCard>
  );
}
