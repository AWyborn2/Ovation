import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  useListSocialDrafts,
  getListSocialDraftsQueryKey,
  useGenerateRoundUp,
  generateRecaps,
  markSocialDraftPosted,
  useListTrackedLinks,
  getListTrackedLinksQueryKey,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  getGetPendingSocialDraftCountQueryKey,
  useListImports,
  getListImportsQueryKey,
  type SocialDraft,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShareCardModal, type EngineKey } from "@/components/share-card-modal";
import { ListSkeleton, EmptyState, QueryError } from "@/components/data-states";
import { DataTable, StatusPill, type DataTableColumn } from "@/components/admin-ui";
import { AutomationCard } from "@/components/social-queue/automation-card";
import { AutoPostCard } from "@/components/social-queue/auto-post-card";
import { DraftDrawer } from "@/components/social-queue/draft-drawer";
import {
  FAMILIES,
  FAMILY_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  draftGrade,
  draftHeading,
  draftSource,
  draftStatus,
  draftSubline,
  isJuniorDraft,
  relativeTime,
  type DraftStatus,
  type Family,
} from "@/components/social-queue/draft-meta";
import type { ShareCardInput } from "@/lib/share-card";
import { cn } from "@/lib/utils";

/**
 * The Studio queue (Social Studio U8): drafts by state, filtered by family and
 * grade, each opening a drawer with its caption, photo, history and actions.
 */
