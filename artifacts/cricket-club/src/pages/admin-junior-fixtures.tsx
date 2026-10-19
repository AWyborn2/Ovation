import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorFixtures,
  useGetJuniorFixtureTeamList,
  usePutJuniorFixtureTeamList,
  getGetJuniorFixtureTeamListQueryKey,
  getListJuniorFixturesQueryKey,
  getGetJuniorFixtureQueryKey,
  type JuniorTeamListCandidate,
} from "@workspace/api-client-react";
import { AlertTriangle, ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WeekendCarousel } from "@/components/weekend-carousel";
import { Switch } from "@/components/ui/switch";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { seasonLabel } from "@/lib/season-label";
import {
  addRow,
  moveRow,
  removeRow,
  rowsFromPlayers,
  toPayload,
  toggleRole,
  type JuniorEditorRow,
  type JuniorRoleKey,
} from "@/lib/junior-team-list";
import { fmtJuniorStart, juniorFixtureTitle } from "@/lib/junior-fixtures";

/**
 * Junior fixtures admin (junior PlayHQ sync plan U6; KTD9, R8, R9, R17). Lists the
 * club's upcoming junior games and edits each game's team list: the club's own
 * junior players only, with each player's junior shirt number for the season,
 * order, and captain / vice-captain / keeper. A list the PlayHQ sync copied is
 * marked as such; saving makes it the admin's, and the sync never overwrites it.
 * Admins always see full names; a player withheld publicly is flagged.
 */

const MAX_MATCHES = 8;

