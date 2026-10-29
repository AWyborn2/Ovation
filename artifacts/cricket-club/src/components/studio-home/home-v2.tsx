/**
 * New Studio → Home (studio-create-consolidation S7): what needs the admin, quick
 * ways into Create, and the designs to pick up again. Existing data only: the
 * club's drafts and its recent designs.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import {
  getListSocialDraftsQueryKey,
  useListSocialDrafts,
  type SocialDraft,
} from "@workspace/api-client-react";
import { useLibraryPreviewData } from "@/components/template-library/previews";
import { ContinueDesigning } from "@/components/studio-home/recent-designs";
import { draftStatus, isJuniorDraft } from "@/components/social-queue/draft-meta";
import { useEntitlements } from "@/lib/entitlements";
import { cn } from "@/lib/utils";

const CREATE = "/admin/social/create";
const QUEUE = "/admin/social/queue";

/** Home's quick picks: each opens Create at the right step. */
export function quickPicks(juniors: boolean): Array<{ label: string; href: string }> {
  return [
    { label: "Team List", href: `${CREATE}?kind=teamList&step=2` },
    { label: "Match Day", href: `${CREATE}?kind=matchDay&step=2` },
    { label: "Results", href: `${CREATE}?kind=resultsSummary&step=2` },
    { label: "Milestone", href: `${CREATE}?kind=milestone&step=3` },
    ...(juniors
      ? [{ label: "Junior Team List", href: `${CREATE}?team=junior&kind=teamList&step=2` }]
      : []),
    { label: "Carousel set", href: `${CREATE}?kind=matchDay&mode=many&step=3` },
    { label: "Blank design", href: `${CREATE}?kind=blank&step=4` },
  ];
}

/** What "Needs you" counts: drafts waiting for review, seniors and juniors. */
export function needsYou(drafts: readonly SocialDraft[]) {
  const waiting = drafts.filter((d) => draftStatus(d) === "awaiting_review");
  const juniors = waiting.filter(isJuniorDraft).length;
  return {
    seniors: waiting.length - juniors,
    juniors,
    ready: drafts.filter((d) => draftStatus(d) === "ready").length,
  };
}

function NeedTile({
  href,
  tag,
  title,
  detail,
  tone,
}: {
  href: string;
  tag: string;
  title: string;
  detail: string;
  tone: "accent" | "warn" | "muted";
}) {
  return (
    <Link
      href={href}
      className="bc-lift flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
    >
      <span
        className={cn(
          "self-start rounded-full px-2.5 py-0.5 text-xs font-bold",
          tone === "accent" && "bg-primary/15 text-primary-text",
          tone === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        {tag}
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </Link>
  );
}

export function StudioHomeV2() {
  const preview = useLibraryPreviewData();
  const juniors = useEntitlements().juniors;
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const needs = useMemo(() => needsYou((draftsQ.data ?? []) as SocialDraft[]), [draftsQ.data]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-[26px] font-bold uppercase leading-none">Home</h2>
        <Link
          href={CREATE}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden /> Create
        </Link>
      </div>

      <section aria-labelledby="needs-heading" className="space-y-3">
        <h3 id="needs-heading" className="text-lg font-semibold">
          Needs you
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NeedTile
            href={`${QUEUE}?team=senior`}
            tag={`${needs.seniors} to review`}
            title={needs.seniors ? "Senior cards are waiting" : "No senior cards waiting"}
            detail="Approve, edit or dismiss them in the Queue."
            tone={needs.seniors ? "accent" : "muted"}
          />
          {juniors && (
            <NeedTile
              href={`${QUEUE}?team=junior`}
              tag={`${needs.juniors} to review`}
              title={needs.juniors ? "Junior cards are waiting" : "No junior cards waiting"}
              detail="Junior cards never auto-post. Check names and photos before approving."
              tone={needs.juniors ? "warn" : "muted"}
            />
          )}
          <NeedTile
            href={QUEUE}
            tag={`${needs.ready} scheduled`}
            title="Approved and ready"
            detail="Cards that post at their planned time."
            tone="muted"
          />
        </div>
      </section>

      <section aria-labelledby="quick-heading" className="space-y-3">
        <h3 id="quick-heading" className="text-lg font-semibold">
          Make something
        </h3>
        <nav aria-label="Make something" className="flex flex-wrap gap-2">
          {quickPicks(juniors).map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="bc-lift rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
            >
              {q.label}
            </Link>
          ))}
        </nav>
      </section>

      <ContinueDesigning preview={preview} />
    </div>
  );
}
