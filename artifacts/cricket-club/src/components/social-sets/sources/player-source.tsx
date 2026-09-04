import { useState } from "react";
import {
  useListPlayers,
  getListPlayersQueryKey,
  type Player,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { LoadingState } from "@/components/data-states";
import type { ShareCardInput, StatLine } from "@/lib/share-card";

/** Search players by name and add a player-spotlight slide. */
export function PlayerSource({ onAdd }: { onAdd: (i: ShareCardInput) => void }) {
  const [search, setSearch] = useState("");
  const params = { search: search.trim(), limit: 15 };
  const playersQ = useListPlayers(params, {
    query: {
      enabled: search.trim().length > 1,
      queryKey: getListPlayersQueryKey(params),
    },
  });
  const players = playersQ.data?.players ?? [];

  const playerToInput = (p: Player): ShareCardInput => {
    const stats: StatLine[] = [
      { label: "Games", value: p.totalGames ?? 0 },
      { label: "Runs", value: p.totalRuns ?? 0 },
      { label: "Wickets", value: p.totalWickets ?? 0 },
    ];
    if ((p.premiershipsWon ?? 0) > 0) {
      stats.push({ label: "Premierships", value: p.premiershipsWon ?? 0 });
    }
    return {
      kind: "player",
      playerName: `${p.givenName} ${p.surname}`.trim(),
      gradesPlayed: p.gradesPlayed,
      stats,
      photoUrl: p.imageUrl,
    };
  };

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players by name…"
      />
      {search.trim().length > 1 && (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {playersQ.isLoading ? (
            <LoadingState label="Searching…" />
          ) : players.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players found.</p>
          ) : (
            players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAdd(playerToInput(p))}
                className="flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm hover:border-primary"
              >
                <span>
                  {p.givenName} {p.surname}
                </span>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
