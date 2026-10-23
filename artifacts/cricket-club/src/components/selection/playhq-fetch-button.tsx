import { useRef, useState } from "react";
import { requestPlayhqFetch, type SelectionPlayhqFetch } from "@workspace/api-client-react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

/** The server's refusal text ({ error }) when there is one. */
function errorText(e: unknown): string {
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === "string") return data.error;
  return "Could not ask PlayHQ for the latest sides. Please try again.";
}

/** Perth wall-clock time, e.g. "9:12 am". */
function perthTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Perth",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The button's hover text: what a fetch does, and where the last one is. */
export function fetchTitle(f: SelectionPlayhqFetch): string {
  if (f.pending && f.requestedAt)
    return `Asked${f.requestedBy ? ` by ${f.requestedBy}` : ""} at ${perthTime(f.requestedAt)}. PlayHQ's sides usually arrive within a few minutes; this page updates by itself.`;
  if (f.nextAllowedAt)
    return `Fetched recently. You can ask again after ${perthTime(f.nextAllowedAt)}.`;
  const last = f.completedAt ? ` Last fetched ${perthTime(f.completedAt)}.` : "";
  return `Collect the sides named in PlayHQ now, instead of at the next scheduled sync. It changes no draft: use Sync from PlayHQ afterwards.${last}`;
}

/**
 * "Fetch latest from PlayHQ" (admins): asks the PlayHQ sync to collect the club's named sides
 * now. The board refreshes on its own, so the PlayHQ counts update when the fetch lands; a
 * fetch never changes a draft.
 */
export function PlayhqFetchButton({
  fetch: f,
  onRequested,
}: {
  fetch: SelectionPlayhqFetch | undefined;
  onRequested: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (!f?.available || !f.canRequest) return null;

  const ask = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await requestPlayhqFetch();
      toast({
        description:
          r.wake === "dispatched"
            ? "Fetching the latest sides from PlayHQ. They usually arrive within a few minutes."
            : "Asked PlayHQ for the latest sides. They arrive with the next hourly sync.",
      });
      onRequested();
    } catch (e) {
      toast({ variant: "destructive", description: errorText(e) });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const waiting = f.pending || f.nextAllowedAt != null;
  return (
    <Button variant="outline" disabled={busy || waiting} title={fetchTitle(f)} onClick={ask}>
      {busy || f.pending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
      )}
      {f.pending ? "Fetching from PlayHQ…" : "Fetch latest from PlayHQ"}
    </Button>
  );
}
