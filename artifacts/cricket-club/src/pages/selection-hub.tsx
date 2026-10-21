import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetSelectionBoardQueryKey,
  useFinaliseSelection,
  useGetSelectionBoard,
  useRemindSelectionNonResponders,
  useReopenSelection,
  useSyncSelectionFromPlayhq,
  useSaveSelectionBoard,
  type SelectionBoard,
  type SquadSection,
} from "@workspace/api-client-react";
import { AddActivePlayer } from "@/components/add-active-player";
import { NAV_QUERY, useAdminSidebarSlot, useMediaQuery } from "@/components/admin-sidebar-slot";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SelectionCompareLink } from "@/components/selection/compare-link";
import { CaptainShell } from "@/components/captain-shell";
import { EmptyState, LoadingState, QueryError } from "@/components/data-states";
import {
  applyMove,
  checkMove,
  sideLabel,
  toChanges,
  type BoardAction,
  type BoardState,
  type Location,
} from "@/components/selection/apply-move";
import { weekendLabel } from "@/components/selection/labels";
import { GradeChipBar } from "@/components/selection/grade-chip-bar";
import { MoveDialog } from "@/components/selection/move-dialog";
import { MemberStatusControl } from "@/components/selection/member-status-control";
import { PlayerMatches } from "@/components/selection/player-matches";
import { PlayerPool } from "@/components/selection/player-pool";
import { ChangeLog, RoundHeader } from "@/components/selection/round-header";
import { TeamCard, finaliseHeadsUp } from "@/components/selection/team-card";
import { usePointerDrag } from "@/components/selection/use-pointer-drag";
import { useHubView } from "@/components/selection/use-hub-view";
import { AvailabilityContext } from "@/components/selection/availability-context";
import { StatusTierLegend } from "@/components/selection/status-tier";
import { WeekendSwitcher, useWeekendNav } from "@/components/selection/weekend-switcher";
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
  const [shownWeekends, setShownWeekends] = useState<SelectionBoard["weekends"]>();
  const nav = useWeekendNav(shownWeekends);
  const params = { section, ...(nav.weekend ? { weekend: nav.weekend } : {}) };
  const queryKey = getGetSelectionBoardQueryKey(params);
  const board = useGetSelectionBoard(params, {
    query: { queryKey, staleTime: 0, refetchInterval: 15_000 },
  });
  useEffect(() => setShownWeekends(board.data?.weekends), [board.data?.weekends]);
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

  // A new section or weekend starts from the server's board.
  useEffect(() => {
    setLocal(null);
    setOpenId(null);
  }, [section, nav.weekend]);

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey }), [qc, queryKey]);

  const save = useSaveSelectionBoard();
  const finalise = useFinaliseSelection();
  const reopen = useReopenSelection();
  const playhqSync = useSyncSelectionFromPlayhq();
  const remind = useRemindSelectionNonResponders();
  const [syncingAll, setSyncingAll] = useState(false);
  const [finalisingAll, setFinalisingAll] = useState(false);
  const confirm = useConfirm();
  const busy =
    save.isPending ||
    finalise.isPending ||
    reopen.isPending ||
    playhqSync.isPending ||
    syncingAll ||
    finalisingAll;

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

  // Where the chip being dragged or opened sits: a player can be in several sides.
  const sourceRef = useRef<Location | null>(null);
  const [openFrom, setOpenFrom] = useState<Location | null>(null);
  const drag = usePointerDrag({
    check: (memberId, target) => {
      const v = viewRef.current;
      if (!v) return { ok: false, message: "" };
      const r = checkMove(v, memberId, target, sourceRef.current);
      return r.ok ? r : { ok: false, message: r.message };
    },
    onDrop: (memberId, target) => act({ kind: "move", memberId, target, from: sourceRef.current }),
    onCancel: () => say("Move cancelled"),
    scrollContainer: poolRef,
  });

  const openMember = (id: number, from?: Location) => {
    if (drag.shouldSuppressClick()) return;
    setOpenFrom(from ?? null);
    setOpenId(id);
  };
  const startDrag = (e: PointerEvent<HTMLElement>, id: number, from: Location) => {
    sourceRef.current = from;
    drag.onPointerDown(e, id);
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
          const unlisted = r.unlisted?.length
            ? ` ${r.unlisted.join(", ")} ${r.unlisted.length === 1 ? "isn't" : "aren't"} on the junior team list: no matching PlayHQ junior was found.`
            : "";
          const msg = !board.data?.availability
            ? `${label} finalised and published as the team list.${unlisted}`
            : `${label} finalised and published. ${n} ${
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
              }${unlisted}`;
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

  const doPlayhqSync = (sideId: number) => {
    const side = view?.selections.find((s) => s.id === sideId);
    if (!side) return;
    playhqSync.mutate(
      // The version as shown: a side changed since is refused, not overwritten unseen.
      { id: sideId, data: { version: side.version } },
      {
        onSuccess: (r) => {
          const gaps = r.slots.filter((s) => s.gap).length;
          const msg = `${sideLabel(side)} now matches the team named in PlayHQ.${
            gaps
              ? ` ${gaps} ${gaps === 1 ? "player isn't" : "players aren't"} on your squad list or ${gaps === 1 ? "is" : "are"} in another side: see the gaps.`
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

  /** Drafts this section can take PlayHQ's side for: named in PlayHQ, editable, not final. */
  const playhqReady = (view?.selections ?? []).filter(
    (s) => s.state === "draft" && s.canEdit && s.playhqPlayers != null,
  );

  // One side at a time, each at the version shown, so a side changed meanwhile is
  // refused rather than overwritten; the rest still sync.
  const doSyncAll = async () => {
    const sides = playhqReady;
    if (sides.length === 0 || syncingAll) return;
    const ok = await confirm({
      title: `Use PlayHQ's teams for ${sides.length} ${sides.length === 1 ? "side" : "sides"}?`,
      description: `${sides.map((s) => sideLabel(s)).join(", ")}: each draft is replaced by the team named in PlayHQ. Anyone not on your squad list, or already in another side, is left as a gap. Nothing is published until you finalise.`,
      confirmText: "Use PlayHQ teams",
    });
    if (!ok) return;
    setSyncingAll(true);
    let synced = 0;
    let gaps = 0;
    const failed: string[] = [];
    for (const side of sides) {
      try {
        const r = await playhqSync.mutateAsync({ id: side.id, data: { version: side.version } });
        synced++;
        gaps += r.slots.filter((x) => x.gap).length;
      } catch (e) {
        failed.push(`${sideLabel(side)} (${errorText(e)})`);
      }
    }
    setSyncingAll(false);
    await refetch();
    const msg = `${synced} ${synced === 1 ? "side now matches" : "sides now match"} PlayHQ.${
      gaps ? ` ${gaps} ${gaps === 1 ? "gap" : "gaps"} to fill.` : ""
    }${failed.length ? ` Not synced: ${failed.join("; ")}.` : ""}`;
    if (failed.length) fail(msg);
    else {
      say(msg);
      toast({ description: msg });
    }
  };

  /** Drafts the caller may finalise that have at least one player picked. */
  const finaliseReady = (view?.selections ?? []).filter(
    (s) => s.state === "draft" && s.canEdit && s.canFinalise && s.slots.some((x) => x.member),
  );

  // One side at a time at the version shown, like a single finalise: a side
  // changed meanwhile (or started) is refused and named; the rest still finalise.
  const doFinaliseAll = async () => {
    const sides = finaliseReady;
    if (sides.length === 0 || finalisingAll) return;
    const notify = board.data?.availability === true;
    const warned = sides.filter((s) => finaliseHeadsUp(s).length > 0);
    const ok = await confirm({
      title: `Finalise ${sides.length} ${sides.length === 1 ? "side" : "sides"}?`,
      description: `${sides.map((s) => sideLabel(s)).join(", ")} will be published as ${
        sides.length === 1 ? "its team list" : "their team lists"
      }${notify ? ` and each selected ${section === "junior" ? "family" : "player"} gets an SMS and email` : ""}.${
        warned.length
          ? ` Heads up: ${warned
              .map((s) => `${sideLabel(s)} (${finaliseHeadsUp(s).join(", ")})`)
              .join("; ")}.`
          : ""
      }`,
      confirmText: notify ? "Finalise and notify" : "Finalise all",
    });
    if (!ok) return;
    setFinalisingAll(true);
    let done = 0;
    let notified = 0;
    const unlisted: string[] = [];
    const failed: string[] = [];
    for (const side of sides) {
      try {
        const r = await finalise.mutateAsync({ id: side.id, data: { version: side.version } });
        done++;
        notified += r.messaged.selected;
        unlisted.push(...(r.unlisted ?? []));
      } catch (e) {
        failed.push(`${sideLabel(side)} (${errorText(e)})`);
      }
    }
    setFinalisingAll(false);
    await refetch();
    const msg = `${done} ${done === 1 ? "side" : "sides"} finalised and published.${
      notify && notified ? ` ${notified} notified.` : ""
    }${
      unlisted.length
        ? ` Not on the junior team list (no matching PlayHQ junior): ${unlisted.join(", ")}.`
        : ""
    }${failed.length ? ` Not finalised: ${failed.join("; ")}.` : ""}`;
    if (failed.length) fail(msg);
    else {
      say(msg);
      toast({ description: msg });
    }
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

  // Focus shows up to three sides side by side; Board shows them all.
  const wide = useMediaQuery(NAV_QUERY);
  const sideIds = (view?.selections ?? []).map((s) => s.id);
  const hubView = useHubView(section, sideIds, !wide);
  const shownSides =
    hubView.view === "focus"
      ? (view?.selections ?? []).filter((s) => hubView.focused.includes(s.id))
      : (view?.selections ?? []);

  // On desktop the pool lives in the admin side panel; the Pool toggle shows
  // how many of this section's players aren't in a side yet.
  const slot = useAdminSidebarSlot();
  const unpicked = useMemo(() => {
    if (!view) return null;
    const placed = new Set(view.selections.flatMap((s) => s.slots.map((x) => x.memberId)));
    return view.pool.filter((m) => !placed.has(m.id) && (junior || m.section !== "junior")).length;
  }, [view, junior]);
  const { setCount } = slot;
  useEffect(() => {
    setCount(unpicked);
  }, [setCount, unpicked]);
  useEffect(() => () => setCount(null), [setCount]);
  const roundLabel = data?.selections.find((s) => s.fixture.roundLabel)?.fixture.roundLabel;

  const pool = (variant: "inline" | "sidebar") =>
    view && data ? (
      <PlayerPool
        variant={variant}
        pool={view.pool}
        junior={junior}
        busy={save.isPending}
        draggingId={drag.draggingId}
        draggingFromSide={drag.draggingId != null && sourceRef.current?.kind === "side"}
        scrollRef={poolRef}
        sides={view.selections}
        canRemind={
          data.availability &&
          data.actor.canRemind &&
          data.round != null &&
          nav.weekend === undefined
        }
        reminding={remind.isPending}
        onRemind={doRemind}
        onOpenMember={openMember}
        onChipPointerDown={startDrag}
      />
    ) : null;

  return (
    <AvailabilityContext.Provider value={data?.availability ?? true}>
      <div className="mx-auto flex w-full min-w-0 flex-col gap-4 pb-12">
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
          <div className="flex flex-wrap items-center gap-2">
            <SelectionCompareLink junior={junior} />
            {/* Always shown, so they can be found; greyed out with the reason when idle. */}
            <Button
              variant="outline"
              disabled={busy || playhqReady.length === 0}
              title={
                playhqReady.length === 0
                  ? "PlayHQ hasn't named a side for any draft here yet (it syncs about hourly)."
                  : undefined
              }
              onClick={() => void doSyncAll()}
            >
              {syncingAll
                ? "Syncing…"
                : playhqReady.length > 0
                  ? `Sync all from PlayHQ (${playhqReady.length})`
                  : "Sync all from PlayHQ"}
            </Button>
            <Button
              disabled={busy || finaliseReady.length === 0}
              title={
                finaliseReady.length === 0
                  ? "No draft side with players picked for you to finalise."
                  : undefined
              }
              onClick={() => void doFinaliseAll()}
            >
              {finalisingAll
                ? "Finalising…"
                : finaliseReady.length > 0
                  ? `Finalise all (${finaliseReady.length})`
                  : "Finalise all"}
            </Button>
            <AddActivePlayer section={section} />
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
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <WeekendSwitcher
            weekends={data?.weekends}
            readOnly={data?.readOnly === true}
            atHome={nav.weekend === undefined}
            onGo={nav.go}
            onHome={nav.goHome}
          />
          {view && view.selections.length > 0 && <StatusTierLegend />}
        </div>

        <div aria-live="polite" role="status" className="sr-only" data-testid="hub-announcer">
          {announcement}
        </div>

        {board.isError ? (
          <QueryError message={errorText(board.error)} onRetry={() => board.refetch()} />
        ) : board.isLoading || !data || !view ? (
          <LoadingState label="Loading the board…" />
        ) : !data.round && view.selections.length === 0 ? (
          <EmptyState
            title={data.readOnly ? "Nothing picked that weekend" : "No fixtures this weekend"}
            message={
              data.readOnly
                ? "No sides were drafted in the Hub for this weekend."
                : "A side is drafted for each fixture from Friday to Sunday as soon as it's scheduled. Add or sync fixtures to start picking."
            }
          />
        ) : (
          <>
            {data.availability && data.round && (
              <RoundHeader round={data.round} actor={data.actor} junior={junior} />
            )}
            {!data.readOnly && (
              <PlayerMatches
                board={data}
                sides={view.selections}
                disabled={busy}
                onBoard={(next) => {
                  qc.setQueryData(queryKey, next);
                  setLocal(null);
                }}
                onChanged={() => void refetch()}
                onSay={(message) => {
                  say(message);
                  toast({ description: message });
                }}
                onFail={fail}
              />
            )}
            {view.selections.length > 0 && (
              <GradeChipBar
                sides={view.selections}
                view={hubView.view}
                focused={hubView.focused}
                onToggle={hubView.toggle}
                onFocusOnly={hubView.focusOnly}
                onView={hubView.setView}
              />
            )}
            {slot.node && createPortal(pool("sidebar"), slot.node)}
            <div
              className={cn(
                "grid items-stretch gap-4",
                !slot.node && "lg:grid-cols-[minmax(0,1fr)_340px]",
              )}
            >
              <main
                aria-label="Teams"
                style={{ "--cols": Math.max(1, shownSides.length) } as CSSProperties}
                className={cn(
                  "grid min-w-0 content-start gap-3.5",
                  hubView.view === "focus"
                    ? "grid-cols-1 nav:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
                    : "[grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]",
                )}
              >
                {view.selections.length === 0 ? (
                  <EmptyState
                    className="col-span-full"
                    title="No fixtures this weekend"
                    message={
                      data.readOnly
                        ? "This section had no sides that weekend."
                        : "A side is drafted for each of this section's fixtures from Friday to Sunday, starting from the grade's side last week. Add or sync fixtures to start picking."
                    }
                  />
                ) : (
                  shownSides.map((side) => (
                    <TeamCard
                      key={side.id}
                      side={side}
                      junior={junior}
                      busy={busy}
                      draggingId={drag.draggingId}
                      onOpenMember={openMember}
                      onChipPointerDown={startDrag}
                      onRole={(role, memberId) =>
                        act({ kind: "role", sideId: side.id, role, memberId })
                      }
                      onFinalise={() => doFinalise(side.id)}
                      onReopen={() => doReopen(side.id)}
                      onPlayhqSync={() => doPlayhqSync(side.id)}
                    />
                  ))
                )}
              </main>
              {!slot.node && (
                <div className="relative order-first min-w-0 lg:order-none lg:min-h-[420px]">
                  {pool("inline")}
                </div>
              )}
            </div>
            <ChangeLog events={data.events} />
          </>
        )}

        {view && (
          <MoveDialog
            junior={junior}
            state={view}
            memberId={openId}
            from={openFrom}
            busy={busy}
            onClose={() => setOpenId(null)}
            onMove={(memberId, target) => act({ kind: "move", memberId, target, from: openFrom })}
            onRole={(sideId, role, memberId) => act({ kind: "role", sideId, role, memberId })}
            // A past weekend is read-only: its answers can't be recorded.
            extra={(member) =>
              data?.round && !data.readOnly ? (
                <MemberStatusControl
                  member={member}
                  weekend={data.round.weekendDate}
                  boardJunior={junior}
                  disabled={busy}
                  onSaved={(next, message) => {
                    if (next.section === section) qc.setQueryData(queryKey, next);
                    setLocal(null);
                    say(message);
                    toast({ description: message });
                  }}
                  onError={(e) => fail(`Not recorded: ${errorText(e)}`)}
                />
              ) : null
            }
          />
        )}
      </div>
    </AvailabilityContext.Provider>
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
