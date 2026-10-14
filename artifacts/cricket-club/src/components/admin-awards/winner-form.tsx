import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { formatSeason } from "./helpers";
import type { WinnerFormValues } from "./types";

export function WinnerForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  knownName,
}: {
  initial: WinnerFormValues;
  pending: boolean;
  onSubmit: (v: WinnerFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  knownName?: string;
}) {
  const [season, setSeason] = useState(initial.season);
  const [name, setName] = useState(initial.name);
  const [published, setPublished] = useState(initial.published);
  const [nameEdited, setNameEdited] = useState(initial.name.length > 0);
  const [selectionError, setSelectionError] = useState("");
  const [players, setPlayers] = useState<SelectedPlayer[]>(
    (initial.playerIds ?? (initial.playerId == null ? [] : [initial.playerId])).map((id) => ({
      id,
      givenName: "",
      surname:
        initial.recipients?.find((p) => p.playerId === id)?.name ??
        ((initial.playerIds?.length ?? 1) === 1 ? knownName : undefined) ??
        `Player #${id}`,
    })),
  );

  const changePlayers = (next: SelectedPlayer[]) => {
    setPlayers(next);
    if (!nameEdited) setName(next.map((p) => `${p.givenName} ${p.surname}`.trim()).join(" / "));
    setSelectionError("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      season,
      playerIds: players.map((p) => p.id),
      playerId: players[0]?.id ?? null,
      name: name.trim(),
      displayOrder: initial.displayOrder,
      published,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div className="space-y-2">
          <Label>Season (start year)</Label>
          <Input
            type="number"
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value, 10) || 0)}
            min={1900}
            max={2100}
            required
          />
          <p className="text-xs text-muted-foreground">Shown as {formatSeason(season || 0)}</p>
        </div>
        <div className="space-y-2">
          <Label>Linked players (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Add each co-winner separately. The winner name can include people without a profile.
          </p>
          <ol className="space-y-2">
            {players.map((p, index) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
              >
                <span className="flex-1">{`${p.givenName} ${p.surname}`.trim()}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || index === 0}
                  aria-label={`Move ${p.surname} earlier`}
                  onClick={() => {
                    const next = [...players];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    changePlayers(next);
                  }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  aria-label={`Remove link to ${p.surname}`}
                  onClick={() => changePlayers(players.filter((other) => other.id !== p.id))}
                >
                  Unlink
                </Button>
              </li>
            ))}
          </ol>
          <PlayerTypeahead
            value={null}
            onChange={(p) => {
              if (!p || pending) return;
              if (players.some((other) => other.id === p.id)) {
                setSelectionError("That player is already linked.");
                return;
              }
              changePlayers([...players, p]);
            }}
          />
          {selectionError && (
            <p role="alert" className="text-sm text-destructive">
              {selectionError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Winner name</Label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
          }}
          placeholder="Type a name (auto-filled when a player is linked)"
          required
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        Published (visible publicly)
      </label>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
