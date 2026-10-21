/**
 * Selection Hub page (plan 2026-10-06-002 U9): the Move dialog's
 * destinations, read-only final cards, and the keyboard/tap move path
 * through to the versioned board save — plus a refused save reverting and
 * a pointer drag landing on a slot.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import type { SelectionBoard, SelectionMember, SelectionSide } from "@workspace/api-client-react";
import SelectionHub from "@/pages/selection-hub";
import { AdminSidebarSlotContext } from "@/components/admin-sidebar-slot";
import { renderAt } from "@/test/render";
import { moveOptions } from "./move-dialog";
import { applyMove, sideWarnings } from "./apply-move";

// Board view: these tests look at every side at once (Focus is covered below).
beforeEach(() => {
  localStorage.clear();
  for (const section of ["senior", "junior"]) {
    localStorage.setItem(
      `selection-hub-view:${section}`,
      JSON.stringify({ view: "board", focused: [] }),
    );
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// jsdom has no PointerEvent; without it fireEvent drops pointerId/clientX.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

function member(
  id: number,
  name: string,
  status: SelectionMember["status"] = "yes",
): SelectionMember {
  return {
    id,
    displayName: name,
    status,
    note: null,
    lastGrade: "C Grade",
    junior: false,
    section: "senior",
    isPrivate: false,
    repliedAt: "2026-10-12T10:14:00.000Z",
    late: false,
  };
}

function side(
  id: number,
  grade: string,
  filled: number,
  opts: Partial<SelectionSide> = {},
): SelectionSide {
  const slots = Array.from({ length: 12 }, (_, i) =>
    i < filled
      ? { memberId: id * 100 + i, member: member(id * 100 + i, `${grade} ${i + 1}`), gap: null }
      : { memberId: null, member: null, gap: null },
  );
  const s: SelectionSide = {
    id,
    roundId: 7,
    fixture: {
      kind: "senior",
      id: id * 10,
      grade,
      opponentName: "Riverside Districts",
      startAt: "2026-10-17T04:30:00.000Z",
      venue: "Ovation Park",
      isHome: true,
      roundLabel: "Round 6",
    },
    date: "2026-10-17",
    state: "draft",
    version: 4,
    slots,
    captainMemberId: null,
    keeperMemberId: null,
    finalisedAt: null,
    finalisedBy: null,
    canEdit: true,
    canFinalise: true,
    readOnlyReason: null,
    playhqPlayers: null,
    warnings: sideWarnings({ slots, captainMemberId: null, keeperMemberId: null } as SelectionSide),
    ...opts,
  };
  return { ...s, warnings: sideWarnings(s) };
}

function makeBoard(): SelectionBoard {
  return {
    section: "senior",
    availability: true,
    actor: { kind: "admin", name: "Ash", selectionRule: "captains_own_grade", canRemind: true },
    round: {
      roundId: 7,
      weekendDate: "2026-10-17",
      sendAt: "2026-10-12T10:00:00.000Z",
      reminderAt: "2026-10-14T10:00:00.000Z",
      cutoffAt: "2026-10-15T10:00:00.000Z",
      finaliseAt: "2026-10-16T12:00:00.000Z",
      sendStartedAt: "2026-10-12T10:00:00.000Z",
      reminderStartedAt: "2026-10-14T10:00:00.000Z",
      cutoffStartedAt: "2026-10-15T10:00:00.000Z",
      cutoffCompletedAt: "2026-10-15T10:01:00.000Z",
      counts: { yes: 30, maybe: 3, no: 5, none: 6, late: 1, total: 44 },
    },
    selections: [
      side(1, "A Grade", 9),
      // B Grade is full: the XI and a 12th.
      side(2, "B Grade", 12),
      side(3, "C Grade", 11, {
        state: "final",
        canEdit: false,
        canFinalise: true,
        readOnlyReason: "This side is finalised. Re-open it to make changes.",
      }),
      side(4, "D Grade", 8, {
        canEdit: false,
        canFinalise: false,
        readOnlyReason: "Captains edit their own grade.",
      }),
      side(5, "E Grade", 11, {
        state: "final",
        canEdit: false,
        canFinalise: false,
        readOnlyReason: "Captains edit their own grade.",
      }),
    ],
    pool: [
      member(900, "Pool Player"),
      member(901, "R. Pike", "no"),
      member(902, "Quiet Q", "none"),
    ],
    events: [
      {
        id: 1,
        selectionId: 1,
        grade: "A Grade",
        actorKind: "system",
        actorName: null,
        action: "draft",
        detail: { seededFrom: { kind: "selection", id: 40 } },
        createdAt: "2026-10-15T10:01:00.000Z",
      },
    ],
  };
}

type Req = { method: string; url: string; body: unknown };

/** A method-aware fetch stub: the board for GET, `onPut` for the save. */
function stubApi(board: SelectionBoard, onPut?: (req: Req) => { status: number; body: unknown }) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const req = { method, url, body };
      requests.push(req);
      let status = 200;
      let payload: unknown = [];
      if (url.includes("/api/selection/board") && method === "GET") payload = board;
      else if (url.includes("/api/selection/board") && method === "PUT") {
        const r = onPut ? onPut(req) : { status: 200, body: board };
        status = r.status;
        payload = r.body;
      } else if (url.includes("/playhq-sync") && method === "POST") {
        payload = board.selections[0];
      } else if (url.includes("/finalise") && method === "POST") {
        payload = {
          selection: board.selections[0],
          messaged: { selected: 9, deselected: 0, failed: 1 },
        };
      }
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const renderHub = () => renderAt(<SelectionHub />, "/admin/selection");

