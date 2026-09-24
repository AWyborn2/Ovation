/**
 * Social Studio U21 (Honours and Users batches) — admin list pages on the data
 * table and edit drawer: rows list, search and chips narrow them, a row opens
 * the drawer, saving calls the existing update mutation, delete asks first,
 * and an empty list shows the empty state.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminAwards from "@/pages/admin-awards";
import AdminCaps from "@/pages/admin-caps";
import AdminLifeMembers from "@/pages/admin-life-members";
import AdminPremierships from "@/pages/admin-premierships";
import AdminJuniorPremierships from "@/pages/admin-junior-premierships";
import AdminUsers from "@/pages/admin-users";
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

const award = (id: number, title: string, published: boolean, displayOrder: number) => ({
  id,
  key: title.toLowerCase().replace(/\s+/g, "-"),
  title,
  description: "",
  displayOrder,
  votingEnabled: false,
  mechanism: "manual",
  published,
  pointsGrade: null,
  winners: [],
});

describe("Awards", () => {
  const AWARDS = [award(1, "Club Champion", true, 0), award(2, "Rising Star", false, 1)];

  it("filters drafts and publishes from the drawer", async () => {
    const requests = stubApi([
      { match: /\/api\/admin\/awards/, reply: () => AWARDS },
      { method: "PATCH", match: /\/api\/awards\/2$/, reply: () => AWARDS[1] },
    ]);
    renderAt(<AdminAwards />, "/admin/honours/awards");
    const t = await table("Awards");
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(within(t).queryByText("Club Champion")).toBeNull();
    fireEvent.click(within(t).getByText("Rising Star"));
    fireEvent.click(within(drawer()).getByRole("button", { name: "Publish" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ published: true });
    });
  });

  it("reordering from the table does not open the drawer", async () => {
    const requests = stubApi([
      { match: /\/api\/admin\/awards/, reply: () => AWARDS },
      { method: "PATCH", match: /\/api\/awards\/\d+$/, reply: () => ({}) },
    ]);
    renderAt(<AdminAwards />, "/admin/honours/awards");
    await table("Awards");
    fireEvent.click(screen.getByRole("button", { name: "Move Rising Star up" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.url).toMatch(/\/api\/awards\/2$/);
      expect(patch?.body).toEqual({ displayOrder: 0 });
    });
  });
});

describe("Caps", () => {
  const CAPS = [
    {
      id: 1,
      capNumber: 1,
      name: "Bill Founder",
      deceased: true,
      playerId: null,
      gamesAGrade: 0,
      inStats: false,
      category: "male",
    },
    {
      id: 2,
      capNumber: 2,
      name: "Sam Keeper",
      deceased: false,
      playerId: 7,
      gamesAGrade: 50,
      inStats: true,
      category: "male",
    },
  ];

  it("filters unmatched caps, saves an edit and asks before deleting", async () => {
    const requests = stubApi([
      { match: /\/api\/caps$/, reply: () => CAPS },
      { method: "PATCH", match: /\/api\/caps\/2$/, reply: () => CAPS[1] },
      { method: "DELETE", match: /\/api\/caps\/2$/, reply: () => ({}) },
    ]);
    renderAt(<AdminCaps />, "/admin/honours/caps");
    const t = await table("A Grade Male caps");
    fireEvent.click(screen.getByRole("button", { name: "No link" }));
    expect(within(t).queryByText("Sam Keeper")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No link" }));

    fireEvent.click(within(t).getByText("Sam Keeper"));
    fireEvent.change(within(drawer()).getByLabelText("A Grade games"), {
      target: { value: "51" },
    });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toMatchObject({ gamesAGrade: 51, name: "Sam Keeper" });
    });

    fireEvent.click(within(t).getByText("Sam Keeper"));
    fireEvent.click(within(drawer()).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(requests.some((r) => r.method === "DELETE")).toBe(true));
  });

  it("shows the empty state with no caps", async () => {
    stubApi([{ match: /\/api\/caps$/, reply: () => [] }]);
    renderAt(<AdminCaps />, "/admin/honours/caps");
    expect(await screen.findByText("No cap entries")).toBeTruthy();
  });
});

describe("Life members", () => {
  it("search narrows the rows and the drawer saves through the update mutation", async () => {
    const MEMBERS = [
      {
        id: 1,
        name: "Pat Old",
        inductionYear: 1990,
        isPlayingMember: true,
        playerId: null,
        roleLabel: null,
        blurb: "",
      },
      {
        id: 2,
        name: "Chris New",
        inductionYear: 2020,
        isPlayingMember: false,
        playerId: null,
        roleLabel: "Secretary",
        blurb: "",
      },
    ];
    const requests = stubApi([
      { match: /\/api\/life-members$/, reply: () => MEMBERS },
      { method: "PATCH", match: /\/api\/life-members\/2$/, reply: () => MEMBERS[1] },
    ]);
    renderAt(<AdminLifeMembers />, "/admin/honours/life-members");
    const t = await table("Life members");
    fireEvent.change(screen.getByPlaceholderText("Search life members"), {
      target: { value: "secretary" },
    });
    expect(within(t).queryByText("Pat Old")).toBeNull();
    fireEvent.click(within(t).getByText("Chris New"));
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PATCH")).toBe(true));
  });
});

describe("Premierships", () => {
  it("lists newest first and opens a premiership in the drawer", async () => {
    stubApi([
      {
        match: /\/api\/premierships$/,
        reply: () => [
          { id: 1, year: 2001, grade: "A Grade", competition: "Grand Final", players: [] },
          {
            id: 2,
            year: 2024,
            grade: "B Grade",
            competition: "Grand Final",
            players: [{ playerId: 7, name: "Sam Keeper", isCaptain: true, battingOrder: 1 }],
          },
        ],
      },
    ]);
    renderAt(<AdminPremierships />, "/admin/honours");
    const t = await table("Premierships");
    const rows = within(t).getAllByRole("row");
    expect(rows[1].textContent).toContain("2024");
    expect(within(t).getByText("Sam Keeper")).toBeTruthy();
    fireEvent.click(within(t).getByText("2024"));
    expect(within(drawer()).getByText("2024 · B Grade")).toBeTruthy();
  });
});

describe("Junior premierships", () => {
  it("flags premierships missing details and saves captain and MOM", async () => {
    const requests = stubApi([
      {
        match: /\/api\/juniors\/premierships$/,
        reply: () => [
          {
            id: 4,
            season: "2023/24",
            ageGroup: "U15",
            mom: null,
            matchDate: null,
            resultText: null,
            players: [{ id: 40, playerName: "Olly M", isCaptain: false }],
          },
        ],
      },
      { method: "PATCH", match: /\/api\/juniors\/premierships\/4$/, reply: () => ({}) },
    ]);
    renderAt(<AdminJuniorPremierships />, "/admin/honours/junior-premierships");
    const t = await table("Junior premierships");
    expect(within(t).getByText("Needs details")).toBeTruthy();
    fireEvent.click(within(t).getByText("U15"));
    fireEvent.change(within(drawer()).getByTestId("input-mom"), { target: { value: "Olly M" } });
    fireEvent.click(within(drawer()).getByTestId("checkbox-captain-40"));
    fireEvent.click(within(drawer()).getByTestId("button-save"));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ mom: "Olly M", captainPlayerIds: [40] });
    });
  });
});

describe("Admin users", () => {
  it("adds an admin from the drawer and renames one through the update mutation", async () => {
    const requests = stubApi([
      {
        match: /\/api\/admins$/,
        reply: () => [{ id: 1, username: "ash", displayName: "Ash" }],
      },
      { method: "POST", match: /\/api\/admins$/, reply: () => ({}) },
      { method: "PATCH", match: /\/api\/admins\/1$/, reply: () => ({}) },
    ]);
    renderAt(<AdminUsers />, "/admin/users");
    const t = await table("Admin users");

    fireEvent.click(screen.getByRole("button", { name: "Add admin" }));
    fireEvent.change(within(drawer()).getByLabelText("Username"), { target: { value: "jo" } });
    fireEvent.change(within(drawer()).getByLabelText("Display name"), { target: { value: "Jo" } });
    fireEvent.change(within(drawer()).getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Add admin" }));
    await waitFor(() => {
      const post = requests.find((r) => r.method === "POST");
      expect(post?.body).toEqual({ username: "jo", displayName: "Jo", password: "pw" });
    });

    fireEvent.click(within(t).getByText("Ash"));
    fireEvent.change(within(drawer()).getByLabelText("Display name"), {
      target: { value: "Ash W" },
    });
    fireEvent.click(within(drawer()).getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toMatchObject({ displayName: "Ash W" });
    });
  });
});
