import { useEffect, useState } from "react";
import type { SelectionWeekends } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { weekendLabel } from "./labels";

/**
 * Which weekend the Hub shows. `weekend` is undefined for the club's current
 * weekend (the board's default), so the board follows the week as it turns
 * over; moving back to the current weekend clears it again. `home` is the
 * current weekend as the server last reported it.
 */
export function useWeekendNav(shown: SelectionWeekends | undefined) {
  const [weekend, setWeekend] = useState<string | undefined>(undefined);
  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    if (weekend === undefined && shown) setHome(shown.current);
  }, [weekend, shown]);
  const go = (target: string) => setWeekend(target === home ? undefined : target);
  return { weekend, home, go, goHome: () => setWeekend(undefined) };
}

const navButton = "h-[34px] rounded-[10px] border-primary text-[13px] font-semibold";

/**
 * Previous / next weekend buttons around the weekend shown, a way back to this
 * weekend, and a view-only badge on a past weekend. Back goes to the nearest
 * earlier weekend with a round; forward to the next weekend with fixtures.
 */
export function WeekendSwitcher({
  weekends,
  readOnly,
  atHome,
  onGo,
  onHome,
}: {
  weekends: SelectionWeekends | undefined;
  readOnly: boolean;
  /** The current weekend is shown. */
  atHome: boolean;
  onGo: (weekend: string) => void;
  onHome: () => void;
}) {
  if (!weekends) return null;
  const { previous, next } = weekends;
  return (
    <nav aria-label="Weekend" className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className={navButton}
        disabled={!previous}
        aria-label={previous ? `Previous: ${weekendLabel(previous)}` : "No earlier weekend"}
        title={previous ? undefined : "No earlier weekend was picked in the Hub."}
        onClick={() => previous && onGo(previous)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Previous
      </Button>
      <span className="text-[15px] font-bold text-primary-text" aria-live="polite">
        {weekendLabel(weekends.current)}
      </span>
      <Button
        variant="outline"
        size="sm"
        className={navButton}
        disabled={!next}
        aria-label={next ? `Next: ${weekendLabel(next)}` : "No later weekend"}
        title={next ? undefined : "No later weekend has fixtures yet."}
        onClick={() => next && onGo(next)}
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
      {!atHome && (
        <Button variant="ghost" size="sm" onClick={onHome}>
          This weekend
        </Button>
      )}
      {readOnly && (
        <span
          role="status"
          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[12px] font-semibold text-muted-foreground"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Past weekend · view only
        </span>
      )}
    </nav>
  );
}
