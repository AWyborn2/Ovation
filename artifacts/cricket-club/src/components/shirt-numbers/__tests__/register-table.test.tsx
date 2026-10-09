/**
 * Season shirt numbers U6 — the admin register UI: the page hides everything
 * but settings while the feature is off, duplicates are badged with text on
 * every row that shares a number, held entries filter and offer a link, a
 * block-policy 409 keeps the edited value, and "Start season" confirms the
 * source and target seasons and how many entries it will create.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminShirtNumbers from "@/pages/admin-shirt-numbers";
import {
  ShirtNumberRegister,
  ShirtNumberRegisterTable,
  seniorShirtNumberApi,
  type RegisterEntryView,
} from "@/components/shirt-numbers";
import { renderAt } from "@/test/render";
import { QueryClient } from "@tanstack/react-query";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Req = { method: string; url: string; body: unknown };
type Reply = unknown | { status: number; body: unknown };
type Route = { method?: string; match: RegExp; reply: (req: Req) => Reply };

const isStatusReply = (r: unknown): r is { status: number; body: unknown } =>
  typeof r === "object" && r !== null && "status" in r && "body" in r;

/** A method-aware fetch stub that records every request and can reply with a status. */
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
      const reply = route ? route.reply(req) : {};
      const { status, body: payload } = isStatusReply(reply) ? reply : { status: 200, body: reply };
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const entry = (
  id: number,
  name: string,
  number: string | null,
  extra: Partial<RegisterEntryView> = {},
): RegisterEntryView => ({
  id,
  season: 2026,
  name,
  number,
  participantId: null,
  playerId: id + 100,
  playerName: name,
  held: false,
  duplicate: false,
  source: "upload",
  ...extra,
});

const apiEntry = (e: RegisterEntryView) => ({
  ...e,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
});

const SETTINGS_ON = { enabled: true, duplicatePolicy: "block", rolloverPolicy: "carry" };

describe("Admin shirt numbers page", () => {
  it("invalidates team-list carousel sources after a manual register number edit", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const row = apiEntry(entry(1, "Carousel Captain", "36"));
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      { match: /\/api\/shirt-numbers\?season=/, reply: ({ url }) => ({
        season: 2026, seasons: [2026], entries: url.includes("season=2026") ? [row] : [],
      }) },
      { method: "PATCH", match: /\/api\/shirt-numbers\/1$/, reply: () => ({
        entry: { ...row, number: "88" }, warnings: [],
      }) },
    ]);
    renderAt(<AdminShirtNumbers />, "/admin/honours/shirt-numbers");
    fireEvent.click(await screen.findByRole("button", { name: /edit number for carousel captain/i }));
    fireEvent.change(screen.getByLabelText("Number for Carousel Captain"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.find(r => r.method === "PATCH")?.body).toEqual({ number: "88" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["/api/weekend-carousel/sources"], predicate: expect.any(Function),
    }));
  });
  it("shows only the settings panel while the feature is off", async () => {
    const requests = stubApi([
      {
        match: /\/api\/shirt-numbers\/settings$/,
        reply: () => ({ enabled: false, duplicatePolicy: "warn", rolloverPolicy: "carry" }),
      },
    ]);
    renderAt(<AdminShirtNumbers />, "/admin/honours/shirt-numbers");
    expect(await screen.findByRole("switch", { name: /shirt numbers/i })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    expect(screen.queryByLabelText("Season")).toBeNull();
    // The register list is never fetched while the feature is off.
    expect(requests.some((r) => /\/api\/shirt-numbers(\?|$)/.test(r.url))).toBe(false);
  });

  it("notes that the register is kept when the feature is turned off", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      {
        method: "PATCH",
        match: /\/api\/shirt-numbers\/settings$/,
        reply: () => ({ ...SETTINGS_ON, enabled: false }),
      },
      {
        match: /\/api\/shirt-numbers\?season=/,
        reply: () => ({ season: 2026, seasons: [2026], entries: [] }),
      },
    ]);
    renderAt(<AdminShirtNumbers />, "/admin/honours/shirt-numbers");
    const toggle = await screen.findByRole("switch", { name: /shirt numbers/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ enabled: false });
    });
    expect(await screen.findByText(/register is kept/i)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["/api/weekend-carousel/sources"], predicate: expect.any(Function),
    });
  });
});

