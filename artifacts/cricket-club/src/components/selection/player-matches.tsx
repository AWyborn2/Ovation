import { useState } from "react";
import {
  useMatchSelectionSlot,
  useUnmatchSquadMemberParticipant,
  type SelectionBoard,
  type SelectionMember,
  type SelectionSide,
} from "@workspace/api-client-react";
import { Link2, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sideEditable, sideLabel } from "./apply-move";

/** An open slot holding a list row the matcher couldn't place ("Private Player"). */
export type UnmatchedSlot = {
  side: SelectionSide;
  /** 1–12, as the match endpoint takes it. */
  slot: number;
  name: string;
  /** The row's PlayHQ participant id: the match is remembered when it has one. */
  participantId: string | null;
};

/** Every gap "not on register" in the sides the caller may edit. */
export function unmatchedSlots(sides: readonly SelectionSide[]): UnmatchedSlot[] {
  return sides.flatMap((side) =>
    sideEditable(side)
      ? side.slots.flatMap((s, i) =>
          s.memberId == null && s.gap?.reason === "not_on_register"
            ? [{ side, slot: i + 1, name: s.gap.name, participantId: s.gap.participantId ?? null }]
            : [],
        )
      : [],
  );
}

/** Who can fill a slot of `side`: the board's pool, less anyone already in that side. */
export function matchCandidates(
  side: SelectionSide,
  pool: readonly SelectionMember[],
): SelectionMember[] {
  const inSide = new Set(side.slots.flatMap((s) => (s.memberId != null ? [s.memberId] : [])));
  return pool
    .filter((m) => !inSide.has(m.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

const selectClass =
  "block min-h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 py-1 text-[13px] text-foreground";

function errorText(e: unknown): string {
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === "string") return data.error;
  return (e as Error)?.message ?? "Request failed";
}

function MatchRow({
  item,
  pool,
  disabled,
  onMatch,
}: {
  item: UnmatchedSlot;
  pool: readonly SelectionMember[];
  disabled: boolean;
  onMatch: (memberId: number) => void;
}) {
  const [memberId, setMemberId] = useState("");
  const candidates = matchCandidates(item.side, pool);
  const label = sideLabel(item.side);
  const selectId = `match-${item.side.id}-${item.slot}`;
  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
      <div className="text-[12.5px]">
        <b className="font-semibold">{label}</b>, slot {item.slot === 12 ? "12th" : item.slot}:
        PlayHQ lists <b className="font-semibold">{item.name}</b>.{" "}
        <span className="text-muted-foreground">
          {item.participantId
            ? "Remembered for later PlayHQ lists once matched."
            : "No PlayHQ ID on this row, so the match fills this slot only."}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Squad member for {label} slot {item.slot}
        </label>
        <select
          id={selectId}
          className={`${selectClass} flex-1 basis-48`}
          value={memberId}
          disabled={disabled}
          onChange={(e) => setMemberId(e.target.value)}
        >
          <option value="">Choose a squad member…</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
              {m.junior ? " (junior)" : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={disabled || !memberId}
          onClick={() => onMatch(Number(memberId))}
        >
          Match to squad member
        </Button>
      </div>
    </li>
  );
}

/**
 * Private Player matching in the Selection Hub (ADR-008 §4): each open slot
 * whose PlayHQ row matched nobody ("Private Player", or a name not on the
 * register) can be matched to a squad member, and the club's remembered matches
 * are listed with "Unmatch". A remembered match only changes later drafts and
 * PlayHQ syncs; sides already drafted keep their slots.
 */
export function PlayerMatches({
  board,
  sides,
  disabled,
  onBoard,
  onChanged,
  onSay,
  onFail,
}: {
  /** The server's board: its pool and remembered matches. */
  board: SelectionBoard;
  /** The sides as shown (the versions a match is sent with). */
  sides: readonly SelectionSide[];
  /** Another change is in flight. */
  disabled: boolean;
  /** A match returns the updated board. */
  onBoard: (next: SelectionBoard) => void;
  /** Reload the board after an unmatch or a refusal. */
  onChanged: () => void;
  onSay: (message: string) => void;
  onFail: (message: string) => void;
}) {
  const match = useMatchSelectionSlot();
  const unmatch = useUnmatchSquadMemberParticipant();
  const busy = disabled || match.isPending || unmatch.isPending;
  const open = unmatchedSlots(sides);
  const remembered = board.participantMatches ?? [];
  // Only those who pick sides can change remembered matches (the reminder right).
  const canUnmatch = board.actor.canRemind;
  if (open.length === 0 && (remembered.length === 0 || !canUnmatch)) return null;

  const doMatch = (item: UnmatchedSlot, memberId: number) => {
    const name = board.pool.find((m) => m.id === memberId)?.displayName ?? "The player";
    match.mutate(
      { id: item.side.id, data: { slot: item.slot, memberId, version: item.side.version } },
      {
        onSuccess: (next) => {
          onBoard(next);
          onSay(
            `${name} matched to ${sideLabel(item.side)} slot ${item.slot}.${
              item.participantId ? " PlayHQ lists will find them from now on." : ""
            }`,
          );
        },
        onError: (e) => {
          onFail(`Not matched: ${errorText(e)}`);
          onChanged();
        },
      },
    );
  };

  const doUnmatch = (memberId: number, participantId: string, name: string) => {
    unmatch.mutate(
      { id: memberId, participantId },
      {
        onSuccess: () => {
          onSay(
            `${name} unmatched. Sides already picked keep them; later PlayHQ lists won't match them automatically.`,
          );
          onChanged();
        },
        onError: (e) => {
          onFail(`Not unmatched: ${errorText(e)}`);
          onChanged();
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="player-matches-title"
      className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-3.5 py-3"
      data-testid="player-matches"
    >
      <h2
        id="player-matches-title"
        className="flex items-center gap-1.5 text-sm font-semibold leading-none"
      >
        <UserSearch className="h-4 w-4" aria-hidden />
        PlayHQ players to match
      </h2>
      {open.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {open.map((item) => (
            <MatchRow
              key={`${item.side.id}:${item.slot}`}
              item={item}
              pool={board.pool}
              disabled={busy}
              onMatch={(memberId) => doMatch(item, memberId)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted-foreground">Every PlayHQ player is matched.</p>
      )}
      {canUnmatch && remembered.length > 0 && (
        <details className="text-[12.5px]">
          <summary className="cursor-pointer font-semibold">
            Remembered matches ({remembered.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {remembered.map((r) => (
              <li
                key={r.participantId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 flex-none" aria-hidden />
                  <span>
                    PlayHQ player is <b className="font-semibold">{r.memberName}</b>
                    {r.createdBy && (
                      <span className="text-muted-foreground"> · matched by {r.createdBy}</span>
                    )}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Unmatch ${r.memberName}`}
                  onClick={() => doUnmatch(r.memberId, r.participantId, r.memberName)}
                >
                  Unmatch
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
