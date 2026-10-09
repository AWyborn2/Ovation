import type { StarterId } from "@workspace/scorecard/kind-templates";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { StarterChooser } from "./starter-chooser";

/**
 * Start a kind template over from a starter design (the editor's "Start
 * over"): the club's current design is replaced by the starter, saved as a
 * new version. Cards already waiting keep their design until the new version
 * is applied to them, and unsaved changes in the editor are lost.
 */
export function StartOverDialog({
  open,
  kind,
  label,
  input,
  data,
  version,
  dirty,
  busy,
  error,
  onPick,
  onClose,
}: {
  open: boolean;
  kind: string;
  label: string;
  input: ShareCardInput;
  data: PackCardData | null;
  /** The template's current version (the new one will be the next). */
  version: number;
  /** Unsaved changes in the editor, which starting over discards. */
  dirty: boolean;
  busy: boolean;
  error: string | null;
  onPick: (starter: StarterId) => void;
  onClose: () => void;
}) {
  const blurb =
    `Replaces this design with the starter you pick, saved as version ${version + 1}. ` +
    "Cards already waiting keep their design until you apply it to them." +
    (dirty ? " Your unsaved changes will be lost." : "");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      {/* The chooser's own heading and line describe the dialog on screen. */}
      <DialogContent
        className="studio-editor max-h-[92vh] max-w-3xl overflow-auto"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Start {label} over</DialogTitle>
        <StarterChooser
          kind={kind}
          label={label}
          input={input}
          data={data}
          busy={busy}
          error={error}
          onPick={onPick}
          title={`Start your ${label} card over`}
          blurb={blurb}
        />
      </DialogContent>
    </Dialog>
  );
}
