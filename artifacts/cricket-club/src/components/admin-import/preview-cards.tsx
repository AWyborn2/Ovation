import type {
  ImportPreview,
  MatchImportPreview,
  BatchImportPreview,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BackfillControls, NetEffectPanel } from "./backfill-controls";
import {
  BatchStatusBadge,
  DebutBadge,
  FileIdentityResolver,
  PlayerResolutionRow,
  Stat,
} from "./rows";
import {
  FINALS_STAGES,
  RESOLVABLE_STATUSES,
  isDebut,
  resolvedPlayerId,
  rowKey,
  seasonLabel,
  unresolvedSuggestions,
  type FileResolutionEntry,
  type ReconcileMode,
  type RowResolution,
} from "./resolution";

/** Props every preview card shares: name resolutions, backfill choice, actions. */
type PreviewCommonProps = {
  resolutions: Record<string, RowResolution>;
  setRowResolution: (key: string, r: RowResolution | undefined) => void;
  isBackfill: boolean;
  setIsBackfill: (v: boolean) => void;
  reconcileMode: ReconcileMode;
  setReconcileMode: (m: ReconcileMode) => void;
  error: string | null;
  onConfirm: () => void;
  committing: boolean;
  onCancel: () => void;
  cancelling: boolean;
};

/** Whole-season CSV preview: grade totals + player name resolutions. */
export function CsvPreviewCard({
  preview,
  resolutions,
  setRowResolution,
  isBackfill,
  setIsBackfill,
  reconcileMode,
  setReconcileMode,
  error,
  onConfirm,
  committing,
  onCancel,
  cancelling,
}: PreviewCommonProps & { preview: ImportPreview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview — {preview.filename}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Rows parsed" value={preview.rowsParsed} />
          <Stat label="Matched players" value={preview.matchedPlayers} />
          <Stat label="Suggested" value={preview.suggestedPlayers} />
          <Stat label="New players" value={preview.newPlayers} />
        </div>
        {preview.capCategory && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            This is a cap-eligible grade ({preview.capCategory}). Players earning their first cap
            are flagged <DebutBadge /> below.
          </div>
        )}

        {preview.unmappedGrades.length > 0 && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
            Skipped rows with unrecognised PlayCricket grade(s):{" "}
            <strong>{preview.unmappedGrades.join(", ")}</strong>. Add a mapping in{" "}
            <code className="font-mono">PLAYCRICKET_GRADE_MAP</code> to include them.
          </div>
        )}

        <div>
          <h3 className="font-semibold mb-2">Totals to apply</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Grade</th>
                  <th className="py-2 pr-4">Rows</th>
                  <th className="py-2 pr-4">Games</th>
                  <th className="py-2 pr-4">Runs</th>
                  <th className="py-2 pr-4">Wickets</th>
                </tr>
              </thead>
              <tbody>
                {preview.gradeTotals.map((g) => (
                  <tr key={g.grade} className="border-b last:border-0">
                    <td className="py-2 pr-4">{g.grade}</td>
                    <td className="py-2 pr-4">{g.rows}</td>
                    <td className="py-2 pr-4">{g.games}</td>
                    <td className="py-2 pr-4">{g.runs}</td>
                    <td className="py-2 pr-4">{g.wickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">Players in this CSV</h3>
          {preview.suggestedPlayers > 0 && (
            <p className="text-sm text-muted-foreground mb-2">
              Some names look like existing players. Confirm a link or choose to create a new player
              for each suggestion before applying.
            </p>
          )}
          <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
            {preview.players.map((p, i) => (
              <PlayerResolutionRow
                key={i}
                surname={p.surname}
                givenName={p.givenName}
                status={p.status}
                candidates={p.candidates}
                resolution={resolutions[rowKey(p.surname, p.givenName)]}
                onChange={(r) => setRowResolution(rowKey(p.surname, p.givenName), r)}
                debut={isDebut(
                  preview.capCategory,
                  new Set(preview.cappedPlayerIds),
                  resolvedPlayerId(
                    p.status,
                    p.playerId,
                    p.candidates,
                    resolutions[rowKey(p.surname, p.givenName)],
                  ),
                )}
              />
            ))}
          </div>
        </div>

        <BackfillControls
          isBackfill={isBackfill}
          setIsBackfill={setIsBackfill}
          reconcileMode={reconcileMode}
          setReconcileMode={setReconcileMode}
        />
        {isBackfill && <NetEffectPanel players={preview.players} reconcileMode={reconcileMode} />}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {unresolvedSuggestions(preview.players, resolutions) > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {unresolvedSuggestions(preview.players, resolutions)} suggested name(s) still need a
            decision before you can apply.
          </p>
        )}

        <div className="flex gap-3">
          <Button
            onClick={onConfirm}
            disabled={committing || unresolvedSuggestions(preview.players, resolutions) > 0}
          >
            {committing ? "Applying…" : "Confirm & Apply"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={cancelling}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Single-match scorecard preview: identity (round / final), scores, player lines. */
export function MatchPreviewCard({
  matchPreview,
  clubShort,
  matchRound,
  setMatchRound,
  matchStage,
  setMatchStage,
  resolutions,
  setRowResolution,
  isBackfill,
  setIsBackfill,
  reconcileMode,
  setReconcileMode,
  error,
  onConfirm,
  committing,
  onCancel,
  cancelling,
}: PreviewCommonProps & {
  matchPreview: MatchImportPreview;
  clubShort: string;
  matchRound: string;
  setMatchRound: (v: string) => void;
  matchStage: string;
  setMatchStage: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Match preview — {matchPreview.filename}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Grade" value={matchPreview.grade ?? "—"} />
          <Stat label="Season" value={seasonLabel(matchPreview.season)} />
          <div className="rounded-md border p-3">
            <Label
              htmlFor="match-round"
              className="text-xs uppercase tracking-wider text-muted-foreground font-normal"
            >
              Round
            </Label>
            <Input
              id="match-round"
              type="number"
              min={1}
              inputMode="numeric"
              value={matchRound}
              onChange={(e) => {
                setMatchRound(e.target.value);
                if (e.target.value) setMatchStage("");
              }}
              disabled={!!matchStage}
              placeholder="e.g. 5"
              className="mt-1 h-8"
            />
          </div>
          <div className="rounded-md border p-3">
            <Label
              htmlFor="match-stage"
              className="text-xs uppercase tracking-wider text-muted-foreground font-normal"
            >
              Final (optional)
            </Label>
            <select
              id="match-stage"
              value={matchStage}
              onChange={(e) => {
                setMatchStage(e.target.value);
                if (e.target.value) setMatchRound("");
              }}
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              data-testid="select-match-stage"
            >
              <option value="">Regular round</option>
              {FINALS_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <Stat label="Result" value={matchPreview.result ?? "—"} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {clubShort}
            </div>
            <div className="font-medium">{matchPreview.hhccScore ?? "—"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {matchPreview.opponent ?? "Opponent"}
            </div>
            <div className="font-medium">{matchPreview.opponentScore ?? "—"}</div>
          </div>
        </div>

        {matchPreview.warnings.length > 0 && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm space-y-1">
            {matchPreview.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        {!matchPreview.abandoned && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Matched" value={matchPreview.matchedPlayers} />
            <Stat label="Suggested" value={matchPreview.suggestedPlayers} />
            <Stat label="New players" value={matchPreview.newPlayers} />
            <Stat label="Venue" value={matchPreview.venue ?? "—"} />
          </div>
        )}

        {matchPreview.capCategory && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            This is a cap-eligible grade ({matchPreview.capCategory}). Players earning their first
            cap are flagged <DebutBadge /> below.
          </div>
        )}

        {matchPreview.players.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Player lines</h3>
            {matchPreview.suggestedPlayers > 0 && (
              <p className="text-sm text-muted-foreground mb-2">
                Some names look like existing players. Confirm a link or choose to create a new
                player for each suggestion before applying.
              </p>
            )}
            <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
              {matchPreview.players.map((p, i) => {
                const bat = p.batted
                  ? `${p.runs ?? 0}${p.notOut ? "*" : ""}${p.balls != null ? ` (${p.balls})` : ""}`
                  : null;
                const bowl = p.bowled
                  ? `${p.wickets ?? 0}/${p.runsConceded ?? 0}${p.overs ? ` (${p.overs})` : ""}`
                  : null;
                const field =
                  p.catches + p.stumpings + p.runOuts > 0
                    ? [
                        p.catches ? `${p.catches}c` : "",
                        p.stumpings ? `${p.stumpings}st` : "",
                        p.runOuts ? `${p.runOuts}ro` : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    : null;
                return (
                  <PlayerResolutionRow
                    key={i}
                    surname={p.surname}
                    givenName={p.givenName}
                    status={p.status}
                    candidates={p.candidates}
                    resolution={resolutions[rowKey(p.surname, p.givenName)]}
                    onChange={(r) => setRowResolution(rowKey(p.surname, p.givenName), r)}
                    meta={
                      <span className="text-xs text-muted-foreground">
                        {[
                          bat ? `Bat ${bat}` : null,
                          bowl ? `Bowl ${bowl}` : null,
                          field ? `Field ${field}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Did not bat/bowl/field"}
                      </span>
                    }
                    debut={isDebut(
                      matchPreview.capCategory,
                      new Set(matchPreview.cappedPlayerIds),
                      resolvedPlayerId(
                        p.status,
                        p.playerId,
                        p.candidates,
                        resolutions[rowKey(p.surname, p.givenName)],
                      ),
                    )}
                  />
                );
              })}
            </div>
          </div>
        )}

        <BackfillControls
          isBackfill={isBackfill}
          setIsBackfill={setIsBackfill}
          reconcileMode={reconcileMode}
          setReconcileMode={setReconcileMode}
        />
        {isBackfill && (
          <NetEffectPanel players={matchPreview.players} reconcileMode={reconcileMode} />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {unresolvedSuggestions(matchPreview.players, resolutions) > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {unresolvedSuggestions(matchPreview.players, resolutions)} suggested name(s) still need
            a decision before you can apply.
          </p>
        )}

        <div className="flex gap-3">
          <Button
            onClick={onConfirm}
            disabled={committing || unresolvedSuggestions(matchPreview.players, resolutions) > 0}
          >
            {committing
              ? "Applying…"
              : matchPreview.matchExists
                ? "Confirm & Replace"
                : "Confirm & Add match"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={cancelling}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Season batch preview: per-file statuses with Round / Final resolvers + names. */
export function BatchPreviewCard({
  batchPreview,
  fileResolutions,
  setFileResolutions,
  uploading,
  resolutions,
  setRowResolution,
  isBackfill,
  setIsBackfill,
  reconcileMode,
  setReconcileMode,
  error,
  onConfirm,
  onCancel,
  cancelling,
}: Omit<PreviewCommonProps, "committing"> & {
  batchPreview: BatchImportPreview;
  fileResolutions: Record<string, FileResolutionEntry>;
  setFileResolutions: React.Dispatch<React.SetStateAction<Record<string, FileResolutionEntry>>>;
  uploading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Season batch preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Files" value={batchPreview.files.length} />
          <Stat label="Committable matches" value={batchPreview.committableMatches} />
          <Stat label="Matched players" value={batchPreview.matchedPlayers} />
          <Stat label="New players" value={batchPreview.newPlayers} />
        </div>

        {batchPreview.warnings.length > 0 && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm space-y-1">
            {batchPreview.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        <div>
          <h3 className="font-semibold mb-2">Matches in this batch</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Files flagged <span className="font-medium">Replaces existing</span> or{" "}
            <span className="font-medium">Duplicate in batch</span> collide with another match. Give
            one a different round or final below to import both as separate matches — statuses and
            the committable count update automatically.
          </p>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="text-left border-b">
                  <th className="py-2 px-3">File</th>
                  <th className="py-2 px-3">Grade</th>
                  <th className="py-2 px-3">Season</th>
                  <th className="py-2 px-3">Round / Final</th>
                  <th className="py-2 px-3">Opponent</th>
                  <th className="py-2 px-3">Result</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {batchPreview.files.map((f, i) => (
                  <tr
                    key={i}
                    className={`border-b last:border-0 ${f.committable ? "" : "opacity-60"}`}
                  >
                    <td className="py-2 px-3 max-w-[16rem] truncate" title={f.filename}>
                      {f.filename}
                    </td>
                    <td className="py-2 px-3">{f.grade ?? "—"}</td>
                    <td className="py-2 px-3">{seasonLabel(f.season)}</td>
                    <td className="py-2 px-3">
                      {RESOLVABLE_STATUSES.has(f.status) ? (
                        <FileIdentityResolver
                          index={i}
                          parsedRound={f.round}
                          parsedStage={f.stage}
                          resolution={fileResolutions[f.filename]}
                          onChange={(r) =>
                            setFileResolutions((prev) => ({
                              ...prev,
                              [f.filename]: r,
                            }))
                          }
                        />
                      ) : (
                        (f.stage ?? f.round ?? "—")
                      )}
                    </td>
                    <td className="py-2 px-3">{f.opponent ?? "—"}</td>
                    <td className="py-2 px-3">{f.result ?? "—"}</td>
                    <td className="py-2 px-3">
                      <BatchStatusBadge status={f.status} />
                      {f.error && (
                        <span className="block text-xs text-destructive" title={f.error}>
                          {f.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {batchPreview.players.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Players across the batch</h3>
            {batchPreview.suggestedPlayers > 0 && (
              <p className="text-sm text-muted-foreground mb-2">
                Some names look like existing players. Confirm a link or choose to create a new
                player for each suggestion before applying.
              </p>
            )}
            <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
              {batchPreview.players.map((p, i) => (
                <PlayerResolutionRow
                  key={i}
                  surname={p.surname}
                  givenName={p.givenName}
                  status={p.status}
                  candidates={p.candidates}
                  resolution={resolutions[rowKey(p.surname, p.givenName)]}
                  onChange={(r) => setRowResolution(rowKey(p.surname, p.givenName), r)}
                  debut={isDebut(
                    p.capCategory ?? null,
                    new Set(batchPreview.cappedPlayerIds),
                    resolvedPlayerId(
                      p.status,
                      p.playerId,
                      p.candidates,
                      resolutions[rowKey(p.surname, p.givenName)],
                    ),
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <BackfillControls
          isBackfill={isBackfill}
          setIsBackfill={setIsBackfill}
          reconcileMode={reconcileMode}
          setReconcileMode={setReconcileMode}
        />
        {isBackfill && (
          <NetEffectPanel players={batchPreview.players} reconcileMode={reconcileMode} />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {unresolvedSuggestions(batchPreview.players, resolutions) > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {unresolvedSuggestions(batchPreview.players, resolutions)} suggested name(s) still need
            a decision before you can apply.
          </p>
        )}

        <div className="flex gap-3">
          <Button
            onClick={onConfirm}
            disabled={
              uploading ||
              batchPreview.committableMatches === 0 ||
              unresolvedSuggestions(batchPreview.players, resolutions) > 0
            }
          >
            {uploading
              ? "Applying…"
              : `Confirm & Add ${batchPreview.committableMatches} match${
                  batchPreview.committableMatches === 1 ? "" : "es"
                }`}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={cancelling}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
