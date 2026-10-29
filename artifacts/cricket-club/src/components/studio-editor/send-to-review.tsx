import { Link } from "wouter";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * New Studio's way out of the editor (studio-create-consolidation S6): the draft is
 * already waiting for review, so this opens it in the Queue to approve, schedule or
 * post. It never approves or posts on its own. Unsaved changes are saved first.
 */
export function SendToReview({ draftId, dirty }: { draftId: number; dirty: boolean }) {
  const cls = cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
    "bg-[var(--ed-accent)] text-[var(--ed-on-accent)]",
    dirty && "pointer-events-none opacity-40",
  );
  return (
    <Link
      href={`/admin/social/queue?draft=${draftId}`}
      aria-disabled={dirty}
      tabIndex={dirty ? -1 : undefined}
      title={dirty ? "Save your changes first" : "Open it in the Queue to approve or schedule"}
      className={cls}
    >
      <Send className="h-4 w-4" aria-hidden />
      Send to review
    </Link>
  );
}
