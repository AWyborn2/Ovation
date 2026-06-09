import { useMemo, useState } from "react";
import {
  useListSocialDrafts,
  getListSocialDraftsQueryKey,
  useApproveSocialDraft,
  useDismissSocialDraft,
  useGenerateRoundUp,
  useListTrackedLinks,
  getListTrackedLinksQueryKey,
  useGetSocialSettings,
  getGetSocialSettingsQueryKey,
  getGetPendingSocialDraftCountQueryKey,
  type SocialDraft,
  type SocialSettingsBundle,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShareCardModal } from "@/components/share-card-modal";
import { Loader2, Check, X, ExternalLink, Copy } from "lucide-react";
import type { ShareCardInput } from "@/lib/share-card";

type DraftStatus = "pending" | "approved" | "posted" | "dismissed";

export default function AdminSocialQueue() {
  const qc = useQueryClient();
  const draftsQ = useListSocialDrafts({
    query: { queryKey: getListSocialDraftsQueryKey() },
  });
  const linksQ = useListTrackedLinks({
    query: { queryKey: getListTrackedLinksQueryKey() },
  });
  const settingsQ = useGetSocialSettings({
    query: { queryKey: getGetSocialSettingsQueryKey() },
  });
  const bundle = settingsQ.data as SocialSettingsBundle | undefined;

  // Refresh both the queue list and the admin-nav pending badge after any
  // action that changes how many drafts are still waiting for review.
  const invalidateDrafts = () => {
    qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
  };

  const approveM = useApproveSocialDraft({
    mutation: {
      onSuccess: () => {
        invalidateDrafts();
        qc.invalidateQueries({ queryKey: getListTrackedLinksQueryKey() });
      },
    },
  });
  const dismissM = useDismissSocialDraft({
    mutation: {
      onSuccess: invalidateDrafts,
    },
  });
  const roundupM = useGenerateRoundUp({
    mutation: {
      onSuccess: invalidateDrafts,
    },
  });

  const markPosted = async (id: number) => {
    await fetch(`/api/social-drafts/${id}/posted`, {
      method: "POST",
      credentials: "include",
    });
    invalidateDrafts();
  };

  const triggerRecap = async () => {
    await fetch(`/api/social-recaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ grade, season }),
    });
    invalidateDrafts();
  };

  const [previewDraft, setPreviewDraft] = useState<SocialDraft | null>(null);
  const [approveMode, setApproveMode] = useState(false);
  const [grade, setGrade] = useState("A Grade");
  const [season, setSeason] = useState<number>(new Date().getFullYear());

  // Approving a pending draft: mint its tracked-link slug (so the caption
  // carries the /go/ short link), then open the modal in approve mode where the
  // admin downloads the card + caption bundle and confirms — which marks the
  // draft and its linked milestone event as posted.
  const startApproval = async (d: SocialDraft) => {
    let draft = d;
    if (d.status === "pending" && !d.trackedSlug) {
      try {
        draft = (await approveM.mutateAsync({ id: d.id })) as SocialDraft;
      } catch {
        draft = d;
      }
    }
    setApproveMode(true);
    setPreviewDraft(draft);
  };

  const openPreview = (d: SocialDraft) => {
    setApproveMode(false);
    setPreviewDraft(d);
  };

  const drafts = (draftsQ.data ?? []) as SocialDraft[];
  const byStatus = useMemo(() => {
    const groups: Record<DraftStatus, SocialDraft[]> = {
      pending: [],
      approved: [],
      posted: [],
      dismissed: [],
    };
    for (const d of drafts) {
      const key = (d.status as DraftStatus) ?? "pending";
      (groups[key] ??= []).push(d);
    }
    return groups;
  }, [drafts]);

  const clubUrl = bundle?.settings.clubUrl ?? "";
  const buildShortUrl = (slug: string) =>
    clubUrl
      ? `${clubUrl.replace(/\/$/, "")}/go/${slug}`
      : `/go/${slug}`;

  const renderList = (list: SocialDraft[]) => {
    if (draftsQ.isLoading) return <p className="text-muted-foreground">Loading…</p>;
    if (list.length === 0)
      return <p className="text-muted-foreground text-sm">Nothing here yet.</p>;
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((d) => {
          const input = d.cardInput as ShareCardInput | null;
          const heading =
            (input && (input as { playerName?: string }).playerName) ??
            (input && (input as { headline?: string }).headline) ??
            d.engine;
          const sub =
            (input && (input as { tierLabel?: string }).tierLabel) ??
            (input && (input as { category?: string }).category) ??
            (input && (input as { grade?: string }).grade) ??
            d.appPath;
          return (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{heading}</CardTitle>
                  <Badge variant="outline" className="capitalize">{d.engine}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {new Date(d.createdAt).toLocaleString()}
                </p>
                {d.trackedSlug && (
                  <div className="flex items-center gap-2 text-xs">
                    <code className="bg-muted px-1.5 py-0.5 rounded">
                      {buildShortUrl(d.trackedSlug)}
                    </code>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() =>
                        navigator.clipboard.writeText(buildShortUrl(d.trackedSlug!))
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openPreview(d)}
                    disabled={!input}
                  >
                    Preview & download
                  </Button>
                  {d.status === "pending" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => startApproval(d)}
                        disabled={approveM.isPending || !input}
                      >
                        {approveM.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        )}{" "}
                        Approve &amp; download
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => dismissM.mutate({ id: d.id })}
                        disabled={dismissM.isPending}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Skip
                      </Button>
                    </>
                  )}
                  {d.status === "approved" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => markPosted(d.id)}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" /> Mark posted
                    </Button>
                  )}
                  {d.appPath && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      asChild
                    >
                      <a href={d.appPath} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Social card queue</h1>
        <p className="text-muted-foreground text-sm">
          Auto-detected milestones, generated round-ups, and tracked share links.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate round-up</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ru-grade">Grade</Label>
            <Input
              id="ru-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ru-season">Season</Label>
            <Input
              id="ru-season"
              type="number"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10) || season)}
              className="w-28"
            />
          </div>
          <Button
            type="button"
            onClick={() => roundupM.mutate({ data: { grade, season } })}
            disabled={roundupM.isPending}
          >
            {roundupM.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generate round-up
          </Button>
          <Button type="button" variant="secondary" onClick={triggerRecap}>
            Generate season recap
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({byStatus.pending.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({byStatus.approved.length})
          </TabsTrigger>
          <TabsTrigger value="posted">
            Posted ({byStatus.posted.length})
          </TabsTrigger>
          <TabsTrigger value="dismissed">
            Dismissed ({byStatus.dismissed.length})
          </TabsTrigger>
          <TabsTrigger value="links">Tracked links</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          {renderList(byStatus.pending)}
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          {renderList(byStatus.approved)}
        </TabsContent>
        <TabsContent value="posted" className="mt-4">
          {renderList(byStatus.posted)}
        </TabsContent>
        <TabsContent value="dismissed" className="mt-4">
          {renderList(byStatus.dismissed)}
        </TabsContent>
        <TabsContent value="links" className="mt-4">
          {linksQ.isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (linksQ.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">No tracked links yet.</p>
          ) : (
            <div className="border rounded-md divide-y">
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
        </TabsContent>
      </Tabs>

      <ShareCardModal
        open={!!previewDraft}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewDraft(null);
            setApproveMode(false);
          }
        }}
        input={(previewDraft?.cardInput as ShareCardInput | null) ?? null}
        engine={(previewDraft?.engine as "ondemand" | "milestone" | "roundup" | "recap") ?? "ondemand"}
        appPath={previewDraft?.appPath ?? undefined}
        trackedSlug={previewDraft?.trackedSlug ?? null}
        onApprove={
          approveMode && previewDraft
            ? () => markPosted(previewDraft.id)
            : undefined
        }
        approveLabel="Approve & mark posted"
      />
    </div>
  );
}
