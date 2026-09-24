/**
 * Social Studio U8 — the queue: revisions with revert (AE3), the stale notice
 * with refresh, photo swap, the waiting-for-import empty state, and the
 * automation switches.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
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

const FAMILY_CONFIG = {
  results: { enabled: true, grades: {} },
  achievements: { enabled: false, grades: {} },
  roundup: { enabled: false, grades: {} },
  matchday: { enabled: false, grades: {} },
};

const settings = (extra: object = {}) => ({
  settings: { clubUrl: "", familyConfig: FAMILY_CONFIG, lastSweepAt: null, ...extra },
  captionTemplates: [],
  activeSponsors: [],
});

const DRAFT = {
  id: 7,
  engine: "milestone",
  family: "achievements",
  status: "awaiting_review",
  cardInput: { kind: "century", playerName: "Sam Keeper", runs: 104, grade: "A Grade" },
  appPath: "/players/1",
  trackedSlug: null,
  sourceMatchIsJunior: false,
  caption: "Sam 104",
  photoUrl: null,
  photoSource: null,
  staleSince: null,
  createdAt: "2026-09-20T10:00:00Z",
};

const REVISIONS = [
  {
    id: 31,
    draftId: 7,
    cardInput: { kind: "century", playerName: "Sam Keeper", runs: 101 },
    caption: "old",
    reason: "refresh",
    createdAt: "2026-09-21T10:00:00Z",
  },
  {
    id: 30,
    draftId: 7,
    cardInput: { kind: "century", playerName: "Sam Keeper", runs: 100 },
    caption: "older",
    reason: "edit",
    createdAt: "2026-09-20T11:00:00Z",
  },
];

const baseRoutes = (drafts: object[], extra: Route[] = []): Route[] => [
  ...extra,
  { match: /\/api\/social-drafts\/pending-count/, reply: () => ({ count: 1 }) },
  { match: /\/api\/social-drafts\/\d+\/revisions$/, reply: () => REVISIONS },
  { match: /\/api\/social-drafts(\?|$)/, reply: () => drafts },
  { match: /\/api\/social-settings/, reply: () => settings() },
  {
    match: /\/api\/imports/,
    reply: () => [{ id: 1, importedAt: new Date().toISOString(), status: "committed" }],
  },
  {
    match: /\/api\/club-photos/,
    reply: () => [
      {
        id: 5,
        url: "/api/storage/objects/library/5",
        thumbUrl: "/api/storage/objects/library/5-t",
        playerIds: [],
      },
    ],
  },
];

async function openDraft(name: string) {
  fireEvent.click(await screen.findByText(name));
  return screen.findByRole("dialog");
}

describe("draft drawer", () => {
  it("AE3: lists both revisions, and reverting calls the endpoint and refreshes the drawer", async () => {
    const requests = stubApi(
      baseRoutes(
        [DRAFT],
        [
          {
            method: "POST",
            match: /\/revisions\/30\/revert$/,
            reply: () => ({ ...DRAFT, caption: "older" }),
          },
        ],
      ),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    const dialog = await openDraft("Sam Keeper");
    const reverts = await within(dialog).findAllByRole("button", { name: /revert/i });
    expect(reverts).toHaveLength(2);

    fireEvent.click(reverts[1]);
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.method === "POST" && r.url.endsWith("/social-drafts/7/revisions/30/revert"),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect((within(dialog).getByLabelText("Caption") as HTMLTextAreaElement).value).toBe("older"),
    );
  });

  it("a stale posted draft shows the changed-data notice with a refresh action", async () => {
    const stale = { ...DRAFT, status: "posted", staleSince: "2026-09-22T10:00:00Z" };
    const requests = stubApi(
      baseRoutes(
        [stale],
        [
          {
            method: "POST",
            match: /\/revisions\/31\/revert$/,
            reply: () => ({ ...stale, staleSince: null }),
          },
        ],
      ),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    fireEvent.click(await screen.findByRole("tab", { name: /Posted/ }));
    const dialog = await openDraft("Sam Keeper");
    expect(within(dialog).getByText(/data changed since this card was posted/i)).toBeTruthy();
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Refresh with the new data" }),
    );
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "POST" && r.url.endsWith("/revisions/31/revert")),
      ).toBe(true),
    );
  });

  it("swapping the photo records the manual choice", async () => {
    const requests = stubApi(
      baseRoutes(
        [DRAFT],
        [
          {
            method: "PATCH",
            match: /\/api\/social-drafts\/7$/,
            reply: (r) => ({ ...DRAFT, ...(r.body as object), photoSource: "manual" }),
          },
        ],
      ),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    const dialog = await openDraft("Sam Keeper");
    fireEvent.click(within(dialog).getByRole("button", { name: "Swap photo" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Library item 5" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({ photoUrl: "/api/storage/objects/library/5" });
    });
  });
});

describe("queue page", () => {
  it("with no drafts, explains that drafts arrive after the next import", async () => {
    stubApi(baseRoutes([]));
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    expect(await screen.findByText("No drafts yet")).toBeTruthy();
    expect(screen.getByText(/after the next results import/)).toBeTruthy();
    expect(screen.getByText(/Last import: just now/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /switched on/ }).getAttribute("href")).toBe(
      "#automation",
    );
  });

  it("turning on Achievements from the automation card saves the family switch", async () => {
    const requests = stubApi(
      baseRoutes(
        [DRAFT],
        [{ method: "PATCH", match: /\/api\/social-settings/, reply: () => ({}) }],
      ),
    );
    renderAt(<AdminSocialQueue />, "/admin/social/queue");
    const toggle = await screen.findByRole("switch", { name: "Achievements" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    fireEvent.click(toggle);
    await waitFor(() => {
      const patch = requests.find(
        (r) => r.method === "PATCH" && r.url.includes("/social-settings"),
      );
      expect(patch?.body).toEqual({ familyConfig: { achievements: { enabled: true } } });
    });
  });
});
