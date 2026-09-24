/**
 * Social Studio U21 (People batch) — admin list pages on the data table and
 * edit drawer: rows list, search and filter chips narrow them, a row opens the
 * drawer, saving calls the existing update mutation, delete asks first, and an
 * empty list shows the empty state.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminPlayers from "@/pages/admin-players";
import AdminPeople from "@/pages/admin-people";
import AdminCommittee from "@/pages/admin-committee";
import AdminCaptains from "@/pages/admin-captains";
import AdminJuniorPlayers from "@/pages/admin-junior-players";
import AdminStats from "@/pages/admin-stats";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };
type Route = { method?: string; match: RegExp; reply: (req: Req) => unknown };

/** A method-aware fetch stub that records every request. */
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

const table = (name: string) => screen.findByRole("table", { name });
const drawer = () => screen.getByRole("dialog");

describe("Players", () => {
  const PLAYERS = {
    players: [
      {
        id: 1,
        surname: "Keeper",
        givenName: "Sam",
        deceased: false,
        totalGames: 40,
        totalRuns: 1200,
        totalWickets: 3,
        cardRole: null,
        cardRating: null,
      },
    ],
    total: 1,
    page: 1,
    limit: 25,
  };

  it("lists players, opens the drawer and saves through the update mutation", async () => {
    const requests = stubApi([
      { match: /\/api\/players\?/, reply: () => PLAYERS },
      { match: /\/api\/players\/1$/, reply: () => ({ ...PLAYERS.players[0], stats: [] }) },
      { method: "PATCH", match: /\/api\/players\/1$/, reply: () => PLAYERS.players[0] },
    ]);
    renderAt(<AdminPlayers />, "/admin/people");
    fireEvent.click(within(await table("Players")).getByText("Keeper, Sam"));
    const surname = within(drawer()).getByLabelText("Surname");
    fireEvent.change(surname, { target: { value: "Keepers" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toMatchObject({ surname: "Keepers" });
    });
  });

  it("asks before deleting a player with stats", async () => {
    const requests = stubApi([
      { match: /\/api\/players\?/, reply: () => PLAYERS },
      { match: /\/api\/players\/1$/, reply: () => ({ ...PLAYERS.players[0], stats: [] }) },
      { method: "DELETE", match: /\/api\/players\/1$/, reply: () => ({}) },
    ]);
    renderAt(<AdminPlayers />, "/admin/people");
    fireEvent.click(within(await table("Players")).getByText("Keeper, Sam"));
    fireEvent.click(within(drawer()).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Delete player with stats?")).toBeTruthy();
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(requests.some((r) => r.method === "DELETE")).toBe(true));
  });

  it("shows the empty state when there are no players", async () => {
    stubApi([
      { match: /\/api\/players\?/, reply: () => ({ players: [], total: 0, page: 1, limit: 25 }) },
    ]);
    renderAt(<AdminPlayers />, "/admin/people");
    expect(await screen.findByText("No players found")).toBeTruthy();
  });
});

describe("Non-player people", () => {
  const PEOPLE = [
    { id: 1, name: "Raquel Willey", bio: "Secretary for a decade" },
    { id: 2, name: "Tom Brand", bio: null },
  ];

  it("search narrows the rows", async () => {
    stubApi([{ match: /\/api\/people$/, reply: () => PEOPLE }]);
    renderAt(<AdminPeople />, "/admin/people/non-players");
    const t = await table("Non-player people");
    expect(within(t).getByText("Tom Brand")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search people"), {
      target: { value: "raquel" },
    });
    expect(within(t).queryByText("Tom Brand")).toBeNull();
    expect(within(t).getByText("Raquel Willey")).toBeTruthy();
  });

  it("saving in the drawer calls the update mutation", async () => {
    const requests = stubApi([
      { match: /\/api\/people$/, reply: () => PEOPLE },
      { method: "PATCH", match: /\/api\/people\/2$/, reply: () => PEOPLE[1] },
    ]);
    renderAt(<AdminPeople />, "/admin/people/non-players");
    fireEvent.click(within(await table("Non-player people")).getByText("Tom Brand"));
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ name: "Tom Brand", bio: null });
    });
  });

  it("shows the empty state with no people", async () => {
    stubApi([{ match: /\/api\/people$/, reply: () => [] }]);
    renderAt(<AdminPeople />, "/admin/people/non-players");
    expect(await screen.findByText("No non-player people yet")).toBeTruthy();
  });
});