describe("comparison from selection", () => {
  it.each(["admin", "captain"] as const)(
    "lets a %s open comparison without leaving the board",
    async (kind) => {
      const board = makeBoard();
      board.actor.kind = kind;
      board.pool[0].linkedPlayerId = 7654;
      stubApi(board);
      renderHub();
      await screen.findByTestId("chip-900");
      const link = screen.getByRole("link", { name: /Compare players/ });
      expect(link).toHaveAttribute("href", "/compare");
      expect(link).toHaveAttribute("target", "_blank");
      fireEvent.click(screen.getByTestId("chip-900"));
      const dialog = screen.getByRole("dialog");
      const playerLink = within(dialog).getByRole("link", { name: /Compare players/ });
      expect(playerLink).toHaveAttribute("href", "/compare?a=7654");
      expect(playerLink).toHaveAttribute("target", "_blank");
      expect(playerLink.getAttribute("href")).not.toContain("900");
    },
  );

  it("explains missing profile links, private players and unsupported juniors", async () => {
    const board = makeBoard();
    board.pool[1].isPrivate = true;
    board.pool[1].linkedPlayerId = 99;
    stubApi(board);
    renderHub();
    fireEvent.click(await screen.findByTestId("chip-900"));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/No senior statistics profile is linked/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /Compare players/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /Unavailable/ }));
    fireEvent.click(screen.getByTestId("chip-901"));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/unavailable for this private player/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Juniors" }));
    await screen.findByText("Player comparison currently supports senior statistics only.");
    expect(screen.queryByRole("link", { name: /Compare players/ })).toBeNull();
  });

  it("preserves the server grade order after saving a player move", async () => {
    const board = makeBoard();
    board.selections = [board.selections[2], board.selections[0], board.selections[1]];
    const requests = stubApi(board);
    renderHub();
    await screen.findByTestId("side-3");
    const ids = () =>
      within(screen.getByRole("main", { name: "Teams" }))
        .getAllByRole("article")
        .map((el) => el.getAttribute("data-side-id"));
    expect(ids()).toEqual(["3", "1", "2"]);
    fireEvent.click(screen.getByTestId("chip-900"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    expect(ids()).toEqual(["3", "1", "2"]);
  });
});

