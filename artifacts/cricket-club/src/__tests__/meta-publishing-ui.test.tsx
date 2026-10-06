/**
 * Meta publishing admin UI (plan 2026-10-06-001 U9, U10): the connection
 * card, the auto-publish controls, the needs-attention alerts and the draft
 * drawer's schedule panel. fetch is stubbed per path and method.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SocialDraft, SocialPublication, SocialSettings } from "@workspace/api-client-react";
import { MetaConnectionCard } from "@/components/social-queue/meta-connection-card";
import { AutoPostCard } from "@/components/social-queue/auto-post-card";
import { SchedulePanel } from "@/components/social-queue/schedule-panel";
import { NeedsAttention } from "@/components/admin-hub/needs-attention";
import {
  clubTimeInputValue,
  publicationLabel,
  PUBLICATION_LABEL,
} from "@/components/social-queue/draft-meta";
import { renderAt } from "@/test/render";

type Handler = (body: unknown) => unknown;
type Calls = { method: string; path: string; body: unknown }[];

/** Stub fetch: `routes` maps "METHOD /path-substring" to a response maker. */
function stubApi(routes: Record<string, Handler | unknown>): Calls {
  const calls: Calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url, body });
      const key = Object.keys(routes).find((k) => {
        const [m, p] = k.split(" ");
        return m === method && url.includes(p);
      });
      const route = key ? routes[key] : undefined;
      const payload = typeof route === "function" ? (route as Handler)(body) : (route ?? []);
      return new Response(JSON.stringify(payload ?? null), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

const CONNECTED = {
  available: true,
  status: "connected",
  statusReason: null,
  pageName: "Halls Head CC",
  igUsername: "hallsheadcc",
  connectedAt: "2026-10-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("draft-meta publication helpers", () => {
  it("labels platforms and states", () => {
    expect(publicationLabel({ platform: "instagram", postType: "story" })).toBe("Instagram story");
    expect(publicationLabel({ platform: "facebook", postType: "feed" })).toBe("Facebook");
    expect(PUBLICATION_LABEL.held).toBe("Waiting for reconnect");
    expect(clubTimeInputValue(new Date("2026-10-10T11:00:00Z"))).toBe("2026-10-10T19:00");
  });
});

