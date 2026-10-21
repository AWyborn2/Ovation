import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { SelectionMember, SelectionSide } from "@workspace/api-client-react";
import { X } from "lucide-react";
import { sideShape } from "@workspace/scorecard/selection-shape";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { sideLabel, type BoardState, type DropTarget, type Location } from "./apply-move";
import { useAvailability } from "./availability-context";
import { STATUS, perthDateTime } from "./labels";
import { StatusMark } from "./player-chip";
import { rankCandidates } from "./rank-candidates";

/** What the hub's popover is open for, and the element it points at. */
export type HubPop =
  | { mode: "fill"; sideId: number; index: number; anchor: HTMLElement }
  | { mode: "place"; memberId: number; anchor: HTMLElement };

type Row = {
  key: string;
  disabled: boolean;
  status?: SelectionMember["status"];
  name: string;
  meta: string;
  badge?: ReactNode;
  pick: () => void;
};

/** "slot 7", or "12th" for an XI-and-12th side's 12th slot. */
export function slotName(side: SelectionSide, index: number) {
  return index === sideShape(side).twelfthIndex ? "12th" : `slot ${index + 1}`;
}

/**
 * The sides a pool player can be added to: the sides on screen first, then
 * the rest, in grade order. Finalised, full and already-in sides are listed
 * but disabled; sides the caller can't edit are left out (as in the Move dialog).
 */
export function placeOptions(
  state: BoardState,
  memberId: number,
  focused: readonly number[] = [],
): { side: SelectionSide; index: number | null; reason: string | null }[] {
  const sides = [
    ...state.selections.filter((s) => focused.includes(s.id)),
    ...state.selections.filter((s) => !focused.includes(s.id)),
  ];
  return sides
    .filter((s) => s.state === "final" || s.canEdit)
    .map((side) => {
      const open = side.slots.findIndex((x) => x.memberId == null);
      const reason =
        side.state === "final"
          ? "Finalised"
          : side.slots.some((x) => x.memberId === memberId)
            ? "Already in this side"
            : open < 0
              ? "Full"
              : null;
      return { side, index: open < 0 ? null : open, reason };
    });
}

/**
 * Tap-to-fill: from an open slot, a search of ranked candidates ("fill"); from
 * a pool player, the sides they can join ("place"). Arrow keys choose, Enter
 * adds, Escape closes. Every pick is an ordinary board move.
 */