describe("Move dialog destinations", () => {
  it("lists only sides the caller can edit, and disables full and finalised ones", () => {
    const b = makeBoard();
    const opts = moveOptions({ selections: b.selections, pool: b.pool }, 900);
    expect(opts).toEqual([
      { value: "1", label: "A Grade", disabled: false },
      { value: "2", label: "B Grade (full)", disabled: true },
      { value: "3", label: "C Grade (finalised)", disabled: true },
      { value: "5", label: "E Grade (finalised)", disabled: true },
    ]);
    // A side player can also go back to the pool; their own side isn't offered.
    const fromA = moveOptions({ selections: b.selections, pool: b.pool }, 100);
    expect(fromA[0]).toEqual({
      value: "pool",
      label: "Player pool (take out of A Grade)",
      disabled: false,
    });
    expect(fromA.map((o) => o.value)).not.toContain("1");
  });

  it("the dialog shows those options for a pool player", async () => {
    stubApi(makeBoard());
    renderHub();
    fireEvent.click(await screen.findByTestId("chip-900"));
    const dialog = await screen.findByRole("dialog");
    const select = within(dialog).getByLabelText("Move to") as HTMLSelectElement;
    const options = [...select.options].map((o) => [o.textContent, o.disabled]);
    expect(options).toEqual([
      ["A Grade", false],
      ["B Grade (full)", true],
      ["C Grade (finalised)", true],
      ["E Grade (finalised)", true],
    ]);
    expect(within(dialog).queryByText(/D Grade/)).toBeNull();
    // Pool players have no side, so no captain/keeper actions.
    expect(within(dialog).queryByRole("button", { name: "Make captain" })).toBeNull();
  });

  it("a player in a read-only side can't be moved and the dialog says why", async () => {
    stubApi(makeBoard());
    renderHub();
    fireEvent.click(await screen.findByTestId("chip-400"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("D Grade players are managed by its captain or an admin."),
    ).toBeTruthy();
    expect(within(dialog).queryByLabelText("Move to")).toBeNull();
  });
});

describe("final and read-only cards", () => {
  it("a final card is read-only and offers Re-open only to those who may finalise it", async () => {
    stubApi(makeBoard());
    renderHub();
    const c = await screen.findByTestId("side-3");
    expect(within(c).getByText("Final")).toBeTruthy();
    expect(within(c).queryByRole("combobox")).toBeNull();
    expect(within(c).getByRole("button", { name: "Re-open for changes" })).toBeTruthy();
    expect(within(c).queryByRole("button", { name: /^Finalise/ })).toBeNull();

    const e = screen.getByTestId("side-5");
    expect(within(e).queryByRole("button", { name: "Re-open for changes" })).toBeNull();

    const d = screen.getByTestId("side-4");
    expect(within(d).getByText("Captains edit their own grade.")).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /^Finalise/ })).toBeNull();

    const a = screen.getByTestId("side-1");
    expect(within(a).getAllByRole("combobox")).toHaveLength(2);
    expect(within(a).getByText("2 open slots")).toBeTruthy();
    expect(within(a).getByText("No captain")).toBeTruthy();
  });

  it('counts the XI out of 11 with +12th, and labels slot 12 "12th"', async () => {
    stubApi(makeBoard());
    renderHub();
    const b = await screen.findByTestId("side-2");
    expect(b.textContent).toContain("11/11 +12th");
    const bSlots = within(b).getAllByRole("listitem");
    expect(bSlots).toHaveLength(12);
    expect(bSlots[10].textContent).toMatch(/^11/);
    expect(bSlots[11].textContent).toMatch(/^12th/);
    expect(within(b).queryByText(/open slot/)).toBeNull();

    // C Grade has an XI and an empty 12th: complete, no open-slot warning.
    const c = screen.getByTestId("side-3");
    expect(c.textContent).toContain("11/11");
    expect(c.textContent).not.toContain("+12th");
    expect(within(c).queryByText(/open slot/)).toBeNull();
    expect(within(c).getAllByRole("listitem")[11].textContent).toMatch(/^12thOpen slot/);
  });

  it("the 12th can't be picked as captain or keeper", async () => {
    stubApi(makeBoard());
    renderHub();
    const b = await screen.findByTestId("side-2");
    const [captain] = within(b).getAllByRole("combobox") as HTMLSelectElement[];
    const names = [...captain.options].map((o) => o.textContent);
    expect(names).toContain("B Grade 11");
    expect(names).not.toContain("B Grade 12");
  });

  it("finalise asks first, stating the count and what's missing", async () => {
    stubApi(makeBoard());
    renderHub();
    const a = await screen.findByTestId("side-1");
    fireEvent.click(within(a).getByRole("button", { name: "Finalise A Grade" }));
    expect(within(a).getByText(/Finalise A Grade with 9 players\?/).textContent).toMatch(
      /Heads up: 2 open slots, no captain, no keeper\./,
    );
    expect(within(a).getByRole("button", { name: "Finalise and notify" })).toBeTruthy();
    fireEvent.click(within(a).getByRole("button", { name: "Keep editing" }));
    expect(within(a).getByRole("button", { name: "Finalise A Grade" })).toBeTruthy();
  });

  it("finalise sends the side's version and reports anyone who couldn't be reached", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    const a = await screen.findByTestId("side-1");
    fireEvent.click(within(a).getByRole("button", { name: "Finalise A Grade" }));
    fireEvent.click(within(a).getByRole("button", { name: "Finalise and notify" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && r.url.includes("/finalise"))).toBe(true),
    );
    const post = requests.find((r) => r.method === "POST" && r.url.includes("/finalise"))!;
    expect(post.url).toContain("/api/selection/1/finalise");
    expect(post.body).toEqual({ version: 4 });
    await waitFor(() =>
      expect(screen.getByTestId("hub-announcer").textContent).toMatch(
        /9 players notified. 1 couldn't be reached/,
      ),
    );
  });

  it("shows the round header and response breakdown", async () => {
    stubApi(makeBoard());
    renderHub();
    expect(await screen.findByText("86% replied")).toBeTruthy();
    expect(screen.getByText(/38 of 44 senior players/)).toBeTruthy();
    expect(screen.getByText("A Grade draft started from the side picked last time")).toBeTruthy();
  });
});

