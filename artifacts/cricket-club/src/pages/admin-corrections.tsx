import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClubCorrectionMatchQueryKey,
  getSearchClubCorrectionMatchesQueryKey,
  useCreateClubCorrection,
  useGetClubCorrectionMatch,
  useGetClubCorrectionsStatus,
  useListClubCorrections,
  useRemoveClubCorrection,
  useSearchClubCorrectionMatches,
  type ClubCorrection,
  type ClubCorrectionField,
  type ClubCorrectionMatch,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnderlineTabs } from "@/components/broadcast";
import { StatusPill } from "@/components/admin-ui";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { AlertTriangle, Info } from "lucide-react";

/**
 * Stat corrections (hybrid stats plan U16). The club's match figures come from
 * the association. When one is wrong — the scorer's book says 55, the
 * association says 40 — an admin corrects it here: pick the match, the
 * player and the figure, see what the association shows now, enter the right
 * number. The correction shows everywhere on the club's site; the
 * association's data never changes. If the association later changes that
 * figure itself, the correction stops applying and is listed as not applied.
 */
type TabKey = "list" | "new";

const FIELD_LABEL: Record<ClubCorrectionField, string> = {
  runs: "Runs",
  balls_faced: "Balls faced",
  fours: "Fours",
  sixes: "Sixes",
  not_out: "Not out",
  balls_bowled: "Balls bowled",
  maidens: "Maidens",
  runs_conceded: "Runs conceded",
  wickets: "Wickets",
  wides: "Wides",
  no_balls: "No balls",
  catches: "Catches",
  stumpings: "Stumpings",
  run_outs: "Run outs",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

function seasonLabel(season: number | null): string | null {
  if (season == null) return null;
  return `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}

function matchSummary(m: ClubCorrectionMatch): string {
  const round = m.round ? (/^\d+$/.test(m.round) ? `Round ${m.round}` : m.round) : null;
  const scores =
    m.clubScore || m.opponentScore ? `${m.clubScore ?? "–"} v ${m.opponentScore ?? "–"}` : null;
  return [
    formatDate(m.matchDate) ?? seasonLabel(m.season),
    m.grade,
    round,
    m.opponent ? `v ${m.opponent}` : null,
    scores,
  ]
    .filter(Boolean)
    .join(" · ");
}

function oversOf(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6} overs`;
}

/** A figure as an admin reads it: bowling in overs too, not out as yes/no. */
function showValue(field: ClubCorrectionField, value: number): string {
  if (field === "balls_bowled") return `${value} balls (${oversOf(value)})`;
  if (field === "not_out") return value === 1 ? "1 (not out)" : "0 (out)";
  return String(value);
}

const STALE_TEXT: Record<string, (c: ClubCorrection) => string> = {
  mismatch: (c) =>
    `The association now shows ${c.centralValue ?? "a different figure"}, not ${c.previousValue}, so this correction is skipped. Remove it, then correct the new figure if it's still wrong.`,
  not_found: () =>
    "The association no longer has this player's line in the match, so this correction is skipped.",
  before_boundary: () =>
    "This match is now before the club's history boundary, where the club's own history is used, so this correction is skipped.",
};

/**
 * A player's name as the club admin sees it: the real name, even for a
 * private player (the public pages keep hiding them — only this admin screen
 * shows it).
 */
function playerName(c: { displayName: string | null; isPrivate: boolean }): string {
  return c.displayName ?? (c.isPrivate ? "Private player" : "Unknown player");
}

/** The player-picker option: the real name, marked when the player is private. */
function playerOptionLabel(c: { displayName: string | null; isPrivate: boolean }): string {
  return c.isPrivate && c.displayName ? `${c.displayName} (private)` : playerName(c);
}

export default function AdminCorrections() {
  const [tab, setTab] = useState<TabKey>("list");
  const [notice, setNotice] = useState<string | null>(null);
  const list = useListClubCorrections();
  const status = useGetClubCorrectionsStatus();
  const count = list.data?.length ?? 0;
  // Only an explicit "not yet" from the API shows the notice.
  const notOnPublicPagesYet = status.data?.appliedToPublicPages === false;

  return (
    <div className="space-y-5">
      {notOnPublicPagesYet && (
        <div
          data-testid="corrections-native-notice"
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300"
            aria-hidden
          />
          <p>
            <span className="font-semibold">Not on your public pages yet.</span> Your club still
            shows its own stats, so corrections you make here are saved but will only appear on the
            club&rsquo;s public pages once the club switches to association data.
          </p>
        </div>
      )}

      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        The club&rsquo;s match figures come from the association. When one is wrong, correct it
        here: pick the match, the player and the figure, then enter the right number. The corrected
        figure shows in careers, leaderboards, records and milestones across the site.
      </p>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden />
        <p>
          Corrections never change the association&rsquo;s data, can be removed at any time, and
          never create social cards. If the association later changes a figure you corrected, your
          correction stops applying and is marked &ldquo;Not applied&rdquo;.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm" role="status">
          {notice}
        </div>
      )}

      <UnderlineTabs<TabKey>
        label="Corrections"
        tabs={[
          { value: "list", label: `In force (${count})` },
          { value: "new", label: "New correction" },
        ]}
        value={tab}
        onChange={(v) => {
          setNotice(null);
          setTab(v);
        }}
      />

      {tab === "list" ? (
        <CorrectionList query={list} />
      ) : (
        <NewCorrection
          onSaved={() => {
            setNotice(
              notOnPublicPagesYet
                ? "Correction saved. It will show on the club's public pages once the club switches to association data."
                : "Correction saved. It now shows across the site.",
            );
            setTab("list");
          }}
        />
      )}
    </div>
  );
}

