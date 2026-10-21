import type {
  AvailabilitySelectionRule,
  SelectionActor,
  SelectionEvent,
  SelectionRound,
} from "@workspace/api-client-react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { STATUS, STATUS_ORDER, eventText, perthDateTime, perthTime } from "./labels";

const RULE_TEXT: Record<AvailabilitySelectionRule, { admin: string; captain: string }> = {
  captains_own_grade: {
    admin:
      "captains edit and finalise their own grade; admins edit every grade and settle clashes.",
    captain:
      "you can pick from the pool and edit the grades you captain. Other grades are read-only; ask an admin to release a player from another side.",
  },
  captains_all_grades: {
    admin: "captains edit and finalise every grade; admins can too.",
    captain: "you can pick from the pool and edit every grade.",
  },
  admins_only: {
    admin: "only admins pick and finalise sides.",
    captain: "only admins pick and finalise sides, so every grade is read-only for you.",
  },
};

/**
 * The round strip: the four stages with their Perth times, the section's
 * response rate and its Yes / Maybe / No / No-reply bar, on one line. The
 * club's selection rule, as it applies to the viewer, sits behind the info
 * button.
 */
export function RoundHeader({
  round,
  actor,
  junior,
}: {
  round: SelectionRound;
  actor: SelectionActor;
  junior: boolean;
}) {
  const stages = [
    { label: "Requests sent", at: round.sendAt, done: round.sendStartedAt != null },
    { label: "Reminder", at: round.reminderAt, done: round.reminderStartedAt != null },
    {
      label: "Cut-off",
      at: round.cutoffAt,
      done: round.cutoffCompletedAt != null,
      after: round.cutoffCompletedAt != null ? "drafts built" : null,
    },
  ];
  const c = round.counts;
  const replied = c.total - c.none;
  const pct = c.total > 0 ? Math.round((replied / c.total) * 100) : 0;
  const rule = RULE_TEXT[actor.selectionRule] ?? RULE_TEXT.captains_own_grade;
  const ruleText =
    actor.kind === "admin"
      ? `Club rule: ${rule.admin}`
      : `Signed in as ${actor.name}: ${rule.captain}`;
  const breakdown = STATUS_ORDER.map((k) => `${STATUS[k].label} ${c[k]}`).join(", ");
  return (
    <section
      aria-label="This round"
      className="flex flex-wrap items-center gap-x-6 gap-y-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[12.5px] text-muted-foreground"
    >
      <ol className="contents">
        {stages.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] font-bold",
                s.done
                  ? "bg-[var(--win-bg)] text-[var(--win-fg)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span>
              <b className="font-semibold text-primary-text">{s.label}</b> {perthDateTime(s.at)}
              {s.after ? ` · ${s.after}` : ""}
              <span className="sr-only">{s.done ? " (done)" : " (to come)"}</span>
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
          >
            4
          </span>
          <span>
            <b className="font-semibold text-primary-text">Finalise</b> by{" "}
            {perthDateTime(round.finaliseAt)}
          </span>
        </li>
      </ol>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={ruleText}
              className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <Info className="h-4 w-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{ruleText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="flex-1" />
      <div className="flex items-center gap-3">
        <strong className="font-serif text-[22px] font-extrabold leading-none text-primary-text">
          {pct}% replied
        </strong>
        <span>
          {replied} of {c.total} {junior ? "junior families" : "senior players"}
          {c.late > 0 ? ` · ${c.late} after cut-off` : ""}
        </span>
        <div
          className="flex h-2 w-[200px] overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={breakdown}
          title={breakdown}
        >
          {STATUS_ORDER.map((k) => (
            <i
              key={k}
              className={cn("block h-full", STATUS[k].bar)}
              style={{ width: c.total > 0 ? `${(c[k] / c.total) * 100}%` : 0 }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** "Changes this round": the board's events, newest first. */
export function ChangeLog({ events }: { events: SelectionEvent[] }) {
  return (
    <section
      aria-label="Changes this round"
      className="rounded-lg border border-border bg-card px-4 py-3"
    >
      <h2 className="mb-2 font-serif text-xl font-extrabold leading-none">Changes this round</h2>
      <ol className="flex flex-col gap-1 text-[13px]">
        {events.length === 0 ? (
          <li className="text-muted-foreground">
            No changes yet. Drafts are built at cut-off from each side's last game.
          </li>
        ) : (
          events.map((e) => (
            <li key={e.id}>
              <time
                dateTime={e.createdAt}
                title={perthDateTime(e.createdAt)}
                className="mr-2 font-mono text-xs text-muted-foreground"
              >
                {perthTime(e.createdAt)}
              </time>
              {eventText(e)}
              {e.actorName && e.actorKind !== "system" && (
                <span className="text-muted-foreground"> · {e.actorName}</span>
              )}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
