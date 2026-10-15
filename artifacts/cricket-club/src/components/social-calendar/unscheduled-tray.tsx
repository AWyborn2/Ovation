import type { PointerEvent } from "react";
import type { SocialCalendarCard } from "@workspace/api-client-react";
import { CalendarCard } from "./calendar-card";

type Props = {
  cards: SocialCalendarCard[];
  draggingId: number | null;
  onOpen: (card: SocialCalendarCard) => void;
  onMoveTo: (card: SocialCalendarCard) => void;
  /** Drag from the tray onto the week grid (desktop only). */
  onPointerDown?: (e: PointerEvent<HTMLElement>, id: number) => void;
};

/**
 * The Unscheduled tray (R15): cards made by hand, cards with no free slot
 * before they expire, cards taken off the calendar, and expired cards. Each
 * waits here until someone gives it a time.
 */
export function UnscheduledTray({ cards, draggingId, onOpen, onMoveTo, onPointerDown }: Props) {
  if (cards.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="tray-title">
      <h3 id="tray-title" className="text-sm font-semibold text-foreground">
        Unscheduled ({cards.length})
      </h3>
      <p className="mb-2 text-xs text-muted-foreground">
        These have no posting time yet. Drag one onto the week or use “Move to…”.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.draft.id}>
            <CalendarCard
              card={c}
              dragging={draggingId === c.draft.id}
              onOpen={onOpen}
              onMoveTo={onMoveTo}
              onPointerDown={onPointerDown}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
