import type { KioskLook } from "@workspace/api-client-react";
import type {
  KioskDuration,
  KioskMove,
  KioskTextSize,
  KioskTransition,
  ResolvedKioskLook,
} from "@workspace/scorecard/kiosk-display";
import { Input } from "@/components/ui/input";

/**
 * The TV motion and size controls (honours kiosk redesign B3), shared by the
 * Look tab (club defaults, `kiosk_look`) and the rotation's per-board panel
 * (`board_configs`). Every field is optional: unset falls back to `defaults`,
 * which the caller works out with the same resolver the TV uses, so "Default"
 * always names what the TV will actually do.
 */

export type MotionKey = keyof ResolvedKioskLook;
export const MOTION_KEYS: readonly MotionKey[] = [
  "move",
  "trans",
  "dur",
  "size",
  "perPage",
  "pageSecs",
  "speed",
  "hold",
  "columnsPerScreen",
];

const MOVES: Record<KioskMove, string> = {
  pages: "Pages",
  credits: "Credits roll",
  fit: "Fit to screen",
};
const TRANSITIONS: Record<KioskTransition, string> = {
  fade: "Fade",
  up: "Slide up",
  down: "Slide down",
  left: "Slide left",
  right: "Slide right",
  pop: "Pop",
  zoom: "Zoom",
  flip: "Flip",
  wipe: "Wipe",
  rows: "Rows cascade",
  cut: "Cut",
  random: "Random",
};
const DURATIONS: Record<KioskDuration, string> = { S: "Quick", M: "Medium", L: "Slow" };
const SIZES: Record<KioskTextSize, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
  XL: "Extra large",
};
const PER_PAGE = [0, 4, 6, 8, 10, 12, 15, 20];
// 0 = as many rows as fit the screen.
const perPageLabel = (n: number) => (n === 0 ? "Auto" : String(n));

export interface TvMotionFieldsProps {
  /** The saved values (unset = default). */
  value: KioskLook;
  /** What each field is when unset. */
  defaults: ResolvedKioskLook;
  onPatch: (patch: KioskLook) => void;
  /** Most columns this board (or a club default) can show; 1 hides the field. */
  maxColumns: number;
  columnsLabel: string;
  /** Prefix for test ids, e.g. "look" or "board-premierships". */
  idPrefix: string;
}

export function TvMotionFields({
  value,
  defaults,
  onPatch,
  maxColumns,
  columnsLabel,
  idPrefix,
}: TvMotionFieldsProps) {
  const move = value.move ?? defaults.move;
  const columns = Array.from({ length: maxColumns }, (_, i) => i + 1);
  const secsLabel =
    move === "pages"
      ? "Seconds per page"
      : move === "credits"
        ? "Pause before rolling (s)"
        : "Seconds on screen";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ChoiceField
        label="Movement"
        hint="How a long board shows all its rows"
        options={MOVES}
        value={value.move}
        fallback={defaults.move}
        onChange={(move) => onPatch({ move })}
        testId={`${idPrefix}-move`}
      />
      <ChoiceField
        label="Transition"
        options={TRANSITIONS}
        value={value.trans}
        fallback={defaults.trans}
        onChange={(trans) => onPatch({ trans })}
        testId={`${idPrefix}-trans`}
      />
      <ChoiceField
        label="Transition speed"
        options={DURATIONS}
        value={value.dur}
        fallback={defaults.dur}
        onChange={(dur) => onPatch({ dur })}
        testId={`${idPrefix}-dur`}
      />
      <ChoiceField
        label="Text size"
        options={SIZES}
        value={value.size}
        fallback={defaults.size}
        onChange={(size) => onPatch({ size })}
        testId={`${idPrefix}-size`}
      />
      {maxColumns > 1 && (
        <ChoiceField
          label={columnsLabel}
          options={Object.fromEntries(columns.map((n) => [String(n), String(n)]))}
          value={value.columnsPerScreen === undefined ? undefined : String(value.columnsPerScreen)}
          fallback={String(Math.min(defaults.columnsPerScreen, maxColumns))}
          onChange={(v) => onPatch({ columnsPerScreen: v === undefined ? undefined : Number(v) })}
          testId={`${idPrefix}-columns`}
        />
      )}
      {move === "pages" && (
        <ChoiceField
          label="Rows per page"
          options={Object.fromEntries(PER_PAGE.map((n) => [String(n), perPageLabel(n)]))}
          value={value.perPage === undefined ? undefined : String(value.perPage)}
          fallback={String(defaults.perPage)}
          fallbackLabel={perPageLabel(defaults.perPage)}
          onChange={(v) => onPatch({ perPage: v === undefined ? undefined : Number(v) })}
          testId={`${idPrefix}-perpage`}
        />
      )}
      <NumberField
        label={secsLabel}
        value={value.pageSecs}
        fallback={defaults.pageSecs}
        min={1}
        max={60}
        onChange={(pageSecs) => onPatch({ pageSecs })}
        testId={`${idPrefix}-pagesecs`}
      />
      {move === "credits" && (
        <NumberField
          label="Roll speed (px/s)"
          value={value.speed}
          fallback={defaults.speed}
          min={5}
          max={200}
          onChange={(speed) => onPatch({ speed })}
          testId={`${idPrefix}-speed`}
        />
      )}
      <NumberField
        label="Hold at the end (s)"
        value={value.hold}
        fallback={defaults.hold}
        min={0}
        max={60}
        onChange={(hold) => onPatch({ hold })}
        testId={`${idPrefix}-hold`}
      />
    </div>
  );
}

function ChoiceField<K extends string>({
  label,
  hint,
  options,
  value,
  fallback,
  fallbackLabel,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  options: Record<K, string>;
  value: K | undefined;
  fallback: K;
  fallbackLabel?: string;
  onChange: (v: K | undefined) => void;
  testId: string;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <select
        className="w-full rounded border bg-card px-2 py-1.5 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as K | undefined)}
        data-testid={testId}
      >
        <option value="">Default · {fallbackLabel ?? options[fallback] ?? fallback}</option>
        {(Object.keys(options) as K[]).map((k) => (
          <option key={k} value={k}>
            {options[k]}
          </option>
        ))}
      </select>
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function NumberField({
  label,
  value,
  fallback,
  min,
  max,
  onChange,
  testId,
}: {
  label: string;
  value: number | undefined;
  fallback: number;
  min: number;
  max: number;
  onChange: (v: number | undefined) => void;
  testId: string;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ""}
        placeholder={`Default · ${fallback}`}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          onChange(e.target.value === "" || !Number.isFinite(n) ? undefined : n);
        }}
        data-testid={testId}
      />
    </label>
  );
}

/** `value` without its motion fields (what Reset leaves behind). */
export function withoutMotion<T extends KioskLook>(value: T): T {
  const next = { ...value };
  for (const k of MOTION_KEYS) delete next[k];
  return next;
}

/** Per field, what it resolves to when only that field is unset. */
export function motionDefaults<T extends KioskLook>(
  value: T,
  resolve: (value: T) => ResolvedKioskLook,
): ResolvedKioskLook {
  const out = { ...resolve(value) };
  for (const k of MOTION_KEYS) {
    if (value[k] === undefined) continue;
    const rest = { ...value };
    delete rest[k];
    (out as Record<MotionKey, unknown>)[k] = resolve(rest)[k];
  }
  return out;
}
