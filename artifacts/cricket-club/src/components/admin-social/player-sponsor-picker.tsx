import { useState } from "react";
import { useListPlayers, getListPlayersQueryKey } from "@workspace/api-client-react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

export type PickedPlayer = { id: number; name: string };

/**
 * Player sponsors: the senior players a sponsor backs. Their cards carry this
 * sponsor in place of the club strip. Search the club's players (the directory
 * holds senior players only) and remove a player with their chip's ×.
 */
export function PlayerSponsorPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: PickedPlayer[] | null | undefined;
  onChange: (next: PickedPlayer[]) => void;
}) {
  const [search, setSearch] = useState("");
  const params = { search, limit: 8 };
  const playersQ = useListPlayers(params, {
    query: { queryKey: getListPlayersQueryKey(params), enabled: search.trim().length >= 2 },
  });
  const picked = value ?? [];
  const pickedIds = new Set(picked.map((p) => p.id));
  const hits = (search.trim().length >= 2 ? (playersQ.data?.players ?? []) : []).filter(
    (p) => !pickedIds.has(p.id),
  );

  return (
    <div className="space-y-2">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
            >
              {p.name || `Player #${p.id}`}
              <button
                type="button"
                aria-label={`Remove ${p.name || `player #${p.id}`}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(picked.filter((x) => x.id !== p.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players to add"
        className="h-8 max-w-xs"
      />
      {hits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hits.map((p) => {
            const name = `${p.givenName} ${p.surname}`.trim();
            return (
              <button
                key={p.id}
                type="button"
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50"
                onClick={() => {
                  onChange([...picked, { id: p.id, name }]);
                  setSearch("");
                }}
              >
                + {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