describe("Facebook and Instagram connection card", () => {
  it("connects: asks the server for Meta's URL and goes there", async () => {
    const calls = stubApi({
      "GET /social-connections/meta": { ...CONNECTED, status: "not_connected", pageName: null },
      "POST /social-connections/meta/start": { url: "https://www.facebook.com/dialog" },
    });
    const assign = vi.fn();
    vi.stubGlobal("location", {
      ...window.location,
      assign,
      search: "",
      href: "http://localhost/",
    });
    renderAt(<MetaConnectionCard />, "/admin/social/cards");
    fireEvent.click(await screen.findByRole("button", { name: "Connect Facebook and Instagram" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://www.facebook.com/dialog"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ replace: false });
  });

  it("shows the connected accounts and asks before disconnecting", async () => {
    const calls = stubApi({
      "GET /social-connections/meta": CONNECTED,
      "DELETE /social-connections/meta": { ...CONNECTED, status: "disconnected" },
    });
    renderAt(<MetaConnectionCard />, "/admin/social/cards");
    expect(await screen.findByText("Halls Head CC")).toBeTruthy();
    expect(screen.getByText("@hallsheadcc")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect", hidden: false }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("warns when the connection needs reconnecting", async () => {
    stubApi({
      "GET /social-connections/meta": {
        ...CONNECTED,
        status: "needs_reconnect",
        statusReason: "Meta access was revoked or expired.",
      },
    });
    renderAt(<MetaConnectionCard />, "/admin/social/cards");
    expect(await screen.findByText("Reconnect needed")).toBeTruthy();
    expect(screen.getByText("Meta access was revoked or expired.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
  });

  it("lets the admin pick a Page when Facebook returned several", async () => {
    window.history.replaceState(null, "", "/admin/social/cards?meta_connect=tok123");
    const calls = stubApi({
      "GET /social-connections/meta/pending": {
        pages: [
          { pageId: "p1", pageName: "First Page", igUsername: null },
          { pageId: "p2", pageName: "Second Page", igUsername: "second" },
        ],
      },
      "GET /social-connections/meta": CONNECTED,
      "POST /social-connections/meta/complete": CONNECTED,
    });
    renderAt(<MetaConnectionCard />, "/admin/social/cards");
    fireEvent.click(await screen.findByLabelText(/Second Page/));
    fireEvent.click(screen.getByRole("button", { name: "Connect this Page" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.includes("/complete"))?.body).toEqual({
        token: "tok123",
        pageId: "p2",
        replace: true,
      }),
    );
  });

  it("says nothing can be done while publishing is off", async () => {
    stubApi({ "GET /social-connections/meta": { ...CONNECTED, available: false } });
    renderAt(<MetaConnectionCard />, "/admin/social/cards");
    expect(await screen.findByText(/isn't switched on for this club yet/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("auto-publish controls", () => {
  const SETTINGS = {
    autoPostEnabled: true,
    autoPostWindowHours: 12,
    notificationEmail: null,
    autoPublishEnabled: false,
    autoPublishFreshnessHours: 24,
  } as unknown as SocialSettings;

  it("is disabled with a hint until Meta is connected", async () => {
    stubApi({ "GET /social-connections/meta": { ...CONNECTED, status: "not_connected" } });
    renderAt(<AutoPostCard settings={SETTINGS} />, "/admin/social/cards");
    expect(await screen.findByText("Connect Facebook and Instagram first.")).toBeTruthy();
    const toggle = screen.getByRole("switch", {
      name: "Publish automatically to Facebook and Instagram",
    });
    expect(toggle.hasAttribute("disabled")).toBe(true);
  });

  it("saves auto-publish, and refuses a cut-off shorter than the window", async () => {
    const calls = stubApi({
      "GET /social-connections/meta": CONNECTED,
      "PATCH /social-settings": {},
    });
    renderAt(<AutoPostCard settings={SETTINGS} />, "/admin/social/cards");
    const toggle = await screen.findByRole("switch", {
      name: "Publish automatically to Facebook and Instagram",
    });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Only if imported within"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/at least the review window/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Only if imported within"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
      autoPublishEnabled: true,
      autoPublishFreshnessHours: 24,
    });
  });
});

const pub = (over: Partial<SocialPublication>): SocialPublication => ({
  id: 1,
  draftId: 7,
  platform: "facebook",
  postType: "feed",
  status: "scheduled",
  origin: "manual",
  scheduledFor: "2026-10-10T11:00:00Z",
  attempts: 0,
  lastError: null,
  publishedAt: null,
  ...over,
});

const DRAFT = {
  id: 7,
  engine: "milestone",
  status: "ready",
  cardInput: { kind: "milestone", playerName: "Sam" },
  appPath: "/",
  sourceMatchIsJunior: false,
  createdAt: "2026-10-01T00:00:00Z",
  publications: [],
} as unknown as SocialDraft;

describe("schedule panel", () => {
  it("schedules both platforms as a feed post by default, and Facebook only when Instagram is unticked", async () => {
    const calls = stubApi({
      "GET /social-connections/meta": CONNECTED,
      "POST /social-drafts/7/publications": [pub({})],
    });
    renderAt(<SchedulePanel draft={DRAFT} />, "/admin/social/queue");
    fireEvent.click(await screen.findByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      platforms: ["facebook", "instagram"],
      postTypes: ["feed"],
    });

    fireEvent.click(screen.getByLabelText("Instagram"));
    fireEvent.click(screen.getByLabelText("Story"));
    fireEvent.change(screen.getByLabelText("Publish at (club time)"), {
      target: { value: "2099-10-10T19:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(2));
    expect(calls.filter((c) => c.method === "POST")[1].body).toEqual({
      platforms: ["facebook"],
      postTypes: ["feed", "story"],
      at: "2099-10-10T19:00",
    });
  });

  it("rejects a past time inline", async () => {
    const calls = stubApi({ "GET /social-connections/meta": CONNECTED });
    renderAt(<SchedulePanel draft={DRAFT} />, "/admin/social/queue");
    fireEvent.change(await screen.findByLabelText("Publish at (club time)"), {
      target: { value: "2001-01-01T09:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
    expect(await screen.findByText("Pick a time in the future.")).toBeTruthy();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows each post's state with cancel, retry and the reason", async () => {
    const calls = stubApi({
      "GET /social-connections/meta": CONNECTED,
      "POST /social-publications/1/cancel": pub({ status: "cancelled" }),
      "POST /social-publications/2/retry": pub({
        id: 2,
        platform: "instagram",
        status: "scheduled",
      }),
    });
    const draft = {
      ...DRAFT,
      publications: [
        pub({}),
        pub({ id: 2, platform: "instagram", status: "failed", lastError: "Instagram said no." }),
        pub({ id: 3, platform: "instagram", postType: "story", status: "held" }),
      ],
    } as SocialDraft;
    renderAt(<SchedulePanel draft={draft} />, "/admin/social/queue");
    expect(await screen.findByText("Instagram said no.")).toBeTruthy();
    expect(screen.getByText("Waiting for reconnect")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls.some((c) => c.path.includes("/2/retry"))).toBe(true));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    await waitFor(() => expect(calls.some((c) => c.path.includes("/1/cancel"))).toBe(true));
  });

  it("hints that junior cards never auto-publish, and hides the form for drafts in review", async () => {
    stubApi({ "GET /social-connections/meta": CONNECTED });
    const junior = { ...DRAFT, sourceMatchIsJunior: true } as SocialDraft;
    renderAt(<SchedulePanel draft={junior} />, "/admin/social/queue");
    expect(await screen.findByText(/Junior cards never publish automatically/)).toBeTruthy();
    cleanup();
    renderAt(
      <SchedulePanel draft={{ ...DRAFT, status: "awaiting_review" } as SocialDraft} />,
      "/admin/social/queue",
    );
    await screen.findByRole("region", { name: "Publish to Facebook and Instagram" });
    expect(screen.queryByRole("button", { name: "Publish now" })).toBeNull();
  });
});

describe("needs attention", () => {
  it("Covers AE3 / R18: lists a reconnect and cards that couldn't be published", async () => {
    stubApi({
      "GET /social-connections/meta": {
        ...CONNECTED,
        status: "needs_reconnect",
        statusReason: "Meta access was revoked or expired.",
      },
      "GET /social-drafts?status=ready": [{ ...DRAFT, needsAttention: true }],
      "GET /tenant-plan": {
        plan: "pro",
        entitlements: {
          customDomain: true,
          mobileApp: true,
          socialStudio: true,
          socialPublishing: true,
          clubroomTv: true,
          curation: true,
        },
      },
    });
    renderAt(<NeedsAttention />, "/admin");
    expect(await screen.findByText("Reconnect Facebook and Instagram")).toBeTruthy();
    expect(await screen.findByText("1 card couldn't be published")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in the queue" }).getAttribute("href")).toContain(
      "ids=7",
    );
  });
});
