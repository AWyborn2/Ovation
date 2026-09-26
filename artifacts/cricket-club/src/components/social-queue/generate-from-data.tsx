/**
 * "Create from your club's data" (Social Studio queue). Every club — native or
 * central-data — can draft cards from its own history on demand:
 *   - a season recap or round-up for one of the club's grades and seasons;
 *   - Match Result cards for past matches ("Draft past matches"), which the
 *     automatic sweep never drafts because it only watches for new games —
 *     optionally with those matches' centuries, five-fors, debuts and
 *     milestones.
 * Grades come from the club's own grade list and seasons from its own matches,
 * so a picker never offers a grade the club doesn't play.
 */
import { useEffect, useMemo, useState } from "react";
import {
  useListMatches,
  getListMatchesQueryKey,
  useGenerateRoundUp,
  useGenerateRecaps,
  useBackfillMatchDrafts,
  BackfillMatchesInputIncludeItem,
  type MatchSummary,
  type BackfillMatchesResult,
} from "@workspace/api-client-react";
import { History, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { seasonLabel } from "@/lib/match-summary";
import { useClubGrades } from "@/hooks/use-club-grades";

/** Most matches one "Draft past matches" run drafts (the API's cap). */
export const BACKFILL_LIMIT = 60;

const selectClass =
  "h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground disabled:opacity-50";

/** Seasons (newest first) the club played, for a grade or across all grades. */
function useClubSeasons(grade: string, enabled = true): number[] {
  const params = useMemo(() => (grade ? { grade } : {}), [grade]);
  const q = useListMatches(params, {
    query: { enabled, queryKey: getListMatchesQueryKey(params) },
  });
  return useMemo(() => {
    const set = new Set<number>();
    for (const m of (q.data ?? []) as MatchSummary[]) set.add(m.season);
    return [...set].sort((a, b) => b - a);
  }, [q.data]);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function GenerateFromDataCard({ onDrafted }: { onDrafted: () => void }) {
  const { grades } = useClubGrades();
  const [grade, setGrade] = useState("");
  const effectiveGrade = grade || grades[0] || "";
  const seasons = useClubSeasons(effectiveGrade, !!effectiveGrade);
  const [season, setSeason] = useState<number | null>(null);
  const effectiveSeason = season ?? seasons[0] ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);

  const done = (what: string) => (created: unknown[]) => {
    setMessage(
      created.length === 0
        ? `No ${what} cards — nothing to celebrate for that grade and season yet.`
        : `${plural(created.length, `${what} card`)} drafted. They're in the queue, awaiting review.`,
    );
    onDrafted();
  };
  const recapM = useGenerateRecaps({ mutation: { onSuccess: done("season recap") } });
  const roundupM = useGenerateRoundUp({ mutation: { onSuccess: done("round-up") } });

  const ready = !!effectiveGrade && effectiveSeason != null;
  const body = () => ({ grade: effectiveGrade, season: effectiveSeason as number });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create from your club&rsquo;s data</CardTitle>
        <p className="text-sm text-muted-foreground">
          Draft cards from any season you&rsquo;ve played: a season recap, a round-up, or results
          for past matches.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44 space-y-1">
            <Label htmlFor="gen-grade">Grade</Label>
            <select
              id="gen-grade"
              className={selectClass}
              value={effectiveGrade}
              disabled={grades.length === 0}
              onChange={(e) => {
                setGrade(e.target.value);
                setSeason(null);
              }}
            >
              {grades.length === 0 && <option value="">No grades yet</option>}
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="w-32 space-y-1">
            <Label htmlFor="gen-season">Season</Label>
            <select
              id="gen-season"
              className={selectClass}
              value={effectiveSeason == null ? "" : String(effectiveSeason)}
              disabled={seasons.length === 0}
              onChange={(e) => setSeason(e.target.value ? Number(e.target.value) : null)}
            >
              {seasons.length === 0 && <option value="">No matches</option>}
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={!ready || recapM.isPending}
            onClick={() => recapM.mutate({ data: body() })}
          >
            {recapM.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Season recap
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!ready || roundupM.isPending}
            onClick={() => roundupM.mutate({ data: body() })}
          >
            {roundupM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Round-up
          </Button>
          <Button type="button" variant="outline" onClick={() => setBackfillOpen(true)}>
            <History className="mr-2 h-4 w-4" />
            Draft past matches
          </Button>
        </div>
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </CardContent>
      <BackfillMatchesDialog
        open={backfillOpen}
        onOpenChange={setBackfillOpen}
        grades={grades}
        onDrafted={onDrafted}
      />
    </Card>
  );
}

function matchLabel(m: MatchSummary): string {
  const round = m.stage ?? (m.round != null ? `Round ${m.round}` : "Match");
  return `${m.grade} · ${round} — vs ${m.opponent ?? "Unknown"}${m.result ? ` (${m.result})` : ""}`;
}

/**
 * Pick a season (and optionally a grade), tick the matches, and draft a Match
 * Result card for each. Re-drafting a match already in the queue adds nothing.
 */
export function BackfillMatchesDialog({
  open,
  onOpenChange,
  grades,
  onDrafted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grades: string[];
  onDrafted: () => void;
}) {
  const [grade, setGrade] = useState("");
  const seasons = useClubSeasons(grade, open);
  const [season, setSeason] = useState<number | null>(null);
  const effectiveSeason = season ?? seasons[0] ?? null;

  const params = useMemo(
    () => ({ ...(grade ? { grade } : {}), season: effectiveSeason ?? undefined }),
    [grade, effectiveSeason],
  );
  const matchesQ = useListMatches(params, {
    query: {
      enabled: open && effectiveSeason != null,
      queryKey: getListMatchesQueryKey(params),
    },
  });
  const matches = useMemo(() => (matchesQ.data ?? []) as MatchSummary[], [matchesQ.data]);

  // Every listed match starts ticked (up to the cap); the admin unticks any.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  useEffect(() => {
    setPicked(new Set(matches.slice(0, BACKFILL_LIMIT).map((m) => m.id)));
  }, [matches]);

  // Off by default: the dialog drafts Match Result cards unless asked for more.
  const [withAchievements, setWithAchievements] = useState(false);
  const [result, setResult] = useState<BackfillMatchesResult | null>(null);
  const backfillM = useBackfillMatchDrafts({
    mutation: {
      onSuccess: (r) => {
        setResult(r);
        onDrafted();
      },
    },
  });

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < BACKFILL_LIMIT) next.add(id);
      return next;
    });

  const submit = () => {
    if (effectiveSeason == null || picked.size === 0) return;
    setResult(null);
    backfillM.mutate({
      data: {
        season: effectiveSeason,
        ...(grade ? { grade } : {}),
        matchIds: matches.filter((m) => picked.has(m.id)).map((m) => m.id),
        ...(withAchievements
          ? {
              include: [
                BackfillMatchesInputIncludeItem.results,
                BackfillMatchesInputIncludeItem.achievements,
              ],
            }
          : {}),
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft past matches</DialogTitle>
          <DialogDescription>
            Draft a Match Result card for matches you&rsquo;ve already played. Up to{" "}
            {BACKFILL_LIMIT} at a time; a match already in the queue isn&rsquo;t drafted again.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bf-season">Season</Label>
            <select
              id="bf-season"
              className={selectClass}
              value={effectiveSeason == null ? "" : String(effectiveSeason)}
              disabled={seasons.length === 0}
              onChange={(e) => {
                setSeason(e.target.value ? Number(e.target.value) : null);
                setResult(null);
              }}
            >
              {seasons.length === 0 && <option value="">No matches</option>}
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bf-grade">Grade</Label>
            <select
              id="bf-grade"
              className={selectClass}
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setSeason(null);
                setResult(null);
              }}
            >
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {plural(picked.size, "match", "matches")} selected
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              className="font-medium text-primary-text underline"
              onClick={() => setPicked(new Set(matches.slice(0, BACKFILL_LIMIT).map((m) => m.id)))}
            >
              Select all
            </button>
            <button
              type="button"
              className="font-medium text-primary-text underline"
              onClick={() => setPicked(new Set())}
            >
              Clear
            </button>
          </div>
        </div>

        <div
          className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2"
          aria-label="Matches"
          role="group"
        >
          {matchesQ.isLoading ? (
            <p className="p-2 text-sm text-muted-foreground">Loading matches…</p>
          ) : matches.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No matches for this season.</p>
          ) : (
            matches.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={picked.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span>{matchLabel(m)}</span>
              </label>
            ))
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={withAchievements}
            onChange={(e) => {
              setWithAchievements(e.target.checked);
              setResult(null);
            }}
          />
          <span>Also draft centuries, five-fors, debuts and milestones</span>
        </label>

        {result && (
          <p role="status" className="text-sm text-foreground">
            {result.drafted === 0
              ? "Nothing new to draft — those matches are already drafted, or Match Result cards are switched off."
              : `${plural(result.drafted, "match result card")} drafted.`}
            {result.achievements != null
              ? result.achievements === 0
                ? " No new century, five-for, debut or milestone cards."
                : ` ${plural(result.achievements, "century, five-for, debut or milestone card")} drafted.`
              : ""}
            {result.capped ? ` Only the first ${BACKFILL_LIMIT} were drafted.` : ""}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={picked.size === 0 || effectiveSeason == null || backfillM.isPending}
          >
            {backfillM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Draft {plural(picked.size, "match", "matches")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