export function FillPopover({
  pop,
  state,
  focused,
  busy,
  onClose,
  onMove,
  onMore,
}: {
  pop: HubPop | null;
  state: BoardState;
  focused: readonly number[];
  busy: boolean;
  onClose: () => void;
  onMove: (memberId: number, target: DropTarget, from: Location) => void;
  /** The full Move dialog for a pool player (status, compare, every move). */
  onMore: (memberId: number) => void;
}) {
  const availability = useAvailability();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const popKey = pop
    ? pop.mode === "fill"
      ? `f${pop.sideId}:${pop.index}`
      : `p${pop.memberId}`
    : "";
  useEffect(() => {
    setQuery("");
    setHighlight(0);
  }, [popKey]);

  const fillSide = pop?.mode === "fill" ? state.selections.find((s) => s.id === pop.sideId) : null;
  const placing =
    pop?.mode === "place" ? (state.pool.find((m) => m.id === pop.memberId) ?? null) : null;

  const rows = useMemo<Row[]>(() => {
    if (pop?.mode === "fill" && fillSide) {
      return rankCandidates(state.pool, state.selections, fillSide.id, query).map(
        ({ member, alsoIn }) => ({
          key: String(member.id),
          disabled: false,
          status: member.status,
          name: member.displayName,
          meta: [
            availability ? STATUS[member.status].label : null,
            member.lastGrade ? `last ${member.lastGrade}` : null,
            alsoIn.length ? `also in ${alsoIn.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: member.junior ? <Badge junior>Jr</Badge> : null,
          pick: () =>
            onMove(
              member.id,
              { kind: "slot", sideId: fillSide.id, index: pop.index },
              { kind: "pool" },
            ),
        }),
      );
    }
    if (pop?.mode === "place" && placing) {
      return placeOptions(state, placing.id, focused).map(({ side, index, reason }) => ({
        key: String(side.id),
        disabled: reason != null,
        name: sideLabel(side),
        meta: reason ?? `Into ${slotName(side, index!)} · ${perthDateTime(side.fixture.startAt)}`,
        pick: () => onMove(placing.id, { kind: "side", sideId: side.id }, { kind: "pool" }),
      }));
    }
    return [];
  }, [pop, fillSide, placing, state, query, focused, availability, onMove]);

  const enabled = rows.map((r, i) => (r.disabled ? -1 : i)).filter((i) => i >= 0);
  const active = enabled.includes(highlight) ? highlight : (enabled[0] ?? -1);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  if (!pop || (pop.mode === "fill" && !fillSide) || (pop.mode === "place" && !placing)) {
    return null;
  }

  const choose = (i: number) => {
    const row = rows[i];
    if (!row || row.disabled || busy) return;
    onClose();
    row.pick();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (enabled.length === 0) return;
      const at = enabled.indexOf(active);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight(enabled[(at + step + enabled.length) % enabled.length]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) choose(active);
    }
  };
  const optionId = (i: number) => `${listId}-${i}`;

  const title =
    pop.mode === "fill"
      ? `${sideLabel(fillSide!)} · ${slotName(fillSide!, pop.index)}`
      : placing!.displayName;
  const sub =
    pop.mode === "fill"
      ? "Fill this open slot"
      : [
          availability ? STATUS[placing!.status].label : null,
          placing!.lastGrade ? `last played ${placing!.lastGrade}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={{ current: pop.anchor }} />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="w-80 rounded-xl p-0"
        aria-label={title}
        data-testid="fill-popover"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (pop.mode === "fill" ? inputRef.current : listRef.current)?.focus();
        }}
      >
        <div className="flex items-start gap-2 p-3 pb-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-serif text-lg font-extrabold uppercase leading-tight">
              {title}
            </div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {pop.mode === "fill" && (
          <div className="px-3 pb-2">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Find a player"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              autoComplete="off"
              placeholder="Type a name…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              className="h-9 w-full rounded-[10px] border-[1.5px] border-primary bg-background px-3 text-sm outline-none"
            />
          </div>
        )}

        <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {pop.mode === "place"
            ? "Add to"
            : query.trim()
              ? "Matches"
              : "Best fits — available first"}
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={pop.mode === "place" ? "Add to" : "Candidates"}
          tabIndex={pop.mode === "place" ? 0 : -1}
          aria-activedescendant={pop.mode === "place" && active >= 0 ? optionId(active) : undefined}
          onKeyDown={pop.mode === "place" ? onKeyDown : undefined}
          className="flex max-h-[300px] flex-col gap-0.5 overflow-auto px-1.5 pb-1.5 outline-none"
        >
          {rows.length === 0 && (
            <p className="px-2 py-3 text-[13px] text-muted-foreground">
              {pop.mode === "fill" ? "No one matches." : "No side you can add to."}
            </p>
          )}
          {rows.map((row, i) => (
            <div
              key={row.key}
              id={optionId(i)}
              data-row={i}
              role="option"
              aria-selected={i === active}
              aria-disabled={row.disabled || undefined}
              onMouseEnter={() => !row.disabled && setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 py-1",
                i === active && "bg-muted",
                row.disabled && "cursor-not-allowed opacity-45",
              )}
            >
              {row.status && availability && <StatusMark status={row.status} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{row.name}</div>
                {row.meta && (
                  <div className="truncate text-[11.5px] text-muted-foreground">{row.meta}</div>
                )}
              </div>
              {row.badge}
              {i === active && (
                <kbd className="rounded border border-border px-1 font-mono text-[11px] text-muted-foreground">
                  ↵
                </kbd>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex-1">↑↓ choose · ↵ add · esc close</span>
          {pop.mode === "place" && (
            <button
              type="button"
              className="font-semibold text-primary-text hover:underline"
              onClick={() => {
                const id = placing!.id;
                onClose();
                onMore(id);
              }}
            >
              More options…
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Badge({ junior, children }: { junior?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[10.5px] font-semibold",
        junior ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-muted",
      )}
    >
      {children}
    </span>
  );
}
