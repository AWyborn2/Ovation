/**
 * Season shirt numbers U10 — the juniors register UI: the juniors admin page
 * hides the register for clubs without junior players (central-read clubs)
 * unless junior sync is on, and while the shared feature switch is off; when
 * on, it manages the season through /api/juniors/shirt-numbers only, with
 * entries held by PlayHQ Profile ID until their player arrives; the upload
 * preview groups held rows, Profile IDs that belong to someone else and
 * numbers that differ from the senior register; the junior adapter sends
 * junior-shaped bodies; and the junior profile shows the current number and
 * past numbers.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
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
const juniorEntry = (
  id: number,
  name: string,
  number: string | null,
  duplicate = false,
  extra: object = {},
) => ({
  id,
  season: 2026,
  participantId: `guid-${id}`,
  name,
  number,
  source: "upload",
  duplicate,
  linkStatus: "linked",
  playerName: name,
  suggestedLink: null,
  crossRegister: [],
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  ...extra,
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
    // Only the availability check: no season's register is fetched.
    expect(requests.some((r) => /\/juniors\/shirt-numbers\?season=/.test(r.url))).toBe(false);
  });

  it("keeps a register before the juniors arrive when junior sync is on", async () => {
    stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(0) },
      {
        match: /\/api\/juniors\/shirt-numbers(\?|$)/,
        reply: () => ({
          season: 2026,
          seasons: [2026],
          juniorsAvailable: true,
          seniorNumbers: [],
          entries: [
            juniorEntry(1, "Mia Newcomb", "12", false, {
              linkStatus: "waiting",
              playerName: null,
            }),
          ],
        }),
      },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    expect(await screen.findByText("Mia Newcomb")).toBeInTheDocument();
    expect(screen.getByText("Waiting for PlayHQ")).toBeInTheDocument();
    expect(screen.queryByText(/no junior players/i)).toBeNull();
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

  it("manages the juniors register through the junior routes only", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(40) },
      {
        match: /\/api\/juniors\/shirt-numbers\?season=/,
        reply: () => ({
          season: 2026,
          seasons: [2026],
          juniorsAvailable: true,
          seniorNumbers: [{ participantId: "guid-77", number: "9" }],
          entries: [
            juniorEntry(1, "Amy Archer", "7", true),
            juniorEntry(2, "Ben Bowler", "7", true, {
              crossRegister: [{ relation: "same", name: "Ben Bowler", number: "3" }],
            }),
          ],
        }),
      },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    expect(await screen.findByText("Amy Archer")).toBeInTheDocument();
    expect(screen.getByText(/current season/i)).toBeInTheDocument();
    // A dual player's senior number is tagged, and flagged when it differs.
    expect(screen.getByText(/senior #3 · differs/i)).toBeInTheDocument();
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

  it("flags held entries: waiting, a name mismatch to check, and a one-click suggested link", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(40) },
      {
        match: /\/api\/juniors\/shirt-numbers\?season=/,
        reply: () => ({
          season: 2026,
          seasons: [2026],
          juniorsAvailable: true,
          seniorNumbers: [],
          entries: [
            juniorEntry(3, "Cohen Buller", "8", false, {
              linkStatus: "nameMismatch",
              playerName: "Hayes Buller",
              suggestedLink: { participantId: "guid-cohen", name: "Cohen Buller" },
            }),
          ],
        }),
      },
      {
        method: "PATCH",
        match: /\/api\/juniors\/shirt-numbers\/3$/,
        reply: () => ({ entry: juniorEntry(3, "Cohen Buller", "8"), warnings: [] }),
      },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    expect(await screen.findByText("Name mismatch — check")).toBeInTheDocument();
    expect(screen.getByText("PlayHQ: Hayes Buller")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Link to Cohen Buller" }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({
        participantId: "guid-cohen",
      }),
    );
  });
});

describe("Junior upload preview", () => {
  const row = (rowIndex: number, name: string, extra: object) => ({
    rowIndex,
    name,
    participantId: null,
    number: null,
    status: "matched",
    playerId: null,
    candidates: [],
    existingEntryId: null,
    existingNumber: null,
    numberChange: false,
    duplicate: false,
    duplicateWith: [],
    errors: [],
    crossRegister: [],
    ...extra,
  });
  const preview = {
    id: 7,
    side: "junior",
    kind: "numbers",
    season: 2026,
    fileName: "juniors.csv",
    unrecognisedHeaders: [],
    errors: [],
    truncated: false,
    counts: {
      total: 4,
      matched: 2,
      suggested: 0,
      new: 0,
      held: 1,
      mismatch: 1,
      invalid: 0,
      numberChanges: 0,
      duplicates: 0,
    },
    rows: [
      row(1, "Mia Newcomb", { status: "held", participantId: "guid-mia", number: "12" }),
      row(2, "Hayes Buller", {
        status: "mismatch",
        participantId: "guid-cohen",
        number: "3",
        idOwnerName: "Cohen Buller",
        candidates: [{ participantId: "guid-hayes", playerId: null, name: "Hayes Buller" }],
        crossRegister: [
          { relation: "sharedId", name: "Cohen Buller", number: "8" },
          { relation: "nameOnly", name: "Hayes Buller", number: "3" },
        ],
      }),
      row(3, "Ben Dual", {
        participantId: "guid-ben",
        number: "48",
        crossRegister: [{ relation: "same", name: "Ben Dual", number: "6" }],
      }),
      row(4, "Archie Same", {
        participantId: "guid-archie",
        number: "70",
        crossRegister: [{ relation: "same", name: "Archie Same", number: "70" }],
      }),
    ],
  };

  it("groups held and someone-else's-id rows, and offers the senior number only for the same person", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/juniors\/overview$/, reply: () => overview(40) },
      {
        match: /\/api\/juniors\/shirt-numbers\?season=/,
        reply: () => ({
          season: 2026,
          seasons: [2026],
          juniorsAvailable: true,
          seniorNumbers: [],
          entries: [],
        }),
      },
      { method: "POST", match: /\/api\/juniors\/shirt-numbers\/uploads$/, reply: () => preview },
      {
        method: "POST",
        match: /\/api\/juniors\/shirt-numbers\/uploads\/7\/commit$/,
        reply: () => ({
          uploadId: 7,
          created: 4,
          updated: 0,
          linked: 3,
          held: 1,
          discarded: 0,
          warnings: [],
        }),
      },
    ]);
    renderAt(<AdminJuniorShirtNumbers />, "/admin/honours/junior-shirt-numbers");
    fireEvent.click(await screen.findByRole("button", { name: /upload file/i }));
    const input = screen.getByLabelText("File");
    fireEvent.change(input, {
      target: { files: [new File(["Name,Number\n"], "juniors.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload and preview/i }));

    const held = await screen.findByRole("region", { name: "Waiting for PlayHQ" });
    expect(within(held).getByText("Mia Newcomb")).toBeInTheDocument();
    expect(
      screen.getByText(
        /linked automatically when this player appears in a team list or scorecard/i,
      ),
    ).toBeInTheDocument();

    const mismatch = screen.getByRole("region", { name: "Profile ID belongs to someone else" });
    expect(within(mismatch).getByText(/profile id belongs to cohen buller/i)).toBeInTheDocument();
    expect(
      within(mismatch).getByText(/profile id shared with cohen buller in the senior register/i),
    ).toBeInTheDocument();
    // A mismatch must be decided before applying.
    const apply = screen.getByRole("button", { name: /apply to register/i });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Decision for Hayes Buller"), {
      target: { value: "link:g:guid-hayes" },
    });
    expect(apply).toBeEnabled();

    // Only the same person with another number is offered the senior number.
    const differs = screen.getByRole("region", { name: "Different from senior number" });
    expect(within(differs).getByText("Ben Dual")).toBeInTheDocument();
    expect(within(differs).queryByText("Archie Same")).toBeNull();
    expect(within(differs).queryByText("Hayes Buller")).toBeNull();
    expect(screen.getByText("Also senior #70")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Number for Ben Dual"), { target: { value: "use" } });

    fireEvent.click(apply);
    await waitFor(() => expect(requests.some((r) => /\/commit$/.test(r.url))).toBe(true));
    const commit = requests.find((r) => /\/commit$/.test(r.url))!;
    expect(commit.body).toEqual({
      resolutions: [
        { rowIndex: 2, action: "link", participantId: "guid-hayes" },
        {
          rowIndex: 3,
          action: "link",
          participantId: "guid-ben",
          useCrossRegisterNumber: true,
        },
      ],
    });
  });
});

describe("Junior register adapter", () => {
  it("creates by participant, edits name, number and link, holds by Profile ID, adds the squad via juniors", async () => {
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
    // Never a senior player id; a participant id links (and confirms) the entry.
    expect(patch!.body).toEqual({ number: "4", participantId: "x" });
    expect(commit!.body).toEqual({
      resolutions: [
        { rowIndex: 1, action: "link", participantId: "guid-1" },
        { rowIndex: 2, action: "hold" },
        { rowIndex: 3, action: "discard" },
      ],
    });
    expect(squad).toMatchObject({
      method: "POST",
      url: expect.stringMatching(/\/api\/juniors\/shirt-numbers\/seasons\/2026\/from-squad$/),
    });
    expect(requests.every((r) => /\/api\/juniors\//.test(r.url))).toBe(true);
    expect(juniorShirtNumberApi.supportsHeld).toBe(true);
    expect(juniorShirtNumberApi.holdOnlyByProfileId).toBe(true);
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
