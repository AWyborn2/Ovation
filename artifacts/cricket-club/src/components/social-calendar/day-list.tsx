import type {
  SocialCalendarCard,
  SocialCalendarDay,
  SocialCalendarPlaceholder,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { CalendarCard } from "./calendar-card";
import { clubParts, formatClubTime, formatDayLabel } from "./calendar-time";

type Props = {
  days: string[];
  info: Map<string, SocialCalendarDay>;
  dailyCap: number;
  cards: SocialCalendarCard[];
  placeholders: SocialCalendarPlaceholder[];
  today: string;
  onOpen: (card: SocialCalendarCard) => void;
  onMoveTo: (card: SocialCalendarCard) => void;
};

const timeOf = (c: SocialCalendarCard) => c.draft.plannedAt ?? c.draft.reviewedAt ?? null;

/**
 * The List view (the default on phones): one block per club day, posts in
 * time order, each with "Move to…" instead of a drag.
 */
export function DayList(props: Props) {
  return (
    <ol className="space-y-4" aria-label="Posts by day">
      {props.days.map((day) => {
        const info = props.info.get(day);
        const cards = props.cards
          .filter((c) => {
            const at = timeOf(c);
            return at && clubParts(new Date(at)).day === day;
          })
          .sort((a, b) => new Date(timeOf(a)!).getTime() - new Date(timeOf(b)!).getTime());
        const placeholders = props.placeholders.filter(
          (p) => clubParts(new Date(p.at)).day === day,
        );
        return (
          <li
            key={day}
            className={cn(
              "rounded-lg border border-border bg-card p-3",
              day === props.today && "border-primary/60",
            )}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                {formatDayLabel(day)}
                {day === props.today ? " · Today" : ""}
              </h3>
              <span
                className={cn(
                  "text-xs",
                  info?.overCap ? "font-semibold text-destructive" : "text-muted-foreground",
                )}
              >
                {info?.count ?? 0} / {props.dailyCap} posts{info?.overCap ? " — over the cap" : ""}
              </span>
            </div>
            {cards.length === 0 && placeholders.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing planned.</p>
            ) : (
              <ul className="space-y-2">
                {placeholders.map((p) => (
                  <li
                    key={`${p.slotKind}-${p.at}`}
                    className="rounded-md border border-dashed border-muted-foreground/50 px-2 py-1.5 text-xs text-muted-foreground"
                  >
                    {formatClubTime(new Date(p.at))} · {p.label} — expected
                  </li>
                ))}
                {cards.map((c) => (
                  <li key={c.draft.id}>
                    <CalendarCard card={c} onOpen={props.onOpen} onMoveTo={props.onMoveTo} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
