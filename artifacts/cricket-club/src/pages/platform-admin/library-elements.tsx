import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListConsoleLibraryElementReportsQueryKey,
  getListConsoleLibraryElementsQueryKey,
  useDismissConsoleLibraryElementReports,
  useListConsoleLibraryElement,
  useListConsoleLibraryElementReports,
  useListConsoleLibraryElements,
  useUnlistConsoleLibraryElement,
  type ConsoleLibraryElement,
  type ListConsoleLibraryElementsParams,
} from "@workspace/api-client-react";
import { ELEMENT_CATEGORY_LABELS } from "@workspace/scorecard/kind-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/stat-badge";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ORIGIN_LABEL: Record<ConsoleLibraryElement["origin"], string> = {
  bundle: "Bundle",
  console: "Console",
  club: "Club",
};

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-AU");

/** Listed, or who took it out and why. */
function statusPill(e: ConsoleLibraryElement) {
  if (e.listed) return <StatusPill tone="live">Listed</StatusPill>;
  return (
    <StatusPill tone="neutral">
      {e.unlistedBy === "ovation" ? "Unlisted by Ovation" : "Unlisted by its club"}
    </StatusPill>
  );
}

/** An element's reports, open first, with the club that made each. */
function Reports({ id }: { id: number }) {
  const q = useListConsoleLibraryElementReports(id, {
    query: { queryKey: getListConsoleLibraryElementReportsQueryKey(id) },
  });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading reports…</p>;
  const reports = q.data?.reports ?? [];
  if (reports.length === 0) return <p className="text-xs text-muted-foreground">No reports.</p>;
  return (
    <ul className="space-y-1 text-xs" aria-label="Reports">
      {reports.map((r) => (
        <li key={r.id} className={r.resolvedAt ? "text-muted-foreground" : undefined}>
          <span className="font-semibold">{r.clubName}</span> ({dateOf(r.createdAt)}
          {r.resolvedAt ? `, resolved ${dateOf(r.resolvedAt)}` : ""}): {r.reason}
        </li>
      ))}
    </ul>
  );
}

/** One element: its credit, status and reports, and what Ovation can do. */
function ElementRow({
  element,
  onChanged,
}: {
  element: ConsoleLibraryElement;
  onChanged: () => void;
}) {
  const unlist = useUnlistConsoleLibraryElement();
  const relist = useListConsoleLibraryElement();
  const dismiss = useDismissConsoleLibraryElementReports();
  const [showReports, setShowReports] = useState(element.openReports > 0);
  const [unlisting, setUnlisting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = unlist.isPending || relist.isPending || dismiss.isPending;
  const done = () => {
    setUnlisting(false);
    setReason("");
    onChanged();
  };
  return (
    <li className="space-y-2 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{element.name}</span>
        <span className="text-xs text-muted-foreground">
          {ELEMENT_CATEGORY_LABELS[element.category]} · {ORIGIN_LABEL[element.origin]} ·{" "}
          {element.look ? element.look.name : `by ${element.authorName}`} ·{" "}
          {dateOf(element.createdAt)}
        </span>
        {statusPill(element)}
        {element.openReports > 0 && (
          <StatusPill tone="danger">
            {element.openReports} open {element.openReports === 1 ? "report" : "reports"}
          </StatusPill>
        )}
      </div>
      {!element.listed && element.unlistReason && (
        <p className="text-xs text-muted-foreground">Why: {element.unlistReason}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowReports((s) => !s)}>
          {showReports ? "Hide reports" : "Reports"}
        </Button>
        {element.listed ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setUnlisting(true)}>
            Unlist
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await relist.mutateAsync({ id: element.id });
              done();
            }}
          >
            List again
          </Button>
        )}
        {element.openReports > 0 && element.listed && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await dismiss.mutateAsync({ id: element.id });
              done();
            }}
          >
            Keep it, dismiss reports
          </Button>
        )}
      </div>
      {unlisting && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Why (shown in the console)
            <input
              aria-label="Reason for unlisting"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 w-72 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              await unlist.mutateAsync({
                id: element.id,
                data: reason.trim() ? { reason: reason.trim() } : {},
              });
              done();
            }}
          >
            Unlist for every club
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setUnlisting(false)}>
            Cancel
          </Button>
        </div>
      )}
      {showReports && <Reports id={element.id} />}
    </li>
  );
}

/**
 * Console → Element library (editable-elements plan, D5; decision E1): every
 * library element, listed or not, credited to Ovation or the club that saved
 * it, with the reports clubs sent. Ovation can unlist one for every club (which
 * resolves its reports), list it again, or keep it and dismiss the reports.
 */
export default function LibraryElementsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<"" | ConsoleLibraryElement["origin"]>("");
  const [reported, setReported] = useState(false);
  const [listed, setListed] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const params: ListConsoleLibraryElementsParams = {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(origin ? { origin } : {}),
    ...(reported ? { reported: true } : {}),
    ...(listed ? { listed: listed === "true" } : {}),
    ...(page > 1 ? { page } : {}),
  };
  const listQ = useListConsoleLibraryElements(params, {
    query: { queryKey: getListConsoleLibraryElementsQueryKey(params) },
  });
  // The list and every element's reports (an unlisting resolves them).
  const listKey = String(getListConsoleLibraryElementsQueryKey()[0]);
  const changed = () =>
    void queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0]).startsWith(listKey),
    });
  const data = listQ.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div>
      <h1 className="mb-2 text-[clamp(38px,4.6vw,64px)] leading-none">Element library</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Every element clubs can add from the Elements panel: Ovation&rsquo;s, from the looks, and
        the ones clubs saved, which every club sees at once. Reported elements come first.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Elements{data ? ` (${data.total})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              aria-label="Search elements"
              placeholder="Search names and tags"
              value={q}
              onChange={(e) => filter(() => setQ(e.target.value))}
              className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
            />
            <select
              aria-label="Origin"
              className={selectClass}
              value={origin}
              onChange={(e) => filter(() => setOrigin(e.target.value as typeof origin))}
            >
              <option value="">Every origin</option>
              <option value="bundle">Bundle</option>
              <option value="console">Console</option>
              <option value="club">Club</option>
            </select>
            <select
              aria-label="Listed"
              className={selectClass}
              value={listed}
              onChange={(e) => filter(() => setListed(e.target.value as typeof listed))}
            >
              <option value="">Listed or not</option>
              <option value="true">Listed</option>
              <option value="false">Unlisted</option>
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={reported}
                onChange={(e) => filter(() => setReported(e.target.checked))}
              />
              Reported only
            </label>
          </div>
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : listQ.isError ? (
            <p className="text-sm text-destructive">The elements didn&rsquo;t load.</p>
          ) : (data?.elements.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No elements match.</p>
          ) : (
            <ul aria-label="Elements">
              {data!.elements.map((e) => (
                <ElementRow key={e.id} element={e} onChanged={changed} />
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              Page {page} of {pages}
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
