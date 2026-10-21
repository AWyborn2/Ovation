/**
 * Create a Card prefills from the server's content builders (ADR-010 P7): the
 * match result and team list cards an admin makes by hand start as exactly the
 * card the sweep would queue (`SocialCardPrefill.input`, which the API's
 * `social-card-parity.db.test.ts` holds equal to the auto-queued draft). Here:
 * the panel applies that input unchanged, so the built card is that input.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { PrefillPanel } from "@/components/card-forms/prefill-panels";
import { buildCardInput, initialCardState } from "@/components/card-forms/logic";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubApi(routes: Array<[RegExp, unknown]>): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      urls.push(url);
      const route = routes.find(([re]) => re.test(url));
      return new Response(JSON.stringify(route ? route[1] : []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return urls;
}

/** The sweep's team list input: a side of 13 with shirt numbers, a debut and an overseas mark. */
const TEAM_LIST = {
  kind: "teamList",
  gradeRound: "A GRADE — ROUND 3",
  competitionLine: "A Grade",
  venueDateTime: "Club Oval • SAT 10 OCT • 12:30 PM",
  players: Array.from({ length: 13 }, (_, i) => ({
    order: i + 1,
    surname: `PLAYER${i + 1}`,
    firstInitial: "J",
    ...(i === 0 ? { role: "C" } : {}),
    ...(i === 2 ? { debut: true } : {}),
    ...(i === 3 ? { overseas: true } : {}),
    shirtNumber: String(i + 10),
  })),
  grade: "A Grade",
  roundLabel: "ROUND 3",
  opponent: "Mandurah Cricket Club",
  opponentLogoUrl: "https://crest.test/m.png",
  homeAway: "HOME",
  venue: "Club Oval",
  date: "SAT 10 OCT",
  startTime: "12:30 PM",
  numbering: "shirt",
};

/** The sweep's match result input. */
const RESULT = {
  kind: "matchSummary",
  matchTitle: "A Grade • Round 3",
  roundLabel: "Round 3",
  matchType: "One Day",
  date: "Sat 10 Oct 2026",
  venue: "Club Oval",
  result: "Our Club won by 24 runs",
  resultWinner: "club",
  club: {
    name: "Our Club",
    primaryColor: "#000",
    secondaryColor: "#fff",
    textColor: "#fff",
    logoUrl: null,
  },
  opposition: {
    name: "Mandurah Cricket Club",
    primaryColor: "#111",
    secondaryColor: "#eee",
    textColor: "#fff",
    logoUrl: null,
  },
  innings: [
    {
      teamKey: "club",
      inningsNum: 1,
      totalRuns: "180",
      wickets: "6",
      overs: "50",
      topBatters: [{ name: "J. Smith", runs: 72 }],
      topBowlers: [],
    },
  ],
};

const FIXTURE = {
  id: 7,
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Mandurah Cricket Club",
  venue: "Club Oval",
  isHome: true,
  startAt: "2026-10-10T04:30:00Z",
  source: "manual",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("Create a Card: built from the same content builders as the queue (P7)", () => {
  it("a team list card is the card the team list sweep queues", async () => {
    const urls = stubApi([
      [/\/api\/social-prefill\/team-list\/7$/, { input: TEAM_LIST, warnings: [] }],
      [/\/api\/fixtures/, [FIXTURE]],
      [/\/api\/grades/, [{ grade: "A Grade" }]],
    ]);
    const onApply = vi.fn();
    renderAt(<PrefillPanel kind="teamList" onApply={onApply} />, "/admin/social/create");
    await screen.findByRole("option", { name: /A Grade vs Mandurah/ });
    const fixtureSelect = screen.getAllByRole("combobox")[1]!;
    fireEvent.change(fixtureSelect, { target: { value: "7" } });
    const button = screen.getByRole("button", { name: /prefill/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(urls.some((u) => /\/api\/social-prefill\/team-list\/7$/.test(u))).toBe(true);
    // Applied over the starting form, the card is the queued card, side of 13 and all.
    const applied = onApply.mock.calls[0]![0];
    const card = buildCardInput("teamList", { ...initialCardState("teamList"), ...applied }, false);
    expect(JSON.parse(JSON.stringify(card))).toEqual(TEAM_LIST);
  });

  it("a fixture with no saved list fills the heading and keeps the players in the form", async () => {
    const heading = { ...TEAM_LIST, players: [] };
    stubApi([
      [/\/api\/social-prefill\/team-list\/7$/, { input: heading, warnings: ["No list"] }],
      [/\/api\/fixtures/, [FIXTURE]],
    ]);
    const onApply = vi.fn();
    renderAt(<PrefillPanel kind="teamList" onApply={onApply} />, "/admin/social/create");
    await screen.findByRole("option", { name: /A Grade vs Mandurah/ });
    fireEvent.change(screen.getAllByRole("combobox")[1]!, { target: { value: "7" } });
    const button = screen.getByRole("button", { name: /prefill/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(onApply.mock.calls[0]![0]).not.toHaveProperty("players");
    expect(onApply.mock.calls[0]![0]).toMatchObject({ gradeRound: "A GRADE — ROUND 3" });
  });

  it("a match result card is the card the results sweep queues", async () => {
    const urls = stubApi([
      [/\/api\/social-prefill\/match-summary\/11$/, { input: RESULT, warnings: [] }],
      [
        /\/api\/matches(\?|$)/,
        [
          {
            id: 11,
            grade: "A Grade",
            season: 2026,
            round: 3,
            stage: null,
            competition: null,
            matchDate: null,
            venue: null,
            result: "Won",
            opponent: "Mandurah",
          },
        ],
      ],
      [/\/api\/grades/, [{ grade: "A Grade" }]],
    ]);
    const onApply = vi.fn();
    renderAt(<PrefillPanel kind="matchSummary" onApply={onApply} />, "/admin/social/create");
    await screen.findByRole("option", { name: /vs Mandurah/ });
    fireEvent.change(screen.getAllByRole("combobox")[2]!, { target: { value: "11" } });
    const button = screen.getByRole("button", { name: /prefill/i });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(urls.some((u) => /\/api\/social-prefill\/match-summary\/11$/.test(u))).toBe(true);
    // The sample's own headline is cleared: the card is exactly the queued one.
    const applied = onApply.mock.calls[0]![0];
    const card = buildCardInput(
      "matchSummary",
      { ...initialCardState("matchSummary"), ...applied },
      false,
    );
    expect(JSON.parse(JSON.stringify(card))).toEqual(RESULT);
  });
});
