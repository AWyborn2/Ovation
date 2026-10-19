import { useEffect, useState } from "react";
import {
  useSetSelectionMemberStatus,
  type AvailabilityStatus,
  type SelectionBoard,
  type SelectionMember,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS } from "./labels";

const CHOICES: { status: AvailabilityStatus; label: string }[] = [
  { status: "yes", label: "Yes" },
  { status: "maybe", label: "Maybe" },
  { status: "no", label: "No" },
];

/**
 * Record an answer a player gave in person or by phone: Yes, Maybe or No and
 * an optional note, for every date of the round's weekend. Shows who recorded
 * the current answer when it wasn't the player. The player's own later answer
 * from their link replaces it. Works with availability requests off.
 */
export function MemberStatusControl({
  member,
  weekend,
  boardJunior,
  disabled = false,
  onSaved,
  onError,
}: {
  member: SelectionMember;
  /** The round's Saturday (YYYY-MM-DD). */
  weekend: string;
  /** The board shows the Juniors section. */
  boardJunior: boolean;
  disabled?: boolean;
  onSaved: (board: SelectionBoard, message: string) => void;
  onError: (error: unknown) => void;
}) {
  const current = member.status === "none" ? null : member.status;
  const [status, setStatus] = useState<AvailabilityStatus | null>(current);
  const [note, setNote] = useState(member.note ?? "");
  useEffect(() => {
    setStatus(current);
    setNote(member.note ?? "");
  }, [member.id, current, member.note]);
  const set = useSetSelectionMemberStatus();

  // A junior's answers belong to the Juniors board (juniors isolation).
  if (member.section === "junior" && !boardJunior) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="status-control-junior">
        Record a junior&apos;s answer from the Juniors board.
      </p>
    );
  }

  const setBy = member.statusSource === "admin" ? member.statusSetBy : null;
  const changed = status != null && (status !== current || note.trim() !== (member.note ?? ""));
  const save = () => {
    if (status == null) return;
    set.mutate(
      { id: member.id, data: { weekend, status, note: note.trim() || null } },
      {
        onSuccess: (board) =>
          onSaved(board, `${member.displayName}: ${STATUS[status].label} recorded`),
        onError,
      },
    );
  };

  return (
    <fieldset
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      data-testid="status-control"
      disabled={disabled || set.isPending}
    >
      <legend className="px-1 text-xs font-semibold text-muted-foreground">
        Answer given in person
      </legend>
      <div role="group" aria-label="Available this weekend?" className="flex gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.status}
            type="button"
            aria-pressed={status === c.status}
            onClick={() => setStatus(c.status)}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-border text-sm font-semibold",
              status === c.status ? STATUS[c.status].mark : "bg-card text-muted-foreground",
            )}
          >
            <span aria-hidden>{STATUS[c.status].glyph}</span>
            {c.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Note (optional)
        <input
          className="block min-h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. told me at training, Saturday only"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground" data-testid="status-set-by">
          {setBy
            ? `Set by ${setBy}`
            : member.statusSource === "member"
              ? "From the player"
              : current
                ? "Marked away"
                : "No answer yet"}
        </span>
        <Button type="button" size="sm" disabled={!changed} onClick={save}>
          {set.isPending ? "Saving…" : "Record answer"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Applies to every date this weekend. The player&apos;s own answer from their link replaces
        it.
      </p>
    </fieldset>
  );
}
