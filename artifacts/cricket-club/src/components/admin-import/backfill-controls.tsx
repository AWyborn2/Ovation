import type { BackfillPlayerFigures } from "@workspace/api-client-react";
import type { ReconcileMode } from "./resolution";

/**
 * The backfill controls shown above each preview's action buttons: a toggle
 * marking this import as a previous-season backfill, and (when on) the
 * peel-vs-add choice that determines how the season folds into the grade's
 * all-time baseline.
 */
export function BackfillControls({
  isBackfill,
  setIsBackfill,
  reconcileMode,
  setReconcileMode,
}: {
  isBackfill: boolean;
  setIsBackfill: (v: boolean) => void;
  reconcileMode: ReconcileMode;
  setReconcileMode: (m: ReconcileMode) => void;
}) {
  return (
    <div className="rounded-md border p-4 space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={isBackfill}
          onChange={(e) => setIsBackfill(e.target.checked)}
        />
        This is a previous-season backfill
      </label>
      {isBackfill ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Choose how this season folds into the grade&rsquo;s all-time baseline:
          </p>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="reconcileMode"
              className="mt-1"
              checked={reconcileMode === "peel"}
              onChange={() => setReconcileMode("peel")}
            />
            <span>
              <strong>Peel</strong> — subtract this season from the baseline so career totals stay
              exactly the same. Use when the all-time figures already include this season and
              you&rsquo;re just itemising it.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="reconcileMode"
              className="mt-1"
              checked={reconcileMode === "add"}
              onChange={() => setReconcileMode("add")}
            />
            <span>
              <strong>Add</strong> — add this season on top of existing totals (career totals
              increase). Use for genuinely missing history.
            </span>
          </label>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Leave off for the current season — totals are added to the running season as normal.
        </p>
      )}
    </div>
  );
}

/**
 * Predicts the net effect of a backfill commit from the per-player figures the
 * server attaches to matched/linked preview rows. Peel keeps career totals
 * invariant (it only reduces the baseline); add increases both. Players whose
 * season contribution exceeds the baseline are flagged — a peel would floor
 * their baseline at zero and change their career total.
 */
export function NetEffectPanel({
  players,
  reconcileMode,
}: {
  players: Array<{
    surname: string;
    givenName: string;
    backfill?: BackfillPlayerFigures | null;
  }>;
  reconcileMode: ReconcileMode;
}) {
  const withFigures = players.filter(
    (p): p is typeof p & { backfill: BackfillPlayerFigures } => !!p.backfill,
  );
  let seasonGames = 0;
  let seasonRuns = 0;
  let seasonWickets = 0;
  const negatives: Array<{
    name: string;
    seasonGames: number;
    baselineGames: number;
  }> = [];
  for (const p of withFigures) {
    const b = p.backfill;
    seasonGames += b.seasonGames;
    seasonRuns += b.seasonRuns;
    seasonWickets += b.seasonWickets;
    if (reconcileMode === "peel" && b.seasonGames > b.baselineGames) {
      negatives.push({
        name: `${p.givenName} ${p.surname}`.trim(),
        seasonGames: b.seasonGames,
        baselineGames: b.baselineGames,
      });
    }
  }

  return (
    <div className="rounded-md border bg-muted/40 p-4 space-y-3 text-sm">
      <h3 className="font-semibold">Net effect</h3>
      {reconcileMode === "peel" ? (
        <p>
          Career totals stay the same. The {seasonGames} game(s), {seasonRuns} run(s) and{" "}
          {seasonWickets} wicket(s) in this import will be subtracted from the grade&rsquo;s
          all-time baseline so they aren&rsquo;t counted twice.
        </p>
      ) : (
        <p>
          Career totals increase by {seasonGames} game(s), {seasonRuns} run(s) and {seasonWickets}{" "}
          wicket(s) — added on top of existing figures.
        </p>
      )}
      {negatives.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-1">
          <p className="font-medium text-destructive">
            {negatives.length} player(s) would floor at zero
          </p>
          <p className="text-muted-foreground">
            Their season games exceed what the baseline holds, so a peel would change their career
            total. Review before applying:
          </p>
          <ul className="list-disc pl-5">
            {negatives.map((n, i) => (
              <li key={i}>
                {n.name} — {n.seasonGames} this season vs {n.baselineGames} in baseline
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
