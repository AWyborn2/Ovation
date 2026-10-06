import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSelectionBoardQueryKey,
  useFinaliseSelection,
  useGetSelectionBoard,
  useRemindSelectionNonResponders,
  useReopenSelection,
  useSaveSelectionBoard,
  type SelectionBoard,
  type SquadSection,
} from "@workspace/api-client-react";
import { CaptainShell } from "@/components/captain-shell";
import { EmptyState, LoadingState, QueryError } from "@/components/data-states";
import {
  applyMove,
  checkMove,
  sideLabel,
  toChanges,
  type BoardAction,
  type BoardState,
} from "@/components/selection/apply-move";
import { weekendLabel } from "@/components/selection/labels";
import { MoveDialog } from "@/components/selection/move-dialog";
import { PlayerPool } from "@/components/selection/player-pool";
import { ChangeLog, RoundHeader } from "@/components/selection/round-header";
import { TeamCard } from "@/components/selection/team-card";
import { usePointerDrag } from "@/components/selection/use-pointer-drag";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** The server's refusal text ({ error }) when there is one, else the client's message. */
function errorText(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  if (status === 401) return "Your session has expired — please sign in again.";
  const data = (e as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === "string") return data.error;
  return (e as Error)?.message ?? "Request failed";
}

const boardState = (b: SelectionBoard): BoardState => ({ selections: b.selections, pool: b.pool });

/**
 * The Selection Hub: the
 * round header and response bar, a Seniors / Juniors switch, a card per
 * drafted side, the grouped player pool and the change log. Drags and the
 * Move dialog compute the next board with `applyMove`, show it at once and
 * save the touched sides in one versioned `PUT /selection/board`; a
 * refused save (403/409/400) reverts, says why and reloads the board. Edit
 * rights come from the server (`canEdit` / `canFinalise`).
 */