export default function AdminJuniorFixtures() {
  const listQ = useListJuniorFixtures();
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h2 className="text-xl font-semibold">Junior fixtures</h2>
        <p className="text-sm text-muted-foreground">
          Upcoming junior games synced from PlayHQ. Open a game to check or change its team list.
        </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <WeekendCarousel initialAudience="junior" />
          <WeekendCarousel initialType="teamList" initialAudience="junior" />
        </div>
      </div>
      {listQ.isError ? (
        <QueryError onRetry={() => listQ.refetch()} />
      ) : listQ.isLoading ? (
        <ListSkeleton />
      ) : !listQ.data || listQ.data.length === 0 ? (
        <EmptyState
          title="No upcoming junior games"
          message="Junior games appear here once junior sync is on for the club and PlayHQ has scheduled them."
        />
      ) : (
        <div className="space-y-3">
          {listQ.data.map((f) => (
            <Card key={f.id} data-testid={`admin-junior-fixture-${f.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-base">{juniorFixtureTitle(f)}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {[f.ageGroup, f.grade, fmtJuniorStart(f.startAt), f.venue]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={openId === f.id ? "default" : "outline"}
                  onClick={() => setOpenId(openId === f.id ? null : f.id)}
                >
                  {openId === f.id ? "Close" : f.hasTeamList ? "Team list" : "Name team"}
                </Button>
              </CardHeader>
              {openId === f.id && (
                <CardContent>
                  <JuniorTeamListEditor fixtureId={f.id} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const ROLE_BUTTONS: { key: JuniorRoleKey; label: string }[] = [
  { key: "captain", label: "C" },
  { key: "vice", label: "VC" },
  { key: "keeper", label: "WK" },
];

function candidateRow(c: JuniorTeamListCandidate): JuniorEditorRow {
  return {
    participantId: c.participantId,
    name: c.name,
    shirtNumber: c.shirtNumber,
    isPrivate: c.isPrivate,
    captain: false,
    vice: false,
    keeper: false,
  };
}

export function JuniorTeamListEditor({ fixtureId }: { fixtureId: number }) {
  const qc = useQueryClient();
  const q = useGetJuniorFixtureTeamList(fixtureId);
  const put = usePutJuniorFixtureTeamList();
  const [rows, setRows] = useState<readonly JuniorEditorRow[] | null>(null); // null = unedited
  const [published, setPublished] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const savedRows = useMemo(() => rowsFromPlayers(q.data?.teamList?.players ?? []), [q.data]);
  const shown = rows ?? savedRows;
  const onList = useMemo(() => new Set(shown.map((r) => r.participantId)), [shown]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return (q.data?.candidates ?? [])
      .filter((c) => !onList.has(c.participantId) && c.name.toLowerCase().includes(term))
      .slice(0, MAX_MATCHES);
  }, [search, q.data, onList]);

  if (q.isLoading) return <ListSkeleton />;
  if (q.isError || !q.data) return <QueryError onRetry={() => q.refetch()} />;

  const data = q.data;
  const shownPublished = published ?? data.teamList?.isPublished ?? false;
  const numbersOn = data.shirtNumbersEnabled;
  const unnumbered = numbersOn ? shown.filter((r) => !r.shirtNumber).length : 0;
  const dirty = rows !== null || published !== null;

  const save = () => {
    setError(null);
    put.mutate(
      { id: fixtureId, data: { players: toPayload(shown), isPublished: shownPublished } },
      {
        onSuccess: (saved) => {
          qc.setQueryData(getGetJuniorFixtureTeamListQueryKey(fixtureId), saved);
          qc.invalidateQueries({ queryKey: getListJuniorFixturesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetJuniorFixtureQueryKey(fixtureId) });
          setRows(null);
          setPublished(null);
        },
        onError: (e) => setError(handleAdminMutationError(e)),
      },
    );
  };

  return (
    <div className="space-y-3" data-testid="junior-team-list-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" data-testid="team-list-source">
          {data.teamList?.source === "playhq"
            ? "Copied from the side named in PlayHQ. Saving makes it yours: the sync then leaves it alone."
            : data.teamList?.source === "admin"
              ? "Saved by an admin. The PlayHQ sync leaves this list alone."
              : data.teamList?.source === "selection"
                ? "Picked in the Selection Hub. Re-open it there to make changes; after the match PlayHQ's record of who played replaces it."
                : "No team named yet. The sync copies the side once it is named in PlayHQ."}
          {numbersOn && ` Shirt numbers are for the ${seasonLabel(data.season)} season.`}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Switch
            id={`junior-team-list-published-${fixtureId}`}
            checked={shownPublished}
            onCheckedChange={(v) => setPublished(v)}
          />
          <label htmlFor={`junior-team-list-published-${fixtureId}`}>Published</label>
        </div>
      </div>

      {unnumbered > 0 && (
        <div
          data-testid="shirt-number-banner"
          className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {unnumbered === 1
            ? "1 selected player has no shirt number"
            : `${unnumbered} selected players have no shirt number`}{" "}
          for {seasonLabel(data.season)}. Add them in Honours → Junior shirt numbers.
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players on this list yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {shown.map((r, i) => (
            <li
              key={r.participantId}
              data-testid={`junior-team-list-row-${i + 1}`}
              className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5"
            >
              <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}.</span>
              <span
                className="w-10 text-center text-sm font-semibold tabular-nums"
                data-testid="shirt-number"
                title={numbersOn ? "Season shirt number" : "Shirt numbers are off"}
              >
                {r.shirtNumber ? `#${r.shirtNumber}` : numbersOn ? "–" : ""}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              {r.isPrivate && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"
                  title="Private in PlayHQ: shown publicly as Private Player"
                >
                  <AlertTriangle className="h-3.5 w-3.5" /> Private
                </span>
              )}
              <div className="flex gap-1">
                {ROLE_BUTTONS.map((b) => (
                  <Button
                    key={b.key}
                    type="button"
                    size="sm"
                    variant={r[b.key] ? "default" : "outline"}
                    aria-pressed={r[b.key]}
                    onClick={() => setRows(toggleRole(shown, i, b.key))}
                  >
                    {b.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${r.name} up`}
                  disabled={i === 0}
                  onClick={() => setRows(moveRow(shown, i, -1))}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${r.name} down`}
                  disabled={i === shown.length - 1}
                  onClick={() => setRows(moveRow(shown, i, 1))}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${r.name}`}
                  onClick={() => setRows(removeRow(shown, i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="space-y-1.5">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Add a junior player…"
            aria-label="Add a junior player"
            className="pl-8"
          />
        </div>
        {matches.length > 0 && (
          <ul className="max-w-sm divide-y rounded-md border" data-testid="junior-candidates">
            {matches.map((c) => (
              <li key={c.participantId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setRows(addRow(shown, candidateRow(c)));
                    setSearch("");
                  }}
                >
                  <span className="w-10 tabular-nums text-muted-foreground">
                    {c.shirtNumber ? `#${c.shirtNumber}` : ""}
                  </span>
                  <span className="flex-1 truncate">{c.name}</span>
                  {c.teams && (
                    <span className="truncate text-xs text-muted-foreground">{c.teams}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={save} disabled={put.isPending}>
          {put.isPending ? "Saving…" : "Save team list"}
        </Button>
        {dirty && (
          <Button
            variant="outline"
            onClick={() => {
              setRows(null);
              setPublished(null);
              setError(null);
            }}
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
