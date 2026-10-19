/**
 * Shirt-number categories on People → Shirt numbers (admin-menu-consolidation PR 2): one
 * page with Men / Female / Juniors sections (`?section=`), "Also in" badges from the
 * entry's own `alsoIn` and the admin-only overlap read, the "Also add to…" row action,
 * bulk "Move to Female", the Imports upload's register picker, and the old junior tab
 * redirecting to the Juniors section.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AdminShirtNumbers from "@/pages/admin-shirt-numbers";
import { renderWithHistory } from "@/test/render";
import { alsoAddTargets, seniorShirtNumberApiFor, withAlsoIn } from "@/components/shirt-numbers";
import type { RegisterEntryView } from "@/components/shirt-numbers";
import { ADMIN_NAV } from "@/lib/admin-nav";

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
      const body =
        typeof init?.body === "string"
          ? JSON.parse(init.body)
          : init?.body instanceof FormData
            ? init.body
            : undefined;
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

const SETTINGS_ON = { enabled: true, duplicatePolicy: "warn", rolloverPolicy: "blank" };
const seniorEntry = (
  id: number,
  name: string,
  number: string | null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  season: 2026,
  category: "men",
  alsoIn: [],
  name,
  participantId: null,
  playerId: id + 100,
  playerName: name,
  number,
  source: "admin",
  held: false,
  duplicate: false,
  crossRegister: [],
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  ...extra,
});
const register = (entries: unknown[]) => ({ season: 2026, seasons: [2026], entries });

const view = (over: Partial<RegisterEntryView> = {}): RegisterEntryView => ({
  id: 1,
  season: 2026,
  name: "Sam",
  number: "7",
  participantId: null,
  playerId: 7,
  playerName: "Sam",
  held: false,
  heldReason: null,
  suggestedLink: null,
  duplicate: false,
  source: "admin",
  crossRegister: [],
  alsoIn: [],
  ...over,
});

describe("withAlsoIn / alsoAddTargets", () => {
  it("merges the entry's own alsoIn with the overlap, never naming the register shown", () => {
    const [e] = withAlsoIn([view({ id: 1, alsoIn: ["female"] })], "men", {
      season: 2026,
      people: [{ registers: ["men", "juniors"], seniorEntryIds: [1], juniorEntryIds: [9] }],
    });
    expect(e!.alsoIn).toEqual(["female", "juniors"]);
    // On the juniors register the same person is matched by the junior entry id.
    const [j] = withAlsoIn([view({ id: 9 })], "juniors", {
      season: 2026,
      people: [{ registers: ["men", "juniors"], seniorEntryIds: [1], juniorEntryIds: [9] }],
    });
    expect(j!.alsoIn).toEqual(["men"]);
  });

  it("offers only registers the person is not on; Juniors needs a Profile ID", () => {
    expect(alsoAddTargets(view({ alsoIn: ["female"] }), "men")).toEqual([
      {
        register: "juniors",
        disabledReason: "Needs a PlayHQ Profile ID to go on the juniors register",
      },
    ]);
    expect(alsoAddTargets(view({ participantId: "guid-1" }), "men")).toEqual([
      { register: "female", disabledReason: null },
      { register: "juniors", disabledReason: null },
    ]);
  });
});

describe("People → Shirt numbers sections", () => {
  it("defaults to Men and switches to Female through ?section=, each fetching its category", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      {
        match: /\/api\/shirt-numbers\?season=2026&category=men$/,
        reply: () => register([seniorEntry(1, "Alex Men", "7")]),
      },
      {
        match: /\/api\/shirt-numbers\?season=2026&category=female$/,
        reply: () => register([seniorEntry(2, "Kim Female", "7", { category: "female" })]),
      },
    ]);
    const { url } = renderWithHistory(<AdminShirtNumbers />, "/admin/people/shirt-numbers");
    expect(await screen.findByText("Alex Men")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Men" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Female" }));
    expect(await screen.findByText("Kim Female")).toBeInTheDocument();
    expect(url()).toContain("section=female");
    // Same #7 on both registers: no Duplicate badge (clashes are per category).
    expect(screen.queryByText("Duplicate")).toBeNull();
    expect(requests.some((r) => /category=female/.test(r.url))).toBe(true);
  });

  it("?section=juniors shows the juniors register through /api/juniors only", async () => {
    const requests = stubApi([
      { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
      {
        match: /\/api\/juniors\/overview$/,
        reply: () => ({
          totals: { matches: 5, players: 5, premierships: 0, seasons: 1, ageGroups: 1 },
          latestSeason: null,
          recentMatches: [],
          topRunScorers: [],
          topWicketTakers: [],
        }),
      },
      {
        match: /\/api\/juniors\/shirt-numbers\?season=/,
        reply: () => ({
          ...register([
            {
              id: 9,
              season: 2026,
              participantId: "guid-9",
              name: "Jo Junior",
              number: "4",
              source: "upload",
              duplicate: false,
              linkStatus: "linked",
              playerName: "Jo Junior",
              suggestedLink: null,
              crossRegister: [],
              createdAt: "2026-07-01T00:00:00Z",
              updatedAt: "2026-07-01T00:00:00Z",
            },
          ]),
          juniorsAvailable: true,
          seniorNumbers: [],
        }),
      },
      {
        match: /\/api\/juniors\/shirt-numbers\/overlap\?season=2026$/,
        reply: () => ({
          season: 2026,
          people: [{ registers: ["men", "juniors"], seniorEntryIds: [1], juniorEntryIds: [9] }],
        }),
      },
    ]);
    renderWithHistory(<AdminShirtNumbers />, "/admin/people/shirt-numbers?section=juniors");
    expect(await screen.findByText("Jo Junior")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Juniors" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Also in: Men")).toBeInTheDocument();
    // The senior register itself is never read for the Juniors section.
    expect(requests.some((r) => /\/api\/shirt-numbers\?season=/.test(r.url))).toBe(false);
  });
});

describe("Also in / Also add to… / Move to Female", () => {
  const routes = (): Route_[] => [
    { match: /\/api\/shirt-numbers\/settings$/, reply: () => SETTINGS_ON },
    {
      match: /\/api\/shirt-numbers\?season=2026&category=men$/,
      reply: () =>
        register([
          seniorEntry(1, "Sam Both", "12", { alsoIn: ["female"], participantId: "guid-1" }),
          seniorEntry(2, "Pat Single", "30"),
        ]),
    },
    {
      match: /\/api\/juniors\/shirt-numbers\/overlap\?season=2026$/,
      reply: () => ({
        season: 2026,
        people: [
          {
            registers: ["men", "female", "juniors"],
            seniorEntryIds: [1, 5],
            juniorEntryIds: [9],
          },
        ],
      }),
    },
    {
      method: "POST",
      match: /\/api\/shirt-numbers$/,
      reply: () => ({ entry: seniorEntry(3, "Pat Single", "30"), warnings: [] }),
    },
    {
      method: "PATCH",
      match: /\/api\/shirt-numbers\/2$/,
      reply: () => ({ entry: seniorEntry(2, "Pat Single", "30"), warnings: [] }),
    },
  ];

  it("badges a person on several registers, never blocking it", async () => {
    stubApi(routes());
    renderWithHistory(<AdminShirtNumbers />, "/admin/people/shirt-numbers");
    expect(await screen.findByText("Also in: Female, Juniors")).toBeInTheDocument();
    const pat = screen.getByText("Pat Single").closest("tr")!;
    expect(within(pat).queryByText(/Also in/)).toBeNull();
  });

  it("Also add to… copies the person into the Female register with the number filled in", async () => {
    const requests = stubApi(routes());
    renderWithHistory(<AdminShirtNumbers />, "/admin/people/shirt-numbers");
    const pat = (await screen.findByText("Pat Single")).closest("tr")!;
    fireEvent.click(within(pat).getByRole("button", { name: "Also add to…" }));
    const group = within(pat).getByRole("group", { name: /also add pat single to/i });
    // No Profile ID: the juniors register needs one, so it is offered but disabled.
    expect(within(group).getByRole("button", { name: "Juniors" })).toBeDisabled();
    fireEvent.click(within(group).getByRole("button", { name: "Female" }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "POST")?.body).toEqual({
        season: 2026,
        category: "female",
        name: "Pat Single",
        number: "30",
        playerId: 102,
        participantId: null,
      }),
    );
    expect(await screen.findByText(/also added pat single to the female register/i)).toBeVisible();
  });

  it("Move to Female moves the selected rows with one PATCH each", async () => {
    const requests = stubApi(routes());
    renderWithHistory(<AdminShirtNumbers />, "/admin/people/shirt-numbers");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Pat Single" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to Female" }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === "PATCH")).toMatchObject({
        url: expect.stringMatching(/\/api\/shirt-numbers\/2$/),
        body: { category: "female" },
      }),
    );
    expect(await screen.findByText(/moved 1 to the female register/i)).toBeVisible();
  });
});

describe("uploads carry the register", () => {
  it("a Female upload posts category=female", async () => {
    const requests = stubApi([
      {
        method: "POST",
        match: /\/api\/shirt-numbers\/uploads$/,
        reply: () => ({}),
      },
    ]);
    await seniorShirtNumberApiFor("female").upload({
      file: new File(["Name,Number\nKim,7"], "numbers.csv", { type: "text/csv" }),
      kind: "numbers",
      season: 2026,
    });
    const body = requests[0]!.body as FormData;
    expect(body.get("category")).toBe("female");
    expect(body.get("season")).toBe("2026");
  });
});

describe("menu", () => {
  it("one Shirt numbers tab under People, and a Shirt numbers upload under Imports", () => {
    const tabs = (key: string) => ADMIN_NAV.find((g) => g.key === key)!.tabs.map((t) => t.path);
    expect(tabs("people")).toContain("/admin/people/shirt-numbers");
    expect(tabs("people")).not.toContain("/admin/people/junior-shirt-numbers");
    expect(tabs("import")).toContain("/admin/import/shirt-numbers");
  });
});