describe("Register table", () => {
  const noop = async () => ({ ok: true as const, warnings: [] });

  it("badges both entries that share a number, with text", () => {
    renderAt(
      <ShirtNumberRegisterTable
        entries={[
          entry(1, "Alex Able", "7", { duplicate: true }),
          entry(2, "Ben Baker", "7", { duplicate: true }),
          entry(3, "Cal Cole", "9"),
        ]}
        supportsHeld
        onSaveNumber={noop}
      />,
    );
    const table = screen.getByRole("table", { name: /register/i });
    const rowOf = (name: string) => within(table).getByText(name).closest("tr")!;
    expect(within(rowOf("Alex Able")).getByText(/duplicate/i)).toBeInTheDocument();
    expect(within(rowOf("Ben Baker")).getByText(/duplicate/i)).toBeInTheDocument();
    expect(within(rowOf("Cal Cole")).queryByText(/duplicate/i)).toBeNull();
  });

  it("lists held entries under the Held filter and offers to link them", () => {
    renderAt(
      <ShirtNumberRegisterTable
        entries={[
          entry(1, "Alex Able", "7"),
          entry(2, "Hal Held", "23", { held: true, playerId: null, playerName: null }),
        ]}
        supportsHeld
        onSaveNumber={noop}
        renderLinkControl={() => <p>picker</p>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Held" }));
    const table = screen.getByRole("table", { name: /register/i });
    expect(within(table).queryByText("Alex Able")).toBeNull();
    const row = within(table).getByText("Hal Held").closest("tr")!;
    expect(within(row).getByRole("button", { name: /link to player/i })).toBeInTheDocument();
  });

  it("saves an inline edit with Enter and cancels with Escape", async () => {
    const onSave = vi.fn(noop);
    renderAt(
      <ShirtNumberRegisterTable
        entries={[entry(1, "Alex Able", "7")]}
        supportsHeld
        onSaveNumber={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit number for alex able/i }));
    let input = screen.getByRole("textbox", { name: /number for alex able/i });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: /number for alex able/i })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /edit number for alex able/i }));
    input = screen.getByRole("textbox", { name: /number for alex able/i });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "12"),
    );
  });
});

describe("Register (senior)", () => {
  const CURRENT = [entry(1, "Alex Able", "7"), entry(2, "Ben Baker", "9")];
  const PREVIOUS = [
    { ...entry(1, "Alex Able", "7"), season: 2025 },
    { ...entry(5, "Dan Dee", "4"), season: 2025 },
    { ...entry(6, "Eve East", null), season: 2025 },
  ];

  const registerRoutes = (): Route[] => [
    {
      match: /\/api\/shirt-numbers\?season=2026/,
      reply: () => ({ season: 2026, seasons: [2026, 2025], entries: CURRENT.map(apiEntry) }),
    },
    {
      match: /\/api\/shirt-numbers\?season=2025/,
      reply: () => ({ season: 2025, seasons: [2026, 2025], entries: PREVIOUS.map(apiEntry) }),
    },
  ];

  it("shows the conflict and keeps the edited value when a save is blocked", async () => {
    const message = "#7 is already worn by Alex Able in 2026/27.";
    stubApi([
      ...registerRoutes(),
      {
        method: "PATCH",
        match: /\/api\/shirt-numbers\/2$/,
        reply: () => ({
          status: 409,
          body: {
            error: message,
            warnings: [
              {
                kind: "duplicate",
                season: 2026,
                number: "7",
                message,
                entryIds: [1],
                names: ["Alex Able"],
              },
            ],
          },
        }),
      },
    ]);
    renderAt(
      <ShirtNumberRegister
        api={seniorShirtNumberApi}
        settings={SETTINGS_ON as never}
        initialSeason={2026}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /edit number for ben baker/i }));
    const input = screen.getByRole("textbox", { name: /number for ben baker/i });
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /number for ben baker/i })).toHaveValue("7");
  });

  it("confirms the source and target seasons and the entries a season start creates", async () => {
    const requests = stubApi([
      ...registerRoutes(),
      {
        method: "POST",
        match: /\/api\/shirt-numbers\/seasons\/2026\/start$/,
        reply: () => ({
          season: 2026,
          fromSeason: 2025,
          created: 2,
          numbered: 1,
          skipped: 1,
          warnings: [],
        }),
      },
    ]);
    renderAt(
      <ShirtNumberRegister
        api={seniorShirtNumberApi}
        settings={SETTINGS_ON as never}
        initialSeason={2026}
      />,
    );
    const start = await screen.findByRole("button", { name: /carry forward from 2025\/26/i });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getAllByText(/2025\/26/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/2026\/27/).length).toBeGreaterThan(0);
    // Alex is already on 2026/27, so only Dan and Eve are created.
    expect(within(dialog).getByText(/2 entries/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /start season/i }));
    await waitFor(() => {
      expect(
        requests.some((r) => r.method === "POST" && /\/seasons\/2026\/start$/.test(r.url)),
      ).toBe(true);
    });
  });
});

