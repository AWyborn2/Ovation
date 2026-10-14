import { useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { SelectionMember, SelectionMemberStatus } from "@workspace/api-client-react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PlayerChip, StatusMark } from "./player-chip";

const zoneClass =
  "rounded-lg px-1 py-1.5 data-[drop-state=ok]:bg-blue-500/10 data-[drop-state=ok]:shadow-[inset_0_0_0_2px_var(--color-blue-500)]";

function List({
  members,
  busy,
  draggingId,
  onOpenMember,
  onChipPointerDown,
}: {
  members: SelectionMember[];
  busy: boolean;
  draggingId: number | null;
  onOpenMember: (id: number) => void;
  onChipPointerDown: (e: PointerEvent<HTMLElement>, id: number) => void;
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
            onOpen={() => onOpenMember(m.id)}
            onPointerDown={(e) => onChipPointerDown(e, m.id)}
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

/**
 * Players not in any side: Available, Maybe, No reply (with the remind
 * action) and Unavailable (collapsed). The search filters every group.
 * Each group is a drop zone, so dragging a side player here takes them out.
 */
export function PlayerPool({
  pool,
  junior,
  busy,
  draggingId,
  scrollRef,
  canRemind,
  reminding,
  onRemind,
  onOpenMember,
  onChipPointerDown,
}: {
  pool: SelectionMember[];
  junior: boolean;
  busy: boolean;
  draggingId: number | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  canRemind: boolean;
  reminding: boolean;
  onRemind: () => void;
  onOpenMember: (id: number) => void;
  onChipPointerDown: (e: PointerEvent<HTMLElement>, id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [showNo, setShowNo] = useState(false);
  const q = query.trim().toLowerCase();
  const shown = q ? pool.filter((m) => m.displayName.toLowerCase().includes(q)) : pool;
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
  const headClass =
    "flex items-center gap-2 px-1 pb-1.5 pt-1 font-serif text-[15px] font-bold uppercase leading-tight tracking-wide";

  return (
    <aside
      aria-label="Player pool"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card lg:absolute lg:inset-0"
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3.5 py-3">
        <h2 className="font-serif text-[22px] font-extrabold leading-none">Player pool</h2>
        <p className="text-[12.5px] text-muted-foreground">
          Drag players onto a team. Drag a team player back here to drop them. On a phone, hold the
          grip to drag, or tap a player to move them.
        </p>
        <label className="sr-only" htmlFor="pool-search">
          Search players
        </label>
        <Input
          id="pool-search"
          type="search"
          placeholder="Search players"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 max-h-[60vh] flex-col gap-1.5 overflow-auto overscroll-contain px-2.5 pb-3 pt-1.5 lg:max-h-none lg:flex-1"
      >
        <section data-drop="pool" className={zoneClass} aria-label="Available, not picked">
          <div className={headClass}>
            <Heading status="yes" count={yes.length}>
              Available, not picked
            </Heading>
          </div>
          {list(yes)}
        </section>
        <section data-drop="pool" className={zoneClass} aria-label="Maybe">
          <div className={headClass}>
            <Heading status="maybe" count={maybe.length}>
              Maybe
            </Heading>
          </div>
          {list(maybe)}
        </section>
        <section data-drop="pool" className={zoneClass} aria-label="No reply">
          <div className={headClass}>
            <Heading status="none" count={none.length}>
              No reply
            </Heading>
            {canRemind && none.length > 0 && (
              <button
                type="button"
                className="min-h-[30px] rounded-md border border-input bg-card px-2 font-sans text-xs font-semibold normal-case tracking-normal disabled:opacity-50"
                disabled={reminding}
                onClick={onRemind}
              >
                Remind {none.length}
              </button>
            )}
          </div>
          <p className="mx-1 mb-1.5 text-xs text-muted-foreground">
            Left out of drafts at cut-off. Picking one flags them until they reply.
          </p>
          {list(none)}
        </section>
        <section data-drop="pool" className={zoneClass} aria-label="Unavailable">
          <button
            type="button"
            className={cn(headClass, "w-full text-left")}
            aria-expanded={showNo}
            onClick={() => setShowNo((v) => !v)}
          >
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", showNo && "rotate-90")}
              aria-hidden
            />
            <Heading status="no" count={no.length}>
              Unavailable
            </Heading>
          </button>
          {showNo && list(no)}
        </section>
        <p className="mx-1 mt-1 text-xs text-muted-foreground">
          Showing {q ? "matching players" : junior ? "junior families" : "seniors"}.
        </p>
      </div>
    </aside>
  );
}
