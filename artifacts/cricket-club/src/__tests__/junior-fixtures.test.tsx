import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { Route } from "wouter";
import { renderAt } from "@/test/render";
import JuniorsFixtures, { JuniorsFixtureDetail } from "@/pages/juniors-fixtures";
import AdminJuniorFixtures from "@/pages/admin-junior-fixtures";

/**
 * Junior fixtures and team lists — public page and admin editor (junior PlayHQ
 * sync plan U6; R8, R9, R15, R17, R23).
 */

type Sent = { url: string; method: string; body: unknown };

/** Stub fetch with canned GET payloads (first matching key wins) and record writes. */
function stubApi(routes: [string, unknown][], writeReply?: unknown): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        sent.push({ url, method, body });
        return new Response(JSON.stringify(writeReply ?? {}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const hit = routes.find(([needle]) => url.includes(needle));
      return new Response(JSON.stringify(hit ? hit[1] : []), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return sent;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fixture = (id: number, ageGroup: string, extra: Record<string, unknown> = {}) => ({
  id,
  seasonStartYear: 2026,
  ageGroup,
  grade: `${ageGroup} Gold`,
  teamName: "Hawks",
  opponentName: `Eagles ${id}`,
  venue: "Oval 1",
  startAt: "2026-11-07T00:30:00.000Z",
  isHome: true,
  status: "UPCOMING",
  hasTeamList: false,
  ...extra,
});

describe("Junior fixtures (public)", () => {
  it("lists upcoming games with an age-group filter and links to each game", async () => {
    stubApi([
      ["ageGroup=Year", [fixture(2, "Year 10")]],
      ["/juniors/fixtures", [fixture(1, "Year 6", { hasTeamList: true }), fixture(2, "Year 10")]],
    ]);
    renderAt(<JuniorsFixtures />, "/juniors/fixtures");
    expect(await screen.findByText("Hawks vs Eagles 1")).toBeTruthy();
    expect(screen.getByText("Team named")).toBeTruthy();
    const link = screen.getByTestId("junior-fixture-1").closest("a");
    expect(link?.getAttribute("href")).toBe("/juniors/fixtures/1");

    const select = screen.getByTestId("select-age-group") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", "Year 6", "Year 10"]);
    fireEvent.change(select, { target: { value: "Year 10" } });
    expect(await screen.findByText("Hawks vs Eagles 2")).toBeTruthy();
    expect(screen.queryByText("Hawks vs Eagles 1")).toBeNull();
  });

  it("shows an empty state when there are no games (or junior sync is off)", async () => {
    stubApi([["/juniors/fixtures", []]]);
    renderAt(<JuniorsFixtures />, "/juniors/fixtures");
    expect(await screen.findByText("No upcoming junior games")).toBeTruthy();
  });

  it("shows the published team list with public names and withholds private players", async () => {
    stubApi([
      [
        "/juniors/fixtures/1",
        {
          fixture: fixture(1, "Year 6", { hasTeamList: true }),
          teamList: [
            { order: 1, name: "Ollie G", participantId: "p-ollie", role: "C", shirtNumber: "7" },
            {
              order: 2,
              name: "Private Player",
              participantId: null,
              role: null,
              shirtNumber: null,
            },
          ],
        },
      ],
    ]);
    renderAt(
      <Route path="/juniors/fixtures/:id" component={JuniorsFixtureDetail} />,
      "/juniors/fixtures/1",
    );
    const list = await screen.findByTestId("junior-team-list");
    const ollie = within(list).getByText("Ollie G");
    expect(ollie.closest("a")?.getAttribute("href")).toBe("/juniors/players/p-ollie");
    expect(within(list).getByText("7")).toBeTruthy();
    const hidden = within(list).getByText("Private Player");
    expect(hidden.closest("a")).toBeNull();
  });

  it("says when no team has been named", async () => {
    stubApi([["/juniors/fixtures/3", { fixture: fixture(3, "Year 6"), teamList: null }]]);
    renderAt(
      <Route path="/juniors/fixtures/:id" component={JuniorsFixtureDetail} />,
      "/juniors/fixtures/3",
    );
    expect(await screen.findByTestId("no-team-list")).toBeTruthy();
  });
});

const ADMIN_VIEW = {
  fixture: fixture(1, "Year 6", { hasTeamList: true }),
  season: 2026,
  shirtNumbersEnabled: true,
  teamList: {
    players: [
      {
        order: 1,
        participantId: "p-ollie",
        name: "Ollie Gallash",
        role: "C",
        shirtNumber: "7",
        isPrivate: false,
        isKnown: true,
      },
      {
        order: 2,
        participantId: "p-sam",
        name: "Sam Hidden",
        role: null,
        shirtNumber: null,
        isPrivate: true,
        isKnown: true,
      },
    ],
    isPublished: true,
    source: "playhq",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  candidates: [
    {
      participantId: "p-kit",
      name: "Kit Carson",
      isPrivate: false,
      shirtNumber: "21",
      teams: "Hawks",
      lastSeason: "2026/27",
    },
    {
      participantId: "p-ollie",
      name: "Ollie Gallash",
      isPrivate: false,
      shirtNumber: "7",
      teams: "Hawks",
      lastSeason: "2026/27",
    },
  ],
};

describe("Junior fixtures (admin)", () => {
  const routes: [string, unknown][] = [
    ["/juniors/fixtures/1/team-list", ADMIN_VIEW],
    ["/juniors/fixtures", [fixture(1, "Year 6", { hasTeamList: true })]],
  ];

  it("renders inside the admin tab group without its own h1", async () => {
    stubApi(routes);
    const { container } = renderAt(<AdminJuniorFixtures />, "/admin/people/junior-fixtures");
    expect(await screen.findByText("Hawks vs Eagles 1")).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("shows each player's season shirt number and flags a withheld player", async () => {
    stubApi(routes);
    renderAt(<AdminJuniorFixtures />, "/admin/people/junior-fixtures");
    fireEvent.click(await screen.findByRole("button", { name: "Team list" }));
    const row1 = await screen.findByTestId("junior-team-list-row-1");
    expect(within(row1).getByText("Ollie Gallash")).toBeTruthy();
    expect(within(row1).getByTestId("shirt-number").textContent).toBe("#7");
    const row2 = screen.getByTestId("junior-team-list-row-2");
    // Admins see the full name, with the public withholding flagged.
    expect(within(row2).getByText("Sam Hidden")).toBeTruthy();
    expect(within(row2).getByText("Private")).toBeTruthy();
    expect(screen.getByTestId("shirt-number-banner").textContent).toContain("1 selected player");
    expect(screen.getByTestId("team-list-source").textContent).toContain("PlayHQ");
  });

  it("adds, reorders, removes and saves the club's own players", async () => {
    const sent = stubApi(routes, {
      ...ADMIN_VIEW,
      teamList: { ...ADMIN_VIEW.teamList, source: "admin" },
    });
    renderAt(<AdminJuniorFixtures />, "/admin/people/junior-fixtures");
    fireEvent.click(await screen.findByRole("button", { name: "Team list" }));
    await screen.findByTestId("junior-team-list-row-1");

    // Search offers only players not already on the list.
    fireEvent.change(screen.getByLabelText("Add a junior player"), { target: { value: "a" } });
    const offered = screen.getByTestId("junior-candidates");
    expect(within(offered).queryByText("Ollie Gallash")).toBeNull();
    fireEvent.click(within(offered).getByText("Kit Carson"));
    const row3 = screen.getByTestId("junior-team-list-row-3");
    expect(within(row3).getByText("Kit Carson")).toBeTruthy();
    expect(within(row3).getByTestId("shirt-number").textContent).toBe("#21");

    // Kit keeps wicket; move Kit above Sam; drop Sam.
    fireEvent.click(within(row3).getByRole("button", { name: "WK" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Kit Carson up" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Sam Hidden" }));

    fireEvent.click(screen.getByRole("button", { name: "Save team list" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: "PUT",
      body: {
        isPublished: true,
        players: [
          { order: 1, participantId: "p-ollie", role: "C" },
          { order: 2, participantId: "p-kit", role: "WK" },
        ],
      },
    });
    expect(sent[0]!.url).toContain("/juniors/fixtures/1/team-list");
  });
});