describe("PlayHQ's published side", () => {
  it("offers PlayHQ's team on a draft that has one and syncs at the version shown", async () => {
    const board = makeBoard();
    board.selections[0] = { ...board.selections[0], playhqPlayers: 11 };
    const requests = stubApi(board);
    renderHub();
    const card = await screen.findByTestId(`side-${board.selections[0].id}`);
    fireEvent.click(within(card).getByRole("button", { name: "Use PlayHQ team (11)" }));
    expect(within(card).getByText(/Replace this draft with the 11 players named in/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Use PlayHQ team" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && r.url.includes("/playhq-sync"))).toBe(
        true,
      ),
    );
    const req = requests.find((r) => r.url.includes("/playhq-sync"))!;
    expect(req.url).toContain(`/api/selection/${board.selections[0].id}/playhq-sync`);
    expect(req.body).toEqual({ version: board.selections[0].version });
  });

  it("Sync all replaces every draft PlayHQ has named, one at a time at its version", async () => {
    const board = makeBoard();
    const drafts = board.selections.filter((x) => x.state === "draft" && x.canEdit);
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    for (const d of drafts.slice(0, 2)) d.playhqPlayers = 11;
    const requests = stubApi(board);
    renderHub();
    fireEvent.click(await screen.findByRole("button", { name: "Sync all from PlayHQ (2)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use PlayHQ teams" }));
    await waitFor(() =>
      expect(requests.filter((r) => r.url.includes("/playhq-sync"))).toHaveLength(2),
    );
    const synced = requests.filter((r) => r.url.includes("/playhq-sync"));
    expect(synced.map((r) => r.url)).toEqual(
      drafts.slice(0, 2).map((d) => expect.stringContaining(`/api/selection/${d.id}/playhq-sync`)),
    );
    expect(synced.map((r) => r.body)).toEqual(
      drafts.slice(0, 2).map((d) => ({ version: d.version })),
    );
  });

  it("shows no PlayHQ button when PlayHQ hasn't named the side", async () => {
    stubApi(makeBoard());
    renderHub();
    await screen.findByTestId("chip-900");
    expect(screen.queryByRole("button", { name: /Use PlayHQ team/ })).toBeNull();
    // Sync all stays visible but greyed out, so it can be found.
    expect(screen.getByRole("button", { name: "Sync all from PlayHQ" })).toBeDisabled();
  });
});

