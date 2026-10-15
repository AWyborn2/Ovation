import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { renderAt } from "@/test/render";
import AdminJuniorMatchDisplay from "@/pages/admin-junior-match-display";
import AdminJuniorPlayers from "@/pages/admin-junior-players";

/**
 * Junior naming style, per-team publishing and the privacy override admin
 * screens (junior PlayHQ sync plan U7; KTD12, KTD14, R15, R16, AE3).
 */

type Sent = { url: string; method: string; body: unknown };

/** Stub fetch with canned GET payloads (first matching key wins) and record writes. */
function stubApi(routes: [string, unknown][]): Sent[] {
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
        return new Response(JSON.stringify(body ?? {}), {
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

const SETTINGS = {
  defaultAgeGroup: "",
  defaultSeasonMode: "latest",
  defaultSeason: null,
  ageGroupOrder: [],
  nameStyle: "full",
  teamPublishing: { "Year 6": { "Halls Head Hawks": "auto" } },
};

describe("Junior match display: naming style and team publishing", () => {
  const routes: [string, unknown][] = [
    ["/juniors/match-display-settings", SETTINGS],
    ["/juniors/filters", { seasons: ["2026/27", "2025/26"], ageGroups: ["Year 6", "Year 7"] }],
    [
      "/juniors/matches",
      [
        { id: 1, season: "2026/27", ageGroup: "Year 6", teamName: "Halls Head Hawks" },
        { id: 2, season: "2026/27", ageGroup: "Year 7", teamName: "Halls Head Eagles" },
        { id: 3, season: "2026/27", ageGroup: "Year 7", teamName: "Halls Head Eagles" },
      ],
    ],
  ];

  it("previews each naming style", async () => {
    stubApi(routes);
    renderAt(<AdminJuniorMatchDisplay />, "/admin/juniors/match-display");
    const select = (await screen.findByTestId("select-name-style")) as HTMLSelectElement;
    expect(select.value).toBe("full");
    expect(screen.getByTestId("name-style-preview").textContent).toContain("Ollie Gallash");
    fireEvent.change(select, { target: { value: "first_initial" } });
    expect(screen.getByTestId("name-style-preview").textContent).toContain("Ollie G");
    fireEvent.change(select, { target: { value: "first" } });
    expect(screen.getByTestId("name-style-preview").textContent).toMatch(/Ollie(?! G)/);
  });

  it("lists each team once, defaults unlisted teams to approval, and saves both settings", async () => {
    const sent = stubApi(routes);
    renderAt(<AdminJuniorMatchDisplay />, "/admin/juniors/match-display");
    const hawks = (await screen.findByTestId(
      "select-publish-Year 6-Halls Head Hawks",
    )) as HTMLSelectElement;
    const eagles = (await screen.findByTestId(
      "select-publish-Year 7-Halls Head Eagles",
    )) as HTMLSelectElement;
    expect(screen.getAllByTestId(/^select-publish-/)).toHaveLength(2);
    expect(hawks.value).toBe("auto");
    expect(eagles.value).toBe("approval");

    fireEvent.change(eagles, { target: { value: "auto" } });
    fireEvent.change(screen.getByTestId("select-name-style"), {
      target: { value: "first_initial" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.method).toBe("PATCH");
    expect(sent[0]!.body).toMatchObject({
      nameStyle: "first_initial",
      teamPublishing: {
        "Year 6": { "Halls Head Hawks": "auto" },
        "Year 7": { "Halls Head Eagles": "auto" },
      },
    });
  });
});

describe("Junior players admin: privacy override (AE3)", () => {
  const OLLIE = {
    participantId: "p-ollie",
    displayName: "Ollie Gallash",
    isPrivate: true,
    privacyOverride: true,
    privacyOverrideBy: "ash",
    privacyOverrideAt: "2026-10-01T02:00:00.000Z",
    matches: 3,
    runs: 40,
    wickets: 2,
  };
  const SAM = {
    participantId: "p-sam",
    displayName: "Sam Taylor",
    isPrivate: true,
    privacyOverride: false,
    privacyOverrideBy: null,
    privacyOverrideAt: null,
  };

  it("lists active overrides with who set them and when", async () => {
    stubApi([
      ["/juniors/privacy-overrides", [OLLIE]],
      ["/juniors/players", [OLLIE, SAM]],
    ]);
    renderAt(<AdminJuniorPlayers />, "/admin/people/junior-players");
    const list = await screen.findByTestId("privacy-overrides");
    expect(within(list).getByText("Ollie Gallash")).toBeTruthy();
    expect(list.textContent).toContain("ash");
    expect(list.textContent).toMatch(/2026/);
  });

  it("warns while a private player is being named, and shows who set it", async () => {
    stubApi([
      ["/juniors/privacy-overrides", [OLLIE]],
      ["/juniors/players", [OLLIE, SAM]],
    ]);
    renderAt(<AdminJuniorPlayers />, "/admin/people/junior-players");
    fireEvent.click(await screen.findByText("Ollie Gallash", { selector: "span" }));
    const warning = await screen.findByTestId("privacy-override-warning");
    expect(warning.textContent).toMatch(/private player/i);
    expect(warning.textContent).toContain("ash");
  });

  it("switches the override on for a private player", async () => {
    const sent = stubApi([
      ["/juniors/privacy-overrides", []],
      ["/juniors/players", [SAM]],
    ]);
    renderAt(<AdminJuniorPlayers />, "/admin/people/junior-players");
    fireEvent.click(await screen.findByText("Sam Taylor", { selector: "span" }));
    expect(screen.queryByTestId("privacy-override-warning")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /show name publicly/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^show name$/i }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.url).toContain("/juniors/participants/p-sam");
    expect(sent[0]!.body).toEqual({ privacyOverride: true });
  });

  it("offers no override for a public player", async () => {
    stubApi([
      ["/juniors/privacy-overrides", []],
      ["/juniors/players", [{ ...SAM, isPrivate: false }]],
    ]);
    renderAt(<AdminJuniorPlayers />, "/admin/people/junior-players");
    fireEvent.click(await screen.findByText("Sam Taylor", { selector: "span" }));
    await screen.findByText(/public profile/i);
    expect(screen.queryByRole("button", { name: /show name publicly/i })).toBeNull();
  });
});