export default function AdminSocialQueue() {
  const qc = useQueryClient();
  const draftsQ = useListSocialDrafts(undefined, {
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const linksQ = useListTrackedLinks({ query: { queryKey: getListTrackedLinksQueryKey() } });
  const settingsQ = useGetSocialSettings({ query: { queryKey: getGetSocialSettingsQueryKey() } });
  const importsQ = useListImports({ query: { queryKey: getListImportsQueryKey() } });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;

  // A notification links here with the batch's draft ids (?ids=1,2,3).
  const search = useSearch();
  const [, navigate] = useLocation();
  const batchIds = useMemo(() => {
    const raw = new URLSearchParams(search).get("ids");
    return raw ? new Set(raw.split(",").map(Number).filter(Number.isInteger)) : null;
  }, [search]);

  const [status, setStatus] = useState<DraftStatus>(batchIds ? "ready" : "awaiting_review");
  const [family, setFamily] = useState<Family | "all">("all");
  const [grade, setGrade] = useState<string>("all");
  const [open, setOpen] = useState<SocialDraft | null>(null);
  const [preview, setPreview] = useState<SocialDraft | null>(null);
  const [ruGrade, setRuGrade] = useState("A Grade");
  const [ruSeason, setRuSeason] = useState<number>(new Date().getFullYear());

  const invalidateDrafts = () => {
    qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
  };
  const roundupM = useGenerateRoundUp({ mutation: { onSuccess: invalidateDrafts } });

  const drafts = useMemo(() => (draftsQ.data ?? []) as SocialDraft[], [draftsQ.data]);
  const counts = useMemo(() => {
    const c: Record<DraftStatus, number> = {
      awaiting_review: 0,
      ready: 0,
      posted: 0,
      dismissed: 0,
    };
    for (const d of drafts) c[draftStatus(d)]++;
    return c;
  }, [drafts]);
  const grades = useMemo(
    () => Array.from(new Set(drafts.map(draftGrade).filter((g): g is string => !!g))).sort(),
    [drafts],
  );
  const rows = useMemo(
    () =>
      drafts.filter(
        (d) =>
          (!batchIds || batchIds.has(d.id)) &&
          draftStatus(d) === status &&
          (family === "all" || d.family === family) &&
          (grade === "all" || draftGrade(d) === grade),
      ),
    [drafts, status, family, grade, batchIds],
  );

  const lastImport = (importsQ.data ?? [])
    .map((i) => i.importedAt)
    .sort()
    .at(-1);
  const clubUrl = bundle?.settings.clubUrl ?? "";
  const buildShortUrl = (slug: string) =>
    clubUrl ? `${clubUrl.replace(/\/$/, "")}/go/${slug}` : `/go/${slug}`;

  const columns: DataTableColumn<SocialDraft>[] = [
    {
      key: "card",
      header: "Card",
      cell: (d) => (
        <div className="flex items-center gap-3">
          {d.photoUrl ? (
            <img src={d.photoUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ImageIcon className="h-4 w-4" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{draftHeading(d)}</p>
            <p className="truncate text-xs text-muted-foreground">{draftSubline(d)}</p>
          </div>
        </div>
      ),
    },
    {
      key: "family",
      header: "Type",
      cell: (d) => (
        <div className="flex items-center gap-1.5">
          {isJuniorDraft(d) && (
            <Badge
              className="text-[10px] uppercase tracking-wide text-white"
              style={{ backgroundColor: "var(--juniors-accent)" }}
            >
              Junior
            </Badge>
          )}
          <span className="text-muted-foreground">
            {d.family ? FAMILY_LABEL[d.family as Family] : d.engine}
          </span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      cell: (d) => (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{draftSource(d)}</span>
          {d.staleSince && <StatusPill tone="danger">Data changed</StatusPill>}
        </div>
      ),
    },
  ];

  const hasAnyDraft = drafts.length > 0;
  const emptyState = hasAnyDraft ? (
    `No ${STATUS_LABEL[status].toLowerCase()} drafts match these filters.`
  ) : (
    <div className="mx-auto max-w-md space-y-2">
      <p className="font-medium text-foreground">No drafts yet</p>
      <p>
        Cards are drafted automatically after the next results import, and on each scheduled sweep.
      </p>
      <p className="text-xs">
        Last import: {relativeTime(lastImport ?? null)} · Last sweep:{" "}
        {relativeTime(bundle?.settings.lastSweepAt ?? null)}
      </p>
      <a href="#automation" className="text-sm font-medium text-primary-text underline">
        Check which cards are switched on
      </a>
    </div>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cards drafted from your imports, ready to review, share and post.{" "}
        <Link href="/admin/social/library" className="text-primary-text underline">
          Photo library
        </Link>
      </p>

      {batchIds && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm">
          <span>Showing the {batchIds.size} drafts from a notification.</span>
          <button
            type="button"
            className="font-medium text-primary-text underline"
            onClick={() => navigate("/admin/social/queue")}
          >
            Show all
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Draft state">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-semibold transition-colors",
              status === s
                ? "border-primary bg-primary/10 text-primary-text"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {STATUS_LABEL[s]} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="family-filter" className="text-sm">
          Type
        </Label>
        <select
          id="family-filter"
          value={family}
          onChange={(e) => setFamily(e.target.value as Family | "all")}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
        >
          <option value="all">All types</option>
          {FAMILIES.map((f) => (
            <option key={f} value={f}>
              {FAMILY_LABEL[f]}
            </option>
          ))}
        </select>
        <Label htmlFor="grade-filter" className="text-sm">
          Grade
        </Label>
        <select
          id="grade-filter"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
        >
          <option value="all">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      {draftsQ.isLoading ? (
        <ListSkeleton rows={5} />
      ) : draftsQ.isError ? (
        <QueryError
          message="We couldn’t load the social queue. Please try again."
          onRetry={() => draftsQ.refetch()}
        />
      ) : (
        <DataTable
          label="Drafts"
          rows={rows}
          columns={columns}
          getRowId={(d) => d.id}
          searchText={(d) => `${draftHeading(d)} ${draftSubline(d)}`}
          searchPlaceholder="Search drafts"
          onRowClick={setOpen}
          emptyState={emptyState}
          minWidth={640}
        />
      )}

      <AutomationCard config={bundle?.settings.familyConfig} />

      <AutoPostCard settings={bundle?.settings} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate by hand</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ru-grade">Grade</Label>
            <Input
              id="ru-grade"
              value={ruGrade}
              onChange={(e) => setRuGrade(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ru-season">Season</Label>
            <Input
              id="ru-season"
              type="number"
              value={ruSeason}
              onChange={(e) => setRuSeason(parseInt(e.target.value, 10) || ruSeason)}
              className="w-28"
            />
          </div>
          <Button
            type="button"
            onClick={() => roundupM.mutate({ data: { grade: ruGrade, season: ruSeason } })}
            disabled={roundupM.isPending}
          >
            {roundupM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate round-up
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await generateRecaps({ grade: ruGrade, season: ruSeason });
              invalidateDrafts();
            }}
          >
            Generate season recap
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tracked links</CardTitle>
        </CardHeader>
        <CardContent>
          {linksQ.isLoading ? (
            <ListSkeleton rows={3} />
          ) : linksQ.isError ? (
            <QueryError
              message="We couldn’t load tracked links. Please try again."
              onRetry={() => linksQ.refetch()}
            />
          ) : (linksQ.data ?? []).length === 0 ? (
            <EmptyState
              title="No tracked links yet"
              message="Short links are minted when you mark a card ready."
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {(linksQ.data ?? []).map((l) => (
                <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="space-y-0.5">
                    <code className="text-xs">{buildShortUrl(l.slug)}</code>
                    <p className="text-xs text-muted-foreground">
                      → {l.targetUrl} • {l.engine}
                    </p>
                  </div>
                  <Badge variant="secondary">{l.clickCount} clicks</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DraftDrawer draft={open} onClose={() => setOpen(null)} onPreview={setPreview} />

      <ShareCardModal
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        input={(preview?.cardInput as ShareCardInput | null) ?? null}
        engine={(preview?.engine as EngineKey) ?? "ondemand"}
        appPath={preview?.appPath ?? undefined}
        trackedSlug={preview?.trackedSlug ?? null}
        onApprove={
          preview && draftStatus(preview) === "ready"
            ? async () => {
                await markSocialDraftPosted(preview.id);
                invalidateDrafts();
              }
            : undefined
        }
        approveLabel="Mark posted"
      />
    </div>
  );
}
