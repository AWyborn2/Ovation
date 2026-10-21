import { useState, type PointerEvent } from "react";
import type { SelectionSide } from "@workspace/api-client-react";
import { Lock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/plural";
import { XI_SIZE, sideShape } from "@workspace/scorecard/selection-shape";
import { sideEditable, sideLabel, type Location } from "./apply-move";
import { GAP_REASON, perthDateTime } from "./labels";
import { PlayerChip, type ChipRole } from "./player-chip";
import { TeamSheetButton } from "./team-sheet-button";
import { EmailTeamSheetButton } from "./email-team-sheet-button";
import { useAvailability } from "./availability-context";

export function roleOf(side: SelectionSide, memberId: number | null): ChipRole {
  if (memberId == null) return null;
  const c = side.captainMemberId === memberId;
  const k = side.keeperMemberId === memberId;
  if (c && k) return "C/WK";
  if (c) return "C";
  if (k) return "WK";
  return null;
}

/**
 * The finalise confirmation's "Heads up" list; an empty 12th (or interchange
 * slot) is not an open slot.
 */
export function finaliseHeadsUp(side: SelectionSide): string[] {
  const w = side.warnings;
  const bits: string[] = [];
  if (w.open) bits.push(`${plural(w.open, "open slot")}`);
  if (w.overSize) bits.push(`${w.overSize} more than the grade's ${w.gradeSideSize}`);
  if (w.unconfirmed) bits.push(`${w.unconfirmed} not confirmed`);
  if (w.saidNo) bits.push(`${w.saidNo} said unavailable`);
  if (w.noCaptain) bits.push("no captain");
  if (w.noKeeper) bits.push("no keeper");
  const os = side.overseas;
  if (os?.over) bits.push(`overseas ${os.count} / cap ${os.cap}`);
  return bits;
}

/** The overseas counter: shown when the grade has a cap or the side has an overseas player. */
function OverseasChip({ overseas }: { overseas: SelectionSide["overseas"] }) {
  if (!overseas || (overseas.cap == null && overseas.count === 0)) return null;
  const { count, cap, over } = overseas;
  return (
    <span
      data-testid="overseas-count"
      title={
        cap == null
          ? `${plural(count, "overseas player")}, no limit for this grade`
          : `${plural(count, "overseas player")}, limit ${cap}${over ? ": over the limit" : ""}`
      }
      className={cn(
        "rounded px-1.5 py-0.5",
        over
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      Overseas {count}
      {cap != null && `/${cap}`}
      {over && " (over limit)"}
    </span>
  );
}

const selectClass =
  "block min-h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 py-1 text-[13px] font-medium normal-case tracking-normal text-foreground";

/**
 * One grade's side: fixture, filled count,
 * Draft/Final state, warnings, captain and keeper pickers, the side's slots
 * (each a drop zone: the XI then the 12th player, or above 12 slots numbered
 * 1–N with no "12th"), and the finalise / re-open footer.
 */
export function TeamCard({
  side,
  junior,
  busy,
  draggingId,
  onOpenMember,
  onChipPointerDown,
  onRole,
  onFinalise,
  onReopen,
  onPlayhqSync,
  onSlotClick,
}: {
  side: SelectionSide;
  /** Junior section: players' parents are notified. */
  junior: boolean;
  /** A save or finalise is in flight. */
  busy: boolean;
  draggingId: number | null;
  onOpenMember: (memberId: number, from: Location) => void;
  onChipPointerDown: (e: PointerEvent<HTMLElement>, memberId: number, from: Location) => void;
  onRole: (role: "captain" | "keeper", memberId: number | null) => void;
  onFinalise: () => void;
  onReopen: () => void;
  /** Replace the draft with the side PlayHQ has published (`side.playhqPlayers`). */
  onPlayhqSync: () => void;
  /** Tap-to-fill: an open slot in an editable side was clicked. */
  onSlotClick?: (index: number, anchor: HTMLElement) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const availability = useAvailability();
  const label = sideLabel(side);
  const final = side.state === "final";
  const edit = sideEditable(side);
  const w = side.warnings;
  const picked = side.slots.filter((s) => s.memberId != null && s.member);
  const shape = sideShape(side);
  // Captain and keeper come from the XI; the 12th holds no role. Above 12 any slot can.
  const xi = side.slots.slice(0, shape.roleSlots).filter((s) => s.memberId != null && s.member);
  // Players past the XI in a side above 12, shown as "+k" by the count.
  const extras = shape.twelfthLabel
    ? 0
    : side.slots.slice(XI_SIZE).filter((s) => s.memberId != null).length;
  const nameOf = (id: number | null) =>
    id == null ? null : (side.slots.find((s) => s.memberId === id)?.member?.displayName ?? null);
  const f = side.fixture;
  const headsUp = finaliseHeadsUp(side);
  const slug = `side-${side.id}`;

  return (
    <article
      data-drop="side"
      data-side-id={side.id}
      aria-labelledby={`${slug}-title`}
      data-testid={`side-${side.id}`}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border bg-card has-[[data-drop-state=ok]]:border-blue-500 data-[drop-state]:outline-dashed data-[drop-state]:outline-2 data-[drop-state]:outline-offset-2 data-[drop-state=no]:outline-[var(--loss-fg)] data-[drop-state=ok]:outline-blue-500",
        final && "border-[var(--win-fg)]",
      )}
    >
      <div className="flex flex-col gap-1.5 border-b border-border px-3.5 pb-2.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id={`${slug}-title`} className="font-serif text-2xl font-extrabold leading-none">
            {label}
          </h2>
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
            <b className="text-foreground">{w.filled}</b>/{XI_SIZE}
            {shape.twelfthLabel ? w.twelfth && " +12th" : extras > 0 && ` +${extras}`}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold uppercase leading-none tracking-wide",
              final ? "bg-[var(--win-bg)] text-[var(--win-fg)]" : "bg-muted text-muted-foreground",
            )}
          >
            {final && <Lock className="h-3 w-3" aria-hidden />}
            {final ? "Final" : "Draft"}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
          <span>
            vs <b className="font-semibold text-foreground">{f.opponentName}</b>
          </span>
          <span>{perthDateTime(f.startAt)}</span>
          <span>
            {f.isHome ? "Home" : "Away"}
            {f.venue ? ` · ${f.venue}` : ""}
          </span>
          {!shape.twelfthLabel && <span>Side of {shape.size}</span>}
        </div>

        {edit ? (
          <div className="grid grid-cols-2 gap-2">
            {(["captain", "keeper"] as const).map((role) => {
              const value = role === "captain" ? side.captainMemberId : side.keeperMemberId;
              return (
                <label
                  key={role}
                  className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {role === "captain" ? "Captain" : "Keeper"}
                  <select
                    className={selectClass}
                    value={value ?? ""}
                    disabled={busy}
                    onChange={(e) => onRole(role, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Not set</option>
                    {xi.map((s) => (
                      <option key={s.memberId} value={s.memberId!}>
                        {s.member!.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="text-[12.5px] text-muted-foreground">
            Captain{" "}
            <b className="font-semibold text-foreground">
              {nameOf(side.captainMemberId) ?? "not set"}
            </b>{" "}
            · Keeper{" "}
            <b className="font-semibold text-foreground">
              {nameOf(side.keeperMemberId) ?? "not set"}
            </b>
          </div>
        )}

        {(w.open > 0 ||
          w.unconfirmed > 0 ||
          w.saidNo > 0 ||
          w.noCaptain ||
          w.noKeeper ||
          !!w.overSize ||
          (side.overseas != null && (side.overseas.cap != null || side.overseas.count > 0))) && (
          <div className="flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
            {!!w.overSize && (
              <span
                className="rounded bg-[var(--loss-bg)] px-1.5 py-0.5 text-[var(--loss-fg)]"
                data-testid={`${slug}-over-size`}
              >
                {label} is now {w.gradeSideSize}: move {plural(w.overSize, "player")} out
              </span>
            )}
            {w.open > 0 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {plural(w.open, "open slot")}
              </span>
            )}
            {w.unconfirmed > 0 && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                {w.unconfirmed} not confirmed
              </span>
            )}
            {w.saidNo > 0 && (
              <span className="rounded bg-[var(--loss-bg)] px-1.5 py-0.5 text-[var(--loss-fg)]">
                {w.saidNo} said unavailable
              </span>
            )}
            {w.noCaptain && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                No captain
              </span>
            )}
            {w.noKeeper && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                No keeper
              </span>
            )}
            <OverseasChip overseas={side.overseas} />
          </div>
        )}
      </div>

      <ol className="flex flex-1 flex-col gap-[3px] px-2 py-1.5" aria-label={`${label} slots`}>
        {side.slots.map((slot, i) => (
          <li
            key={i}
            data-drop="slot"
            data-side-id={side.id}
            data-index={i}
            className="flex min-h-10 items-center gap-1.5 rounded-md px-0.5 py-px data-[drop-state=no]:bg-[var(--loss-bg)] data-[drop-state=ok]:bg-blue-500/10 data-[drop-state=no]:shadow-[inset_0_0_0_2px_var(--loss-fg)] data-[drop-state=ok]:shadow-[inset_0_0_0_2px_var(--color-blue-500)]"
          >
            <span className="w-7 flex-none text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {i === shape.twelfthIndex ? "12th" : i + 1}
            </span>
            {slot.memberId != null && slot.member ? (
              <PlayerChip
                member={slot.member}
                role={roleOf(side, slot.memberId)}
                overseas={slot.overseas === true}
                inSide={label}
                draggable={edit && !busy}
                dragging={draggingId === slot.memberId}
                onOpen={() =>
                  onOpenMember(slot.memberId!, { kind: "side", sideId: side.id, index: i })
                }
                onPointerDown={(e) =>
                  onChipPointerDown(e, slot.memberId!, { kind: "side", sideId: side.id, index: i })
                }
              />
            ) : slot.memberId == null && edit && onSlotClick ? (
              <button
                type="button"
                aria-label={`Fill ${label} ${i === shape.twelfthIndex ? "12th" : `slot ${i + 1}`}`}
                disabled={busy}
                onClick={(e) => onSlotClick(i, e.currentTarget)}
                className="group flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border-[1.5px] border-dashed border-border px-2.5 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                <span className="min-w-0">
                  Open slot
                  {slot.gap && (
                    <small className="block text-[11.5px]">
                      was {slot.gap.name} · {GAP_REASON[slot.gap.reason] ?? slot.gap.reason}
                    </small>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-primary-text group-hover:text-foreground">
                  <Search className="h-3 w-3" aria-hidden />
                  Find player
                </span>
              </button>
            ) : (
              <div className="flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border-[1.5px] border-dashed border-border px-2.5 py-1.5 text-[12.5px] text-muted-foreground">
                <span>{slot.memberId != null ? "Player not on register" : "Open slot"}</span>
                {slot.gap && (
                  <small className="text-right text-[11.5px]">
                    was {slot.gap.name} · {GAP_REASON[slot.gap.reason] ?? slot.gap.reason}
                  </small>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
        {final ? (
          <>
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--win-fg)]">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Finalised and published as the team list.
              {availability && ` ${plural(picked.length, "player")} notified by SMS and email.`}
            </div>
            <TeamSheetButton selectionId={side.id} label={label} />
            <EmailTeamSheetButton selectionId={side.id} />
            {side.canFinalise && (
              <Button variant="ghost" className="w-full" disabled={busy} onClick={onReopen}>
                Re-open for changes
              </Button>
            )}
          </>
        ) : !edit ? (
          <p className="text-xs text-muted-foreground">
            {side.readOnlyReason ??
              `Read-only for you. The ${label} captain or an admin finalises this side.`}
          </p>
        ) : confirming ? (
          <>
            <div className="rounded-md bg-muted px-2.5 py-2 text-[12.5px]" role="status">
              {shape.twelfthLabel ? (
                <>
                  Finalise {label} with {plural(w.filled, "player")}
                  {w.twelfth ? " and a 12th" : ""}?{" "}
                </>
              ) : (
                <>
                  Finalise {label} with {plural(picked.length, "player")}?{" "}
                </>
              )}
              {headsUp.length > 0 && <b>Heads up: {headsUp.join(", ")}. </b>}
              {availability
                ? `Each player${junior ? "'s parent" : ""} gets an SMS and email with the match details, and the side is published as the team list.`
                : "The side is published as the team list."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  onFinalise();
                }}
              >
                {availability ? "Finalise and notify" : "Finalise"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
            </div>
          </>
        ) : syncing ? (
          <>
            <div className="rounded-md bg-muted px-2.5 py-2 text-[12.5px]" role="status">
              Replace this draft with the {plural(side.playhqPlayers ?? 0, "player")} named in
              PlayHQ? Anyone not on your squad list, or already in another side, is left as a gap.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  setSyncing(false);
                  onPlayhqSync();
                }}
              >
                Use PlayHQ team
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setSyncing(false)}>
                Keep this draft
              </Button>
            </div>
          </>
        ) : (
          <>
            {side.playhqPlayers != null && (
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => setSyncing(true)}
              >
                Use PlayHQ team ({side.playhqPlayers})
              </Button>
            )}
            {side.canFinalise && (
              <Button
                className="w-full"
                disabled={busy || picked.length === 0}
                onClick={() => setConfirming(true)}
              >
                Finalise {label}
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
