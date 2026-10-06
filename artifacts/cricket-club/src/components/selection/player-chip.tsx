import type { PointerEvent } from "react";
import type { SelectionMember } from "@workspace/api-client-react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { gradeCode } from "@/lib/grade-code";
import { ROLE_LABEL, STATUS } from "./labels";

/** The availability mark: a glyph on the status colour. */
export function StatusMark({
  status,
  className,
}: {
  status: SelectionMember["status"];
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-[18px] w-[18px] flex-none place-items-center rounded-full text-[11px] font-bold leading-none",
        s.mark,
        className,
      )}
    >
      {s.glyph}
    </span>
  );
}

function Grip() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden className="h-4 w-2.5">
      <g fill="currentColor">
        <circle cx="2.5" cy="2.5" r="1.5" />
        <circle cx="7.5" cy="2.5" r="1.5" />
        <circle cx="2.5" cy="8" r="1.5" />
        <circle cx="7.5" cy="8" r="1.5" />
        <circle cx="2.5" cy="13.5" r="1.5" />
        <circle cx="7.5" cy="13.5" r="1.5" />
      </g>
    </svg>
  );
}

export type ChipRole = "C" | "WK" | "C/WK" | null;

/**
 * A player on the board: availability mark, name, captain/keeper badge,
 * junior tag, the grade they last played when it differs from where they sit,
 * and a note marker. A picked player who said No, Maybe or hasn't replied is
 * flagged. Clicking or pressing Enter opens their details; a
 * draggable chip starts a drag from anywhere with a mouse, or from the grip
 * on touch.
 */
export function PlayerChip({
  member,
  role = null,
  inSide = null,
  draggable,
  dragging = false,
  onOpen,
  onPointerDown,
}: {
  member: SelectionMember;
  role?: ChipRole;
  /** The grade of the side the chip sits in; null in the pool. */
  inSide?: string | null;
  draggable: boolean;
  dragging?: boolean;
  onOpen: () => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
}) {
  const s = STATUS[member.status];
  const picked = inSide != null;
  const showFrom = member.lastGrade && (!picked || member.lastGrade !== inSide);
  const roleTitle = role ? ROLE_LABEL[role] : "";
  return (
    <button
      type="button"
      data-member-id={member.id}
      data-testid={`chip-${member.id}`}
      aria-label={`${member.displayName}, ${s.label}${role ? `, ${roleTitle.toLowerCase()}` : ""}${
        member.note ? `, note: ${member.note}` : ""
      }. Open to move.`}
      onClick={onOpen}
      onPointerDown={draggable ? onPointerDown : undefined}
      className={cn(
        "flex min-h-9 min-w-0 flex-1 touch-manipulation select-none items-center gap-2 rounded-md border border-border bg-card py-1 pl-1 pr-2 text-left text-sm hover:border-muted-foreground/50",
        draggable && "cursor-grab",
        picked &&
          (member.status === "maybe" || member.status === "none") &&
          "border-amber-500 bg-amber-500/10",
        picked && member.status === "no" && "border-[var(--loss-fg)] bg-[var(--loss-bg)]",
        dragging && "opacity-35",
      )}
    >
      <span
        aria-hidden
        data-drag-grip
        className={cn(
          "grid h-[26px] w-[18px] flex-none touch-none place-items-center rounded text-muted-foreground",
          !draggable && "invisible",
        )}
      >
        <Grip />
      </span>
      <StatusMark status={member.status} />
      <span className="min-w-0 flex-1 truncate font-medium">{member.displayName}</span>
      <span className="flex flex-none items-center gap-1">
        {role && (
          <span
            title={roleTitle}
            className="rounded bg-primary px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-primary-foreground"
          >
            {role}
          </span>
        )}
        {member.junior && (
          <span
            title="Junior: parent contacted"
            className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-violet-700 dark:text-violet-300"
          >
            Jr
          </span>
        )}
        {member.late && (
          <span
            title="Answered after cut-off"
            className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-muted-foreground"
          >
            Late
          </span>
        )}
        {showFrom && (
          <span
            title={`Last played ${member.lastGrade}`}
            className="rounded bg-primary/15 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-primary-text"
          >
            {gradeCode(member.lastGrade)}
          </span>
        )}
        {member.note && (
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden data-note />
        )}
      </span>
    </button>
  );
}
