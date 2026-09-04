import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListFixtures,
  useCreateFixture,
  useUpdateFixture,
  useDeleteFixture,
  useGetFixtureTeamList,
  usePutFixtureTeamList,
  getListFixturesQueryKey,
  getGetFixtureTeamListQueryKey,
  useGetSocialSettings,
  useUpdateSocialSettings,
  getGetSocialSettingsQueryKey,
} from "@workspace/api-client-react";
import type { Fixture, TeamListPlayer } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const TEAM_LIST_ROWS = 12;

type FixtureFormValues = {
  grade: string;
  roundLabel: string;
  opponentName: string;
  venue: string;
  startAt: string; // datetime-local value
  isHome: boolean;
  notes: string;
};

/** ISO date-time → value usable in an <input type="datetime-local">. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminFixtures() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: fixtures, isLoading, isError, refetch } = useListFixtures();
  const createFixture = useCreateFixture();
  const updateFixture = useUpdateFixture();
  const deleteFixture = useDeleteFixture();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [teamListId, setTeamListId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListFixturesQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  // Upcoming fixtures first (soonest at the top), then past fixtures
  // (most recent first).
  const sorted = useMemo(() => {
    if (!fixtures) return [];
    const now = Date.now();
    const upcoming = fixtures
      .filter((f: Fixture) => new Date(f.startAt).getTime() >= now)
      .sort(
        (a: Fixture, b: Fixture) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
    const past = fixtures
      .filter((f: Fixture) => new Date(f.startAt).getTime() < now)
      .sort(
        (a: Fixture, b: Fixture) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
      );
    return [...upcoming, ...past];
  }, [fixtures]);

  const buildBody = (v: FixtureFormValues) => ({
    grade: v.grade,
    roundLabel: v.roundLabel.trim() || null,
    opponentName: v.opponentName.trim(),
    venue: v.venue.trim() || null,
    startAt: new Date(v.startAt).toISOString(),
    isHome: v.isHome,
    notes: v.notes.trim() || null,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">
            Upcoming fixtures and team lists. These feed the Match Day, Team List and Countdown
            social cards.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} variant={showNew ? "outline" : "default"}>
          {showNew ? "Close form" : "New fixture"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <SeasonStartCard onError={onMutationError} />

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle>New fixture</CardTitle>
          </CardHeader>
          <CardContent>
            <FixtureForm
              initial={{
                grade: GRADES[0],
                roundLabel: "",
                opponentName: "",
                venue: "",
                startAt: "",
                isHome: true,
                notes: "",
              }}
              pending={createFixture.isPending}
              onSubmit={(v) => {
                setError(null);
                createFixture.mutate(
                  { data: buildBody(v) },
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
              submitLabel="Add fixture"
            />
          </CardContent>
        </Card>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No fixtures yet"
          message="Add an upcoming fixture to start building match-day cards."
        />
      ) : (
        sorted.map((f) => (
          <Card key={f.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">
                  {f.isHome ? "vs" : "@"} {f.opponentName}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {f.grade}
                    {f.roundLabel ? ` · ${f.roundLabel}` : ""}
                  </span>
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatStart(f.startAt)}
                  {f.venue ? ` · ${f.venue}` : ""}
                  {new Date(f.startAt).getTime() < Date.now() && " · past"}
                </div>
              </div>
              <div className="space-x-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTeamListId(teamListId === f.id ? null : f.id)}
                >
                  {teamListId === f.id ? "Close team list" : "Team list"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(editingId === f.id ? null : f.id)}
                >
                  {editingId === f.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: "Delete fixture",
                        description: `Delete the ${f.grade} fixture against ${f.opponentName}? Its team list is deleted with it.`,
                        confirmText: "Delete",
                        destructive: true,
                      }))
                    )
                      return;
                    setError(null);
                    deleteFixture.mutate(
                      { id: f.id },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                  disabled={deleteFixture.isPending}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            {(editingId === f.id || teamListId === f.id || f.notes) && (
              <CardContent className="space-y-6">
                {editingId === f.id && (
                  <FixtureForm
                    initial={{
                      grade: f.grade,
                      roundLabel: f.roundLabel ?? "",
                      opponentName: f.opponentName,
                      venue: f.venue ?? "",
                      startAt: toLocalInputValue(f.startAt),
                      isHome: f.isHome,
                      notes: f.notes ?? "",
                    }}
                    pending={updateFixture.isPending}
                    onSubmit={(v) => {
                      setError(null);
                      updateFixture.mutate(
                        { id: f.id, data: buildBody(v) },
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
                )}
                {teamListId === f.id && <TeamListEditor fixture={f} onError={onMutationError} />}
                {editingId !== f.id && teamListId !== f.id && f.notes && (
                  <p className="text-sm text-muted-foreground italic">{f.notes}</p>
                )}
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function SeasonStartCard({ onError }: { onError: (e: unknown) => void }) {
  const queryClient = useQueryClient();
  const settingsQ = useGetSocialSettings();
  const update = useUpdateSocialSettings();
  const saved = settingsQ.data?.settings.seasonStartDate ?? null;
  const [value, setValue] = useState<string | null>(null); // null = untouched
  const shown = value ?? (saved ? String(saved).slice(0, 10) : "");

  const save = (seasonStartDate: string | null) => {
    update.mutate(
      { data: { seasonStartDate } },
      {
        onSuccess: () => {
          setValue(null);
          queryClient.invalidateQueries({ queryKey: getGetSocialSettingsQueryKey() });
        },
        onError,
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Season start date</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Countdown cards count down to the earliest upcoming fixture. Set a date here to override
          that (e.g. before any fixtures are entered).
        </p>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label>Override date</Label>
            <Input
              type="date"
              value={shown}
              onChange={(e) => setValue(e.target.value)}
              className="w-auto"
            />
          </div>
          <Button
            size="sm"
            disabled={update.isPending || value === null || value === ""}
            onClick={() => value && save(new Date(`${value}T00:00:00`).toISOString())}
          >
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          {saved && (
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => save(null)}
            >
              Clear override
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FixtureForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FixtureFormValues;
  pending: boolean;
  onSubmit: (v: FixtureFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [grade, setGrade] = useState(initial.grade);
  const [roundLabel, setRoundLabel] = useState(initial.roundLabel);
  const [opponentName, setOpponentName] = useState(initial.opponentName);
  const [venue, setVenue] = useState(initial.venue);
  const [startAt, setStartAt] = useState(initial.startAt);
  const [isHome, setIsHome] = useState(initial.isHome);
  const [notes, setNotes] = useState(initial.notes);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentName.trim() || !startAt) return;
    onSubmit({ grade, roundLabel, opponentName, venue, startAt, isHome, notes });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Grade</Label>
          <select className={selectClass} value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Opponent</Label>
          <Input value={opponentName} onChange={(e) => setOpponentName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Round label (optional, e.g. "Round 7")</Label>
          <Input value={roundLabel} onChange={(e) => setRoundLabel(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Date & time</Label>
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Venue (optional)</Label>
          <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Home fixture</Label>
          <div className="pt-2">
            <Switch checked={isHome} onCheckedChange={setIsHome} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !opponentName.trim() || !startAt}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// One editable row of the XI: either a register-linked player or a free-typed
// name, plus captain / wicket-keeper markers.
type TeamListRowState = {
  player: SelectedPlayer | null;
  freeName: string;
  isCaptain: boolean;
  isKeeper: boolean;
};

const emptyRow = (): TeamListRowState => ({
  player: null,
  freeName: "",
  isCaptain: false,
  isKeeper: false,
});

function rowsFromPlayers(players: TeamListPlayer[]): TeamListRowState[] {
  const rows = [...players]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      player: p.playerId != null ? { id: p.playerId, surname: p.displayName, givenName: "" } : null,
      freeName: p.playerId == null ? p.displayName : "",
      isCaptain: p.role === "C" || p.role === "C/WK",
      isKeeper: p.role === "WK" || p.role === "C/WK",
    }));
  while (rows.length < TEAM_LIST_ROWS) rows.push(emptyRow());
  return rows.slice(0, TEAM_LIST_ROWS);
}

function TeamListEditor({ fixture, onError }: { fixture: Fixture; onError: (e: unknown) => void }) {
  const queryClient = useQueryClient();
  const listQ = useGetFixtureTeamList(fixture.id);
  const putList = usePutFixtureTeamList();
  const [rows, setRows] = useState<TeamListRowState[] | null>(null); // null = not edited yet
  const [isPublished, setIsPublished] = useState<boolean | null>(null);

  if (listQ.isLoading) return <ListSkeleton />;
  if (listQ.isError) return <QueryError onRetry={() => listQ.refetch()} />;

  const savedPlayers = listQ.data?.players ?? [];
  const shownRows = rows ?? rowsFromPlayers(savedPlayers);
  const shownPublished = isPublished ?? listQ.data?.isPublished ?? false;

  const setRow = (i: number, next: Partial<TeamListRowState>) => {
    const copy = shownRows.map((r, idx) => (idx === i ? { ...r, ...next } : r));
    setRows(copy);
  };

  const save = () => {
    const players: TeamListPlayer[] = [];
    let order = 1;
    for (const r of shownRows) {
      const displayName = r.player
        ? `${r.player.givenName} ${r.player.surname}`.trim()
        : r.freeName.trim();
      if (!displayName) continue;
      const role: TeamListPlayer["role"] =
        r.isCaptain && r.isKeeper ? "C/WK" : r.isCaptain ? "C" : r.isKeeper ? "WK" : undefined;
      players.push({
        order: order++,
        ...(r.player ? { playerId: r.player.id } : {}),
        displayName,
        ...(role ? { role } : {}),
      });
    }
    putList.mutate(
      { id: fixture.id, data: { players, isPublished: shownPublished } },
      {
        onSuccess: () => {
          setRows(null);
          setIsPublished(null);
          queryClient.invalidateQueries({
            queryKey: getGetFixtureTeamListQueryKey(fixture.id),
          });
        },
        onError,
      },
    );
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">Team list</h3>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={shownPublished} onCheckedChange={(v) => setIsPublished(v)} />
          Published
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Pick a player from the register or type a name (e.g. a new signing). Mark the captain (C)
        and wicket-keeper (WK).
      </p>
      <div className="space-y-2">
        {shownRows.map((r, i) => (
          <div key={i} className="grid grid-cols-[24px_1fr_auto] items-center gap-2">
            <span className="text-xs text-muted-foreground text-right">{i + 1}.</span>
            {r.player ? (
              <PlayerTypeahead value={r.player} onChange={(p) => setRow(i, { player: p })} />
            ) : r.freeName ? (
              <Input
                value={r.freeName}
                onChange={(e) => setRow(i, { freeName: e.target.value })}
                placeholder="Type a name"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <PlayerTypeahead
                  value={null}
                  onChange={(p) => setRow(i, { player: p })}
                  placeholder="Search register…"
                />
                <Input
                  value={r.freeName}
                  onChange={(e) => setRow(i, { freeName: e.target.value })}
                  placeholder="…or type a name"
                />
              </div>
            )}
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={r.isCaptain ? "default" : "outline"}
                onClick={() => setRow(i, { isCaptain: !r.isCaptain })}
              >
                C
              </Button>
              <Button
                type="button"
                size="sm"
                variant={r.isKeeper ? "default" : "outline"}
                onClick={() => setRow(i, { isKeeper: !r.isKeeper })}
              >
                WK
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button onClick={save} disabled={putList.isPending}>
          {putList.isPending ? "Saving…" : "Save team list"}
        </Button>
        {(rows !== null || isPublished !== null) && (
          <Button
            variant="outline"
            onClick={() => {
              setRows(null);
              setIsPublished(null);
            }}
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
