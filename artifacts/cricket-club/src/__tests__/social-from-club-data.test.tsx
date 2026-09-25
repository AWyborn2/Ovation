/**
 * Social assets from the club's own data (every club type): the queue's
 * season-recap / round-up trigger, the "Draft past matches" dialog, the club's
 * grades in the match picker, and the milestone / premiership prefills.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { PrefillPanel } from "@/components/card-forms/prefill-panels";
import {
  milestoneItemToState,
  premiershipSeasonYear,
  premiershipToState,
} from "@/components/card-forms/prefill";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };
type Route = { method?: string; match: RegExp; reply: (req: Req) => unknown };

function stubApi(routes: Route[]): Req[] {
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
      const route = routes.find((r) => (r.method ?? "GET") === method && r.match.test(url));
      const payload = route ? route.reply(req) : [];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

// A WA-style club: its grades are not the fixed PCA list.
const CLUB_GRADES = [{ grade: "1st Grade" }, { grade: "2nd Grade" }];

const match = (id: number, grade: string, season: number, round: number) => ({
  id,
  grade,
  season,
  round,
  stage: null,
  competition: null,
  matchDate: null,
  venue: null,
  result: "Won",
  opponent: `Rivals ${id}`,
  clubScore: null,
  opponentScore: null,
  abandoned: false,
  playerCount: 11,
  opponentClub: null,
});

const MATCHES = [
  match(101, "1st Grade", 2024, 3),
  match(102, "1st Grade", 2024, 2),
  match(103, "2nd Grade", 2024, 1),
  match(90, "1st Grade", 2023, 9),
];

/** GET /matches filtered like the API: by grade and season query params. */
function listMatches(req: Req) {
  const q = new URL(req.url, "http://x").searchParams;
  return MATCHES.filter(
    (m) =>
      (!q.get("grade") || m.grade === q.get("grade")) &&
      (!q.get("season") || m.season === Number(q.get("season"))),
  );
}

const queueRoutes = (extra: Route[] = []): Route[] => [
  ...extra,
  { match: /\/api\/social-drafts\/pending-count/, reply: () => ({ count: 0 }) },
  { match: /\/api\/social-drafts(\?|$)/, reply: () => [] },
  {
    match: /\/api\/social-settings/,
    reply: () => ({ settings: { clubUrl: "", lastSweepAt: null }, captionTemplates: [] }),
  },
  { match: /\/api\/grades(\?|$)/, reply: () => CLUB_GRADES },
  { match: /\/api\/matches(\?|$)/, reply: listMatches },
];

describe("queue: create from your club's data", () => {
  it("offers the club's own grades and seasons and triggers a season recap", async () => {
    const requests = stubApi(
      queueRoutes([
        {
          method: "POST",
          match: /\/api\/social-recaps$/,
          reply: () => [{ id: 1 }, { id: 2 }],
        },
      ]),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");

    const gradeSelect = (await screen.findByLabelText("Grade", {
      selector: "#gen-grade",
    })) as HTMLSelectElement;
    await waitFor(() =>
      expect([...gradeSelect.options].map((o) => o.value)).toEqual(["1st Grade", "2nd Grade"]),
    );
    const seasonSelect = screen.getByLabelText("Season", {
      selector: "#gen-season",
    }) as HTMLSelectElement;
    await waitFor(() =>
      expect([...seasonSelect.options].map((o) => o.textContent)).toEqual(["2024/25", "2023/24"]),
    );

    fireEvent.click(screen.getByRole("button", { name: /season recap/i }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.method === "POST" && /social-recaps/.test(r.url))?.body,
      ).toEqual({ grade: "1st Grade", season: 2024 }),
    );
    expect(await screen.findByText(/2 season recap cards drafted/i)).toBeInTheDocument();
  });

  it("draft past matches: pick a season, untick a match, and draft the rest", async () => {
    const requests = stubApi(
      queueRoutes([
        {
          method: "POST",
          match: /\/api\/social-drafts\/backfill-matches$/,
          reply: () => ({ considered: 2, drafted: 2, skipped: 0, capped: false, errors: [] }),
        },
      ]),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");

    fireEvent.click(await screen.findByRole("button", { name: /draft past matches/i }));
    const dialog = await screen.findByRole("dialog");
    const matches = await within(dialog).findByRole("group", { name: "Matches" });
    // Season defaults to the newest; every match of that season across grades is listed.
    await waitFor(() => expect(within(matches).getAllByRole("checkbox")).toHaveLength(3));
    expect(within(matches).queryByText(/Rivals 90/)).toBeNull();

    // Grade picker lists the club's grades.
    const grade = within(dialog).getByLabelText("Grade") as HTMLSelectElement;
    expect([...grade.options].map((o) => o.value)).toEqual(["", "1st Grade", "2nd Grade"]);

    fireEvent.click(within(matches).getByLabelText(/Rivals 103/));
    fireEvent.click(within(dialog).getByRole("button", { name: /draft 2 matches/i }));

    await waitFor(() =>
      expect(
        requests.find((r) => r.method === "POST" && /backfill-matches/.test(r.url))?.body,
      ).toEqual({ season: 2024, matchIds: [101, 102] }),
    );
    expect(await within(dialog).findByText(/2 match result cards drafted/i)).toBeInTheDocument();
  });

  it("draft past matches: a re-run reports nothing new", async () => {
    stubApi(
      queueRoutes([
        {
          method: "POST",
          match: /\/api\/social-drafts\/backfill-matches$/,
          reply: () => ({ considered: 3, drafted: 0, skipped: 3, capped: false, errors: [] }),
        },
      ]),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    fireEvent.click(await screen.findByRole("button", { name: /draft past matches/i }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: /draft 3 matches/i })).toBeEnabled(),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /draft 3 matches/i }));
    expect(await within(dialog).findByText(/nothing new to draft/i)).toBeInTheDocument();
  });
});

