import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useGetMetaConnection,
  getGetMetaConnectionQueryKey,
  useScheduleDraftPublications,
  useRescheduleSocialPublication,
  useCancelSocialPublication,
  useRetrySocialPublication,
  getListSocialDraftsQueryKey,
  type SocialDraft,
  type SocialPublication,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/admin-ui";
import {
  PUBLICATION_LABEL,
  PUBLICATION_TONE,
  clubTimeInputValue,
  clubTimeLabel,
  draftStatus,
  isJuniorDraft,
  publicationLabel,
} from "./draft-meta";

/**
 * Publish to Facebook and Instagram from the draft drawer (Meta publishing
 * U10, R3, R8, R17): pick the platforms (both by default), feed and/or Story,
 * now or a club-time date and time; then each post's state, with cancel,
 * move and retry.
 */

type Platform = "facebook" | "instagram";
type PostType = "feed" | "story";

function merge(list: SocialPublication[], rows: SocialPublication[]): SocialPublication[] {
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const r of rows) byId.set(r.id, r);
  // The newest per platform and post type, as the API presents them.
  const bySlot = new Map<string, SocialPublication>();
  for (const p of [...byId.values()].sort((a, b) => a.id - b.id)) {
    bySlot.set(`${p.platform}:${p.postType}`, p);
  }
  return [...bySlot.values()].sort((a, b) => a.id - b.id);
}

