import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useApplyKindTemplate, type ApplyKindTemplateResult } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * After a save, offer to update the cards already waiting (R16, AE4). Shown
 * only when drafts of the kind are waiting; "Don't apply" is the default.
 * Applying replaces each waiting card's design with the saved version —
 * one-off design tweaks are reset, captions are kept — and reports what
 * changed and what was skipped (posted in the meantime).
 */
export function ApplyTemplateDialog({
  kind,
  label,
  version,
  waiting,
  open,
  onClose,
  onApplied,
}: {
  kind: string;
  /** The card kind's display name. */
  label: string;
  /** The saved version to apply. */
  version: number;
  /** Waiting drafts of this kind, as last counted. */
  waiting: number;
  open: boolean;
  onClose: () => void;
  onApplied?: (result: ApplyKindTemplateResult) => void;
}) {
  const apply = useApplyKindTemplate();
  const [result, setResult] = useState<ApplyKindTemplateResult | null>(null);
  const dontApplyRef = useRef<HTMLButtonElement>(null);

  const run = () =>
    apply.mutate(
      { kind, data: { version, expectedDrafts: waiting } },
      {
        onSuccess: (r) => {
          setResult(r);
          onApplied?.(r);
        },
      },
    );
  const close = () => {
    setResult(null);
    apply.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !apply.isPending && close()}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          dontApplyRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {result
              ? "Waiting cards updated"
              : `Update ${plural(waiting, "waiting card", "waiting cards")}?`}
          </DialogTitle>
          <DialogDescription>
            {result
              ? `${plural(result.changed, "card", "cards")} now ${result.changed === 1 ? "uses" : "use"} this design.` +
                (result.skipped > 0
                  ? ` ${plural(result.skipped, "card was", "cards were")} posted in the meantime and kept ${result.skipped === 1 ? "its" : "their"} design.`
                  : "")
              : `${plural(waiting, `${label} card is`, `${label} cards are`)} waiting in the queue with the previous design. Applying gives them this design: any one-off design tweaks on them are reset. Their captions are kept. New cards use this design either way.`}
          </DialogDescription>
        </DialogHeader>
        {apply.isError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t update the waiting cards. Nothing was changed.
          </p>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button
                ref={dontApplyRef}
                variant="outline"
                onClick={close}
                disabled={apply.isPending}
              >
                Don&apos;t apply
              </Button>
              <Button onClick={run} disabled={apply.isPending}>
                {apply.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                {apply.isPending
                  ? "Updating…"
                  : apply.isError
                    ? "Try again"
                    : "Apply to waiting cards"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