function storeMessage(error: unknown): string | null {
  const status = (error as { status?: number } | null)?.status;
  if (status === 503 || status === 409) return (error as Error)?.message ?? null;
  return null;
}

interface ListQuery {
  data?: ClubCorrection[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

function CorrectionList({ query }: { query: ListQuery }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const remove = useRemoveClubCorrection();
  const { data, isLoading, isError, error: loadError, refetch } = query;

  const onRemove = async (c: ClubCorrection) => {
    const ok = await confirm({
      title: "Remove this correction?",
      description: `${playerName(c)}'s ${FIELD_LABEL[c.field].toLowerCase()} will show the association's figure (${c.centralValue ?? c.previousValue}) again.`,
      confirmText: "Remove correction",
    });
    if (!ok) return;
    setError(null);
    remove.mutate(
      { id: c.id },
      {
        // A correction changes careers on every stats surface, so refresh them all.
        onSuccess: () => qc.invalidateQueries(),
        onError: (e) => setError(handleAdminMutationError(e)),
      },
    );
  };

  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError) {
    const message = storeMessage(loadError);
    return message ? (
      <EmptyState title="Corrections aren't available" message={message} />
    ) : (
      <QueryError onRetry={() => refetch()} />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No corrections"
        message="Every figure shows as the association has it. Corrections you make are listed here."
      />
    );
  }
  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ul className="space-y-3" aria-label="Corrections in force">
        {data.map((c) => (
          <li
            key={c.id}
            data-testid={`correction-${c.id}`}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{playerName(c)}</span>
                  {c.isPrivate && (
                    <span
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      title="This player is private: their name is hidden on the club's public pages."
                    >
                      Private
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.match ? matchSummary(c.match) : `PlayHQ match ${c.playhqMatchId}`}
                </div>
                <div className="text-sm">
                  <span className="font-medium">{FIELD_LABEL[c.field]}</span>{" "}
                  <span className="tabular-nums">{`${c.previousValue} → ${c.newValue}`}</span>
                </div>
                {c.note && <p className="text-sm text-muted-foreground">{`Note: ${c.note}`}</p>}
                <p className="text-xs text-muted-foreground">
                  {`By ${c.createdBy.replace(/^admin:/, "")} · ${formatDate(c.createdAt) ?? ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.status === "active" ? (
                  <StatusPill tone="success">Applied</StatusPill>
                ) : (
                  <StatusPill tone="attention">Not applied</StatusPill>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={remove.isPending && remove.variables?.id === c.id}
                  onClick={() => onRemove(c)}
                >
                  Remove
                </Button>
              </div>
            </div>
            {c.status === "stale" && c.staleReason && (
              <p className="mt-3 border-t border-border pt-3 text-sm">
                {STALE_TEXT[c.staleReason]?.(c)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const selectClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";

function NewCorrection({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim());
  const [match, setMatch] = useState<ClubCorrectionMatch | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [field, setField] = useState<ClubCorrectionField | "">("");
  const [newValue, setNewValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const searchParams = { q: search || undefined, limit: 40 };
  const matches = useSearchClubCorrectionMatches(searchParams, {
    query: {
      enabled: match === null,
      queryKey: getSearchClubCorrectionMatchesQueryKey(searchParams),
    },
  });
  const detail = useGetClubCorrectionMatch(match?.matchId ?? 0, {
    query: {
      enabled: match !== null,
      queryKey: getGetClubCorrectionMatchQueryKey(match?.matchId ?? 0),
    },
  });
  const create = useCreateClubCorrection();

  const line = detail.data?.lines.find((l) => l.participantId === participantId) ?? null;
  const figure = line?.figures.find((f) => f.field === field) ?? null;
  const parsed = newValue.trim() === "" ? NaN : Number(newValue);
  const valid =
    figure !== null &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed !== figure.value &&
    (figure.field !== "not_out" || parsed <= 1);

  const resetLine = () => {
    setField("");
    setNewValue("");
    setError(null);
  };

  const pickMatch = (m: ClubCorrectionMatch | null) => {
    setMatch(m);
    setParticipantId("");
    resetLine();
  };

  const save = () => {
    if (!valid || !match?.playhqMatchId || !figure) return;
    setError(null);
    create.mutate(
      {
        data: {
          playhqMatchId: match.playhqMatchId,
          participantId,
          field: figure.field,
          previousValue: figure.value,
          newValue: parsed,
          note: note.trim() || null,
        },
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries();
          pickMatch(null);
          setNote("");
          onSaved();
        },
        onError: (e) => setError(handleAdminMutationError(e)),
      },
    );
  };

  const sortedLines = detail.data?.lines ?? [];

  if (!match) {
    return (
      <div className="space-y-3">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="correction-match-search">Find a match</Label>
          <Input
            id="correction-match-search"
            value={q}
            placeholder="Date, opponent, round or grade"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {matches.isLoading ? (
          <ListSkeleton rows={4} />
        ) : matches.isError ? (
          storeMessage(matches.error) ? (
            <EmptyState
              title="Corrections aren't available"
              message={storeMessage(matches.error)!}
            />
          ) : (
            <QueryError onRetry={() => matches.refetch()} />
          )
        ) : (matches.data ?? []).length === 0 ? (
          <EmptyState title="No matches found" message="Try a date, an opponent or a round." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {(matches.data ?? []).map((m) => (
              <li key={m.matchId}>
                <button
                  type="button"
                  disabled={!m.playhqMatchId}
                  onClick={() => pickMatch(m)}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {matchSummary(m)}
                  {!m.playhqMatchId && (
                    <span className="block text-xs text-muted-foreground">
                      No PlayHQ match id, so this match can&rsquo;t be corrected.
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="min-w-0 flex-1 text-sm font-medium">{matchSummary(match)}</span>
        <Button size="sm" variant="outline" onClick={() => pickMatch(null)}>
          Change match
        </Button>
      </div>

      {detail.isLoading ? (
        <ListSkeleton rows={3} />
      ) : detail.isError ? (
        <QueryError onRetry={() => detail.refetch()} />
      ) : sortedLines.length === 0 ? (
        <EmptyState
          title="No player lines"
          message="The association has no batting, bowling or fielding figures for the club in this match."
        />
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="correction-player">Player</Label>
            <select
              id="correction-player"
              className={selectClass}
              value={participantId}
              onChange={(e) => {
                setParticipantId(e.target.value);
                resetLine();
              }}
            >
              <option value="">Choose a player…</option>
              {sortedLines.map((l) => (
                <option key={l.participantId} value={l.participantId}>
                  {playerOptionLabel(l)}
                </option>
              ))}
            </select>
          </div>

          {line && (
            <div className="space-y-1.5">
              <Label htmlFor="correction-field">Figure</Label>
              <select
                id="correction-field"
                className={selectClass}
                value={field}
                onChange={(e) => {
                  setField(e.target.value as ClubCorrectionField | "");
                  setNewValue("");
                  setError(null);
                }}
              >
                <option value="">Choose a figure…</option>
                {line.figures.map((f) => (
                  <option key={f.field} value={f.field}>
                    {FIELD_LABEL[f.field]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {figure && (
            <>
              <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
                <div data-testid="current-value">
                  <span className="text-muted-foreground">Association figure now: </span>
                  <span className="font-semibold tabular-nums">
                    {showValue(figure.field, figure.value)}
                  </span>
                </div>
                {figure.correction && (
                  <p className="mt-1 text-muted-foreground">
                    {`Saving replaces the correction in force (${figure.correction.previousValue} → ${figure.correction.newValue}).`}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="correction-value">
                  {figure.field === "balls_bowled"
                    ? "Corrected value (balls)"
                    : figure.field === "not_out"
                      ? "Corrected value (1 = not out, 0 = out)"
                      : "Corrected value"}
                </Label>
                <Input
                  id="correction-value"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={figure.field === "not_out" ? 1 : undefined}
                  step={1}
                  className="max-w-40"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                {figure.field === "balls_bowled" && Number.isInteger(parsed) && parsed >= 0 && (
                  <p className="text-xs text-muted-foreground">{`= ${oversOf(parsed)}`}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="correction-note">Note (optional)</Label>
                <Textarea
                  id="correction-note"
                  value={note}
                  maxLength={500}
                  placeholder="Where the right figure comes from, e.g. the scorer's book"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button disabled={!valid || create.isPending} onClick={save}>
                {create.isPending ? "Saving…" : "Save correction"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
