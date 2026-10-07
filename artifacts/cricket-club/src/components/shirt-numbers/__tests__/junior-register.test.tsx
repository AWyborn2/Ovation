/**
 * Season shirt numbers U10 — the juniors register UI: the juniors admin page
 * hides the register for clubs without junior players (central-read clubs)
 * and while the shared feature switch is off; when on, it manages the season
 * through /api/juniors/shirt-numbers only, with no held entries; the junior
 * adapter sends junior-shaped bodies; and the junior profile shows the
 * current number and past numbers.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Route } from "wouter";
import AdminJuniorShirtNumbers from "@/pages/admin-junior-shirt-numbers";
import JuniorsPlayerDetail from "@/pages/juniors-player-detail";
import { juniorShirtNumberApi } from "@/components/shirt-numbers/junior-api";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };
type Route_ = { method?: string; match: RegExp; reply: (req: Req) => unknown };

function stubApi(routes: Route_[]): Req[] {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      const route = routes.find((r) => (r.method ?? "GET") === method && r.match.test(url));
      const payload = route ? route.reply({ method, url, body }) : {};
      return new Response(JSON.stringify(payload ?? null), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const SETTINGS_ON = { enabled: true, duplicatePolicy: "warn", rolloverPolicy: "carry" };
const overview = (players: number) => ({
  totals: { matches: players, players, premierships: 0, seasons: 1, ageGroups: 1 },
  latestSeason: null,
  recentMatches: [],
  topRunScorers: [],
  topWicketTakers: [],
});
const juniorEntry = (id: number, name: string, number: string | null, duplicate = false) => ({
  id,
  season: 2026,
  participantId: `guid-${id}`,
  name,
  number,
  source: "upload",
  duplicate,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
});
const isRegisterList = (url: string) => /\/api\/(juniors\/)?shirt-numbers(\?|$)/.test(url);

describe("Admin junior shirt numbers page", () => {
  it("hides the register for a club with no junior players (central-read clubs)", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(0) },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    expect(await screen.findByText(/no junior players/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(requests.some((r) => isRegisterList(r.url))).toBe(false);
  });

  it("points to the shared settings while the feature is off and fetches no register", async () => {
    const requests = stubApi([
      {
        match: /\/api\/shirt-numbers\/settings$/,
        reply: () => ({ ...SETTINGS_ON, enabled: false }),
      },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(40) },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    expect(await screen.findByText(/turned off/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shirt numbers/i })).toHaveAttribute(
      "href",
      "/admin/honours/shirt-numbers",
    );
    // No settings switch here: one switch covers both registers.
    expect(screen.queryByRole("switch")).toBeNull();
    expect(requests.some((r) => isRegisterList(r.url))).toBe(false);
  });

  it("manages the juniors register through the junior routes only, with no held entries", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(40) },
      {
        match: /\/api\/juniors\/shirt-numbers\?season=/,
        reply: () => ({
          season: 2026,
          seasons: [2026],
          entries: [
            juniorEntry(1, "Amy Archer", "7", true),
            juniorEntry(2, "Ben Bowler", "7", true),
          ],
        }),
      },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    expect(await screen.findByText("Amy Archer")).toBeInTheDocument();
    expect(screen.getByText(/current season/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^held/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /link to player/i })).toBeNull();
    expect(
      requests.filter((r) => isRegisterList(r.url)).every((r) => /\/juniors\//.test(r.url)),
    ).toBe(true);

    // Adding requires picking a junior player: no free-text name.
    fireEvent.click(screen.getByRole("button", { name: /add person/i }));
    expect(await screen.findByPlaceholderText(/search junior players/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
  });
});

describe("Junior register adapter", () => {
  it("creates by participant, edits only name and number, never holds upload rows, adds the squad via juniors", async () => {
    const requests = stubApi([
      {
        method: "POST",
        match: /\/api\/juniors\/shirt-numbers$/,
        reply: () => ({ entry: juniorEntry(9, "Cal", "3"), warnings: [] }),
      },
      {
        method: "PATCH",
        match: /\/api\/juniors\/shirt-numbers\/9$/,
        reply: () => ({ entry: juniorEntry(9, "Cal", "4"), warnings: [] }),
      },
      {
        method: "POST",
        match: /\/api\/juniors\/shirt-numbers\/seasons\/2026\/from-squad$/,
        reply: () => ({ season: 2026, created: 1, skipped: 0, unmatched: [], warnings: [] }),
      },
      {
        method: "POST",
        match: /\/api\/juniors\/shirt-numbers\/uploads\/5\/commit$/,
        reply: () => ({
          uploadId: 5,
          created: 1,
          updated: 0,
          linked: 1,
          held: 0,
          discarded: 2,
          warnings: [],
        }),
      },
    ]);
    await juniorShirtNumberApi.createEntry({
      season: 2026,
      name: "Cal",
      participantId: "guid-9",
      number: "3",
    });
    await juniorShirtNumberApi.updateEntry(9, { number: "4", playerId: 12, participantId: "x" });
    await juniorShirtNumberApi.commitUpload(5, [
      { rowIndex: 1, action: "link", participantId: "guid-1" },
      { rowIndex: 2, action: "hold" },
      { rowIndex: 3, action: "discard" },
    ]);
    await expect(
      juniorShirtNumberApi.createEntry({ season: 2026, name: "No One", number: null }),
    ).rejects.toThrow(/junior player/i);
    expect(await juniorShirtNumberApi.addSquad(2026)).toMatchObject({ created: 1 });

    const [create, patch, commit, squad] = requests;
    expect(create).toMatchObject({
      method: "POST",
      body: { season: 2026, participantId: "guid-9", name: "Cal", number: "3" },
    });
    expect(patch!.body).toEqual({ number: "4" });
    expect(commit!.body).toEqual({
      resolutions: [
        { rowIndex: 1, action: "link", participantId: "guid-1" },
        { rowIndex: 2, action: "discard" },
        { rowIndex: 3, action: "discard" },
      ],
    });
    expect(squad).toMatchObject({
      method: "POST",
      url: expect.stringMatching(/\/api\/juniors\/shirt-numbers\/seasons\/2026\/from-squad$/),
    });
    expect(requests.every((r) => /\/api\/juniors\//.test(r.url))).toBe(true);
    expect(juniorShirtNumberApi.supportsHeld).toBe(false);
  });
});

describe("Junior player profile shirt numbers", () => {
  const player = (extra: object = {}) => ({
    participantId: "junior-1",
    displayName: "Amy Archer",
    firstSeason: "2023/24",
    lastSeason: "2026/27",
    teams: "Under 13",
    seniorPlayerId: null,
    batting: { matches: 1, innings: 1, runs: 10, notOuts: 0, highScore: "10", average: 10 },
    bowling: { matches: 1, wickets: 0, runs: 5, maidens: 0, economy: 5 },
    seasons: [],
    matches: [],
    ...extra,
  });
  const show = (body: object) => {
    stubApi([{ match: /\/api\/juniors\/players\/junior-1$/, reply: () => body }]);
    renderAt(
      <Route path="/juniors/players/:id" component={JuniorsPlayerDetail} />,
      "/juniors/players/junior-1",
    );
  };

  it("shows the current number and the past numbers", async () => {
    show(
      player({
        shirtNumber: "07",
        shirtNumbers: [
          { season: 2026, number: "07" },
          { season: 2024, number: "12" },
        ],
      }),
    );
    expect(await screen.findByTestId("junior-shirt-number")).toHaveTextContent("#07");
    expect(screen.getByLabelText("Shirt number 07")).toBeInTheDocument();
    expect(screen.getByTestId("junior-shirt-history")).toHaveTextContent(
      "2026/27 #07 · 2024/25 #12",
    );
  });

  it("shows past numbers with no current number, and nothing when the feature is off", async () => {
    show(player({ shirtNumber: null, shirtNumbers: [{ season: 2024, number: "12" }] }));
    expect(await screen.findByTestId("junior-shirt-history")).toHaveTextContent("2024/25 #12");
    expect(screen.queryByTestId("junior-shirt-number")).toBeNull();
    cleanup();
    vi.unstubAllGlobals();

    show(player());
    expect(await screen.findByRole("heading", { name: "Amy Archer" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("junior-shirt-number")).toBeNull());
    expect(screen.queryByTestId("junior-shirt-history")).toBeNull();
  });
});
