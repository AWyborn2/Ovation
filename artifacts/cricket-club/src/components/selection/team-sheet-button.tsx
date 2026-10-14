import { useEffect, useId, useRef, useState } from "react";
import {
  getGetTeamSheetPreviewQueryKey,
  printTeamSheet,
  useGetTeamSheetPreview,
} from "@workspace/api-client-react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadBlob } from "@/lib/share-card";
import { plural } from "@/lib/plural";

/** The server's refusal text ({ error }) when there is one. */
function errorText(e: unknown): string {
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === "string") return data.error;
  return "Could not make the team sheet. Please try again.";
}

/**
 * "Print team sheet" on a finalised side: opens a small panel with the match
 * format and competition from PlayHQ and the overs (remembered per grade —
 * PlayHQ doesn't publish them), then downloads the A4 PDF.
 */
export function TeamSheetButton({ selectionId, label }: { selectionId: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [overs, setOvers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const oversId = useId();
  const preview = useGetTeamSheetPreview(selectionId, {
    query: { queryKey: getGetTeamSheetPreviewQueryKey(selectionId), enabled: open, staleTime: 0 },
  });
  const p = preview.data;

  useEffect(() => {
    if (p) setOvers(p.overs ?? "");
  }, [p]);

  const download = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await printTeamSheet(selectionId, { overs: overs.trim() || null });
      if (!blob.size) throw new Error("empty");
      const name = `team-sheet-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadBlob(blob, `${name}.pdf`);
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Printer className="mr-2 h-4 w-4" aria-hidden />
        Print team sheet
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md bg-muted px-2.5 py-2 text-[12.5px]">
      <div className="font-semibold">Team sheet (A4 PDF)</div>
      {preview.isLoading ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading match details…
        </p>
      ) : preview.isError ? (
        <p role="alert" className="text-destructive">
          {errorText(preview.error)}
        </p>
      ) : p ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Format</dt>
            <dd>{p.format ?? "Not in PlayHQ — write it in"}</dd>
            <dt className="text-muted-foreground">Competition</dt>
            <dd>{p.competition ?? "Not in PlayHQ — write it in"}</dd>
          </dl>
          <label htmlFor={oversId} className="block font-medium">
            Overs per innings
          </label>
          <Input
            id={oversId}
            value={overs}
            maxLength={20}
            inputMode="numeric"
            placeholder="e.g. 50"
            onChange={(e) => setOvers(e.target.value)}
            className="h-9 bg-background"
          />
          <p className="text-[11.5px] text-muted-foreground">
            Remembered for {p.grade}. Leave blank to write it in by hand.
          </p>
          {p.section === "senior" && (
            <p className="text-[11.5px] text-muted-foreground">
              {p.bowlingRulesSource
                ? `Junior Aged Player bowling limits follow ${p.bowlingRulesSource}, from each player's date of birth.`
                : "This competition's junior bowling rules aren't set up yet, so the limit columns print blank."}
              {p.missingBirthDates > 0 &&
                ` ${plural(p.missingBirthDates, "player")} in the side ${p.missingBirthDates === 1 ? "has" : "have"} no date of birth on the squad list.`}
            </p>
          )}
        </>
      ) : null}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !p} onClick={download}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Printer className="mr-2 h-4 w-4" aria-hidden />
          )}
          {busy ? "Making PDF…" : "Download PDF"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
