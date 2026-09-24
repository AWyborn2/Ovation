import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Bell, Image, Upload } from "lucide-react";
import {
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  useListImports,
  getListImportsQueryKey,
  useListNotifications,
  getListNotificationsQueryKey,
  useListSocialDrafts,
  getListSocialDraftsQueryKey,
  type NotificationList,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { useEntitlements } from "@/lib/entitlements";
import { draftHeading, draftSubline, relativeTime } from "@/components/social-queue/draft-meta";
import type { ReactNode } from "react";

/** KTD16: the scheduled sweep runs every 15 minutes, so an hour of silence means it stopped. */
export const SWEEP_STALE_MS = 60 * 60 * 1000;

export function sweepIsStale(lastSweepAt: string | null | undefined, now = new Date()): boolean {
  if (!lastSweepAt) return true;
  return now.getTime() - new Date(lastSweepAt).getTime() > SWEEP_STALE_MS;
}

const AWAITING = { status: "awaiting_review" } as const;

/**
 * The admin hub's "needs attention" strip (Social Studio U24): drafts waiting
 * for review, recent imports, recent notifications, and a warning when the
 * automatic draft sweep has gone quiet.
 */
export function NeedsAttention() {
  const { socialStudio } = useEntitlements();
  const importsQ = useListImports({ query: { queryKey: getListImportsQueryKey() } });
  const notificationsQ = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey() },
  });
  const draftsQ = useListSocialDrafts(AWAITING, {
    query: { queryKey: getListSocialDraftsQueryKey(AWAITING), enabled: !!socialStudio },
  });
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey(), enabled: !!socialStudio },
  });

  const drafts = draftsQ.data ?? [];
  const imports = [...(importsQ.data ?? [])]
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, 3);
  const notifications = ((notificationsQ.data as NotificationList | undefined)?.items ?? []).slice(
    0,
    3,
  );
  const settings = (settingsQ.data as SocialSettingsBundle | undefined)?.settings;
  const staleSweep = socialStudio && settingsQ.isSuccess && sweepIsStale(settings?.lastSweepAt);

  return (
    <section aria-label="Needs attention" className="space-y-4">
      {staleSweep && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[var(--loss-fg)]/40 bg-[var(--loss-bg)] px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--loss-fg)]" aria-hidden />
          <div>
            <p className="font-semibold">Automatic drafting has stopped</p>
            <p className="text-muted-foreground">
              {settings?.lastSweepAt
                ? `The last sweep ran ${relativeTime(settings.lastSweepAt)}. `
                : "The sweep hasn't run yet. "}
              New results won't be drafted until the scheduled sweep runs again. Cards still draft
              after each import.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {socialStudio && (
          <AttentionCard
            icon={<Image className="h-4 w-4" aria-hidden />}
            title="Awaiting review"
            count={drafts.length}
            link={{ href: "/admin/social/queue", label: "Open the queue" }}
            empty="Nothing waiting. New cards arrive after each import."
          >
            {drafts.slice(0, 4).map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/social/queue?ids=${d.id}`}
                  className="block rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <span className="block truncate text-sm font-medium">{draftHeading(d)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {draftSubline(d)}
                  </span>
                </Link>
              </li>
            ))}
          </AttentionCard>
        )}

        <AttentionCard
          icon={<Upload className="h-4 w-4" aria-hidden />}
          title="Recent imports"
          link={{ href: "/admin/import", label: "Import results" }}
          empty="No imports yet."
        >
          {imports.map((i) => (
            <li key={i.id} className="px-2 py-1.5">
              <span className="block truncate text-sm font-medium">
                {[i.grade, i.season, i.round != null ? `Round ${i.round}` : null]
                  .filter(Boolean)
                  .join(" · ") || i.filename}
              </span>
              <span className="block text-xs text-muted-foreground">
                {i.rowCount} rows · {relativeTime(i.importedAt)}
              </span>
            </li>
          ))}
        </AttentionCard>

        <AttentionCard
          icon={<Bell className="h-4 w-4" aria-hidden />}
          title="Notifications"
          empty="No notifications."
        >
          {notifications.map((n) => (
            <li key={n.id} className="px-2 py-1.5">
              <span className="block truncate text-sm font-medium">{n.title}</span>
              <span className="block text-xs text-muted-foreground">
                {relativeTime(n.createdAt)}
              </span>
            </li>
          ))}
        </AttentionCard>
      </div>
    </section>
  );
}

function AttentionCard({
  icon,
  title,
  count,
  link,
  empty,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  link?: { href: string; label: string };
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary-text">
          {icon}
        </span>
        <h2 className="flex-1 text-base font-semibold normal-case">{title}</h2>
        {count != null && count > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {count}
          </span>
        )}
      </div>
      {children.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex-1 space-y-0.5">{children}</ul>
      )}
      {link && (
        <Link
          href={link.href}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-text hover:underline"
        >
          {link.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
