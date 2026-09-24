import { useEffect, useRef, useState } from "react";
import {
  useGetPendingSocialDraftCount,
  getGetPendingSocialDraftCountQueryKey,
} from "@workspace/api-client-react";

/**
 * How many social cards a publish drafted (Social Studio U24). Publishing runs
 * the draft sweep before it responds, so the drafts it made are the rise in
 * the awaiting-review count between the review step and the publish.
 *
 * `reviewing` is true while a preview is open; `committed` changes identity on
 * each successful publish. Returns null until a publish has been counted.
 */
export function useDraftedOnPublish({
  reviewing,
  committed,
  enabled,
}: {
  reviewing: boolean;
  committed: unknown;
  enabled: boolean;
}): number | null {
  const pendingQ = useGetPendingSocialDraftCount({
    query: { queryKey: getGetPendingSocialDraftCountQueryKey(), enabled },
  });
  const atReview = useRef<number | null>(null);
  const [drafted, setDrafted] = useState<number | null>(null);

  // Snapshot the count once per review step, as soon as it is known.
  const snapped = useRef(false);
  useEffect(() => {
    if (!reviewing) {
      snapped.current = false;
      return;
    }
    if (!snapped.current && pendingQ.data) {
      atReview.current = pendingQ.data.count;
      snapped.current = true;
      setDrafted(null);
    }
  }, [reviewing, pendingQ.data]);

  useEffect(() => {
    if (!committed || !enabled) return;
    const before = atReview.current;
    void pendingQ.refetch().then(({ data }) => {
      if (before != null && data) setDrafted(Math.max(0, data.count - before));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  return drafted;
}
