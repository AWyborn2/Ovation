import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { renderAt } from "../test/render";
import { installApiMock } from "../test/mock-api";
import type {
  Fixture,
  ShirtNumberEntry,
  ShirtNumberRegister,
  ShirtNumberSettings,
  TeamList,
} from "@workspace/api-client-react";
import AdminFixtures from "./admin-fixtures";

/**
 * Season shirt numbers U7 (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
 * R10, F3): the team-list editor shows each selected player's season number,
 * flags the unnumbered ones, and numbers them inline. Rows keep their PlayHQ
 * participant id through an admin save.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIXTURE: Fixture = {
  id: 5,
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Rockingham",
  venue: "Home Oval",
  // Saturday 10 Oct 2026 in Perth: the 2026/27 season.
  startAt: "2026-10-10T02:00:00.000Z",
  isHome: true,
  notes: null,
  source: "playhq",
  playhqMatchId: "phq-5",
  createdAt: "2026-10-01T00:00:00.000Z",
};

const HELD_GUID = "0f1e2d3c-aaaa-bbbb-cccc-000000000002";

const TEAM_LIST: TeamList = {
  id: 9,
  fixtureId: 5,
  isPublished: true,
  players: [
    {
      order: 1,
      playerId: 11,
      participantId: "0f1e2d3c-aaaa-bbbb-cccc-000000000001",
      displayName: "Alex Opener",
      role: "C",
    },
    { order: 2, participantId: HELD_GUID, displayName: "Held Debutant" },
    { order: 3, displayName: "Typed Name" },
    { order: 4, playerId: 13, displayName: "Pat Unnumbered" },
  ],
} as TeamList;

const entry = (over: Partial<ShirtNumberEntry>): ShirtNumberEntry => ({
  id: 1,
  season: 2026,
  name: "Someone",
  participantId: null,
  playerId: null,
  number: null,
  source: "admin",
  held: false,
  duplicate: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

const REGISTER: ShirtNumberRegister = {
  season: 2026,
  seasons: [2026],
  entries: [
    entry({ id: 101, name: "Alex Opener", playerId: 11, number: "7" }),
    // Added by the PlayHQ lineup sync, unnumbered and held.
    entry({ id: 102, name: "Held Debutant", participantId: HELD_GUID, held: true }),
  ],
};

type Write = { url: string; method: string; body: unknown };
type Reply = { status: number; body: unknown };

function setupApi(opts: {
  enabled: boolean;
  register?: ShirtNumberRegister;
  reply?: (w: Write) => Reply | undefined;
}): { writes: Write[]; registerReads: () => number } {
  const settings: ShirtNumberSettings = {
    enabled: opts.enabled,
    duplicatePolicy: "warn",
    rolloverPolicy: "carry",
  };
  installApiMock({
    "/fixtures/5/team-list": TEAM_LIST,
    "/fixtures": [FIXTURE],
    "/social-settings": { settings: { seasonStartDate: null } },
    "/shirt-numbers/settings": settings,
    "/shirt-numbers": opts.register ?? REGISTER,
    // The player typeahead's register search.
    "/players?": {
      players: [
        { id: 21, surname: "Debutant", givenName: "Held" },
        { id: 22, surname: "Else", givenName: "Someone" },
      ],
      total: 2,
      page: 1,
      limit: 10,
    },
  });
  const base = globalThis.fetch as unknown as (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Write[] = [];
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "GET" && /\/shirt-numbers\?/.test(url)) reads += 1;
      if (method !== "GET") {
        const w = { url, method, body: init?.body ? JSON.parse(String(init.body)) : null };
        writes.push(w);
        const r = opts.reply?.(w);
        if (r) {
          return new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { "content-type": "application/json" },
          });
        }
      }
      return base(input, init);
    }),
  );
  return { writes, registerReads: () => reads };
}

async function openTeamList() {
  renderAt(<AdminFixtures />, "/admin/social/fixtures");
  fireEvent.click(await screen.findByRole("button", { name: "Team list" }));
  await screen.findByText("Save team list");
}

const row = (n: number) => screen.getByTestId(`team-list-row-${n}`);

describe("team-list editor with season shirt numbers", () => {
  it("shows each row's season number, flags the unnumbered and hints id-less rows", async () => {
    setupApi({ enabled: true });
    await openTeamList();

    await waitFor(() => expect(within(row(1)).getByText("#7")).toBeTruthy());
    const banner = screen.getByTestId("shirt-number-banner");
    expect(banner.textContent).toMatch(/3 selected players have no shirt number/);
    // Rows with a player or PlayHQ id can be numbered inline...
    expect(within(row(2)).getByRole("button", { name: /Assign #/ })).toBeTruthy();
    expect(within(row(4)).getByRole("button", { name: /Assign #/ })).toBeTruthy();
    // ...a free-typed row only gets the hint.
    expect(within(row(3)).queryByRole("button", { name: /Assign #/ })).toBeNull();
    expect(within(row(3)).getByText("Link this player to number them")).toBeTruthy();
    expect(within(row(1)).queryByRole("button", { name: /Assign #/ })).toBeNull();
  });

  it("the banner jumps to the first unnumbered row", async () => {
    setupApi({ enabled: true });
    await openTeamList();
    const banner = await screen.findByTestId("shirt-number-banner");
    fireEvent.click(within(banner).getByRole("button"));
    expect(document.activeElement).toBe(within(row(2)).getByLabelText(/shirt number/i));
  });

  it("assigning numbers a new player with a register entry for the fixture's season", async () => {
    const { writes } = setupApi({
      enabled: true,
      reply: (w) =>
        w.method === "POST"
          ? {
              status: 201,
              body: {
                entry: entry({ id: 103, playerId: 13, name: "Pat Unnumbered", number: "31" }),
                warnings: [],
              },
            }
          : undefined,
    });
    await openTeamList();
    await waitFor(() => within(row(4)).getByLabelText(/shirt number/i));
    fireEvent.change(within(row(4)).getByLabelText(/shirt number/i), { target: { value: "31" } });
    fireEvent.click(within(row(4)).getByRole("button", { name: /Assign #/ }));

    await waitFor(() => expect(writes.some((w) => w.method === "POST")).toBe(true));
    const post = writes.find((w) => w.method === "POST")!;
    expect(post.url).toMatch(/\/api\/shirt-numbers$/);
    expect(post.body).toEqual({
      season: 2026,
      name: "Pat Unnumbered",
      playerId: 13,
      number: "31",
    });
    await waitFor(() => expect(within(row(4)).getByText(/Saved/)).toBeTruthy());
  });

  it("numbers a held player's existing entry rather than adding a second (R16 exception)", async () => {
    const { writes } = setupApi({
      enabled: true,
      reply: (w) =>
        w.method === "PATCH"
          ? {
              status: 200,
              body: {
                entry: entry({ id: 102, participantId: HELD_GUID, number: "31", held: true }),
                warnings: [],
              },
            }
          : undefined,
    });
    await openTeamList();
    await waitFor(() => within(row(2)).getByLabelText(/shirt number/i));
    fireEvent.change(within(row(2)).getByLabelText(/shirt number/i), { target: { value: "31" } });
    fireEvent.click(within(row(2)).getByRole("button", { name: /Assign #/ }));
    await waitFor(() => expect(writes.some((w) => w.method === "PATCH")).toBe(true));
    const patch = writes.find((w) => w.method === "PATCH")!;
    expect(patch.url).toMatch(/\/api\/shirt-numbers\/102$/);
    expect(patch.body).toEqual({ number: "31" });
    expect(writes.some((w) => w.method === "POST")).toBe(false);
  });

  it("offers to link a held entry whose name matches instead of creating a new one", async () => {
    const register: ShirtNumberRegister = {
      ...REGISTER,
      entries: [
        ...REGISTER.entries,
        // Uploaded from the club spreadsheet before Pat had played: held, numbered.
        entry({ id: 104, name: "  pat   UNNUMBERED ", number: "12", held: true }),
      ],
    };
    const { writes } = setupApi({
      enabled: true,
      register,
      reply: (w) =>
        w.method === "PATCH"
          ? {
              status: 200,
              body: {
                entry: entry({ id: 104, playerId: 13, name: "Pat Unnumbered", number: "12" }),
                warnings: [],
              },
            }
          : undefined,
    });
    await openTeamList();
    const link = await within(row(4)).findByRole("button", { name: /Link held entry/ });
    expect(row(4).textContent).toMatch(/#12/);
    fireEvent.click(link);
    await waitFor(() => expect(writes.some((w) => w.method === "PATCH")).toBe(true));
    const patch = writes.find((w) => w.method === "PATCH")!;
    expect(patch.url).toMatch(/\/api\/shirt-numbers\/104$/);
    expect(patch.body).toEqual({ playerId: 13 });
  });

  it("shows the duplicate warning, and a block-policy conflict, on the row", async () => {
    let status = 201;
    const { writes } = setupApi({
      enabled: true,
      reply: (w) => {
        if (w.method !== "POST") return undefined;
        const warning = {
          kind: "duplicate",
          season: 2026,
          number: "7",
          message: "#7 is already worn by Alex Opener in 2026/27.",
          entryIds: [101],
          names: ["Alex Opener"],
        };
        return status === 409
          ? { status: 409, body: { error: warning.message, warnings: [warning] } }
          : {
              status: 201,
              body: {
                entry: entry({ id: 103, playerId: 13, number: "7", duplicate: true }),
                warnings: [warning],
              },
            };
      },
    });
    await openTeamList();
    await waitFor(() => within(row(4)).getByLabelText(/shirt number/i));
    const input = within(row(4)).getByLabelText(/shirt number/i);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.click(within(row(4)).getByRole("button", { name: /Assign #/ }));
    await waitFor(() =>
      expect(within(row(4)).getByText(/already worn by Alex Opener/).className).toMatch(/amber/),
    );

    status = 409;
    fireEvent.change(within(row(4)).getByLabelText(/shirt number/i), {
      target: { value: "7" },
    });
    fireEvent.click(within(row(4)).getByRole("button", { name: /Assign #/ }));
    await waitFor(() =>
      expect(within(row(4)).getByRole("alert").textContent).toMatch(/already worn by Alex Opener/),
    );
    expect(writes.filter((w) => w.method === "POST")).toHaveLength(2);
  });

  it("rejects a number that is not 1-3 digits without a request", async () => {
    const { writes } = setupApi({ enabled: true });
    await openTeamList();
    await waitFor(() => within(row(4)).getByLabelText(/shirt number/i));
    fireEvent.change(within(row(4)).getByLabelText(/shirt number/i), { target: { value: "1234" } });
    fireEvent.click(within(row(4)).getByRole("button", { name: /Assign #/ }));
    expect(within(row(4)).getByRole("alert").textContent).toMatch(/1 to 3 digits/);
    expect(writes).toHaveLength(0);
  });

  it("keeps every row's participantId on save, unnumbered players and all", async () => {
    const { writes } = setupApi({ enabled: true });
    await openTeamList();
    fireEvent.click(screen.getByText("Save team list"));
    await waitFor(() => expect(writes.some((w) => w.method === "PUT")).toBe(true));
    const put = writes.find((w) => w.method === "PUT")!;
    expect(put.url).toMatch(/\/api\/fixtures\/5\/team-list$/);
    expect((put.body as { players: unknown[] }).players).toEqual([
      {
        order: 1,
        playerId: 11,
        participantId: "0f1e2d3c-aaaa-bbbb-cccc-000000000001",
        displayName: "Alex Opener",
        role: "C",
      },
      { order: 2, participantId: HELD_GUID, displayName: "Held Debutant" },
      { order: 3, displayName: "Typed Name" },
      { order: 4, playerId: 13, displayName: "Pat Unnumbered" },
    ]);
  });

  describe("a row's PlayHQ participant id only stays with the same person", () => {
    const savedPlayers = async (writes: Write[]) => {
      fireEvent.click(screen.getByText("Save team list"));
      await waitFor(() => expect(writes.some((w) => w.method === "PUT")).toBe(true));
      return (
        writes.find((w) => w.method === "PUT")!.body as {
          players: { displayName: string; playerId?: number; participantId?: string }[];
        }
      ).players;
    };
    const nameInput = (n: number) => within(row(n)).getByDisplayValue(/./) as HTMLInputElement;

    it("renaming a PlayHQ row to someone else drops its participantId", async () => {
      const { writes } = setupApi({ enabled: true });
      await openTeamList();
      fireEvent.change(nameInput(2), { target: { value: "Someone Else" } });
      const players = await savedPlayers(writes);
      expect(players[1]).toEqual({ order: 2, displayName: "Someone Else" });
    });

    it("a same-name edit (case, spacing) or renaming back keeps it", async () => {
      const { writes } = setupApi({ enabled: true });
      await openTeamList();
      fireEvent.change(nameInput(2), { target: { value: "Someone Else" } });
      fireEvent.change(nameInput(2), { target: { value: "held  DEBUTANT" } });
      const players = await savedPlayers(writes);
      expect(players[1]).toMatchObject({ participantId: HELD_GUID });
    });

    it("re-picking a different register player drops it; the same-name player keeps it", async () => {
      const { writes } = setupApi({ enabled: true });
      await openTeamList();
      // Row 1 is linked (Alex Opener, #11) with a PlayHQ id: unlink and pick someone else.
      fireEvent.click(within(row(1)).getByRole("button", { name: "Unlink" }));
      const search1 = within(row(1)).getByPlaceholderText("Search register…");
      fireEvent.change(search1, { target: { value: "Some" } });
      fireEvent.click(await within(row(1)).findByText("Else, Someone"));

      // Row 2 is a typed PlayHQ row: clear it and pick the register player of the same name.
      fireEvent.change(nameInput(2), { target: { value: "" } });
      const search2 = within(row(2)).getByPlaceholderText("Search register…");
      fireEvent.change(search2, { target: { value: "Held" } });
      fireEvent.click(await within(row(2)).findByText("Debutant, Held"));

      const players = await savedPlayers(writes);
      expect(players[0]).toMatchObject({ playerId: 22, displayName: "Someone Else" });
      expect(players[0]).not.toHaveProperty("participantId");
      expect(players[1]).toMatchObject({
        playerId: 21,
        displayName: "Held Debutant",
        participantId: HELD_GUID,
      });
    });
  });

  it("with the feature off shows no numbers, banner or controls, and never reads the register", async () => {
    const { registerReads, writes } = setupApi({ enabled: false });
    await openTeamList();
    // Let the settings query settle.
    await waitFor(() => expect(screen.getByTestId("team-list-row-1")).toBeTruthy());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("shirt-number-banner")).toBeNull();
    expect(screen.queryByRole("button", { name: /Assign #/ })).toBeNull();
    expect(screen.queryByText("Link this player to number them")).toBeNull();
    expect(screen.queryByText("#7")).toBeNull();
    expect(registerReads()).toBe(0);
    // Saving still keeps participant ids.
    fireEvent.click(screen.getByText("Save team list"));
    await waitFor(() => expect(writes.some((w) => w.method === "PUT")).toBe(true));
    const put = writes.find((w) => w.method === "PUT")!;
    expect((put.body as { players: { participantId?: string }[] }).players[1].participantId).toBe(
      HELD_GUID,
    );
  });
});
