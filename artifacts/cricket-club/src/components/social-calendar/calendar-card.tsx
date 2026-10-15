import type { PointerEvent } from "react";
import { GripVertical, MoveRight } from "lucide-react";
import type { SocialCalendarCard } from "@workspace/api-client-react";
import { draftHeading, isJuniorDraft } from "@/components/social-queue/draft-meta";
import { cn } from "@/lib/utils";
import { formatClubTime } from "./calendar-time";

/** What a card shows, in words — never colour alone (a11y). */
export function cardStateLabel(c: SocialCalendarCard): string {
  const d = c.draft;
  if (d.status === "posted") return "Posted";
  if (d.expiredAt) return "Expired";
  if (c.overdue) return "Overdue — needs approval";
  if (d.dispatchedAt) return "Due to share";
  if (d.status === "awaiting_review") return "Needs approval";
  return "Ready";
}

/** Posted cards and ones already going out stay where they are. */
export function canMove(c: SocialCalendarCard): boolean {
  const d = c.draft;
  if (d.status === "posted" || d.status === "dismissed") return false;
  return !(d.publications ?? []).some((p) => p.status === "publishing" || p.status === "published");
}

const TONE: Record<string, string> = {
  Posted: "border-border bg-muted text-muted-foreground",
  Expired: "border-border bg-muted text-muted-foreground",
  "Overdue — needs approval": "border-destructive/60 bg-destructive/10 text-foreground",
  "Due to share": "border-primary/60 bg-primary/15 text-foreground",
  "Needs approval": "border-amber-500/60 bg-amber-500/10 text-foreground",
  Ready: "border-primary/40 bg-primary/10 text-foreground",
};

type Props = {
  card: SocialCalendarCard;
  /** Compact layout for the week grid; full width in the list and tray. */
  compact?: boolean;
  dragging?: boolean;
  onOpen: (card: SocialCalendarCard) => void;
  onMoveTo: (card: SocialCalendarCard) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>, id: number) => void;
};

export function CalendarCard({ card, compact, dragging, onOpen, onMoveTo, onPointerDown }: Props) {
  const d = card.draft;
  const at = d.plannedAt ? new Date(d.plannedAt) : d.reviewedAt ? new Date(d.reviewedAt) : null;
  const state = cardStateLabel(card);
  const movable = canMove(card);
  const heading = draftHeading(d);
  return (
    <div
      className={cn(
        "group relative flex min-h-11 items-stretch overflow-hidden rounded-md border text-left text-xs shadow-sm",
        TONE[state],
        dragging && "opacity-40",
      )}
      onPointerDown={movable && onPointerDown ? (e) => onPointerDown(e, d.id) : undefined}
      data-card-id={d.id}
    >
      {movable && onPointerDown && (
        <span
          data-drag-grip
          className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground"
          aria-hidden
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
      <button
        type="button"
        className="min-w-0 flex-1 px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(card)}
        aria-label={`${heading}, ${at ? formatClubTime(at) : "no time"}, ${state}${
          card.warning ? `. ${card.warning}` : ""
        }. Open`}
      >
        <span className="block truncate font-semibold">{heading}</span>
        <span className={cn("block truncate", compact ? "text-[10px]" : "text-xs")}>
          {at ? formatClubTime(at) : "No time"} · {state}
          {d.plannedBy === "admin" && d.plannedAt ? " · Pinned" : ""}
          {isJuniorDraft(d) ? " · Junior" : ""}
        </span>
        {card.warning && !compact && (
          <span className="block text-[11px] text-destructive">{card.warning}</span>
        )}
      </button>
      {movable && (
        <button
          type="button"
          className="flex w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onMoveTo(card)}
          aria-label={`Move ${heading} to another time`}
          title="Move to…"
        >
          <MoveRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
