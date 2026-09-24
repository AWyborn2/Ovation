import { useMemo } from "react";
import type { RecordProgressionPoint } from "@workspace/api-client-react";
import { SegmentedControl } from "@/components/broadcast";
import { ChartCard, StepLine, type StepPoint } from "@/components/stats-charts";
import {
  fullName,
  progressionSeasonLabel,
  progressionValue,
  shortName,
  type ProgressionKind,
} from "./model";

const KINDS: Array<{ value: ProgressionKind; label: string }> = [
  { value: "highScore", label: "Highest score" },
  { value: "bestBowling", label: "Best bowling" },
];

const TITLE: Record<ProgressionKind, string> = {
  highScore: "Highest individual score",
  bestBowling: "Best bowling figures",
};

/**
 * Record progression: a step line of every time the record was broken, oldest
 * first, ending at the current record (solid dot, `*`). One component serves
 * highest score and best bowling; the chips below list holder and season.
 */
export function RecordProgression({
  kind,
  onKind,
  points,
  loading,
  error,
  scope,
}: {
  kind: ProgressionKind;
  onKind: (k: ProgressionKind) => void;
  points: RecordProgressionPoint[];
  loading: boolean;
  error: boolean;
  scope: string;
}) {
  const steps: StepPoint[] = useMemo(
    () =>
      points.map((p, i) => {
        const season = progressionSeasonLabel(p);
        return {
          x: season,
          value: progressionValue(kind, p.value),
          label: p.value,
          final: i === points.length - 1,
          tip: `${p.value} by ${fullName(p.givenName, p.surname)} · ${season}${p.grade ? ` · ${p.grade}` : ""}`,
        };
      }),
    [points, kind],
  );

  return (
    <ChartCard
      eyebrow={`Record progression · ${scope} · all time`}
      title={TITLE[kind]}
      actions={<SegmentedControl label="Record" options={KINDS} value={kind} onChange={onKind} />}
      loading={loading}
      points={points.length}
      empty={error}
      emptyReason={
        error ? "Record progression isn't available" : "Not enough record breaks to chart"
      }
      emptyMessage={
        error ? undefined : "The chart appears once the record has changed hands a few times."
      }
      table={{
        columns: ["Season", "Record", "Holder", "Grade"],
        rows: points.map((p) => [
          progressionSeasonLabel(p),
          p.value,
          fullName(p.givenName, p.surname),
          p.grade,
        ]),
      }}
    >
      <div data-testid="record-progression" className="flex flex-col gap-4">
        <StepLine points={steps} />
        <ul className="flex flex-wrap gap-2" aria-label="Record holders">
          {points.map((p, i) => {
            const final = i === points.length - 1;
            return (
              <li
                key={`${p.playerId}-${p.value}-${i}`}
                className="flex h-[30px] items-baseline gap-2 whitespace-nowrap rounded-full bg-muted px-3 pt-[5px] text-[12.5px]"
              >
                <strong
                  className={
                    final
                      ? "font-serif text-[17px] text-primary-text"
                      : "font-serif text-[17px] text-foreground"
                  }
                >
                  {p.value}
                </strong>
                {shortName(p.givenName, p.surname)} · {progressionSeasonLabel(p)}
              </li>
            );
          })}
        </ul>
      </div>
    </ChartCard>
  );
}
