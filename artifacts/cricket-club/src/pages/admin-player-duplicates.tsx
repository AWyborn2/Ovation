import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPlayerDuplicates,
  useReviewPlayerDuplicate,
  type DuplicateEvidence,
  type DuplicatePair,
  type DuplicateReviewBodyAction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Eyebrow, UnderlineTabs } from "@/components/broadcast";
import { StatusPill } from "@/components/admin-ui";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { Info } from "lucide-react";

/**
 * Duplicate players (hybrid stats plan U7). PlayHQ sometimes gives one person
 * two player records, which splits their career. The app suggests likely
 * pairs — two records that both played for the club, were never in the same
 * match, and share an initial and surname — and an admin confirms or rejects
 * each. Confirming shows the two as one player everywhere on the site; Undo
 * splits them again. A rejected pair is never suggested again unless reopened.
 * Nothing here changes PlayHQ or the association's data.
 */
type ListKey = "suggested" | "confirmed" | "rejected";

const EMPTY: Record<ListKey, { title: string; message: string }> = {
  suggested: {
    title: "No likely duplicates",
    message: "Every player record looks like a different person. New suggestions appear here.",
  },
  confirmed: {
    title: "No confirmed merges",
    message: "Pairs you confirm are listed here, where you can undo them.",
  },
  rejected: {
    title: "No rejected pairs",
    message: "Pairs you mark as different people are listed here, where you can reopen them.",
  },
};

function seasonRange(seasons: string[]): string {
  if (seasons.length === 0) return "No seasons on record";
  if (seasons.length === 1) return seasons[0]!;
  return `${seasons[0]} – ${seasons[seasons.length - 1]}`;
}

function gapLabel(gap: number | null): string {
  if (gap === null) return "Seasons unknown";
  if (gap === 0) return "Same season";
  if (gap === 1) return "Next season";
  return `${gap} seasons apart`;
}

export default function AdminPlayerDuplicates() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<ListKey>("suggested");
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useListPlayerDuplicates();
  const review = useReviewPlayerDuplicate();

  const act = async (pair: DuplicatePair, action: DuplicateReviewBodyAction) => {
    const keeper = pair.keeper.displayName ?? "the keeper";
    const duplicate = pair.duplicate.displayName ?? "this record";
    if (action === "confirm") {
      const ok = await confirm({
        title: "Merge these players?",
        description: `${duplicate} and ${keeper} will show as one player, with one combined career, everywhere on the site. You can undo this later.`,
        confirmText: "Merge players",
      });
      if (!ok) return;
    }
    if (action === "undo") {
      const ok = await confirm({
        title: "Split these players?",
        description: `${duplicate} and ${keeper} will show as two players again. The pair goes back to Suggested.`,
        confirmText: "Split players",
      });
      if (!ok) return;
    }
    setError(null);
    review.mutate(
      { participantId: pair.participantId, data: { action } },
      {
        // A merge changes careers on every stats surface, so refresh them all.
        onSuccess: () => qc.invalidateQueries(),
        onError: (e) => setError(handleAdminMutationError(e)),
      },
    );
  };

  const counts = {
    suggested: data?.suggested.length ?? 0,
    confirmed: data?.confirmed.length ?? 0,
    rejected: data?.rejected.length ?? 0,
  };
  const pairs = data?.[tab] ?? [];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        PlayHQ sometimes gives one person two player records, which splits their career in two.
        These are records that both played for the club, were never in the same match, and share an
        initial and surname. Confirm a pair to show it as one player everywhere, or reject it if
        they are different people.
      </p>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden />
        <p>
          Merging only changes how this club&rsquo;s site shows the players. It never changes PlayHQ
          or the association&rsquo;s data, it can be undone at any time, and it never creates social
          cards for past matches.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <UnderlineTabs<ListKey>
        label="Duplicate players"
        tabs={[
          { value: "suggested", label: `Suggested (${counts.suggested})` },
          { value: "confirmed", label: `Confirmed (${counts.confirmed})` },
          { value: "rejected", label: `Rejected (${counts.rejected})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : pairs.length === 0 ? (
        <EmptyState title={EMPTY[tab].title} message={EMPTY[tab].message} />
      ) : (
        <ul className="space-y-3" aria-label={`${tab} pairs`}>
          {pairs.map((p) => (
            <PairCard
              key={p.participantId}
              pair={p}
              busy={review.isPending && review.variables?.participantId === p.participantId}
              onAction={(action) => act(p, action)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceColumn({ label, evidence }: { label: string; evidence: DuplicateEvidence }) {
  return (
    <div className="min-w-0 space-y-1">
      <Eyebrow>{label}</Eyebrow>
      <div className="truncate text-base font-semibold">
        {evidence.displayName ?? "Unknown player"}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted-foreground">Played</dt>
        <dd className="tabular-nums">{`${evidence.games} ${evidence.games === 1 ? "game" : "games"}`}</dd>
        <dt className="text-muted-foreground">Seasons</dt>
        <dd className="tabular-nums">{seasonRange(evidence.seasons)}</dd>
        <dt className="text-muted-foreground">Grades</dt>
        <dd>{evidence.grades.length ? evidence.grades.join(", ") : "None on record"}</dd>
      </dl>
    </div>
  );
}

function PairCard({
  pair,
  busy,
  onAction,
}: {
  pair: DuplicatePair;
  busy: boolean;
  onAction: (action: DuplicateReviewBodyAction) => void;
}) {
  return (
    <li
      data-testid={`duplicate-pair-${pair.participantId}`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <EvidenceColumn label="Keep" evidence={pair.keeper} />
        <EvidenceColumn label="Possible duplicate" evidence={pair.duplicate} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <StatusPill tone="info">{gapLabel(pair.seasonGap)}</StatusPill>
        {pair.sharedGrades.length > 0 ? (
          <StatusPill>{`Both played ${pair.sharedGrades.join(", ")}`}</StatusPill>
        ) : (
          <StatusPill>No grade in common</StatusPill>
        )}
        {pair.status === "suggested" && (
          <StatusPill tone="success">Never in the same match</StatusPill>
        )}
        <div className="ml-auto flex gap-2">
          {pair.status === "suggested" && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAction("reject")}
              >
                Reject
              </Button>
              <Button size="sm" disabled={busy} onClick={() => onAction("confirm")}>
                Confirm
              </Button>
            </>
          )}
          {pair.status === "confirmed" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("undo")}>
              Undo
            </Button>
          )}
          {pair.status === "rejected" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("reopen")}>
              Reopen
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