describe("Committee (season roles board)", () => {
  const ROLES = [
    {
      id: 1,
      season: 2025,
      role: "President",
      grade: null,
      name: "Jo Smith",
      playerId: null,
      nonPlayerId: null,
      displayOrder: 0,
      published: true,
    },
    {
      id: 2,
      season: 2024,
      role: "Treasurer",
      grade: null,
      name: "Ali Chen",
      playerId: null,
      nonPlayerId: null,
      displayOrder: 0,
      published: false,
    },
  ];

  it("filters to drafts and opens a role in the drawer", async () => {
    stubApi([{ match: /\/api\/club-roles\/all/, reply: () => ROLES }]);
    renderAt(<AdminCommittee />, "/admin/people/committee");
    const t = await table("Role records");
    expect(within(t).getByText("Jo Smith")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(within(t).queryByText("Jo Smith")).toBeNull();
    fireEvent.click(within(t).getByText("Ali Chen"));
    expect(within(drawer()).getByText("Edit Treasurer")).toBeTruthy();
  });

  it("publishing a season updates only that season's drafts", async () => {
    const requests = stubApi([
      { match: /\/api\/club-roles\/all/, reply: () => ROLES },
      { method: "PATCH", match: /\/api\/club-roles\/2$/, reply: () => ROLES[1] },
    ]);
    renderAt(<AdminCommittee />, "/admin/people/committee");
    await table("Role records");
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "2024" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish all" }));
    await waitFor(() => {
      const patches = requests.filter((r) => r.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(patches[0].body).toEqual({ published: true });
    });
  });
});

describe("Captains", () => {
  it("opens a captain in the drawer and saves grades through the update mutation", async () => {
    const requests = stubApi([
      {
        match: /\/api\/captains$/,
        reply: () => [{ id: 3, username: "agrade", displayName: "A Grade Cap", grades: [] }],
      },
      { method: "PATCH", match: /\/api\/captains\/3$/, reply: () => ({}) },
    ]);
    renderAt(<AdminCaptains />, "/admin/people/captains");
    const t = await table("Captains");
    expect(within(t).getByText("No grades")).toBeTruthy();
    fireEvent.click(within(t).getByText("A Grade Cap"));
    fireEvent.click(within(drawer()).getByLabelText("B Grade"));
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toMatchObject({ grades: ["B Grade"] });
    });
  });
});

describe("Junior players", () => {
  const JUNIORS = [
    {
      participantId: "g-1",
      displayName: "Olly Mason",
      isPrivate: true,
      seniorPlayerId: null,
      firstSeason: "2022/23",
      lastSeason: "2024/25",
      matches: 20,
      runs: 300,
      wickets: 4,
    },
    {
      participantId: "g-2",
      displayName: "Charlie Tan",
      isPrivate: false,
      seniorPlayerId: 9,
      firstSeason: "2023/24",
      lastSeason: "2023/24",
      matches: 5,
      runs: 40,
      wickets: 1,
    },
  ];

  it("carries the public-name note, filters private players and renames in the drawer", async () => {
    const requests = stubApi([
      { match: /\/api\/juniors\/players/, reply: () => JUNIORS },
      { method: "PATCH", match: /\/api\/juniors\/participants\/g-2$/, reply: () => ({}) },
    ]);
    renderAt(<AdminJuniorPlayers />, "/admin/people/junior-players");
    expect(screen.getByText(/Public junior pages show each player/)).toBeTruthy();
    const t = await table("Junior players");
    fireEvent.click(screen.getByRole("button", { name: "Private" }));
    expect(within(t).queryByText("Charlie Tan")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Private" }));
    fireEvent.click(within(t).getByText("Charlie Tan"));
    fireEvent.change(within(drawer()).getByLabelText("Display name"), {
      target: { value: "Charlie T" },
    });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Rename" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ displayName: "Charlie T" });
    });
  });
});

describe("Stats", () => {
  it("opens a stat row in the drawer with a link to the full editor", async () => {
    stubApi([
      {
        match: /\/api\/stats\?/,
        reply: () => ({
          stats: [
            {
              id: 11,
              surname: "Keeper",
              givenName: "Sam",
              grade: "A Grade",
              games: 10,
              runs: 400,
              wickets: 2,
              batAvg: 40,
              bowlAvg: null,
            },
          ],
          total: 1,
          page: 1,
          limit: 25,
        }),
      },
    ]);
    renderAt(<AdminStats />, "/admin/people/stats");
    fireEvent.click(within(await table("Stat records")).getByText("Keeper, Sam"));
    expect(
      within(drawer()).getByRole("link", { name: "Open full editor" }).getAttribute("href"),
    ).toBe("/stats/11");
  });
});
