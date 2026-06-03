import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminTeamOfDecadeBoards,
  useCreateTeamOfDecadeBoard,
  useUpdateTeamOfDecadeBoard,
  useDeleteTeamOfDecadeBoard,
  useCreateTeamOfDecadeMember,
  useUpdateTeamOfDecadeMember,
  useDeleteTeamOfDecadeMember,
  getListAdminTeamOfDecadeBoardsQueryKey,
} from "@workspace/api-client-react";
import type {
  TeamOfDecadeBoard,
  TeamOfDecadeMember,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  PlayerTypeahead,
  type SelectedPlayer,
} from "@/components/player-typeahead";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type BoardFormValues = {
  key: string;
  title: string;
  teamLabel: string;
  periodLabel: string;
  subtitle: string;
  published: boolean;
  displayOrder: number;
};

export default function AdminTeamOfDecade() {
  const queryClient = useQueryClient();
  const { data: boards, isLoading } = useListAdminTeamOfDecadeBoards();
  const createBoard = useCreateTeamOfDecadeBoard();
  const updateBoard = useUpdateTeamOfDecadeBoard();
  const deleteBoard = useDeleteTeamOfDecadeBoard();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListAdminTeamOfDecadeBoardsQueryKey(),
    });

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = useMemo(() => {
    if (!boards) return [];
    return [...boards].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    );
  }, [boards]);

  const moveBoard = (index: number, dir: -1 | 1) => {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    setError(null);
    updateBoard.mutate(
      { id: a.id, data: { displayOrder: b.displayOrder } },
      {
        onError: onMutationError,
        onSuccess: () => {
          updateBoard.mutate(
            { id: b.id, data: { displayOrder: a.displayOrder } },
            { onSuccess: invalidate, onError: onMutationError },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">
            Admin · Team of the Decade
          </h1>
          <p className="text-muted-foreground mt-1">
            Curate best-XI honour boards. Each board appears as its own card on
            the Honour Boards page once published. Drafts stay hidden from the
            public.
          </p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          variant={showNew ? "outline" : "default"}
        >
          {showNew ? "Close form" : "New board"}
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
            <CardTitle>New board</CardTitle>
          </CardHeader>
          <CardContent>
            <BoardForm
              initial={{
                key: "",
                title: "",
                teamLabel: "",
                periodLabel: "",
                subtitle: "",
                published: false,
                displayOrder:
                  (sorted[sorted.length - 1]?.displayOrder ?? -1) + 1,
              }}
              autoKey
              pending={createBoard.isPending}
              onSubmit={(values) => {
                setError(null);
                createBoard.mutate(
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
              submitLabel="Create board"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            No Team of the Decade boards yet.
          </CardContent>
        </Card>
      ) : (
        sorted.map((board, index) => (
          <Card key={board.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-xl">
                  {board.title}
                  {board.published ? (
                    <span className="ml-2 align-middle text-xs font-normal rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                      Published
                    </span>
                  ) : (
                    <span className="ml-2 align-middle text-xs font-normal rounded bg-muted text-muted-foreground px-2 py-0.5">
                      Draft
                    </span>
                  )}
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  slug: <code>{board.key}</code> · order {board.displayOrder} ·{" "}
                  {board.members.length}{" "}
                  {board.members.length === 1 ? "player" : "players"}
                  {(board.teamLabel || board.periodLabel) && (
                    <>
                      {" "}
                      ·{" "}
                      {[board.teamLabel, board.periodLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </>
                  )}
                </div>
              </div>
              <div className="space-x-2 shrink-0">
                <Button
                  size="sm"
                  variant={board.published ? "outline" : "default"}
                  disabled={updateBoard.isPending}
                  onClick={() => {
                    setError(null);
                    updateBoard.mutate(
                      { id: board.id, data: { published: !board.published } },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                >
                  {board.published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === 0 || updateBoard.isPending}
                  onClick={() => moveBoard(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    index === sorted.length - 1 || updateBoard.isPending
                  }
                  onClick={() => moveBoard(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditingId(editingId === board.id ? null : board.id)
                  }
                >
                  {editingId === board.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      !confirm(
                        `Delete board "${board.title}" and all its players?`,
                      )
                    )
                      return;
                    setError(null);
                    deleteBoard.mutate(
                      { id: board.id },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                  disabled={deleteBoard.isPending}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {editingId === board.id && (
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <BoardForm
                    initial={{
                      key: board.key,
                      title: board.title,
                      teamLabel: board.teamLabel,
                      periodLabel: board.periodLabel,
                      subtitle: board.subtitle,
                      published: board.published,
                      displayOrder: board.displayOrder,
                    }}
                    pending={updateBoard.isPending}
                    onSubmit={(values) => {
                      setError(null);
                      updateBoard.mutate(
                        { id: board.id, data: values },
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
                  />
                </div>
              )}

              {board.subtitle && (
                <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">
                  {board.subtitle}
                </p>
              )}

              <MembersManager
                board={board}
                onError={onMutationError}
                onChanged={invalidate}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function BoardForm({
  initial,
  autoKey,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: BoardFormValues;
  autoKey?: boolean;
  pending: boolean;
  onSubmit: (values: BoardFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial.title);
  const [key, setKey] = useState(initial.key);
  const [keyTouched, setKeyTouched] = useState(!autoKey);
  const [teamLabel, setTeamLabel] = useState(initial.teamLabel);
  const [periodLabel, setPeriodLabel] = useState(initial.periodLabel);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [published, setPublished] = useState(initial.published);
  const [displayOrder, setDisplayOrder] = useState(initial.displayOrder);

  const effectiveKey = autoKey && !keyTouched ? slugify(title) : key;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Team of the Decade 2010–2019"
          />
        </div>
        <div className="space-y-1">
          <Label>Key (slug)</Label>
          <Input
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            placeholder="auto from title"
          />
        </div>
        <div className="space-y-1">
          <Label>Team / grade label</Label>
          <Input
            value={teamLabel}
            onChange={(e) => setTeamLabel(e.target.value)}
            placeholder="e.g. A Grade"
          />
        </div>
        <div className="space-y-1">
          <Label>Period / decade label</Label>
          <Input
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="e.g. 2010s"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Subtitle</Label>
          <Input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) =>
              setDisplayOrder(parseInt(e.target.value, 10) || 0)
            }
          />
        </div>
        <label className="flex items-center gap-2 text-sm self-end pb-2">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published (visible to public)
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || !title.trim() || !effectiveKey.trim()}
          onClick={() =>
            onSubmit({
              key: effectiveKey.trim(),
              title: title.trim(),
              teamLabel: teamLabel.trim(),
              periodLabel: periodLabel.trim(),
              subtitle: subtitle.trim(),
              published,
              displayOrder,
            })
          }
        >
          {submitLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function splitName(id: number, fullName: string): SelectedPlayer {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { id, givenName: fullName.trim(), surname: "" };
  const surname = parts[parts.length - 1];
  const givenName = parts.slice(0, -1).join(" ");
  return { id, givenName, surname };
}

function MembersManager({
  board,
  onError,
  onChanged,
}: {
  board: TeamOfDecadeBoard;
  onError: (e: unknown) => void;
  onChanged: () => void;
}) {
  const createMember = useCreateTeamOfDecadeMember();
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const members = [...board.members].sort(
    (a, b) =>
      a.battingOrder - b.battingOrder ||
      a.displayOrder - b.displayOrder ||
      a.id - b.id,
  );

  const add = () => {
    const resolvedName = player
      ? `${player.givenName} ${player.surname}`.trim()
      : name.trim();
    if (!resolvedName) return;
    createMember.mutate(
      {
        id: board.id,
        data: {
          playerId: player?.id ?? null,
          name: resolvedName,
          battingOrder: members.length + 1,
          role: role.trim(),
          displayOrder: members.length,
        },
      },
      {
        onSuccess: () => {
          setPlayer(null);
          setName("");
          setRole("");
          onChanged();
        },
        onError,
      },
    );
  };

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <h4 className="text-sm font-bold uppercase tracking-wide text-primary">
        Lineup
      </h4>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No players in this XI yet.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              onError={onError}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      <div className="rounded-md border border-border bg-background p-3 space-y-2">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Player (search & link)</Label>
            <PlayerTypeahead value={player} onChange={setPlayer} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Or plain-text name (if not linking)
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Smith"
              disabled={!!player}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role (optional)</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Opening batter"
            />
          </div>
        </div>
        <Button
          size="sm"
          disabled={
            createMember.isPending ||
            (!player && !name.trim())
          }
          onClick={add}
        >
          {createMember.isPending ? "Adding…" : "Add player"}
        </Button>
      </div>
    </div>
  );
}

function MemberRow({
  member,
  onError,
  onChanged,
}: {
  member: TeamOfDecadeMember;
  onError: (e: unknown) => void;
  onChanged: () => void;
}) {
  const update = useUpdateTeamOfDecadeMember();
  const remove = useDeleteTeamOfDecadeMember();
  const [editing, setEditing] = useState(false);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    member.playerId != null ? splitName(member.playerId, member.name) : null,
  );
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [battingOrder, setBattingOrder] = useState(member.battingOrder);

  const patch = (data: Parameters<typeof update.mutate>[0]["data"]) => {
    update.mutate(
      { id: member.id, data },
      { onSuccess: onChanged, onError },
    );
  };

  const badges: string[] = [];
  if (member.isCaptain) badges.push("C");
  if (member.isViceCaptain) badges.push("VC");
  if (member.isWicketkeeper) badges.push("WK");

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-muted-foreground w-6 text-right">
            {member.battingOrder}
          </span>
          <span className="font-semibold truncate">{member.name}</span>
          {member.playerId == null && (
            <span className="text-xs text-muted-foreground italic">
              (unlinked)
            </span>
          )}
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
            >
              {b}
            </span>
          ))}
          {member.role && (
            <span className="text-xs text-muted-foreground italic truncate">
              {member.role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={remove.isPending}
            onClick={() => {
              if (!confirm(`Remove ${member.name} from this XI?`)) return;
              remove.mutate(
                { id: member.id },
                { onSuccess: onChanged, onError },
              );
            }}
          >
            Remove
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 pl-8">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={member.isCaptain}
            onChange={(e) => patch({ isCaptain: e.target.checked })}
            disabled={update.isPending}
          />
          Captain
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={member.isViceCaptain}
            onChange={(e) => patch({ isViceCaptain: e.target.checked })}
            disabled={update.isPending}
          />
          Vice-captain
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={member.isWicketkeeper}
            onChange={(e) => patch({ isWicketkeeper: e.target.checked })}
            disabled={update.isPending}
          />
          Wicketkeeper
        </label>
      </div>

      {editing && (
        <div className="grid gap-2 md:grid-cols-2 pl-8 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Player (search & link)</Label>
            <PlayerTypeahead
              value={player}
              onChange={(p) => {
                setPlayer(p);
                if (p) setName(`${p.givenName} ${p.surname}`.trim());
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Batting order</Label>
            <Input
              type="number"
              value={battingOrder}
              onChange={(e) =>
                setBattingOrder(parseInt(e.target.value, 10) || 0)
              }
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Button
              size="sm"
              disabled={update.isPending || !name.trim()}
              onClick={() => {
                update.mutate(
                  {
                    id: member.id,
                    data: {
                      playerId: player?.id ?? null,
                      name: name.trim(),
                      role: role.trim(),
                      battingOrder,
                    },
                  },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      onChanged();
                    },
                    onError,
                  },
                );
              }}
            >
              Save player
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
