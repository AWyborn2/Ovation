import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useApproveSocialDraft,
  useDismissSocialDraft,
  useListClubPhotos,
  useListSocialDraftRevisions,
  useReopenSocialDraft,
  useRevertSocialDraft,
  useSendBackSocialDraft,
  useUpdateSocialDraft,
  markSocialDraftPosted,
  getListClubPhotosQueryKey,
  getListSocialDraftRevisionsQueryKey,
  getListSocialDraftsQueryKey,
  getGetPendingSocialDraftCountQueryKey,
  type SocialDraft,
} from "@workspace/api-client-react";
import { AlertTriangle, ImageIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EditDrawer, StatusPill } from "@/components/admin-ui";
import {
  STATUS_LABEL,
  STATUS_TONE,
  draftHeading,
  draftSource,
  draftStatus,
  draftSubline,
  isJuniorDraft,
  relativeTime,
} from "./draft-meta";

/**
 * Everything about one draft (R6, R8, R31): the card and its caption, the
 * photo (swap from the library), the revision history with revert, the
 * "changed since posting" notice, and the state actions.
 */
export function DraftDrawer({
  draft,
  onClose,
  onPreview,
}: {
  draft: SocialDraft | null;
  onClose: () => void;
  /** Opens the card preview / download modal for this draft. */
  onPreview: (draft: SocialDraft) => void;
}) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState<SocialDraft | null>(draft);
  const [caption, setCaption] = useState(draft?.caption ?? "");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setCurrent(draft);
    setCaption(draft?.caption ?? "");
    setPicking(false);
  }, [draft]);

  const id = current?.id ?? 0;
  const revisionsQ = useListSocialDraftRevisions(id, {
    query: { queryKey: getListSocialDraftRevisionsQueryKey(id), enabled: id > 0 },
  });
  const junior = current ? isJuniorDraft(current) : false;
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey(), enabled: picking && !junior },
  });

  // Every change refreshes the list, the nav badge and this drawer's history.
  const settle = (next?: SocialDraft) => {
    qc.invalidateQueries({ queryKey: getListSocialDraftsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPendingSocialDraftCountQueryKey() });
    qc.invalidateQueries({ queryKey: getListSocialDraftRevisionsQueryKey(id) });
    if (next) {
      setCurrent(next);
      setCaption(next.caption ?? "");
    }
  };
  const done = { mutation: { onSuccess: (d: unknown) => settle(d as SocialDraft) } };
  const approveM = useApproveSocialDraft(done);
  const sendBackM = useSendBackSocialDraft(done);
  const reopenM = useReopenSocialDraft(done);
  const updateM = useUpdateSocialDraft(done);
  const revertM = useRevertSocialDraft(done);
  const dismissM = useDismissSocialDraft({
    mutation: {
      onSuccess: () => {
        settle();
        onClose();
      },
    },
  });

  if (!current) return null;

  const status = draftStatus(current);
  const revisions = revisionsQ.data ?? [];
  // The newest refresh revision holds the corrected data for a stale card.
  const correction = current.staleSince ? revisions.find((r) => r.reason === "refresh") : undefined;
  const busy =
    approveM.isPending ||
    sendBackM.isPending ||
    reopenM.isPending ||
    updateM.isPending ||
    revertM.isPending ||
    dismissM.isPending;

  const markPosted = async () => {
    await markSocialDraftPosted(current.id);
    settle({ ...current, status: "posted" });
  };

  return (
    <EditDrawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={draftHeading(current)}
      description={`${draftSubline(current)} · ${draftSource(current)}`}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {status !== "dismissed" && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => dismissM.mutate({ id: current.id })}
              disabled={busy}
            >
              Dismiss
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onPreview(current)}>
              Preview & download
            </Button>
            {status === "awaiting_review" && (
              <Button
                type="button"
                onClick={() => approveM.mutate({ id: current.id })}
                disabled={busy}
              >
                Mark ready
              </Button>
            )}
            {status === "ready" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => sendBackM.mutate({ id: current.id })}
                  disabled={busy}
                >
                  Send back
                </Button>
                <Button type="button" onClick={markPosted} disabled={busy}>
                  Mark posted
                </Button>
              </>
            )}
            {status === "dismissed" && (
              <Button
                type="button"
                onClick={() => reopenM.mutate({ id: current.id })}
                disabled={busy}
              >
                Reopen
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
          {junior && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: "var(--juniors-accent)" }}
            >
              Junior
            </span>
          )}
        </div>

        {current.staleSince && (
          <div
            role="status"
            className="flex gap-3 rounded-lg border border-border bg-muted/60 p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="space-y-2">
              <p>
                The data changed since this card was posted ({relativeTime(current.staleSince)}).
                The posted version is unchanged.
              </p>
              {correction && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => revertM.mutate({ id: current.id, revisionId: correction.id })}
                  disabled={busy}
                >
                  Refresh with the new data
                </Button>
              )}
            </div>
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Photo</h3>
          {junior ? (
            <p className="text-sm text-muted-foreground">Junior cards don't use photos.</p>
          ) : (
            <>
              {current.photoUrl ? (
                <img
                  src={current.photoUrl}
                  alt="Card photo"
                  className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                  <ImageIcon className="h-6 w-6" aria-hidden />
                  <span className="sr-only">No photo</span>
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPicking((p) => !p)}
              >
                {picking ? "Close library" : "Swap photo"}
              </Button>
              {picking && (
                <div className="grid grid-cols-3 gap-2" aria-label="Photo library">
                  {(photosQ.data ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        updateM.mutate({ id: current.id, data: { photoUrl: p.url } });
                        setPicking(false);
                      }}
                      className="overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary"
                    >
                      <img
                        src={p.thumbUrl}
                        alt={`Library photo ${p.id}`}
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                  ))}
                  {photosQ.data?.length === 0 && (
                    <p className="col-span-3 text-sm text-muted-foreground">
                      The photo library is empty.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-2">
          <label htmlFor="draft-caption" className="text-sm font-semibold">
            Caption
          </label>
          <Textarea
            id="draft-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || caption === (current.caption ?? "") || status === "dismissed"}
              onClick={() => updateM.mutate({ id: current.id, data: { caption } })}
            >
              Save caption
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">History</h3>
          {revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No earlier versions.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {revisions.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium capitalize">{r.reason}</span>{" "}
                    <span className="text-muted-foreground">· {relativeTime(r.createdAt)}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => revertM.mutate({ id: current.id, revisionId: r.id })}
                    disabled={busy}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden /> Revert
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </EditDrawer>
  );
}
