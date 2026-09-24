import type { ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Building blocks shared by the senior + junior "matches page display" admin
 * pages (plan.md §5.6): each page keeps its own settings hook and field
 * types and composes these presentational pieces.
 */

/**
 * Merge a saved order with the live option list: configured items in their
 * saved order first (only if they still exist), then any remaining items in
 * the live list's order.
 */
export function mergeOrder(saved: string[], all: string[]): string[] {
  const present = saved.filter((g) => all.includes(g));
  const rest = all.filter((g) => !present.includes(g));
  return [...present, ...rest];
}

/**
 * One block inside an admin `SettingsCard` (Social Studio U22): label and
 * helper text, then a control too large for a single settings row (radio
 * cards, ordered lists).
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

/** "All …" + one option per value, in the page's primary-bordered select style. */
export function DefaultSelect({
  value,
  onChange,
  options,
  allLabel,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
  testId: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 min-w-[14rem] rounded-lg border border-input bg-background px-3 text-sm text-foreground"
      data-testid={testId}
    >
      <option value="">{allLabel}</option>
      {options.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}

/** Stacked radio "cards"; `extra` renders trailing controls inside a card. */
export function RadioCards<M extends string>({
  name,
  value,
  onChange,
  options,
  className,
  extra,
}: {
  name: string;
  value: M;
  onChange: (v: M) => void;
  options: { value: M; label: string }[];
  className: string;
  extra?: (option: { value: M; label: string }) => ReactNode;
}) {
  return (
    <div className={className}>
      {options.map((m) => (
        <label
          key={m.value}
          className={`flex items-center gap-3 border rounded p-3 cursor-pointer transition-colors ${
            value === m.value ? "border-primary bg-primary/5" : "hover:bg-muted"
          }`}
        >
          <input
            type="radio"
            name={name}
            checked={value === m.value}
            onChange={() => onChange(m.value)}
          />
          <span className="font-medium text-sm">{m.label}</span>
          {extra?.(m)}
        </label>
      ))}
    </div>
  );
}

/** Numbered list with move-up / move-down buttons. */
export function OrderList({
  items,
  onMove,
  emptyText,
  testIds,
}: {
  items: string[];
  onMove: (idx: number, dir: -1 | 1) => void;
  emptyText: string;
  testIds: (item: string) => { row: string; up: string; down: string };
}) {
  return (
    <ul className="space-y-1 max-w-md">
      {items.map((g, idx) => {
        const ids = testIds(g);
        return (
          <li
            key={g}
            className="flex items-center gap-2 border rounded px-3 py-2 bg-card"
            data-testid={ids.row}
          >
            <span className="text-xs tabular-nums text-muted-foreground w-5">{idx + 1}</span>
            <span className="flex-1 text-sm font-medium">{g}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={idx === 0}
              onClick={() => onMove(idx, -1)}
              data-testid={ids.up}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={idx === items.length - 1}
              onClick={() => onMove(idx, 1)}
              data-testid={ids.down}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </li>
        );
      })}
      {items.length === 0 && <li className="text-xs text-muted-foreground italic">{emptyText}</li>}
    </ul>
  );
}

/** Swap two neighbours in an ordered list (no-op at the edges). */
export function moveItem(prev: string[], idx: number, dir: -1 | 1): string[] {
  const next = prev.slice();
  const target = idx + dir;
  if (target < 0 || target >= next.length) return prev;
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}
