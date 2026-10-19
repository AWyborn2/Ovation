/**
 * Recording an answer given in person from the Selection Hub (ADR-008 §3): the
 * player's dialog offers Yes / Maybe / No and a note for the round's weekend,
 * says who set an admin-recorded answer, and works with availability off. A
 * junior's answer is recorded from the Juniors board only.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import type { SelectionBoard, SelectionMember } from "@workspace/api-client-react";
import SelectionHub from "@/pages/selection-hub";
import { renderAt } from "@/test/render";
import { eventText } from "./labels";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function member(id: number, name: string, opts: Partial<SelectionMember> = {}): SelectionMember {
  return {
    id,
    displayName: name,
    status: "none",
    note: null,
    lastGrade: "A Grade",
    junior: false,
    section: "senior",
    isPrivate: false,
    repliedAt: null,
    late: false,
    statusSource: null,
    statusSetBy: null,
    ...opts,
  };
}

function makeBoard(availability: boolean, pool: SelectionMember[]): SelectionBoard {
  const slots = Array.from({ length: 12 }, () => ({ memberId: null, member: null, gap: null }));
  return {
    section: "senior",
    availability,
    actor: { kind: "admin", name: "Ash", selectionRule: "captains_own_grade", canRemind: true },
    round: {
      roundId: 7,
      weekendDate: "2026-10-24",
      sendAt: "2026-10-19T10:00:00.000Z",
      reminderAt: "2026-10-21T10:00:00.000Z",
      cutoffAt: "2026-10-22T10:00:00.000Z",
      finaliseAt: "2026-10-23T12:00:00.000Z",
      sendStartedAt: null,
      reminderStartedAt: null,
      cutoffStartedAt: null,
      cutoffCompletedAt: null,
      counts: { yes: 0, maybe: 0, no: 0, none: 0, late: 0, total: 0 },
    },
    selections: [
      {
        id: 1,
        roundId: 7,
        fixture: {
          kind: "senior",
          id: 10,
          grade: "A Grade",
          opponentName: "Riverside",
          startAt: "2026-10-24T05:00:00.000Z",
          venue: null,
          isHome: true,
          roundLabel: "Round 7",
        },
        date: "2026-10-24",
        state: "draft",
        version: 1,
        slots,
        captainMemberId: null,
        keeperMemberId: null,
        finalisedAt: null,
        finalisedBy: null,
        canEdit: true,
        canFinalise: true,
        readOnlyReason: null,
        playhqPlayers: null,
        warnings: {
          filled: 0,
          open: 11,
          twelfth: false,
          unconfirmed: 0,
          saidNo: 0,
          noCaptain: true,
          noKeeper: true,
        },
      },
    ],
    pool,
    events: [],
  };
}

type Req = { method: string; url: string; body: unknown };

function stubApi(board: SelectionBoard, after: SelectionBoard) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      const payload =
        url.includes("/api/selection/board") && method === "GET"
          ? board
          : url.includes("/status") && method === "PUT"
            ? after
            : [];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const renderHub = () => renderAt(<SelectionHub />, "/admin/selection");

describe("recording an answer given in person", () => {
  it("records Yes, Maybe or No with a note for the round's weekend, with availability off", async () => {
    const before = makeBoard(false, [member(900, "Dee Dunn")]);
    const after = makeBoard(false, [
      member(900, "Dee Dunn", {
        status: "no",
        note: "away for work",
        statusSource: "admin",
        statusSetBy: "Ash",
      }),
    ]);
    const requests = stubApi(before, after);
    renderHub();
    fireEvent.click(await screen.findByTestId("chip-900"));
    const dialog = screen.getByRole("dialog");
    const control = within(dialog).getByTestId("status-control");
    expect(within(control).getByTestId("status-set-by")).toHaveTextContent("No answer yet");
    const record = within(control).getByRole("button", { name: "Record answer" });
    expect(record).toBeDisabled();
    fireEvent.click(within(control).getByRole("button", { name: "No" }));
    fireEvent.change(within(control).getByLabelText(/Note/), {
      target: { value: " away for work " },
    });
    fireEvent.click(record);
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const put = requests.find((r) => r.method === "PUT")!;
    expect(put.url).toContain("/api/selection/members/900/status");
    expect(put.body).toEqual({ weekend: "2026-10-24", status: "no", note: "away for work" });
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByTestId("status-set-by")).toHaveTextContent(
        "Set by Ash",
      ),
    );
  });

  it("shows who set an admin-recorded answer, and a player's own as theirs", async () => {
    const board = makeBoard(true, [
      member(900, "Dee Dunn", { status: "yes", statusSource: "admin", statusSetBy: "Cal" }),
      member(901, "Eve Eng", { status: "maybe", statusSource: "member" }),
    ]);
    stubApi(board, board);
    renderHub();
    fireEvent.click(await screen.findByTestId("chip-900"));
    expect(within(screen.getByRole("dialog")).getByTestId("status-set-by")).toHaveTextContent(
      "Set by Cal",
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Yes", pressed: true }),
    ).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByTestId("chip-901"));
    expect(within(screen.getByRole("dialog")).getByTestId("status-set-by")).toHaveTextContent(
      "From the player",
    );
  });

  it("sends a junior playing up to the Juniors board", async () => {
    const board = makeBoard(true, [member(902, "Jo Junior", { section: "junior", junior: true })]);
    stubApi(board, board);
    renderHub();
    // Juniors are listed apart on the senior board, collapsed.
    const juniors = await screen.findByRole("region", { name: "Juniors" });
    fireEvent.click(within(juniors).getByRole("button", { expanded: false }));
    fireEvent.click(await screen.findByTestId("chip-902"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByTestId("status-control")).toBeNull();
    expect(within(dialog).getByTestId("status-control-junior")).toBeInTheDocument();
  });
});

describe("change log", () => {
  it("describes a recorded answer", () => {
    expect(
      eventText({
        id: 1,
        selectionId: null,
        grade: "",
        actorKind: "admin",
        actorName: "Ash",
        action: "status_set",
        detail: { memberId: 900, name: "Dee Dunn", status: "no", note: "away for work" },
        createdAt: "2026-10-20T01:00:00.000Z",
      }),
    ).toBe('Dee Dunn recorded as unavailable by Ash ("away for work")');
  });
});
