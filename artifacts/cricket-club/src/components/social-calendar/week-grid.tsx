import type { PointerEvent } from "react";
import type {
  SocialCalendarCard,
  SocialCalendarDay,
  SocialCalendarPlaceholder,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { CalendarCard } from "./calendar-card";
import { clubParts, formatDayLabel, formatMinutes } from "./calendar-time";

/** 15 minutes is 15px: a card (44px) covers about 45 minutes, the default gap. */
export const PX_PER_MINUTE = 1;
const CARD_PX = 44;

type Props = {
  days: string[];
  info: Map<string, SocialCalendarDay>;
  dailyCap: number;
  cards: SocialCalendarCard[];
  placeholders: SocialCalendarPlaceholder[];
  startMinutes: number;
  endMinutes: number;
  today: string;
  draggingId: number | null;
  onOpen: (card: SocialCalendarCard) => void;
  onMoveTo: (card: SocialCalendarCard) => void;
  onPointerDown: (e: PointerEvent<HTMLElement>, id: number) => void;
};

/** Cards in one day column, nudged sideways when they'd overlap. */
function layoutDay(
  cards: SocialCalendarCard[],
): { card: SocialCalendarCard; minutes: number; lane: number }[] {
  const timed = cards
    .map((card) => {
      const at = card.draft.plannedAt ?? card.draft.reviewedAt;
      return { card, minutes: at ? clubParts(new Date(at)).minutes : 0 };
    })
    .sort((a, b) => a.minutes - b.minutes);
  const laneEnds: number[] = [];
  return timed.map((t) => {
    let lane = laneEnds.findIndex((end) => end <= t.minutes);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = t.minutes + CARD_PX / PX_PER_MINUTE;
    return { ...t, lane };
  });
}

/**
 * The week grid (desktop): club days across, times down, each card at its
 * planned time. Each day column is one drop zone; the time under the pointer
 * is snapped to 15 minutes by the page's drag handler.
 */
export function WeekGrid(props: Props) {
  const { startMinutes, endMinutes } = props;
  const height = (endMinutes - startMinutes) * PX_PER_MINUTE;
  const hours: number[] = [];
  for (let m = startMinutes; m < endMinutes; m += 60) hours.push(m);

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border"
      role="region"
      aria-label="Week"
    >
      <div
        className="grid min-w-[900px]"
        style={{ gridTemplateColumns: "4rem repeat(7, minmax(120px, 1fr))" }}
      >
        <div className="sticky left-0 z-10 border-b border-border bg-card" />
        {props.days.map((day) => {
          const info = props.info.get(day);
          return (
            <div
              key={day}
              className={cn(
                "border-b border-l border-border px-2 py-1.5 text-xs",
                day === props.today ? "bg-primary/10" : "bg-card",
              )}
            >
              <p className="font-semibold text-foreground">{formatDayLabel(day)}</p>
              <p
                className={cn(
                  info?.overCap ? "font-semibold text-destructive" : "text-muted-foreground",
                )}
              >
                {info?.count ?? 0} / {props.dailyCap} posts{info?.overCap ? " — over the cap" : ""}
              </p>
            </div>
          );
        })}

        <div className="sticky left-0 z-10 bg-card" style={{ height }}>
          {hours.map((m) => (
            <span
              key={m}
              className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
              style={{ top: (m - startMinutes) * PX_PER_MINUTE }}
            >
              {m === startMinutes ? "" : formatMinutes(m)}
            </span>
          ))}
        </div>
        {props.days.map((day) => {
          const dayCards = props.cards.filter((c) => {
            const at = c.draft.plannedAt ?? c.draft.reviewedAt;
            return at && clubParts(new Date(at)).day === day;
          });
          const dayPlaceholders = props.placeholders.filter(
            (p) => clubParts(new Date(p.at)).day === day,
          );
          return (
            <div
              key={day}
              data-drop="day"
              data-day={day}
              aria-label={`${formatDayLabel(day)} drop zone`}
              className={cn(
                "relative border-l border-border data-[drop-state=no]:bg-destructive/10 data-[drop-state=ok]:bg-primary/5",
                day < props.today && "bg-muted/40",
              )}
              style={{ height }}
            >
              {hours.map((m) => (
                <div
                  key={m}
                  className="absolute inset-x-0 border-t border-border/60"
                  style={{ top: (m - startMinutes) * PX_PER_MINUTE }}
                  aria-hidden
                />
              ))}
              {dayPlaceholders.map((p) => (
                <div
                  key={`${p.slotKind}-${p.at}`}
                  className="absolute inset-x-1 rounded-md border border-dashed border-muted-foreground/50 px-1.5 py-1 text-[10px] text-muted-foreground"
                  style={{
                    top: (clubParts(new Date(p.at)).minutes - startMinutes) * PX_PER_MINUTE,
                    height: CARD_PX,
                  }}
                >
                  {p.label} — expected
                </div>
              ))}
              {layoutDay(dayCards).map(({ card, minutes, lane }) => (
                <div
                  key={card.draft.id}
                  className="absolute pr-1"
                  style={{
                    top: (minutes - startMinutes) * PX_PER_MINUTE,
                    left: `${4 + lane * 10}px`,
                    right: 0,
                    zIndex: 1 + lane,
                  }}
                >
                  <CalendarCard
                    card={card}
                    compact
                    dragging={props.draggingId === card.draft.id}
                    onOpen={props.onOpen}
                    onMoveTo={props.onMoveTo}
                    onPointerDown={props.onPointerDown}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
