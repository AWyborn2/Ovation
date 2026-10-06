import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { locate, sideEditable, sideLabel, type BoardState, type DropTarget } from "./apply-move";
import { STATUS, perthDateTime } from "./labels";
import { StatusMark } from "./player-chip";

type Option = { value: string; label: string; disabled: boolean };

/**
 * Move-to destinations for a player: the pool when they're in a
 * side, then every other side the caller can edit. Finalised and full sides
 * are listed but disabled; sides the caller can't edit are left out.
 */
export function moveOptions(state: BoardState, memberId: number): Option[] {
  const loc = locate(state, memberId);
  if (!loc) return [];
  const out: Option[] = [];
  if (loc.kind === "side") {
    const from = state.selections.find((s) => s.id === loc.sideId)!;
    out.push({
      value: "pool",
      label: `Player pool (take out of ${sideLabel(from)})`,
      disabled: false,
    });
  }
  for (const side of state.selections) {
    if (loc.kind === "side" && loc.sideId === side.id) continue;
    const final = side.state === "final";
    if (!final && !side.canEdit) continue;
    const full = side.slots.every((s) => s.memberId != null);
    out.push({
      value: String(side.id),
      label: `${sideLabel(side)}${final ? " (finalised)" : full ? " (full)" : ""}`,
      disabled: final || full,
    });
  }
  return out;
}

/** Why a player can't be moved at all, or null when they can. */
function lockedReason(state: BoardState, memberId: number): string | null {
  const loc = locate(state, memberId);
  if (!loc || loc.kind === "pool") return null;
  const side = state.selections.find((s) => s.id === loc.sideId)!;
  if (side.state === "final") return `${sideLabel(side)} is finalised. Re-open it to make changes.`;
  if (!side.canEdit) return `${sideLabel(side)} players are managed by its captain or an admin.`;
  return null;
}

/**
 * The tap / keyboard alternative to dragging: a player's availability,
 * note and last grade, "Move to" and, in a side the caller can edit, "Make
 * captain" / "Make keeper" and their remove actions. Never shows a
 * contact value.
 */
export function MoveDialog({
  state,
  memberId,
  busy,
  onClose,
  onMove,
  onRole,
}: {
  state: BoardState;
  memberId: number | null;
  busy: boolean;
  onClose: () => void;
  onMove: (memberId: number, target: DropTarget) => void;
  onRole: (sideId: number, role: "captain" | "keeper", memberId: number | null) => void;
}) {
  const loc = memberId != null ? locate(state, memberId) : null;
  const side = loc?.kind === "side" ? state.selections.find((s) => s.id === loc.sideId)! : null;
  const member = useMemo(() => {
    if (memberId == null) return null;
    if (side) return side.slots.find((s) => s.memberId === memberId)?.member ?? null;
    return state.pool.find((m) => m.id === memberId) ?? null;
  }, [memberId, side, state.pool]);
  const options = memberId != null ? moveOptions(state, memberId) : [];
  const firstEnabled = options.find((o) => !o.disabled)?.value ?? "";
  const [choice, setChoice] = useState(firstEnabled);
  useEffect(() => setChoice(firstEnabled), [memberId, firstEnabled]);

  const open = memberId != null && member != null;
  const locked = memberId != null ? lockedReason(state, memberId) : null;
  const canRole = side != null && sideEditable(side);
  const s = member ? STATUS[member.status] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open && member && s && (
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-[26px] font-extrabold leading-none">
              {member.displayName}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Details and moves for {member.displayName}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13px]">
            <dt className="text-muted-foreground">This round</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <StatusMark status={member.status} />
              {s.label}
              {member.repliedAt
                ? ` · replied ${perthDateTime(member.repliedAt)}`
                : member.status === "none"
                  ? " · no reply yet"
                  : ""}
              {member.late ? " · after cut-off" : ""}
            </dd>
            {member.note && (
              <>
                <dt className="text-muted-foreground">Note</dt>
                <dd className="min-w-0">{member.note}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Last played</dt>
            <dd>{member.lastGrade ?? "Not known"}</dd>
            {member.junior && (
              <>
                <dt className="text-muted-foreground">Junior</dt>
                <dd>Contacted through their parent or guardian</dd>
              </>
            )}
            <dt className="text-muted-foreground">Now in</dt>
            <dd>{side ? sideLabel(side) : "the pool"}</dd>
          </dl>

          {canRole && side && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  onClose();
                  onRole(side.id, "captain", side.captainMemberId === member.id ? null : member.id);
                }}
              >
                {side.captainMemberId === member.id ? "Remove as captain" : "Make captain"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  onClose();
                  onRole(side.id, "keeper", side.keeperMemberId === member.id ? null : member.id);
                }}
              >
                {side.keeperMemberId === member.id ? "Remove as keeper" : "Make keeper"}
              </Button>
            </div>
          )}

          {locked ? (
            <p className="text-xs text-muted-foreground">{locked}</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-muted-foreground">No moves available.</p>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!choice) return;
                const target: DropTarget =
                  choice === "pool" ? { kind: "pool" } : { kind: "side", sideId: Number(choice) };
                onClose();
                onMove(member.id, target);
              }}
            >
              <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-muted-foreground">
                Move to
                <select
                  className="block min-h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  {!firstEnabled && <option value="">No open side</option>}
                  {options.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={busy || !choice}>
                Move
              </Button>
            </form>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
