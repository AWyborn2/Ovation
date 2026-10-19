/**
 * Private Player matching in the Selection Hub (ADR-008 §4): an open slot
 * whose PlayHQ row matched nobody offers "Match to squad member" with a member
 * picker, sending the side's version; the club's remembered matches are listed
 * with "Unmatch".
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SelectionBoard, SelectionMember, SelectionSide } from "@workspace/api-client-react";
import SelectionHub from "@/pages/selection-hub";
import { renderAt } from "@/test/render";
import { sideWarnings } from "./apply-move";
import { matchCandidates, unmatchedSlots } from "./player-matches";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GUID = "6f1c2a9e-0000-4000-8000-00000000abcd";

function member(id: number, name: string, extra: Partial<SelectionMember> = {}): SelectionMember {
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
    ...extra,
  };
}

function side(id: number, opts: Partial<SelectionSide> = {}): SelectionSide {
  const slots: SelectionSide["slots"] = Array.from({ length: 12 }, () => ({
    memberId: null,
    member: null,
    gap: null,
  }));
  slots[0] = { memberId: 10, member: member(10, "Adam Smith"), gap: null };
  slots[1] = {
    memberId: null,
    member: null,
    gap: { name: "Private Player", reason: "not_on_register", participantId: GUID },
  };
  slots[2] = {
    memberId: null,
    member: null,
    gap: { name: "Zed Newcomer", reason: "not_on_register" },
  };
  slots[3] = { memberId: null, member: null, gap: { name: "Bo Busy", reason: "no" } };
  const s: SelectionSide = {
    id,
    roundId: 7,
    fixture: {
      kind: "senior",
      id: id * 10,
      grade: "A Grade",
      opponentName: "Mandurah",
      startAt: "2026-10-24T05:00:00.000Z",
      venue: null,
      isHome: true,
      roundLabel: null,
    },
    date: "2026-10-24",
    state: "draft",
    version: 6,
    slots,
    captainMemberId: null,
    keeperMemberId: null,
    finalisedAt: null,
    finalisedBy: null,
    canEdit: true,
    canFinalise: true,
    readOnlyReason: null,
    playhqPlayers: 3,
    warnings: sideWarnings({ slots, captainMemberId: null, keeperMemberId: null } as SelectionSide),
    ...opts,
  };
  return { ...s, warnings: sideWarnings(s) };
}

function makeBoard(): SelectionBoard {
  return {
    section: "senior",
    availability: false,
    actor: { kind: "admin", name: "Pat", selectionRule: "captains_own_grade", canRemind: true },
    round: null,
    selections: [side(1)],
    pool: [
      member(10, "Adam Smith"),
      member(11, "Priya Patel", { isPrivate: true }),
      member(12, "Jess Junior", { section: "junior", junior: true }),
    ],
    events: [],
    participantMatches: [
      {
        participantId: "11111111-2222-4333-8444-555555555555",
        memberId: 13,
        memberName: "Kim Remembered",
        createdBy: "Pat",
        createdAt: "2026-10-18T02:00:00.000Z",
      },
    ],
  };
}

type Req = { method: string; url: string; body: unknown };

function stubApi(board: SelectionBoard, matched: SelectionBoard = board) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      if (method === "DELETE") return new Response(null, { status: 204 });
      const payload = url.includes("/match") ? matched : board;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const renderHub = () => renderAt(<SelectionHub />, "/admin/selection");

describe("unmatchedSlots / matchCandidates", () => {
  it("lists only 'not on register' gaps of editable sides, with the row's participant id", () => {
    const b = makeBoard();
    expect(unmatchedSlots(b.selections).map((u) => [u.slot, u.name, u.participantId])).toEqual([
      [2, "Private Player", GUID],
      [3, "Zed Newcomer", null],
    ]);
    expect(unmatchedSlots([side(2, { canEdit: false })])).toEqual([]);
    expect(unmatchedSlots([side(3, { state: "final" })])).toEqual([]);
  });

  it("offers the pool less anyone already in the side, by name", () => {
    const b = makeBoard();
    expect(matchCandidates(b.selections[0], b.pool).map((m) => m.id)).toEqual([12, 11]);
  });
});

describe("Match to squad member", () => {
  it("matches a Private Player slot to the chosen member with the side's version", async () => {
    const board = makeBoard();
    const after = makeBoard();
    after.selections[0].slots[1] = {
      memberId: 11,
      member: member(11, "Priya Patel"),
      gap: null,
    };
    const requests = stubApi(board, after);
    renderHub();
    const picker = await screen.findByLabelText("Squad member for A Grade slot 2");
    expect(screen.getByText(/Remembered for later PlayHQ lists/)).toBeInTheDocument();
    expect(screen.getByText(/fills this slot only/)).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "11" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Match to squad member" })[0]);
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST" && r.url.includes("/match"))).toBeTruthy(),
    );
    const post = requests.find((r) => r.method === "POST" && r.url.includes("/match"))!;
    expect(post.url).toContain("/api/selection/1/match");
    expect(post.body).toEqual({ slot: 2, memberId: 11, version: 6 });
    await waitFor(() =>
      expect(screen.queryByLabelText("Squad member for A Grade slot 2")).toBeNull(),
    );
  });

  it("lists remembered matches and unmatches one", async () => {
    const requests = stubApi(makeBoard());
    renderHub();
    fireEvent.click(await screen.findByText(/Remembered matches \(1\)/));
    expect(screen.getByText("Kim Remembered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unmatch Kim Remembered" }));
    await waitFor(() => expect(requests.some((r) => r.method === "DELETE")).toBe(true));
    expect(requests.find((r) => r.method === "DELETE")!.url).toContain(
      "/api/squad/13/participants/11111111-2222-4333-8444-555555555555",
    );
  });

  it("shows nothing when every slot is matched and nothing is remembered", async () => {
    const board = makeBoard();
    board.selections[0].slots = board.selections[0].slots.map((s) =>
      s.gap?.reason === "not_on_register" ? { ...s, gap: null } : s,
    );
    board.participantMatches = [];
    stubApi(board);
    renderHub();
    await screen.findByTestId("side-1");
    expect(screen.queryByTestId("player-matches")).toBeNull();
  });
});