export function SchedulePanel({ draft }: { draft: SocialDraft }) {
  const qc = useQueryClient();
  const conn = useGetMetaConnection({ query: { queryKey: getGetMetaConnectionQueryKey() } });
  const [pubs, setPubs] = useState<SocialPublication[]>(draft.publications ?? []);
  const [platforms, setPlatforms] = useState<Platform[]>(["facebook", "instagram"]);
  const [types, setTypes] = useState<PostType[]>(["feed"]);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() => clubTimeInputValue(new Date(Date.now() + 2 * 3_600_000)));
  const [moving, setMoving] = useState<number | null>(null);
  const [moveAt, setMoveAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPubs(draft.publications ?? []), [draft.id, draft.publications]);

  const refresh = (rows: SocialPublication[]) => {
    setPubs((list) => merge(list, rows));
    setError(null);
    qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
  };
  const fail = (fallback: string) => (err: unknown) => {
    const body = (err as { data?: { error?: string } })?.data;
    setError(body?.error ?? fallback);
  };

  const schedule = useScheduleDraftPublications({
    mutation: { onSuccess: refresh, onError: fail("Couldn't schedule that.") },
  });
  const reschedule = useRescheduleSocialPublication({
    mutation: {
      onSuccess: (row) => {
        setMoving(null);
        refresh([row]);
      },
      onError: fail("Couldn't move that post."),
    },
  });
  const cancel = useCancelSocialPublication({
    mutation: { onSuccess: (row) => refresh([row]), onError: fail("Couldn't cancel that post.") },
  });
  const retry = useRetrySocialPublication({
    mutation: { onSuccess: (row) => refresh([row]), onError: fail("Couldn't retry that post.") },
  });

  const view = conn.data;
  if (!view?.available) return null;
  if (view.status !== "connected") {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Publish</h3>
        <p className="text-sm text-muted-foreground">
          {view.status === "needs_reconnect"
            ? "Facebook and Instagram need reconnecting. Scheduled posts are on hold."
            : "Connect Facebook and Instagram to publish from here."}{" "}
          <Link href="/admin/social/cards" className="font-medium text-primary-text underline">
            {view.status === "needs_reconnect" ? "Reconnect" : "Connect"}
          </Link>
        </p>
        <PublicationList pubs={pubs} />
      </section>
    );
  }

  const hasInstagram = !!view.igUsername;
  const chosen = platforms.filter((p) => p !== "instagram" || hasInstagram);
  const ready = draftStatus(draft) === "ready";
  const busy = schedule.isPending || reschedule.isPending || cancel.isPending || retry.isPending;
  const toggle = <T,>(list: T[], v: T, on: boolean) =>
    on ? [...new Set([...list, v])] : list.filter((x) => x !== v);

  const submit = () => {
    if (chosen.length === 0 || types.length === 0) {
      setError("Pick at least one platform and one post type.");
      return;
    }
    if (when === "later" && clubTimeInputValue(new Date()) >= at) {
      setError("Pick a time in the future.");
      return;
    }
    schedule.mutate({
      id: draft.id,
      data: { platforms: chosen, postTypes: types, ...(when === "later" ? { at } : {}) },
    });
  };

  return (
    <section className="space-y-3" aria-label="Publish to Facebook and Instagram">
      <h3 className="text-sm font-semibold">Publish</h3>
      <PublicationList
        pubs={pubs}
        actions={(p) => (
          <>
            {p.status === "scheduled" && moving !== p.id && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setMoving(p.id);
                    setMoveAt(clubTimeInputValue(new Date(p.scheduledFor)));
                  }}
                >
                  Move
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => cancel.mutate({ id: p.id })}
                >
                  Cancel
                </Button>
              </>
            )}
            {p.status === "held" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => cancel.mutate({ id: p.id })}
              >
                Cancel
              </Button>
            )}
            {p.status === "failed" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => retry.mutate({ id: p.id })}
              >
                Retry
              </Button>
            )}
            {moving === p.id && (
              <span className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  aria-label="New time"
                  value={moveAt}
                  onChange={(e) => setMoveAt(e.target.value)}
                  className="h-8 w-48"
                />
                <Button
                  size="sm"
                  disabled={busy || !moveAt}
                  onClick={() => reschedule.mutate({ id: p.id, data: { at: moveAt } })}
                >
                  Save
                </Button>
              </span>
            )}
          </>
        )}
      />

      {ready && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Platforms</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={platforms.includes("facebook")}
                onChange={(e) => setPlatforms((l) => toggle(l, "facebook", e.target.checked))}
              />
              Facebook
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!hasInstagram}
                checked={hasInstagram && platforms.includes("instagram")}
                onChange={(e) => setPlatforms((l) => toggle(l, "instagram", e.target.checked))}
              />
              Instagram{!hasInstagram && " (not linked)"}
            </label>
          </fieldset>
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Post types</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={types.includes("feed")}
                onChange={(e) => setTypes((l) => toggle(l, "feed", e.target.checked))}
              />
              Feed post
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={types.includes("story")}
                onChange={(e) => setTypes((l) => toggle(l, "story", e.target.checked))}
              />
              Story
            </label>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="sr-only">When</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`when-${draft.id}`}
                checked={when === "now"}
                onChange={() => setWhen("now")}
              />
              Now
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`when-${draft.id}`}
                checked={when === "later"}
                onChange={() => setWhen("later")}
              />
              At
            </label>
            <Input
              type="datetime-local"
              aria-label="Publish at (club time)"
              value={at}
              onChange={(e) => {
                setAt(e.target.value);
                setWhen("later");
              }}
              className="h-9 w-56"
            />
          </fieldset>
          {isJuniorDraft(draft) && (
            <p className="text-xs text-muted-foreground">
              Junior cards never publish automatically. Scheduling here is your call.
            </p>
          )}
          <Button size="sm" onClick={submit} disabled={busy}>
            {when === "now" ? "Publish now" : "Schedule"}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function PublicationList({
  pubs,
  actions,
}: {
  pubs: SocialPublication[];
  actions?: (p: SocialPublication) => ReactNode;
}) {
  if (pubs.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Posts">
      {pubs.map((p) => (
        <li key={p.id} className="space-y-1 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{publicationLabel(p)}</span>
            <StatusPill tone={PUBLICATION_TONE[p.status]}>{PUBLICATION_LABEL[p.status]}</StatusPill>
            {(p.status === "scheduled" || p.status === "held") && (
              <span className="text-muted-foreground">{clubTimeLabel(p.scheduledFor)}</span>
            )}
            {p.status === "published" && p.publishedAt && (
              <span className="text-muted-foreground">{clubTimeLabel(p.publishedAt)}</span>
            )}
            <span className="ml-auto flex items-center gap-1">{actions?.(p)}</span>
          </div>
          {p.status === "failed" && p.lastError && (
            <p className="text-xs text-destructive">{p.lastError}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
