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
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    initial.playerId != null
      ? { id: initial.playerId, surname: knownName ?? "Linked", givenName: "" }
      : null,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      season,
      playerId: player?.id ?? null,
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
          <p className="text-xs text-muted-foreground">
            Shown as {formatSeason(season || 0)}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Linked player (optional)</Label>
          <PlayerTypeahead
            value={player}
            onChange={(p) => {
              setPlayer(p);
              if (p) setName(`${p.givenName} ${p.surname}`.trim());
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Winner name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
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
