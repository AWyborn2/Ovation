import { useId, useMemo } from "react";
import { Container, FilterChips, SegmentedControl, type Option } from "@/components/broadcast";
import { cn } from "@/lib/utils";
import {
  activePreset,
  rangePresets,
  seasonLabel,
  sortSeasonsDesc,
  useStatsView,
  type Discipline,
  type RangePresetKey,
} from "@/lib/use-stats-view";

const DISCIPLINES: Option<Discipline>[] = [
  { value: "bat", label: "Batting" },
  { value: "bowl", label: "Bowling" },
];

const SELECT_CLASS =
  "h-[34px] rounded-lg border bg-card px-2.5 text-[13px] text-foreground [color-scheme:light_dark] disabled:opacity-50";

/**
 * Sticky, glass season bar shared by the stats pages (Profile, Compare,
 * Records). Range chips (Career · Last 3 seasons · latest · previous), a
 * Batting | Bowling switch (hidden with `showDiscipline={false}`, e.g. on
 * Records) and From / To selects. All state lives in the URL via
 * {@link useStatsView}, so every change is one navigation and unrelated params
 * survive.
 *
 * `seasons` is the page's own season list (start years; nulls — baseline rows —
 * are ignored), so the chips and selects only offer seasons that exist.
 */
export function SeasonBar({
  seasons,
  showDiscipline = true,
  className,
}: {
  seasons: ReadonlyArray<number | null | undefined>;
  showDiscipline?: boolean;
  className?: string;
}) {
  const { view, setView } = useStatsView();
  const desc = useMemo(() => sortSeasonsDesc(seasons), [seasons]);
  const asc = useMemo(() => [...desc].reverse(), [desc]);
  const presets = useMemo(() => rangePresets(desc), [desc]);
  const active = activePreset(view, desc);
  const fromId = useId();
  const toId = useId();

  const newest = desc[0];
  const oldest = asc[0];
  const fromValue = view.from ?? oldest;
  const toValue = view.to ?? newest;
  const noSeasons = desc.length === 0;

  const onPreset = (key: RangePresetKey) => {
    const preset = presets.find((p) => p.key === key);
    if (preset) setView(preset.patch);
  };

  // From Career, picking one end pins the other to the list's extreme so the
  // range stays closed; picking past the other end pushes it (useStatsView).
  const onFrom = (value: number) =>
    setView(view.to == null ? { from: value, to: newest } : { from: value });
  const onTo = (value: number) =>
    setView(view.from == null ? { from: oldest, to: value } : { to: value });

  return (
    <div
      data-testid="season-bar"
      className={cn(
        "sticky top-[var(--header-h)] z-30 border-b bg-[var(--glass)] backdrop-blur-[16px]",
        className,
      )}
    >
      <Container className="flex flex-wrap items-center gap-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Seasons
        </span>
        <FilterChips
          label="Season range"
          options={presets.map((p) => ({ value: p.key, label: p.label }))}
          value={active}
          onChange={onPreset}
          className="gap-1.5"
        />
        {showDiscipline && (
          <SegmentedControl
            label="Discipline"
            options={DISCIPLINES}
            value={view.d}
            onChange={(d) => setView({ d })}
          />
        )}
        <div className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <label htmlFor={fromId}>From</label>
          <select
            id={fromId}
            className={SELECT_CLASS}
            value={fromValue ?? ""}
            disabled={noSeasons}
            onChange={(e) => onFrom(Number(e.target.value))}
          >
            {asc.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
          <label htmlFor={toId}>to</label>
          <select
            id={toId}
            className={SELECT_CLASS}
            value={toValue ?? ""}
            disabled={noSeasons}
            onChange={(e) => onTo(Number(e.target.value))}
          >
            {asc.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </Container>
    </div>
  );
}