export default function SelectionHub() {
  const qc = useQueryClient();
  const [section, setSection] = useState<SquadSection>("senior");
  const params = { section };
  const queryKey = getGetSelectionBoardQueryKey(params);
  const board = useGetSelectionBoard(params, { query: { queryKey } });
  const [local, setLocal] = useState<BoardState | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const poolRef = useRef<HTMLDivElement>(null);

  const view = useMemo<BoardState | null>(
    () => local ?? (board.data ? boardState(board.data) : null),
    [local, board.data],
  );
  const viewRef = useRef(view);
  viewRef.current = view;

  // A new section starts from the server's board.
  useEffect(() => {
    setLocal(null);
    setOpenId(null);
  }, [section]);

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  const save = useSaveSelectionBoard();
  const finalise = useFinaliseSelection();
  const reopen = useReopenSelection();
  const remind = useRemindSelectionNonResponders();
  const busy = save.isPending || finalise.isPending || reopen.isPending;

  const say = (message: string) => setAnnouncement(message);
  const fail = (message: string) => {
    say(message);
    toast({ variant: "destructive", description: message });
  };

  const act = (action: BoardAction) => {
    const current = viewRef.current;
    if (!current) return;
    if (save.isPending) {
      say("Still saving the last change. Try again in a moment.");
      return;
    }
    const result = applyMove(current, action);
    if (!result.ok) {
      if (result.message) fail(result.message);
      return;
    }
    setLocal(result.state);
    const roleLines = result.log.filter((l) => / no longer has a /.test(l));
    say(result.log.join(". "));
    const heads = [
      result.warning,
      roleLines.length ? `${roleLines.join(". ")}. Pick a new one on the card.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (heads) toast({ description: heads });
    save.mutate(
      { data: { changes: toChanges(result.state, result.touched) } },
      {
        onSuccess: (next) => {
          qc.setQueryData(queryKey, next);
          setLocal(null);
        },
        onError: (e) => {
          setLocal(null);
          fail(`Not saved: ${errorText(e)}`);
          void refetch();
        },
      },
    );
  };

  const drag = usePointerDrag({
    check: (memberId, target) => {
      const v = viewRef.current;
      if (!v) return { ok: false, message: "" };
      const r = checkMove(v, memberId, target);
      return r.ok ? r : { ok: false, message: r.message };
    },
    onDrop: (memberId, target) => act({ kind: "move", memberId, target }),
    onCancel: () => say("Move cancelled"),
    scrollContainer: poolRef,
  });

  const openMember = (id: number) => {
    if (drag.shouldSuppressClick()) return;
    setOpenId(id);
  };

  const doFinalise = (sideId: number) => {
    const side = view?.selections.find((s) => s.id === sideId);
    if (!side) return;
    finalise.mutate(
      // The version as shown: a side changed since is refused, not published unseen.
      { id: sideId, data: { version: side.version } },
      {
        onSuccess: (r) => {
          const n = r.messaged.selected;
          const label = sideLabel(side);
          const msg = `${label} finalised and published. ${n} ${
            section === "junior"
              ? n === 1
                ? "family"
                : "families"
              : n === 1
                ? "player"
                : "players"
          } notified${r.messaged.deselected ? `, ${r.messaged.deselected} told they're out` : ""}.${
            r.messaged.failed
              ? ` ${r.messaged.failed} couldn't be reached; finalise again later to retry.`
              : ""
          }`;
          say(msg);
          toast({ description: msg });
          void refetch();
        },
        onError: (e) => {
          fail(errorText(e));
          void refetch();
        },
      },
    );
  };

  const doReopen = (sideId: number) => {
    const side = view?.selections.find((s) => s.id === sideId);
    reopen.mutate(
      { id: sideId },
      {
        onSuccess: () => {
          const msg = `${side ? sideLabel(side) : "The side"} re-opened. Selected players are told about any change once you finalise again.`;
          say(msg);
          toast({ description: msg });
          void refetch();
        },
        onError: (e) => {
          fail(errorText(e));
          void refetch();
        },
      },
    );
  };

  const doRemind = () => {
    remind.mutate(
      { data: { section } },
      {
        onSuccess: (r) => {
          const who = section === "junior" ? "families" : "players";
          const msg =
            r.messaged > 0
              ? `Reminder sent to ${r.messaged} ${who} by SMS and email.${
                  r.throttled ? ` ${r.throttled} reminded in the last 12 hours were skipped.` : ""
                }`
              : r.throttled
                ? `Everyone left was reminded in the last 12 hours, so nothing was sent.`
                : "Nobody to remind.";
          say(msg);
          toast({ description: msg });
          void refetch();
        },
        onError: (e) => fail(errorText(e)),
      },
    );
  };

  const data = board.data;
  const junior = section === "junior";
  const roundLabel = data?.selections.find((s) => s.fixture.roundLabel)?.fixture.roundLabel;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            Selection Hub
          </div>
          <h1 className="mt-1.5 font-serif text-[34px] font-extrabold leading-none">
            {roundLabel ?? "This round"}
            {data?.round && (
              <span className="font-semibold text-muted-foreground">
                {" "}
                · {weekendLabel(data.round.weekendDate)}
              </span>
            )}
          </h1>
        </div>
        <div
          role="group"
          aria-label="Section"
          className="inline-flex rounded-lg border border-border bg-muted p-0.5"
        >
          {(["senior", "junior"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={section === s}
              onClick={() => setSection(s)}
              className={cn(
                "min-h-[34px] rounded-md px-3 text-sm font-semibold text-muted-foreground",
                section === s && "bg-card text-foreground shadow-sm",
              )}
            >
              {s === "senior" ? "Seniors" : "Juniors"}
            </button>
          ))}
        </div>
      </header>

      <div aria-live="polite" role="status" className="sr-only" data-testid="hub-announcer">
        {announcement}
      </div>

      {board.isError ? (
        <QueryError message={errorText(board.error)} onRetry={() => board.refetch()} />
      ) : board.isLoading || !data || !view ? (
        <LoadingState label="Loading the board…" />
      ) : !data.round && view.selections.length === 0 ? (
        <EmptyState
          title="No availability round yet"
          message="Once the club's availability requests go out, this round's drafts and replies show here."
        />
      ) : (
        <>
          {data.round && <RoundHeader round={data.round} actor={data.actor} junior={junior} />}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <main
              aria-label="Teams"
              className="grid min-w-0 gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]"
            >
              {view.selections.length === 0 ? (
                <EmptyState
                  className="col-span-full"
                  title="No drafts yet"
                  message="Drafts are built at cut-off for each grade with a fixture this round."
                />
              ) : (
                view.selections.map((side) => (
                  <TeamCard
                    key={side.id}
                    side={side}
                    junior={junior}
                    busy={busy}
                    draggingId={drag.draggingId}
                    onOpenMember={openMember}
                    onChipPointerDown={drag.onPointerDown}
                    onRole={(role, memberId) =>
                      act({ kind: "role", sideId: side.id, role, memberId })
                    }
                    onFinalise={() => doFinalise(side.id)}
                    onReopen={() => doReopen(side.id)}
                  />
                ))
              )}
            </main>
            <div className="order-first min-w-0 lg:order-none">
              <PlayerPool
                pool={view.pool}
                junior={junior}
                busy={save.isPending}
                draggingId={drag.draggingId}
                scrollRef={poolRef}
                canRemind={data.actor.canRemind && data.round != null}
                reminding={remind.isPending}
                onRemind={doRemind}
                onOpenMember={openMember}
                onChipPointerDown={drag.onPointerDown}
              />
            </div>
          </div>
          <ChangeLog events={data.events} />
        </>
      )}

      {view && (
        <MoveDialog
          state={view}
          memberId={openId}
          busy={busy}
          onClose={() => setOpenId(null)}
          onMove={(memberId, target) => act({ kind: "move", memberId, target })}
          onRole={(sideId, role, memberId) => act({ kind: "role", sideId, role, memberId })}
        />
      )}
    </div>
  );
}

/** The Hub for a signed-in captain, inside the captain area's chrome. */
export function CaptainSelectionHub() {
  return (
    <CaptainShell>
      <SelectionHub />
    </CaptainShell>
  );
}
