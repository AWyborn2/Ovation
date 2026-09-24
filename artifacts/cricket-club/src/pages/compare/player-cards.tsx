import { useState } from "react";
import { useGetPlayer, getGetPlayerQueryKey, useListPlayers } from "@workspace/api-client-react";
import type { PlayerDetail } from "@workspace/api-client-react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { initialsOf } from "@/components/broadcast";
import { chartColor } from "@/components/stats-charts/chart-tooltip";
import { seasonLabel } from "@/lib/use-stats-view";
import { cn } from "@/lib/utils";
import { SLOTS, type Slot, type Slots } from "./compare-data";
import { SLOT_TOKENS } from "./shared";

const SLOT_LABELS: Record<Slot, string> = { a: "Player A", b: "Player B", c: "Player C" };

/**
 * The existing searchable player combobox. Players already chosen on another
 * card are listed but disabled (35% opacity).
 */
export function PlayerPicker({
  value,
  onChange,
  label,
  disabledIds,
}: {
  value: number | null;
  onChange: (id: number) => void;
  label: string;
  disabledIds: ReadonlyArray<number>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data } = useListPlayers({ search, page: 1, limit: 20 });
  const { data: selected } = useGetPlayer(value ?? 0, {
    query: { enabled: !!value, queryKey: getGetPlayerQueryKey(value ?? 0) },
  });
  const buttonLabel = selected ? `${selected.givenName} ${selected.surname}` : `Select ${label}...`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`Choose ${label}`}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {buttonLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search players..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No players found.</CommandEmpty>
            <CommandGroup>
              {data?.players.map((p) => {
                const taken = disabledIds.includes(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={String(p.id)}
                    disabled={taken}
                    data-taken={taken || undefined}
                    className={cn(taken && "opacity-35")}
                    onSelect={() => {
                      if (taken) return;
                      onChange(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="flex-1">
                      {p.surname}, {p.givenName}
                    </span>
                    <span className="ml-2 flex flex-wrap gap-1">
                      {sortGradesBySeniority(
                        (p.gradesPlayed || "")
                          .split(",")
                          .map((g) => g.trim())
                          .filter((g) => g && g !== "CLUB TOTAL"),
                      ).map((g) => (
                        <GradeBadge key={g} grade={g} size="sm" />
                      ))}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function metaLine(p: PlayerDetail): string {
  const grades = sortGradesBySeniority(
    (p.gradesPlayed || "")
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g && g !== "CLUB TOTAL"),
  );
  return [
    p.cardRole,
    grades.slice(0, 2).join(", ") || null,
    p.debutSeason != null ? `${seasonLabel(p.debutSeason)}–` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PlayerCard({
  slot,
  id,
  detail,
  slots,
  onPick,
}: {
  slot: Slot;
  id: number | null;
  detail: PlayerDetail | undefined;
  slots: Slots;
  onPick: (slot: Slot, id: number | null) => void;
}) {
  const color = chartColor(SLOT_TOKENS[slot]);
  const name = detail ? `${detail.givenName} ${detail.surname}` : null;
  const others = SLOTS.filter((s) => s !== slot)
    .map((s) => slots[s])
    .filter((v): v is number => v != null);
  const empty = id == null;

  return (
    <section
      data-testid={`player-card-${slot}`}
      aria-label={
        empty ? `${SLOT_LABELS[slot]}: empty` : `${SLOT_LABELS[slot]}: ${name ?? "loading"}`
      }
      className="relative flex min-w-0 flex-col gap-4 rounded-[16px] border bg-card p-[22px]"
      style={{ borderTop: `3px solid ${empty ? "hsl(var(--border))" : color}` }}
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-full font-serif text-[22px] font-bold",
            empty ? "border-2 border-dashed text-muted-foreground" : "bg-muted",
          )}
          style={empty ? undefined : { boxShadow: `0 0 0 2px ${color}`, color }}
        >
          {empty ? (
            <Plus className="h-5 w-5" />
          ) : detail?.imageUrl ? (
            <img src={detail.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsOf(name ?? "")
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[26px] font-bold uppercase leading-none [text-wrap:balance]">
            {empty
              ? slot === "c"
                ? "Add a third player"
                : `Choose ${SLOT_LABELS[slot]}`
              : (name ?? "…")}
          </h2>
          {!empty && detail && (
            <p className="mt-1 truncate text-[12.5px] text-muted-foreground">{metaLine(detail)}</p>
          )}
          {empty && slot === "c" && (
            <p className="mt-1 text-[12.5px] text-muted-foreground">Optional</p>
          )}
        </div>
        {!empty && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onPick(slot, null)}
            aria-label={`Remove ${name ?? SLOT_LABELS[slot]}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <PlayerPicker
        value={id}
        onChange={(v) => onPick(slot, v)}
        label={SLOT_LABELS[slot]}
        disabledIds={others}
      />
    </section>
  );
}

/** Up to three player cards (the third optional), auto-fit 260px. */
export function PlayerCards({
  slots,
  details,
  onPick,
}: {
  slots: Slots;
  details: Record<Slot, PlayerDetail | undefined>;
  onPick: (slot: Slot, id: number | null) => void;
}) {
  return (
    <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
      {SLOTS.map((slot) => (
        <PlayerCard
          key={slot}
          slot={slot}
          id={slots[slot]}
          detail={details[slot]}
          slots={slots}
          onPick={onPick}
        />
      ))}
    </div>
  );
}
