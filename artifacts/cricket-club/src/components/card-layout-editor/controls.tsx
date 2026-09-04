/** Tiny presentational controls used by the inspector and effects panels. */

export function EffectBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded border px-1 py-1 text-[10px] ${
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function ShapeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded border ${
        active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="w-12 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
    </label>
  );
}
