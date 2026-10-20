import { useRef, useState } from "react";
import { emailTeamSheet } from "@workspace/api-client-react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/plural";

/** The server's refusal text ({ error }) when there is one. */
function errorText(e: unknown): string {
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === "string") return data.error;
  return "Could not email the team sheet. Please try again.";
}

/**
 * "Email team sheet" on a finalised senior side: queues the printable sheet
 * for the club's email lists covering the grade (email-distribution-lists).
 * Sending happens in the background; Admin → Email lists has the send log.
 */
export function EmailTeamSheetButton({ selectionId }: { selectionId: number }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const lock = useRef(false);

  const send = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNote(null);
    try {
      const { queued } = await emailTeamSheet(selectionId);
      setNote({ ok: true, text: `Sending to ${plural(queued, "email list")}.` });
    } catch (e) {
      setNote({ ok: false, text: errorText(e) });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button variant="outline" className="w-full" disabled={busy} onClick={send}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Mail className="mr-2 h-4 w-4" aria-hidden />
        )}
        Email team sheet
      </Button>
      {note && (
        <p
          role={note.ok ? "status" : "alert"}
          className={note.ok ? "text-[12px] text-muted-foreground" : "text-[12px] text-destructive"}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