describe("create a card: prefills", () => {
  it("the match picker lists the club's grades, not a fixed list", async () => {
    stubApi(queueRoutes());
    renderAt(<PrefillPanel kind="century" onApply={() => {}} />, "/admin/social/create");
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      expect([...selects[0].options].map((o) => o.value)).toEqual(["1st Grade", "2nd Grade"]);
    });
    expect(screen.queryByRole("option", { name: "A Grade" })).toBeNull();
  });

  it("milestone prefill applies a career crossing from the club's milestone feed", async () => {
    stubApi([
      {
        match: /\/api\/milestones$/,
        reply: () => ({
          recencyWeeks: 4,
          featured: false,
          items: [
            {
              id: "century|x|1",
              kind: "century",
              playerId: 1,
              playerName: "Ignored Century",
              label: "104 runs",
              value: 104,
              significance: 400,
              recent: false,
            },
            {
              id: "career|runs|1000|g",
              kind: "career",
              playerId: 41,
              playerName: "R Star",
              season: 2024,
              boardKey: "runs",
              tierIndex: 0,
              label: "1000 career runs",
              value: 1050,
              threshold: 1000,
              significance: 100,
              recent: false,
            },
          ],
        }),
      },
    ]);
    const onApply = vi.fn();
    renderAt(<PrefillPanel kind="milestone" onApply={onApply} />, "/admin/social/create");
    const select = await screen.findByRole("combobox");
    await waitFor(() => expect((select as HTMLSelectElement).options).toHaveLength(2));
    fireEvent.change(select, { target: { value: "career|runs|1000|g" } });
    fireEvent.click(screen.getByRole("button", { name: /prefill/i }));
    expect(onApply).toHaveBeenCalledWith({
      playerName: "R Star",
      tierLabel: "1000 Runs",
      tierIndex: 0,
      milestoneLabel: "Career Runs",
      currentValue: 1050,
      threshold: 1000,
      headline: "1000 career runs",
    });
  });

  it("premiership prefill applies one of the club's premierships", async () => {
    stubApi([
      {
        match: /\/api\/premierships$/,
        reply: () => [
          {
            id: 5,
            year: 2025,
            grade: "1st Grade",
            competition: "Premier Shield",
            matchDate: "2025-03-15",
            result: "Won by 40 runs",
            mom: "R Star",
            players: [],
          },
        ],
      },
    ]);
    const onApply = vi.fn();
    renderAt(<PrefillPanel kind="premiership" onApply={onApply} />, "/admin/social/create");
    const select = await screen.findByRole("combobox");
    await screen.findByRole("option", { name: "2024/25 1st Grade — Premier Shield" });
    fireEvent.change(select, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /prefill/i }));
    expect(onApply).toHaveBeenCalledWith({
      grade: "1st Grade",
      year: 2024,
      competition: "Premier Shield",
      result: "Won by 40 runs",
      mom: "R Star",
    });
  });
});

describe("prefill mappers", () => {
  it("maps a career item, clamping the tier index to the card's range", () => {
    expect(
      milestoneItemToState({
        id: "x",
        kind: "career",
        playerId: 0,
        playerName: "A B",
        boardKey: "wickets",
        tierIndex: 9,
        label: "",
        value: 301,
        threshold: 300,
        significance: 0,
        recent: false,
      }),
    ).toMatchObject({ tierLabel: "300 Wickets", tierIndex: 6, milestoneLabel: "Career Wickets" });
  });

  it("puts a premiership in the season its final closed", () => {
    expect(premiershipSeasonYear({ year: 2025, matchDate: "2025-03-15" })).toBe(2024);
    expect(premiershipSeasonYear({ year: 2024, matchDate: "2024-12-01" })).toBe(2024);
    expect(premiershipSeasonYear({ year: 2025, matchDate: null })).toBe(2024);
    expect(
      premiershipToState({
        id: 1,
        year: 2025,
        grade: "A Grade",
        competition: "C",
        matchDate: null,
        result: null,
        mom: null,
        players: [],
      }),
    ).toEqual({ grade: "A Grade", year: 2024, competition: "C", result: "", mom: "" });
  });
});
