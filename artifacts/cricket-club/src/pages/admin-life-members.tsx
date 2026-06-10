import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLifeMembers,
  useCreateLifeMember,
  useUpdateLifeMember,
  useDeleteLifeMember,
  getListLifeMembersQueryKey,
} from "@workspace/api-client-react";
import type { LifeMember } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

type FormValues = {
  name: string;
  inductionYear: number;
  isPlayingMember: boolean;
  playerId: number | null;
  roleLabel: string | null;
  blurb: string;
};

export default function AdminLifeMembers() {
  const queryClient = useQueryClient();
  const { data: members, isLoading } = useListLifeMembers();
  const createMember = useCreateLifeMember();
  const updateMember = useUpdateLifeMember();
  const deleteMember = useDeleteLifeMember();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListLifeMembersQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = useMemo(() => {
    if (!members) return [];
    return [...members].sort(
      (a, b) => a.inductionYear - b.inductionYear || a.name.localeCompare(b.name),
    );
  }, [members]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">
            Manage the Life Members honour board. Changes apply immediately to the public page.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} variant={showNew ? "outline" : "default"}>
          {showNew ? "Close form" : "New life member"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle>New life member</CardTitle>
          </CardHeader>
          <CardContent>
            <LifeMemberForm
              initial={{
                name: "",
                inductionYear: new Date().getFullYear(),
                isPlayingMember: true,
                playerId: null,
                roleLabel: null,
                blurb: "",
              }}
              pending={createMember.isPending}
              onSubmit={(values) => {
                setError(null);
                createMember.mutate(
                  { data: values },
                  {
                    onSuccess: () => {
                      setShowNew(false);
                      invalidate();
                    },
                    onError: onMutationError,
                  },
                );
              }}
              onCancel={() => setShowNew(false)}
              submitLabel="Add life member"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            No life members yet.
          </CardContent>
        </Card>
      ) : (
        sorted.map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">
                  {m.name}{" "}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    inducted {m.inductionYear}
                  </span>
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  {m.isPlayingMember ? "Playing member" : "Non-playing member"}
                  {m.roleLabel && <> · {m.roleLabel}</>}
                  {m.playerId != null && <> · player #{m.playerId}</>}
                </div>
              </div>
              <div className="space-x-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                >
                  {editingId === m.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm(`Delete life member "${m.name}"?`)) return;
                    setError(null);
                    deleteMember.mutate(
                      { id: m.id },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                  disabled={deleteMember.isPending}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {editingId === m.id ? (
                <LifeMemberForm
                  initial={{
                    name: m.name,
                    inductionYear: m.inductionYear,
                    isPlayingMember: m.isPlayingMember,
                    playerId: m.playerId ?? null,
                    roleLabel: m.roleLabel ?? null,
                    blurb: m.blurb,
                  }}
                  pending={updateMember.isPending}
                  onSubmit={(values) => {
                    setError(null);
                    updateMember.mutate(
                      { id: m.id, data: values },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          invalidate();
                        },
                        onError: onMutationError,
                      },
                    );
                  }}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save changes"
                  knownPlayer={m as LifeMember}
                />
              ) : m.blurb ? (
                <div className="space-y-2 text-sm italic text-muted-foreground border-l-2 border-primary pl-3">
                  {m.blurb.split(/\n\n+/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No blurb.</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function LifeMemberForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  knownPlayer,
}: {
  initial: FormValues;
  pending: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  knownPlayer?: LifeMember;
}) {
  const [name, setName] = useState(initial.name);
  const [inductionYear, setInductionYear] = useState(initial.inductionYear);
  const [isPlayingMember, setIsPlayingMember] = useState(initial.isPlayingMember);
  const [roleLabel, setRoleLabel] = useState(initial.roleLabel ?? "");
  const [blurb, setBlurb] = useState(initial.blurb);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    initial.playerId != null
      ? { id: initial.playerId, surname: knownPlayer?.name ?? "Linked", givenName: "" }
      : null,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      inductionYear,
      isPlayingMember,
      playerId: player?.id ?? null,
      roleLabel: roleLabel.trim() || null,
      blurb,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Induction year</Label>
          <Input
            type="number"
            value={inductionYear}
            onChange={(e) => setInductionYear(parseInt(e.target.value, 10))}
            min={1900}
            max={2100}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Member type</Label>
          <div className="flex gap-3 text-sm pt-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={isPlayingMember}
                onChange={() => setIsPlayingMember(true)}
              />
              Playing
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!isPlayingMember}
                onChange={() => setIsPlayingMember(false)}
              />
              Non-playing
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Role label (optional, e.g. "Scorer")</Label>
          <Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Linked player (optional)</Label>
        <PlayerTypeahead value={player} onChange={setPlayer} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="blurb">
          Blurb{" "}
          <span className="text-xs text-muted-foreground font-normal">
            (use a blank line between paragraphs)
          </span>
        </Label>
        <textarea
          id="blurb"
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          rows={8}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans"
        />
      </div>

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
