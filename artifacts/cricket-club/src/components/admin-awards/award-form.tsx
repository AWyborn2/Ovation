import { useState } from "react";
import type { AwardMechanism } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GRADES } from "./constants";
import { slugify } from "./helpers";
import type { AwardFormValues } from "./types";

export function AwardForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  autoKey,
}: {
  initial: AwardFormValues;
  pending: boolean;
  onSubmit: (v: AwardFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  autoKey?: boolean;
}) {
  const [key, setKey] = useState(initial.key);
  const [keyTouched, setKeyTouched] = useState(!autoKey);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [displayOrder, setDisplayOrder] = useState(initial.displayOrder);
  const [mechanism, setMechanism] = useState<AwardMechanism>(initial.mechanism);
  const [published, setPublished] = useState(initial.published);
  const [pointsGrade, setPointsGrade] = useState<string>(
    initial.pointsGrade ?? GRADES[0],
  );

  const effectiveKey = autoKey && !keyTouched ? slugify(title) : key;
  // 3-2-1 voting attaches only to voted awards.
  const votingEnabled = mechanism === "voted";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveKey.trim()) return;
    onSubmit({
      key: effectiveKey.trim(),
      title: title.trim(),
      description: description.trim(),
      displayOrder,
      votingEnabled,
      mechanism,
      published,
      pointsGrade: mechanism === "points" ? pointsGrade : null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Peter Wyllie Medal"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            placeholder="peter-wyllie-medal"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description (optional)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Display order</Label>
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="space-y-2">
          <Label>How is the winner decided?</Label>
          <select
            value={mechanism}
            onChange={(e) => setMechanism(e.target.value as AwardMechanism)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="manual">Manual — admin records the winner</option>
            <option value="voted">Voted — captains vote 3-2-1</option>
            <option value="points">Points — ranked from match stats</option>
          </select>
        </div>
      </div>

      {mechanism === "points" && (
        <div className="space-y-2">
          <Label>Grade scored for points</Label>
          <select
            value={pointsGrade}
            onChange={(e) => setPointsGrade(e.target.value)}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm md:w-64"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Leaderboards are computed from this grade's match stats per season.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Visibility</Label>
        <label className="flex items-center gap-2 text-sm pt-1">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published (visible on the website and mobile app)
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !title.trim() || !effectiveKey.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
