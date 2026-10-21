import { useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import type {
  SelectionMember,
  SelectionMemberStatus,
  SelectionSide,
} from "@workspace/api-client-react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAvailability } from "./availability-context";
import { PlayerChip, StatusMark } from "./player-chip";
import { sideLabel, type Location } from "./apply-move";

const zoneClass =
  "rounded-lg px-1 py-1.5 data-[drop-state=ok]:bg-blue-500/10 data-[drop-state=ok]:shadow-[inset_0_0_0_2px_var(--color-blue-500)]";

function List({
  members,
  busy,
  draggingId,
  onOpenMember,
  onChipPointerDown,
  placedIn,
}: {
  members: SelectionMember[];
  busy: boolean;
  draggingId: number | null;
  onOpenMember: (id: number, from: Location) => void;
  onChipPointerDown: (e: PointerEvent<HTMLElement>, id: number, from: Location) => void;
  /** Where each listed player already plays ("A Grade"), for the already-picked group. */
  placedIn?: ReadonlyMap<number, string[]>;
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-md border-[1.5px] border-dashed border-border px-1.5 py-2 text-center text-[12.5px] text-muted-foreground">
        Nobody here
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {members.map((m) => (
        <li key={m.id} className="flex">
          <PlayerChip
            member={m}
            draggable={!busy}
            dragging={draggingId === m.id}
            onOpen={() => onOpenMember(m.id, { kind: "pool" })}
            onPointerDown={(e) => onChipPointerDown(e, m.id, { kind: "pool" })}
            alsoIn={placedIn?.get(m.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function Heading({
  status,
  count,
  children,
}: {
  status: SelectionMemberStatus;
  count: number;
  children: ReactNode;
}) {
  return (
    <>
      <StatusMark status={status} />
      {children}
      <span className="flex-1" />
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
    </>
  );
}

const headClass =
  "flex items-center gap-2 px-1 pb-1.5 pt-1 font-serif text-[15px] font-bold uppercase leading-tight tracking-wide";

/** A pool group: a drop zone with a collapsible heading. A search opens every group. */
function Group({
  label,
  open,
  forced,
  onToggle,
  heading,
  action,
  note,
  children,
}: {
  label: string;
  open: boolean;
  /** A search is on: every group is open. */
  forced: boolean;
  onToggle: () => void;
  heading: ReactNode;
  /** A button beside the heading (Remind N). */
  action?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  const shown = open || forced;
  return (
    <section data-drop="pool" className={zoneClass} aria-label={label}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(headClass, "min-w-0 flex-1 text-left")}
          aria-expanded={shown}
          onClick={onToggle}
        >
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 transition-transform", shown && "rotate-90")}
            aria-hidden
          />
          {heading}
        </button>
        {action}
      </div>
      {shown && note && <p className="mx-1 mb-1.5 text-xs text-muted-foreground">{note}</p>}
      {shown && children}
    </section>
  );
}

type GroupKey = "squad" | "yes" | "maybe" | "none" | "no" | "juniors" | "picked";

/** Open until closed: Available, Maybe, No reply (and the Squad list); the rest start closed. */
const DEFAULT_OPEN: Record<GroupKey, boolean> = {
  squad: true,
  yes: true,
  maybe: true,
  none: true,
  no: false,
  juniors: false,
  picked: false,
};

/**
 * Players not in any side: Available, Maybe, No reply (with the remind
 * action) and Unavailable (collapsed); without availability, one Squad list.
 * The search filters every group.
 * Each group is a drop zone, so dragging a side player here takes them out.
 */
export function PlayerPool({
  pool,
  junior,
  busy,
  draggingId,
  scrollRef,
  sides = [],
  canRemind,
  reminding,
  onRemind,
  onOpenMember,
  onChipPointerDown,
  variant = "inline",
  draggingFromSide = false,
}: {
  pool: SelectionMember[];
  junior: boolean;
  busy: boolean;
  draggingId: number | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  canRemind: boolean;
  reminding: boolean;
  onRemind: () => void;
  onOpenMember: (id: number, from: Location) => void;
  onChipPointerDown: (e: PointerEvent<HTMLElement>, id: number, from: Location) => void;
  /** The board's sides, to tell who is already picked and where. */
  sides?: readonly SelectionSide[];
  /** "sidebar": fills the admin side panel (the Selection Hub on desktop). */
  variant?: "inline" | "sidebar";
  /** A side's player is being dragged: say the pool takes them out. */
  draggingFromSide?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const flip = (k: GroupKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const sidebar = variant === "sidebar";
  const availability = useAvailability();
  const q = query.trim().toLowerCase();
  // The pool is the whole squad: a player already in a side (they can play
  // another game too) waits in the collapsed "Already picked" group.
  const placedIn = new Map<number, string[]>();
  for (const side of sides) {
    for (const slot of side.slots) {
      if (slot.memberId == null) continue;
      placedIn.set(slot.memberId, [...(placedIn.get(slot.memberId) ?? []), sideLabel(side)]);
    }
  }
  const searched = q ? pool.filter((m) => m.displayName.toLowerCase().includes(q)) : pool;
  const picked = searched
    .filter((m) => placedIn.has(m.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const matching = searched.filter((m) => !placedIn.has(m.id));
  // On a senior board, juniors (who can play up) are listed apart, collapsed.
  const playingUp = junior
    ? []
    : matching
        .filter((m) => m.section === "junior")
        .sort(
          (a, b) =>
            (a.lastGrade ?? "~").localeCompare(b.lastGrade ?? "~") ||
            a.displayName.localeCompare(b.displayName),
        );
  const shown = junior ? matching : matching.filter((m) => m.section !== "junior");
  const by = (status: SelectionMemberStatus) =>
    shown
      .filter((m) => m.status === status)
      .sort(
        (a, b) =>
          (a.lastGrade ?? "~").localeCompare(b.lastGrade ?? "~") ||
          a.displayName.localeCompare(b.displayName),
      );
  const list = (members: SelectionMember[]) => (
    <List
      placedIn={placedIn}
      members={members}
      busy={busy}
      draggingId={draggingId}
      onOpenMember={onOpenMember}
      onChipPointerDown={onChipPointerDown}
    />
  );
  const yes = by("yes");
  const maybe = by("maybe");
  const none = by("none");
  const no = by("no");
  const forced = !!q;
  const group = (k: GroupKey) => ({ open: open[k], forced, onToggle: () => flip(k) });

  return (
    <aside
      aria-label="Player pool"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-card",
        sidebar
          ? "flex-1 border-t border-border"
          : "rounded-lg border border-border lg:absolute lg:inset-0",
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3.5 py-3">
        <div className="flex items-baseline gap-2">
          <h2
            className={cn(
              "font-serif text-[22px] font-extrabold leading-none",
              sidebar && "uppercase",
            )}
          >
            Player pool
          </h2>
          {draggingFromSide && (
            <span className="ml-auto text-[11.5px] text-muted-foreground">Drop here to remove</span>
          )}
        </div>
        {!sidebar && (
          <p className="text-[12.5px] text-muted-foreground">
            Drag players onto a team. Drag a team player back here to drop them. On a phone, hold
            the grip to drag, or tap a player to move them.
          </p>
        )}
        <label className="sr-only" htmlFor="pool-search">
          Search players
        </label>
        <Input
          id="pool-search"
          type="search"
          placeholder="Search players"
          autoComplete="off"
          className={cn(sidebar && "h-9")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div
        ref={scrollRef}
        data-drop="pool"
        className={cn(
          "flex min-h-0 flex-col gap-1.5 overflow-auto overscroll-contain px-2.5 pb-3 pt-1.5 data-[drop-state=ok]:bg-blue-500/10",
          sidebar ? "flex-1" : "max-h-[60vh] lg:max-h-none lg:flex-1",
        )}
      >
        {!availability && (
          <Group
            label="Squad"
            {...group("squad")}
            heading={
              <>
                Squad
                <span className="flex-1" />
                <span className="font-mono text-xs text-muted-foreground">{shown.length}</span>
              </>
            }
          >
            {list(
              [...shown].sort(
                (a, b) =>
                  (a.lastGrade ?? "~").localeCompare(b.lastGrade ?? "~") ||
                  a.displayName.localeCompare(b.displayName),
              ),
            )}
          </Group>
        )}
        {availability && (
          <>
            <Group
              label="Available, not picked"
              {...group("yes")}
              heading={
                <Heading status="yes" count={yes.length}>
                  Available, not picked
                </Heading>
              }
            >
              {list(yes)}
            </Group>
            <Group
              label="Maybe"
              {...group("maybe")}
              heading={
                <Heading status="maybe" count={maybe.length}>
                  Maybe
                </Heading>
              }
            >
              {list(maybe)}
            </Group>
            <Group
              label="No reply"
              {...group("none")}
              heading={
                <Heading status="none" count={none.length}>
                  No reply
                </Heading>
              }
              action={
                canRemind &&
                none.length > 0 && (
                  <button
                    type="button"
                    className="min-h-[30px] shrink-0 rounded-md border border-input bg-card px-2 text-xs font-semibold disabled:opacity-50"
                    disabled={reminding}
                    onClick={onRemind}
                  >
                    Remind {none.length}
                  </button>
                )
              }
              note="Left out of drafts at cut-off. Picking one flags them until they reply."
            >
              {list(none)}
            </Group>
            <Group
              label="Unavailable"
              {...group("no")}
              heading={
                <Heading status="no" count={no.length}>
                  Unavailable
                </Heading>
              }
            >
              {list(no)}
            </Group>
          </>
        )}
        {playingUp.length > 0 && (
          <Group
            label="Juniors"
            {...group("juniors")}
            heading={
              <>
                Juniors
                <span className="flex-1" />
                <span className="font-mono text-xs text-muted-foreground">{playingUp.length}</span>
              </>
            }
            note="From the junior register, to play up in a senior side."
          >
            {list(playingUp)}
          </Group>
        )}
        {picked.length > 0 && (
          <Group
            label="Already picked"
            {...group("picked")}
            heading={
              <>
                Already picked
                <span className="flex-1" />
                <span className="font-mono text-xs text-muted-foreground">{picked.length}</span>
              </>
            }
            note="In a side already. Drag one into another side too: a junior can play up, and a senior can play Saturday and Sunday."
          >
            {list(picked)}
          </Group>
        )}
        <p className="mx-1 mt-1 text-xs text-muted-foreground">
          Showing {q ? "matching players" : junior ? "junior families" : "seniors"}.
          {sidebar && " Tap a player to add them to a side."}
        </p>
      </div>
    </aside>
  );
}
