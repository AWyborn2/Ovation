import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  useGetPlatformGradeDecisions,
  useSetPlatformGradeDecision,
  useDeletePlatformGradeDecision,
  getGetPlatformGradeDecisionsQueryKey,
  type GradeDecisionResult,
  type PendingGradeCompetition,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/stat-badge";
import { useConfirm } from "@/components/confirm-dialog";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** What a saved decision did, in words: "Mapped … 12 matches now showing" or "will apply on sync". */
export function describeResult(r: GradeDecisionResult): string {
  if (r.action === "ignore") return `“${r.gradeName}” is now ignored.`;
  if (!r.applied)
    return `“${r.gradeName}” is mapped to ${r.centralGrade}. Its matches will appear on the next sync that touches the competition.`;
  const shown = r.created + r.updated;
  return `“${r.gradeName}” is mapped to ${r.centralGrade}: ${shown} ${shown === 1 ? "match" : "matches"} projected${
    r.skipped ? `, ${r.skipped} skipped` : ""
  }.`;
}

/**
 * PlayHQ competitions Ovation can't place in a grade. Their matches are skipped by the sync
 * until someone decides, so a competition with an unusual name would otherwise vanish. Competitions
 * are shared by every club that plays in them, so the decision is made here, once: map it to an
 * app grade (its matches are projected straight away) or mark it as not tracked.
 */
export default function GradeDecisionsPage() {
  const { data, isLoading, isError } = useGetPlatformGradeDecisions();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: getGetPlatformGradeDecisionsQueryKey() });
  const set = useSetPlatformGradeDecision({
    mutation: {
      onSuccess: (r) => {
        setError(null);
        setNotice(describeResult(r));
        void refresh();
      },
      onError: () => {
        setNotice(null);
        setError("Couldn't save the decision.");
      },
    },
  });
  const remove = useDeletePlatformGradeDecision({ mutation: { onSuccess: () => void refresh() } });

  const mappable = data?.mappableGrades ?? [];

  async function onIgnore(p: PendingGradeCompetition) {
    if (
      !(await confirm({
        title: `Ignore “${p.gradeName}”?`,
        description:
          "Its matches stay out of Ovation, and clubs stop being told about it. You can undo this later.",
        confirmText: "Ignore",
      }))
    )
      return;
    set.mutate({ data: { gradeName: p.gradeName, action: "ignore" } });
  }

  async function onRemove(gradeKey: string, name: string) {
    if (
      !(await confirm({
        title: "Remove this decision?",
        description: `“${name}” goes back to being unrecognised. Matches already projected stay as they are.`,
        confirmText: "Remove",
      }))
    )
      return;
    remove.mutate({ gradeKey });
  }

  return (
    <div>
      <h1 className="mb-2 text-[clamp(38px,4.6vw,64px)] leading-none">PlayHQ competitions</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Competitions Ovation can&rsquo;t place in a grade are skipped by the sync, so their matches
        don&rsquo;t appear. Map each one to a grade, or ignore it. A decision covers every club and
        every season of that competition.
        {data && !data.projectorConfigured
          ? " The stats projector isn't configured on this server, so a mapping takes effect on the next sync."
          : ""}
      </p>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {notice ? (
        <p className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center py-4 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-destructive">Couldn&rsquo;t load the competitions.</p>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Needs a decision</CardTitle>
            </CardHeader>
            <CardContent>
              {data.pending.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Every competition is recognised or decided.
                </p>
              ) : (
                <ul className="divide-y text-sm" data-testid="pending-competitions">
                  {data.pending.map((p) => {
                    const grade = picked[p.gradeKey] ?? "";
                    return (
                      <li
                        key={p.gradeKey}
                        className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{p.gradeName}</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.matches} {p.matches === 1 ? "match" : "matches"}
                            {p.seasons.length ? ` · ${p.seasons.join(", ")}` : ""} ·{" "}
                            {p.tenants.map((t) => t.name).join(", ")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className={selectClass}
                            aria-label={`Grade for ${p.gradeName}`}
                            value={grade}
                            onChange={(e) =>
                              setPicked((prev) => ({ ...prev, [p.gradeKey]: e.target.value }))
                            }
                          >
                            <option value="">Choose a grade…</option>
                            {mappable.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            disabled={!grade || set.isPending}
                            onClick={() =>
                              set.mutate({
                                data: {
                                  gradeName: p.gradeName,
                                  action: "map",
                                  centralGrade: grade,
                                },
                              })
                            }
                          >
                            Map
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={set.isPending}
                            onClick={() => void onIgnore(p)}
                          >
                            Ignore
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Decisions made</CardTitle>
            </CardHeader>
            <CardContent>
              {data.decisions.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">No decisions yet.</p>
              ) : (
                <ul className="divide-y text-sm" data-testid="decided-competitions">
                  {data.decisions.map((d) => (
                    <li key={d.gradeKey} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{d.gradeName}</span>
                          {d.action === "map" ? (
                            <StatusPill tone="live">{d.centralGrade}</StatusPill>
                          ) : (
                            <StatusPill tone="pilot">Ignored</StatusPill>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(d.setAt).toLocaleDateString("en-AU", { dateStyle: "medium" })}
                          {d.reason ? ` · ${d.reason}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={remove.isPending}
                        onClick={() => void onRemove(d.gradeKey, d.gradeName)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