describe("Add squad to register", () => {
  const routes = (): Route[] => [
    {
      match: /\/api\/shirt-numbers\?season=/,
      reply: () => ({ season: 2026, seasons: [2026], entries: [] }),
    },
  ];

  it("confirms the season, adds the squad and shows the created, skipped and unmatched summary", async () => {
    const requests = stubApi([
      ...routes(),
      {
        method: "POST",
        match: /\/api\/shirt-numbers\/seasons\/2026\/from-squad$/,
        reply: () => ({
          season: 2026,
          created: 3,
          skipped: 2,
          unmatched: ["Zed Unknown"],
          warnings: [],
        }),
      },
    ]);
    renderAt(
      <ShirtNumberRegister
        api={seniorShirtNumberApi}
        settings={SETTINGS_ON as never}
        initialSeason={2026}
      />,
    );
    const add = await screen.findByRole("button", { name: /add squad to register/i });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getAllByText(/2026\/27/).length).toBeGreaterThan(0);
    // Nothing is sent until confirmed.
    expect(requests.some((r) => /from-squad/.test(r.url))).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: /add squad/i }));

    const summary = await screen.findByTestId("squad-add-summary");
    expect(summary).toHaveTextContent(/3 added/);
    expect(summary).toHaveTextContent(/2 already on the register/);
    expect(summary).toHaveTextContent(/Zed Unknown/);
    expect(
      requests.filter((r) => r.method === "POST" && /\/seasons\/2026\/from-squad$/.test(r.url)),
    ).toHaveLength(1);
  });

  it("offers only the number spreadsheet upload, with no registration-export option", async () => {
    stubApi(routes());
    renderAt(
      <ShirtNumberRegister
        api={seniorShirtNumberApi}
        settings={SETTINGS_ON as never}
        initialSeason={2026}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /upload file/i }));
    expect(screen.getByLabelText("File")).toBeInTheDocument();
    expect(screen.queryByText(/registered participants/i)).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("Upload review", () => {
  const row = (rowIndex: number, name: string, status: string, extra: object = {}) => ({
    rowIndex,
    name,
    participantId: null,
    number: String(rowIndex + 10),
    status,
    playerId: null,
    candidates: [],
    existingEntryId: null,
    existingNumber: null,
    numberChange: false,
    duplicate: false,
    duplicateWith: [],
    errors: [],
    ...extra,
  });
  const PREVIEW = {
    id: 44,
    side: "senior",
    kind: "numbers",
    season: 2026,
    fileName: "numbers.csv",
    rows: [
      row(1, "Alex Able", "matched", { playerId: 101 }),
      row(2, "J Smith", "suggested", {
        candidates: [
          { playerId: 201, name: "John Smith", score: 0.9 },
          { playerId: 202, name: "Jane Smith", score: 0.8 },
        ],
      }),
      row(3, "New Kid", "new", { duplicate: true, duplicateWith: ["Alex Able"] }),
      row(4, "", "invalid", { errors: ["Missing name."] }),
    ],
    counts: {
      total: 4,
      matched: 1,
      suggested: 1,
      new: 1,
      invalid: 1,
      numberChanges: 0,
      duplicates: 1,
    },
    unrecognisedHeaders: [],
    errors: [],
    truncated: false,
  };

  it("previews grouped rows, applies picks and lists a block-policy conflict", async () => {
    const blocked = "#13 is already worn by Alex Able in 2026/27.";
    const requests = stubApi([
      {
        match: /\/api\/shirt-numbers\?season=/,
        reply: () => ({ season: 2026, seasons: [2026], entries: [] }),
      },
      { method: "POST", match: /\/api\/shirt-numbers\/uploads$/, reply: () => PREVIEW },
      {
        method: "POST",
        match: /\/api\/shirt-numbers\/uploads\/44\/commit$/,
        reply: () => ({
          status: 409,
          body: {
            error: "Duplicate numbers block this upload.",
            warnings: [
              {
                kind: "duplicate",
                season: 2026,
                number: "13",
                message: blocked,
                entryIds: [1],
                names: ["Alex Able"],
              },
            ],
          },
        }),
      },
    ]);
    renderAt(
      <ShirtNumberRegister
        api={seniorShirtNumberApi}
        settings={SETTINGS_ON as never}
        initialSeason={2026}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /upload file/i }));
    const file = new File(["name,number\n"], "numbers.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("File"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /upload and preview/i }));

    const review = await screen.findByRole("region", { name: "Needs review" });
    fireEvent.change(within(review).getByLabelText(/decision for j smith/i), {
      target: { value: "link:p:202" },
    });
    expect(screen.getByRole("region", { name: "Duplicates" })).toHaveTextContent("New Kid");
    fireEvent.click(screen.getByRole("button", { name: /keep all new as held/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard all invalid/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply to register/i }));

    expect(await screen.findByText(blocked)).toBeInTheDocument();
    const commit = requests.find((r) => /\/commit$/.test(r.url));
    expect(commit?.body).toEqual({
      resolutions: expect.arrayContaining([
        { rowIndex: 2, action: "link", playerId: 202 },
        { rowIndex: 3, action: "hold" },
        { rowIndex: 4, action: "discard" },
      ]),
    });
    // The preview stays open for correction.
    expect(screen.getByRole("button", { name: /apply to register/i })).toBeInTheDocument();
  });
});