describe("juniors playing up", () => {
  it("lists juniors apart in a collapsed group on a senior board, and search opens it", async () => {
    const board = makeBoard();
    board.pool.push({ ...board.pool[0], id: 990, displayName: "Kobe Lee", section: "junior" });
    stubApi(board);
    renderHub();
    const group = await screen.findByRole("region", { name: "Juniors" });
    expect(within(group).queryByTestId("chip-990")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search players"), { target: { value: "kobe" } });
    expect(await within(group).findByTestId("chip-990")).toBeTruthy();
  });
});

describe("Finalise all", () => {
  it("finalises every draft the caller may finalise, one at a time at its version", async () => {
    const board = makeBoard();
    const ready = board.selections.filter(
      (x) => x.state === "draft" && x.canEdit && x.canFinalise && x.slots.some((s) => s.member),
    );
    expect(ready.length).toBeGreaterThanOrEqual(2);
    const requests = stubApi(board);
    renderHub();
    fireEvent.click(await screen.findByRole("button", { name: `Finalise all (${ready.length})` }));
    fireEvent.click(await screen.findByRole("button", { name: "Finalise and notify" }));
    await waitFor(() =>
      expect(requests.filter((r) => r.url.includes("/finalise"))).toHaveLength(ready.length),
    );
    expect(requests.filter((r) => r.url.includes("/finalise")).map((r) => r.body)).toEqual(
      ready.map((d) => ({ version: d.version })),
    );
  });
});

describe("without availability", () => {
  it("shows one Squad list and no round header, statuses or reminders", async () => {
    const board = { ...makeBoard(), availability: false };
    stubApi(board);
    renderHub();
    await screen.findByTestId("chip-900");
    expect(screen.queryByText("86% replied")).toBeNull();
    expect(screen.getByRole("region", { name: "Squad" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "No reply" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remind/ })).toBeNull();
    // Every pool player is listed, whatever their (meaningless) status.
    for (const m of board.pool) expect(screen.getByTestId(`chip-${m.id}`)).toBeTruthy();
    expect(screen.getByTestId("chip-900").getAttribute("aria-label")).not.toMatch(
      /reply|available/i,
    );
  });

  it("says finalising published the list without claiming anyone was messaged", async () => {
    const board = { ...makeBoard(), availability: false };
    stubApi(board);
    renderHub();
    const card = await screen.findByTestId("side-1");
    fireEvent.click(within(card).getByRole("button", { name: /^Finalise/ }));
    fireEvent.click(within(card).getByRole("button", { name: /^Finalise/ }));
    expect(await screen.findByText(/finalised and published as the team list\./)).toBeTruthy();
    expect(screen.queryByText(/notified/)).toBeNull();
  });
});

describe("slot status tiers (ADR-008)", () => {
  const tiered = (availability: boolean): SelectionBoard => {
    const board = { ...makeBoard(), availability };
    const a = board.selections[0];
    const statuses: SelectionMember["status"][] = ["yes", "maybe", "none", "no"];
    a.slots = a.slots.map((slot, i) =>
      i < 4 && slot.member ? { ...slot, member: { ...slot.member, status: statuses[i]! } } : slot,
    );
    return board;
  };

  it("marks each picked player yellow, green or red, with a glyph and words as well as colour", async () => {
    stubApi(tiered(true));
    renderHub();
    const card = await screen.findByTestId("side-1");
    const chip = (i: number) => within(card).getByTestId(`chip-${100 + i}`);
    expect(chip(0).getAttribute("aria-label")).toMatch(/, available/);
    expect(chip(1).getAttribute("aria-label")).toMatch(/to confirm \(said Maybe\)/);
    expect(chip(2).getAttribute("aria-label")).toMatch(/to confirm \(no reply\)/);
    expect(chip(3).getAttribute("aria-label")).toMatch(/, unavailable/);
    const tierOf = (i: number) => chip(i).querySelector("[data-tier]");
    expect(tierOf(0)?.textContent).toBe("✓");
    expect(tierOf(1)?.getAttribute("data-tier")).toBe("confirm");
    expect(tierOf(2)?.textContent).toBe("?");
    expect(tierOf(3)?.textContent).toBe("✕");
    expect(screen.getByRole("list", { name: "Slot colours" })).toBeTruthy();
  });

  it("still tiers picked players with availability off: no reply reads as to confirm", async () => {
    stubApi(tiered(false));
    renderHub();
    const card = await screen.findByTestId("side-1");
    expect(within(card).getByTestId("chip-102").getAttribute("aria-label")).toMatch(
      /to confirm \(no reply\)/,
    );
  });
});

describe("weekend switcher (ADR-008)", () => {
  const withWeekends = (over: Partial<SelectionBoard> = {}): SelectionBoard => ({
    ...makeBoard(),
    weekends: { previous: "2026-10-10", current: "2026-10-17", next: "2026-10-24" },
    readOnly: false,
    ...over,
  });

  it("moves to the next weekend and back to this one", async () => {
    const requests = stubApi(withWeekends());
    renderHub();
    fireEvent.click(await screen.findByRole("button", { name: /^Next: weekend of 24–25 Oct/ }));
    await waitFor(() =>
      expect(requests.some((r) => r.url.includes("weekend=2026-10-24"))).toBe(true),
    );
    fireEvent.click(await screen.findByRole("button", { name: "This weekend" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "This weekend" })).toBeNull());
  });

  it("a past weekend shows a view-only badge and disables finalising", async () => {
    const board = withWeekends({
      readOnly: true,
      weekends: { previous: null, current: "2026-10-10", next: "2026-10-17" },
    });
    board.selections = board.selections.map((x) => ({
      ...x,
      canEdit: false,
      canFinalise: false,
      readOnlyReason: "This weekend has passed, so its sides can be viewed but not changed.",
    }));
    stubApi(board);
    renderHub();
    expect(await screen.findByText(/Past weekend · view only/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "No earlier weekend" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Finalise all/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("moving a player", () => {
  it("Enter/tap on a chip opens the dialog; choosing a side and submitting saves the touched side", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    const chip = await screen.findByTestId("chip-902");
    // A native button: Enter or Space activates it as a click.
    expect(chip.tagName).toBe("BUTTON");
    chip.focus();
    fireEvent.click(chip);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Move to"), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));

    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const put = requests.find((r) => r.method === "PUT")!;
    expect(put.url).toContain("/api/selection/board");
    const body = put.body as {
      changes: { selectionId: number; version: number; slots: unknown[] }[];
    };
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({ selectionId: 1, version: 4 });
    expect(body.changes[0].slots).toHaveLength(12);
    expect(body.changes[0].slots[9]).toEqual({ memberId: 902, gap: null });
    expect(screen.getByTestId("hub-announcer").textContent).toBe(
      "Quiet Q moved from the pool to A Grade",
    );
  });

  it("a refused save reverts the board and says why", async () => {
    stubApi(makeBoard(), () => ({
      status: 409,
      body: { error: "A Grade was changed by someone else. Reload to see the latest side." },
    }));
    renderHub();
    fireEvent.click(await screen.findByTestId("chip-900"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(screen.getByTestId("hub-announcer").textContent).toBe(
        "Not saved: A Grade was changed by someone else. Reload to see the latest side.",
      ),
    );
    // Back in the pool, not in A Grade.
    const a = screen.getByTestId("side-1");
    expect(within(a).queryByTestId("chip-900")).toBeNull();
    expect(screen.getByTestId("chip-900")).toBeTruthy();
  });

  it("a pointer drag from the pool onto a full side's player swaps them in", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    const chip = await screen.findByTestId("chip-900");
    const b = screen.getByTestId("side-2");
    const slot = b.querySelectorAll('[data-drop="slot"]')[3] as HTMLElement;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => slot;
    try {
      fireEvent.pointerDown(chip, {
        button: 0,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: 60 });
      expect(slot.getAttribute("data-drop-state")).toBe("ok");
      fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: 60 });
    } finally {
      document.elementFromPoint = original;
    }
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const put = requests.find((r) => r.method === "PUT")!;
    const change = (
      put.body as { changes: { selectionId: number; slots: { memberId: number }[] }[] }
    ).changes[0];
    expect(change.selectionId).toBe(2);
    expect(change.slots[3].memberId).toBe(900);
    expect(screen.getByTestId("hub-announcer").textContent).toBe(
      "Pool Player in to B Grade, B Grade 4 back to the pool",
    );
  });

  it("dropping on a full side without a target player is refused (AE2)", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    const chip = await screen.findByTestId("chip-900");
    const b = screen.getByTestId("side-2");
    const original = document.elementFromPoint;
    document.elementFromPoint = () => b;
    try {
      fireEvent.pointerDown(chip, {
        button: 0,
        pointerId: 2,
        pointerType: "mouse",
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(document, { pointerId: 2, clientX: 80, clientY: 80 });
      expect(b.getAttribute("data-drop-state")).toBe("no");
      fireEvent.pointerUp(document, { pointerId: 2, clientX: 80, clientY: 80 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(screen.getByTestId("hub-announcer").textContent).toBe(
      "B Grade already has 12. Drop onto a player to swap them out.",
    );
    expect(requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("a touch drag only starts from the grip", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    const chip = await screen.findByTestId("chip-900");
    const a = screen.getByTestId("side-1");
    const original = document.elementFromPoint;
    document.elementFromPoint = () => a;
    try {
      // On the name: no drag, the list can scroll.
      fireEvent.pointerDown(chip.querySelector(".truncate")!, {
        button: 0,
        pointerId: 3,
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(document, { pointerId: 3, clientX: 80, clientY: 80 });
      expect(a.getAttribute("data-drop-state")).toBeNull();
      fireEvent.pointerUp(document, { pointerId: 3 });
      expect(requests.some((r) => r.method === "PUT")).toBe(false);

      // From the grip: the drag starts and lands in A Grade's first open slot.
      fireEvent.pointerDown(chip.querySelector("[data-drag-grip]")!, {
        button: 0,
        pointerId: 4,
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(document, { pointerId: 4, clientX: 80, clientY: 80 });
      expect(a.getAttribute("data-drop-state")).toBe("ok");
      fireEvent.pointerUp(document, { pointerId: 4 });
    } finally {
      document.elementFromPoint = original;
    }
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
  });

  it("Escape cancels a drag", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    const chip = await screen.findByTestId("chip-900");
    const a = screen.getByTestId("side-1");
    const original = document.elementFromPoint;
    document.elementFromPoint = () => a;
    try {
      fireEvent.pointerDown(chip, {
        button: 0,
        pointerId: 5,
        pointerType: "mouse",
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(document, { pointerId: 5, clientX: 50, clientY: 50 });
      expect(document.querySelector("[data-drag-ghost]")).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(document.querySelector("[data-drag-ghost]")).toBeNull();
      expect(a.getAttribute("data-drop-state")).toBeNull();
      fireEvent.pointerUp(document, { pointerId: 5 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(screen.getByTestId("hub-announcer").textContent).toBe("Move cancelled");
    expect(requests.some((r) => r.method === "PUT")).toBe(false);
  });
});

describe("overseas players", () => {
  /** A Grade with its first two players overseas against a cap of `cap`. */
  function overseasBoard(cap: number | null): SelectionBoard {
    const board = makeBoard();
    const a = board.selections[0];
    board.selections[0] = {
      ...a,
      slots: a.slots.map((s, i) => (i < 2 ? { ...s, overseas: true } : s)),
      overseas: { count: 2, cap, over: cap != null && 2 > cap },
    };
    board.selections[1] = {
      ...board.selections[1],
      overseas: { count: 0, cap: null, over: false },
    };
    return board;
  }

  it("badges each overseas player and counts them against the cap, in words", async () => {
    stubApi(overseasBoard(1));
    renderHub();
    const a = await screen.findByTestId("side-1");
    expect(within(a).getAllByText("OS")).toHaveLength(2);
    expect(within(a).getByRole("button", { name: /^A Grade 1, .*overseas player/ })).toBeTruthy();
    expect(within(a).getByTestId("overseas-count").textContent).toBe("Overseas 2/1 (over limit)");
  });

  it("warns in the finalise Heads up when over the cap, and still finalises", async () => {
    const requests = stubApi(overseasBoard(1));
    renderHub();
    const a = await screen.findByTestId("side-1");
    fireEvent.click(within(a).getByRole("button", { name: "Finalise A Grade" }));
    expect(within(a).getByText(/Finalise A Grade with 9 players\?/).textContent).toMatch(
      /Heads up: .*overseas 2 \/ cap 1\./,
    );
    fireEvent.click(within(a).getByRole("button", { name: "Finalise and notify" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && r.url.includes("/finalise"))).toBe(true),
    );
  });

  it("within the cap there is no warning", async () => {
    stubApi(overseasBoard(2));
    renderHub();
    const a = await screen.findByTestId("side-1");
    expect(within(a).getByTestId("overseas-count").textContent).toBe("Overseas 2/2");
    fireEvent.click(within(a).getByRole("button", { name: "Finalise A Grade" }));
    expect(within(a).getByText(/Finalise A Grade with 9 players\?/).textContent).not.toMatch(
      /overseas/,
    );
  });

  it("a grade with no cap and no overseas players shows no change", async () => {
    stubApi(overseasBoard(null));
    renderHub();
    const b = await screen.findByTestId("side-2");
    expect(within(b).queryByTestId("overseas-count")).toBeNull();
    expect(within(b).queryByText("OS")).toBeNull();
  });

  it("the badge moves with the player and the count follows", () => {
    const board = overseasBoard(1);
    const state = { selections: board.selections, pool: board.pool };
    const moved = applyMove(state, {
      kind: "move",
      memberId: 100,
      target: { kind: "slot", sideId: 1, index: 10 },
    });
    if (!moved.ok) throw new Error(moved.message);
    const a = moved.state.selections[0];
    expect(a.slots[10]).toMatchObject({ memberId: 100, overseas: true });
    expect(a.overseas).toEqual({ count: 2, cap: 1, over: true });
    const out = applyMove(moved.state, {
      kind: "move",
      memberId: 100,
      target: { kind: "pool" },
    });
    if (!out.ok) throw new Error(out.message);
    expect(out.state.selections[0].overseas).toEqual({ count: 1, cap: 1, over: false });
  });
});

describe("Focus and Board (selection hub redesign)", () => {
  const chip = (label: string) =>
    within(screen.getByTestId("grade-chip-bar"))
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith(label) && b.hasAttribute("title"))!;
  const shownSides = () =>
    within(screen.getByRole("main", { name: "Teams" }))
      .queryAllByRole("article")
      .map((a) => a.getAttribute("data-side-id"));

  it("starts on one grade on a narrow screen; chips add and drop grades, never below one", async () => {
    localStorage.clear();
    stubApi(makeBoard());
    renderHub();
    await screen.findByTestId("side-1");
    expect(shownSides()).toEqual(["1"]);

    fireEvent.click(chip("B"));
    expect(shownSides()).toEqual(["1", "2"]);
    fireEvent.click(chip("A"));
    expect(shownSides()).toEqual(["2"]);
    // The last grade on screen can't be switched off.
    fireEvent.click(chip("B"));
    expect(shownSides()).toEqual(["2"]);
    expect(JSON.parse(localStorage.getItem("selection-hub-view:senior")!)).toEqual({
      view: "focus",
      focused: [2],
    });
  });

  it("Board shows every side, and a chip there jumps to Focus on that grade", async () => {
    localStorage.clear();
    stubApi(makeBoard());
    renderHub();
    await screen.findByTestId("side-1");
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(shownSides()).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.click(chip("C"));
    expect(shownSides()).toEqual(["3"]);
    expect(screen.getByRole("button", { name: "Focus" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("flags a grade that still needs a captain, a keeper or a replacement", async () => {
    const board = makeBoard();
    board.selections[0].warnings = { ...board.selections[0].warnings, noCaptain: true };
    stubApi(board);
    renderHub();
    await screen.findByTestId("side-1");
    expect(chip("A").getAttribute("title")).toMatch(/no captain/);
    expect(within(chip("A")).getByLabelText("Needs attention")).toBeTruthy();
  });
});

describe("pool in the admin side panel (selection hub redesign)", () => {
  it("renders the pool into the sidebar slot and reports the unpicked count", async () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    const setCount = vi.fn();
    stubApi(makeBoard());
    renderAt(
      <AdminSidebarSlotContext.Provider value={{ node, setCount }}>
        <SelectionHub />
      </AdminSidebarSlotContext.Provider>,
      "/admin/selection",
    );
    await screen.findByTestId("side-1");
    const pool = await within(node).findByRole("complementary", { name: "Player pool" });
    expect(pool).toBeTruthy();
    expect(screen.getAllByRole("complementary", { name: "Player pool" })).toHaveLength(1);
    // The sidebar copy drops the long instructions for a one-line footer.
    expect(within(pool).getByText(/Tap a player to add them to a side/)).toBeTruthy();
    await waitFor(() => expect(setCount).toHaveBeenLastCalledWith(3));
    node.remove();
  });

  it("stays inline when there's no sidebar slot (mobile, Menu mode, captain area)", async () => {
    stubApi(makeBoard());
    renderHub();
    await screen.findByTestId("side-1");
    const pool = screen.getByRole("complementary", { name: "Player pool" });
    expect(pool.className).toMatch(/rounded-lg/);
  });
});
