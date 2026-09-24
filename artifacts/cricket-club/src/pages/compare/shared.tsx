import type { PlayerDetail, PlayerMatchLine, PlayerSeasonStat } from "@workspace/api-client-react";
import { chartColor } from "@/components/stats-charts/chart-tooltip";
import { cn } from "@/lib/utils";
import type { Slot } from "./compare-data";

/** Series colour per slot: A / B / C always keep their colour. */
export const SLOT_TOKENS: Record<Slot, string> = {
  a: "--chart-a",
  b: "--chart-b",
  c: "--chart-c",
};

/** One compared player with everything the sections read. */
export interface ComparedPlayer {
  slot: Slot;
  id: number;
  name: string;
  /** Surname, for legends and compact labels. */
  short: string;
  token: string;
  detail: PlayerDetail | undefined;
  seasons: PlayerSeasonStat[];
  matches: PlayerMatchLine[];
}

export function slotColor(p: Pick<ComparedPlayer, "token">, alpha?: number): string {
  return chartColor(p.token, alpha);
}

/** Colour-keyed player names under a chart. */
export function PlayerLegend({
  players,
  className,
}: {
  players: ReadonlyArray<Pick<ComparedPlayer, "slot" | "name" | "token">>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]", className)}>
      {players.map((p) => (
        <li key={p.slot} className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: slotColor(p) }}
          />
          {p.name}
        </li>
      ))}
    </ul>
  );
}
