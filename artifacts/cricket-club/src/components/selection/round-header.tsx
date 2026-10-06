import type {
  AvailabilitySelectionRule,
  SelectionActor,
  SelectionEvent,
  SelectionRound,
} from "@workspace/api-client-react";
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
 * The round header: the four stages with their Perth times, the club's
 * selection rule as it applies to the viewer, and the section's response rate
 * with its Yes / Maybe / No / No-reply breakdown.
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
  return (
    <section
      aria-label="This round"
      className="grid gap-x-7 gap-y-3.5 rounded-lg border border-border bg-card px-4 py-3.5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
    >
      <div>
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5">
          {stages.map((s, i) => {
            return (
              <li
                key={s.label}
                className="flex items-center gap-2 text-[13px] text-muted-foreground"
              >
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
                  <b className="font-semibold text-foreground">{s.label}</b> {perthDateTime(s.at)}
                  {s.after ? ` · ${s.after}` : ""}
                  <span className="sr-only">{s.done ? " (done)" : " (to come)"}</span>
                </span>
              </li>
            );
          })}
          <li className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span
              aria-hidden
              className="grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
            >
              4
            </span>
            <span>
              <b className="font-semibold text-foreground">Finalise</b> by{" "}
              {perthDateTime(round.finaliseAt)}
            </span>
          </li>
        </ol>
        <p className="mt-2.5 text-[12.5px] text-muted-foreground">
          {actor.kind === "admin" ? (
            <>
              <b className="font-semibold text-foreground">Club rule:</b> {rule.admin}
            </>
          ) : (
            <>
              <b className="font-semibold text-foreground">Signed in as {actor.name}:</b>{" "}
              {rule.captain}
            </>
          )}
        </p>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <strong className="font-serif text-[26px] font-bold leading-none">{pct}% replied</strong>
          <span className="text-[12.5px] text-muted-foreground">
            {replied} of {c.total} {junior ? "junior families" : "senior players"}
            {c.late > 0 ? ` · ${c.late} after cut-off` : ""}
          </span>
        </div>
        <div className="my-2 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {STATUS_ORDER.map((k) => (
            <i
              key={k}
              className={cn("block h-full", STATUS[k].bar)}
              style={{ width: c.total > 0 ? `${(c[k] / c.total) * 100}%` : 0 }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-muted-foreground">
          {STATUS_ORDER.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-[3px]", STATUS[k].bar)} />
              {STATUS[k].label}{" "}
              <b className="font-mono font-semibold tabular-nums text-foreground">{c[k]}</b>
            </li>
          ))}
        </ul>
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
