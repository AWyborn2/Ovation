/**
 * Selection Hub page (plan 2026-10-06-002 U9): the Move dialog's
 * destinations, read-only final cards, and the keyboard/tap move path
 * through to the versioned board save — plus a refused save reverting and
 * a pointer drag landing on a slot.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import type { SelectionBoard, SelectionMember, SelectionSide } from "@workspace/api-client-react";
import SelectionHub from "@/pages/selection-hub";
import { renderAt } from "@/test/render";
import { moveOptions } from "./move-dialog";
import { sideWarnings } from "./apply-move";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    warnings: sideWarnings({ slots, captainMemberId: null, keeperMemberId: null } as SelectionSide),
    ...opts,
  };
  return { ...s, warnings: sideWarnings(s) };
}

function makeBoard(): SelectionBoard {
  return {
    section: "senior",
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
        detail: {},
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
  it.each(["admin", "captain"] as const)("lets a %s open comparison without leaving the board", async kind => {
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
  });

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
    const ids = () => within(screen.getByRole("main", { name: "Teams" }))
      .getAllByRole("article").map(el => el.getAttribute("data-side-id"));
    expect(ids()).toEqual(["3", "1", "2"]);
    fireEvent.click(screen.getByTestId("chip-900"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(requests.some(r => r.method === "PUT")).toBe(true));
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
    expect(screen.getByText("A Grade draft built from the side's last game")).toBeTruthy();
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
