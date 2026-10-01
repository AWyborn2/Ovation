import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import type {
  ClubCorrection,
  ClubCorrectionMatch,
  ClubCorrectionMatchDetail,
} from "@workspace/api-client-react";
import { ADMIN_NAV } from "@/lib/admin-nav";
import AdminCorrections from "./admin-corrections";

/**
 * Corrections screen (hybrid stats plan U16): a club admin picks one of the
 * club's matches, a player line in it and a figure, sees the association's
 * current value, enters the corrected one with a note; the list shows active
 * and stale corrections with Remove.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const MATCH: ClubCorrectionMatch = {
  matchId: 11,
  playhqMatchId: "phq-11",
  season: 2024,
  grade: "A Grade",
  round: "3",
  matchDate: "2024-11-02",
  opponent: "Opp CC",
  clubScore: "5/150",
  opponentScore: "10/120",
};

const DETAIL: ClubCorrectionMatchDetail = {
  match: MATCH,
  lines: [
    {
      participantId: "ann-guid",
      displayName: "Ann Able",
      isPrivate: false,
      figures: [
        { field: "runs", value: 40, correction: null },
        { field: "balls_bowled", value: 60, correction: null },
        { field: "catches", value: 1, correction: { id: 5, previousValue: 1, newValue: 2 } },
      ],
    },
    { participantId: "priv-guid", displayName: "Pat Private", isPrivate: true, figures: [] },
  ],
};

const correction = (over: Partial<ClubCorrection>): ClubCorrection => ({
  id: 1,
  playhqMatchId: "phq-11",
  participantId: "ann-guid",
  field: "runs",
  previousValue: 40,
  newValue: 45,
  note: "Scorer's book",
  createdBy: "admin:owner",
  createdAt: "2026-09-30T00:00:00.000Z",
  status: "active",
  staleReason: null,
  centralValue: 40,
  displayName: "Ann Able",
  isPrivate: false,
  match: MATCH,
  ...over,
});

type Write = { url: string; method: string; body: unknown };

function setupApi(overrides: Record<string, unknown>): Write[] {
  installApiMock(overrides);
  const base = globalThis.fetch as unknown as (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Write[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      }
      return base(input, init);
    }),
  );
  return writes;
}

describe("admin corrections", () => {
  it("is reachable from the People admin group, next to duplicate players", () => {
    const people = ADMIN_NAV.find((g) => g.key === "people")!;
    const values = people.tabs.map((t) => t.value);
    expect(values).toContain("corrections");
    expect(values.indexOf("corrections")).toBe(values.indexOf("duplicates") + 1);
    expect(people.tabs.find((t) => t.value === "corrections")!.path).toBe(
      "/admin/people/corrections",
    );
  });

  it("lists active and stale corrections, with the stale reason", async () => {
    setupApi({
      "/club-corrections": [
        correction({}),
        correction({
          id: 2,
          field: "wickets",
          previousValue: 3,
          newValue: 4,
          status: "stale",
          staleReason: "mismatch",
          centralValue: 2,
        }),
      ],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");

    const active = await screen.findByTestId("correction-1");
    expect(within(active).getByText("Ann Able")).toBeTruthy();
    expect(within(active).getByText(/Runs/)).toBeTruthy();
    expect(within(active).getByText(/40 → 45/)).toBeTruthy();
    expect(within(active).getByText("Applied")).toBeTruthy();
    expect(within(active).getByText(/Scorer's book/)).toBeTruthy();
    const stale = screen.getByTestId("correction-2");
    expect(within(stale).getByText("Not applied")).toBeTruthy();
    expect(within(stale).getByText(/association now shows 2/i)).toBeTruthy();
  });

  it("remove asks first, then deletes the correction", async () => {
    const writes = setupApi({ "/club-corrections": [correction({ id: 7 })] });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    const card = await screen.findByTestId("correction-7");
    fireEvent.click(within(card).getByRole("button", { name: /remove/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove correction" }));
    await waitFor(() =>
      expect(writes).toContainEqual(
        expect.objectContaining({ method: "DELETE", url: "/api/club-corrections/7" }),
      ),
    );
  });

  it("new correction: pick a match, a player and a figure, see the current value, save", async () => {
    const writes = setupApi({
      "/club-corrections/matches/11": DETAIL,
      "/club-corrections/matches": [MATCH],
      "/club-corrections": [],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");

    fireEvent.click(await screen.findByRole("tab", { name: /new correction/i }));
    fireEvent.change(screen.getByLabelText(/find a match/i), { target: { value: "opp" } });
    fireEvent.click(await screen.findByRole("button", { name: /Opp CC/ }));

    fireEvent.change(await screen.findByLabelText(/player/i), {
      target: { value: "ann-guid" },
    });
    // The admin sees a private player's real name, marked private.
    expect(screen.getByRole("option", { name: "Pat Private (private)" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^private player$/i })).toBeNull();
    fireEvent.change(screen.getByLabelText(/figure/i), { target: { value: "runs" } });
    expect(screen.getByTestId("current-value").textContent).toContain("40");

    fireEvent.change(screen.getByLabelText(/corrected value/i), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Scorer's book" } });
    fireEvent.click(screen.getByRole("button", { name: /save correction/i }));

    await waitFor(() =>
      expect(writes).toContainEqual({
        url: "/api/club-corrections",
        method: "POST",
        body: {
          playhqMatchId: "phq-11",
          participantId: "ann-guid",
          field: "runs",
          previousValue: 40,
          newValue: 55,
          note: "Scorer's book",
        },
      }),
    );
  });

  it("shows bowling in overs, sends balls, and flags a figure that already has a correction", async () => {
    const writes = setupApi({
      "/club-corrections/matches/11": DETAIL,
      "/club-corrections/matches": [MATCH],
      "/club-corrections": [],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    fireEvent.click(await screen.findByRole("tab", { name: /new correction/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Opp CC/ }));
    fireEvent.change(await screen.findByLabelText(/player/i), { target: { value: "ann-guid" } });

    fireEvent.change(screen.getByLabelText(/figure/i), { target: { value: "catches" } });
    expect(screen.getByText(/replaces the correction in force \(1 → 2\)/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/figure/i), { target: { value: "balls_bowled" } });
    expect(screen.getByTestId("current-value").textContent).toContain("10.0 overs");
    fireEvent.change(screen.getByLabelText(/corrected value/i), { target: { value: "54" } });
    expect(screen.getByText(/9\.0 overs/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save correction/i }));
    await waitFor(() =>
      expect(writes).toContainEqual(
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({ field: "balls_bowled", previousValue: 60, newValue: 54 }),
        }),
      ),
    );
  });

  it("won't save an unchanged value", async () => {
    const writes = setupApi({
      "/club-corrections/matches/11": DETAIL,
      "/club-corrections/matches": [MATCH],
      "/club-corrections": [],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    fireEvent.click(await screen.findByRole("tab", { name: /new correction/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Opp CC/ }));
    fireEvent.change(await screen.findByLabelText(/player/i), { target: { value: "ann-guid" } });
    fireEvent.change(screen.getByLabelText(/figure/i), { target: { value: "runs" } });
    fireEvent.change(screen.getByLabelText(/corrected value/i), { target: { value: "40" } });
    expect(
      (screen.getByRole("button", { name: /save correction/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(writes).toEqual([]);
  });

  it("lists a private player's correction under their real name with a private badge", async () => {
    setupApi({
      "/club-corrections": [
        correction({ id: 9, displayName: "Pat Private", isPrivate: true, participantId: "p" }),
      ],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    const card = await screen.findByTestId("correction-9");
    expect(within(card).getByText("Pat Private")).toBeTruthy();
    expect(within(card).getByText("Private")).toBeTruthy();
    expect(within(card).queryByText("Private player")).toBeNull();
  });

  it("tells a club still on its own stats that corrections won't show publicly yet", async () => {
    setupApi({
      "/club-corrections/status": { appliedToPublicPages: false },
      "/club-corrections": [],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    const notice = await screen.findByTestId("corrections-native-notice");
    expect(notice.textContent).toMatch(/saved/i);
    expect(notice.textContent).toMatch(/switches to association data/i);
    // Saving isn't blocked: the New correction tab is still there.
    expect(screen.getByRole("tab", { name: /new correction/i })).toBeTruthy();
  });

  it("shows no such notice for a club on association data", async () => {
    setupApi({
      "/club-corrections/status": { appliedToPublicPages: true },
      "/club-corrections": [],
    });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    expect(await screen.findByText(/no corrections/i)).toBeTruthy();
    expect(screen.queryByTestId("corrections-native-notice")).toBeNull();
  });

  it("shows an empty state when the club has no corrections", async () => {
    setupApi({ "/club-corrections": [] });
    renderAt(<AdminCorrections />, "/admin/people/corrections");
    expect(await screen.findByText(/no corrections/i)).toBeTruthy();
  });
});
