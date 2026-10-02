import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import {
  useGetPlatformPlayhqSync,
  getGetPlatformPlayhqSyncQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPill, type StatusPillTone } from "@/components/ui/stat-badge";

const TONE: Record<string, StatusPillTone> = { ok: "live", overdue: "pilot", failed: "danger" };

function when(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function waited(ms: number): string {
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`;
}

/**
 * PlayHQ scheduled-sync health for every synced organisation (sync plan U8): state, the
 * latest run, the last successful load, what is due now and any open incident. The
 * watchdog emails on state changes; this page is where to look when one arrives.
 */
export default function PlayhqSyncPage() {
  const { data, isLoading, isError, error } = useGetPlatformPlayhqSync({
    query: { queryKey: getGetPlatformPlayhqSyncQueryKey(), refetchInterval: 60_000 },
  });

  return (
    <div>
      <h1 className="mb-2 text-[clamp(38px,4.6vw,64px)] leading-none">PlayHQ sync</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Fixtures, results and ladders collected hourly on the match calendar. Clubs with sync
        switched off (tenant page) aren&rsquo;t listed.
      </p>

      {isLoading && (
        <div className="flex items-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {isError && (
        <p className="py-12 text-muted-foreground">
          {(error as { status?: number })?.status === 503
            ? "Sync isn't configured on this server yet (PLAYHQ_INGEST_DATABASE_URL)."
            : "Couldn't load sync health."}
        </p>
      )}
      {data && data.orgs.length === 0 && (
        <p className="py-12 text-muted-foreground">No club has PlayHQ sync switched on.</p>
      )}

      <div className="space-y-4">
        {data?.orgs.map((o) => (
          <Card key={o.orgId}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone={TONE[o.state] ?? "neutral"}>{o.state}</StatusPill>
                <span className="font-medium">
                  {o.tenants.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ", "}
                      <Link href={`/platform-admin/tenants/${t.id}`} className="hover:underline">
                        {t.name}
                      </Link>
                    </span>
                  ))}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{o.orgId}</span>
              </div>

              {o.reasons.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-destructive">
                  {o.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}

              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <dt className="text-muted-foreground">Last successful load</dt>
                <dd>{when(o.lastSuccessAt)}</dd>
                <dt className="text-muted-foreground">Latest run</dt>
                <dd>
                  {o.lastRunAt
                    ? `${when(o.lastRunAt)} · ${o.lastRunPlan ?? "unplanned"} · ${o.lastRunStatus} · ${o.lastRunCollector ?? "?"}`
                    : "never"}
                </dd>
                <dt className="text-muted-foreground">Due now</dt>
                <dd>
                  {o.due.length === 0
                    ? "nothing"
                    : o.due.map((d) => `${d.planName} (waiting ${waited(d.waitingMs)})`).join(", ")}
                </dd>
                {o.openIncident && (
                  <>
                    <dt className="text-muted-foreground">Open incident</dt>
                    <dd>
                      {o.openIncident.kind} since {when(o.openIncident.openedAt)}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
