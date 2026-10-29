/**
 * New Studio → Create (S2): a senior Team List from one team's fixture, ending
 * in a draft opened straight in the editor.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithHistory } from "@/test/render";
import { CreateWizard } from "./create-wizard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIXTURES = [
  {
    id: 11,
    grade: "A Grade",
    opponentName: "Mandurah",
    startAt: "2026-10-31T04:30:00Z",
    isHome: true,
    roundLabel: "Round 5",
  },
  {
    id: 12,
    grade: "B Grade",
    opponentName: "Rockingham",
    startAt: "2026-10-31T04:30:00Z",
    isHome: false,
    roundLabel: "Round 5",
  },
  // A junior grade never shows with Seniors.
  {
    id: 13,
    grade: "Under 13",
    opponentName: "Pinjarra",
    startAt: "2026-10-31T01:00:00Z",
    isHome: true,
    roundLabel: "Round 5",
  },
];
const list = (fixtureId: number, source: string, isPublished: boolean) => ({
  id: fixtureId,
  fixtureId,
  players: [{ name: "A Player" }],
  isPublished,
  source,
  createdAt: "2026-10-29T00:00:00Z",
});

type Call = { url: string; method: string; body: unknown };

function stubApi() {
  const calls: Call[] = [];
  const routes: Array<[string, unknown]> = [
    [
      "/juniors/fixtures/31/team-list",
      { teamList: { players: [{ name: "x" }], isPublished: true, source: "selection" } },
    ],
    [
      "/juniors/fixtures/31/social-prefill",
      {
        input: { kind: "teamList", junior: true, juniorFixtureId: 31, players: [] },
        warnings: [],
        source: "selection",
        isPublished: true,
      },
    ],
    [
      "/juniors/fixtures",
      [{ id: 31, ageGroup: "Year 6", teamName: "Hawks", opponentName: "Eagles", startAt: null }],
    ],
    ["/fixtures/11/team-list", list(11, "selection", true)],
    ["/fixtures/12/team-list", list(12, "playhq", true)],
    ["/fixtures/13/team-list", null],
    [
      "/social-prefill/team-list/11",
      {
        input: { kind: "teamList", grade: "A Grade", opponent: "Mandurah", players: [] },
        warnings: [],
      },
    ],
    ["/fixtures", FIXTURES],
    ["/club-templates", { templates: [] }],
    ["/template-library/preview-input", { input: { kind: "teamList" } }],
    [
      "/template-library",
      {
        templates: [
          {
            id: 7,
            version: 3,
            name: "Club Kit Team List",
            kind: "teamList",
            document: { formatVersion: 2, pages: {} },
            look: { name: "Club Kit" },
          },
        ],
      },
    ],
    ["/social-drafts", { id: 501 }],
    ["/social-settings", { settings: {}, brand: {} }],
    ["/club-photos", []],
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const hit = routes.find(([needle]) => url.includes(needle));
      return new Response(JSON.stringify(hit ? hit[1] : {}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

describe("Create wizard", () => {
  it("makes one team's list from its fixture and opens it in the editor", async () => {
    const calls = stubApi();
    const { url } = renderWithHistory(<CreateWizard />, "/admin/social/create");

    fireEvent.click(await screen.findByRole("button", { name: "Team List" }));
    await waitFor(() => expect(url()).toBe("/admin/social/create?kind=teamList&step=3"));

    // Each senior team, badged by where its names came from; the junior grade is left out.
    const a = await screen.findByRole("button", { name: /A Grade v Mandurah/ });
    await waitFor(() => expect(a).toHaveTextContent("Selection Hub"));
    expect(screen.getByRole("button", { name: /B Grade v Rockingham/ })).toHaveTextContent(
      "PlayHQ",
    );
    expect(screen.queryByRole("button", { name: /Under 13/ })).toBeNull();

    fireEvent.click(a);
    await waitFor(() => expect(url()).toBe("/admin/social/create?kind=teamList&step=4"));
    fireEvent.click(await screen.findByRole("button", { name: "Use Club Kit Team List" }));

    await waitFor(() => expect(url()).toBe("/admin/social/editor/501?format=square"));
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/social-drafts"))!;
    expect(post.body).toMatchObject({
      cardInput: { kind: "teamList", grade: "A Grade", opponent: "Mandurah" },
      templateRef: { libraryTemplateId: 7, version: 3 },
    });
  });

  it("makes a blank design from just a size", async () => {
    const calls = stubApi();
    const { url } = renderWithHistory(<CreateWizard />, "/admin/social/create");
    fireEvent.click(await screen.findByRole("button", { name: "Blank design" }));
    await waitFor(() => expect(url()).toBe("/admin/social/create?kind=blank&step=4"));
    fireEvent.click(screen.getByRole("radio", { name: "Story" }));
    await waitFor(() => expect(url()).toBe("/admin/social/editor/501?format=story"));
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/social-drafts"))!;
    expect(post.body).toMatchObject({
      packId: expect.any(String),
      adjustments: expect.any(Object),
    });
  });

  it("makes a junior team's list from the junior tables only", async () => {
    const calls = stubApi();
    const { url } = renderWithHistory(<CreateWizard />, "/admin/social/create");
    fireEvent.click(await screen.findByRole("button", { name: "Juniors" }));
    fireEvent.click(await screen.findByRole("button", { name: "Junior Team List" }));
    await waitFor(() =>
      expect(url()).toBe("/admin/social/create?team=junior&kind=teamList&step=3"),
    );
    const team = await screen.findByRole("button", { name: /Year 6 Hawks vs Eagles/ });
    await waitFor(() => expect(team).toHaveTextContent("Selection Hub"));
    fireEvent.click(team);
    await waitFor(() =>
      expect(url()).toBe("/admin/social/create?team=junior&kind=teamList&step=4"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Use Club Kit Team List" }));
    await waitFor(() => expect(url()).toBe("/admin/social/editor/501?format=square"));
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/social-drafts"))!;
    expect(post.body).toMatchObject({
      cardInput: { kind: "teamList", junior: true, juniorFixtureId: 31 },
    });
    // Senior team lists and fixtures were never read.
    expect(calls.some((c) => /\/api\/fixtures|social-prefill\/team-list/.test(c.url))).toBe(false);
  });
});
