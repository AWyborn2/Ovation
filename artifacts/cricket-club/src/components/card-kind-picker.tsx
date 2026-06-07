import type { CardKind } from "@/lib/share-card";

export const CARD_KIND_OPTIONS: { value: CardKind; label: string }[] = [
  { value: "milestone", label: "Milestone" },
  { value: "player", label: "Player" },
  { value: "record", label: "Record" },
  { value: "gradeLeader", label: "Leaderboard" },
  { value: "premiership", label: "Premiership" },
  { value: "debut", label: "Debut" },
  { value: "newCap", label: "New Cap" },
  { value: "century", label: "Century" },
  { value: "fiveFor", label: "Five-for" },
  { value: "matchSummary", label: "Match Summary" },
];

// Chip picker for the card types a sponsor or template applies to.
// An empty selection means "all card types".
export function CardKindPicker({
  value,
  onChange,
}: {
  value: string[] | null | undefined;
  onChange: (next: CardKind[]) => void;
}) {
  const selected = value ?? [];
  const isAll = selected.length === 0;
  const toggle = (kind: CardKind) => {
    const next = selected.includes(kind)
      ? selected.filter((k) => k !== kind)
      : [...selected, kind];
    onChange(next as CardKind[]);
  };
  const chip = (active: boolean) =>
    `text-xs px-2 py-0.5 rounded-full border transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={chip(isAll)} onClick={() => onChange([])}>
        All cards
      </button>
      {CARD_KIND_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={chip(!isAll && selected.includes(o.value))}
          onClick={() => toggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
