import { useEffect, useId, useState } from "react";
import {
  useSearchSquadPlayers,
  getSearchSquadPlayersQueryKey,
  type SquadPlayerSearchHit,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** The club player a squad member is linked to. `name` is null when it can't be resolved. */
export type LinkedPlayer = { id: number; name: string | null };

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Pick the club player a squad member is (Admin → Availability edit drawer).
 * Searches the club's players by name; a player already linked to another
 * member is shown but can't be picked. Admin only — results can include
 * private players.
 */
export function SquadPlayerPicker({
  memberId,
  value,
  onChange,
}: {
  memberId: number;
  value: LinkedPlayer | null;
  onChange: (p: LinkedPlayer | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(query.trim());
  const params = { q };
  const { data, isFetching } = useSearchSquadPlayers(params, {
    query: { enabled: q.length >= 2, queryKey: getSearchSquadPlayersQueryKey(params) },
  });
  const hits = q.length >= 2 ? (data ?? []) : [];
  const takenElsewhere = (h: SquadPlayerSearchHit) =>
    h.alreadyLinkedTo != null && h.alreadyLinkedTo.memberId !== memberId;
  const showList = open && q.length >= 2 && (data !== undefined || !isFetching);

  useEffect(() => setActive(0), [q]);

  const pick = (h: SquadPlayerSearchHit) => {
    if (takenElsewhere(h)) return;
    onChange({ id: h.playerId, name: h.displayName });
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-2 text-sm"
        data-testid="linked-player"
      >
        {value ? (
          <>
            <span className="font-medium">{value.name ?? `Player #${value.id}`}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              Unlink
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">Not linked</span>
        )}
      </div>
      <div className="relative">
        <Input
          id="member-linked"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && hits[active] ? `${listId}-${hits[active]!.playerId}` : undefined
          }
          autoComplete="off"
          placeholder={value ? "Search to change player" : "Search club players"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!showList || hits.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const h = hits[active];
              if (h) pick(h);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Club players"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-lg"
          >
            {hits.length === 0 ? (
              <li className="p-3 text-sm italic text-muted-foreground">No players matched.</li>
            ) : (
              hits.map((h, i) => {
                const taken = takenElsewhere(h);
                return (
                  <li
                    key={h.playerId}
                    id={`${listId}-${h.playerId}`}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={taken}
                    className={`px-3 py-2 text-sm ${
                      taken
                        ? "cursor-not-allowed text-muted-foreground"
                        : "cursor-pointer hover:bg-muted"
                    } ${i === active ? "bg-muted" : ""}`}
                    // Mouse down, not click, so the input's blur doesn't close the list first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(h);
                    }}
                  >
                    <span className="font-medium">{h.displayName}</span>
                    {h.lastSeason && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        last played {h.lastSeason}
                      </span>
                    )}
                    {taken && (
                      <span className="block text-xs">
                        Already linked to {h.alreadyLinkedTo!.name}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
