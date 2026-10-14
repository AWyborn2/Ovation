import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { Route } from "wouter";
import type { AvailabilityResponsePage } from "@workspace/api-client-react";
import { renderAt } from "@/test/render";
import AvailabilityRespond from "@/pages/availability-respond";
import { AVAILABILITY_LINK_ROUTES } from "@/lib/availability-routes";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * U11 — the public page a player or guardian opens from their availability
 * message. Fetch is faked per test; every write answers with the full page,
 * which the page puts straight into its query cache.
 */
const TOKEN = "tok_abc123";

function basePage(over: Partial<AvailabilityResponsePage> = {}): AvailabilityResponsePage {
  return {
    clubName: "Demo Cricket Club",
    clubShortName: "Demo CC",
    logoUrl: null,
    primaryColour: "#1d4ed8",
    firstName: "Sam",
    displayName: "Sam Smith",
    recipientSlot: "account",
    self: true,
    weekendDate: "2026-10-10",
    dates: [
      { date: "2026-10-10", status: null, note: null, late: false, locked: false },
      { date: "2026-10-11", status: null, note: null, late: false, locked: false },
    ],
    away: [],
    contact: { mobile: "04xx xxx 678", email: "s***@example.com" },
    selection: null,
    canWithdraw: false,
    locked: false,
    withdrawn: false,
    late: false,
    smsOptedOut: false,
    textsAvailable: true,
    ...over,
  };
}

type Call = { method: string; url: string; body: unknown };

function installFetch(
  handler: (call: Call) => { status: number; body?: unknown } | undefined,
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const call = { method, url, body };
      calls.push(call);
      const out = handler(call) ?? { status: 200, body: [] };
      return new Response(out.body === undefined ? null : JSON.stringify(out.body), {
        status: out.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

function renderPage() {
  return renderAt(
    <Route path="/availability/:token">
      <AvailabilityRespond />
    </Route>,
    `/availability/${TOKEN}`,
  );
}

describe("AvailabilityRespond (U11)", () => {
  it.each([
    ["/a/r6/", "the short link with a round tag"],
    ["/a/", "the short link without a tag"],
    ["/availability/", "the older long link"],
  ])("opens from %s (%s) with the token from the path", async (prefix) => {
    const calls = installFetch(({ url }) =>
      url.includes(`/availability/respond/${TOKEN}`)
        ? { status: 200, body: basePage() }
        : undefined,
    );
    renderAt(
      <>
        {AVAILABILITY_LINK_ROUTES.map((path) => (
          <Route key={path} path={path}>
            <AvailabilityRespond />
          </Route>
        ))}
      </>,
      `${prefix}${TOKEN}`,
    );
    expect(await screen.findByRole("heading", { name: "Hi Sam" })).toBeTruthy();
    // Exactly one route matched, and it asked the API for this token only.
    expect(screen.getAllByRole("heading", { name: "Hi Sam" })).toHaveLength(1);
    const gets = calls.filter((c) => c.url.includes("/availability/respond/"));
    expect(gets.length).toBeGreaterThan(0);
    for (const c of gets) expect(c.url).toMatch(new RegExp(`/api/availability/respond/${TOKEN}$`));
  });

  it("renders one answer row per date returned", async () => {
    installFetch(({ url }) =>
      url.includes(`/availability/respond/${TOKEN}`)
        ? { status: 200, body: basePage() }
        : undefined,
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "Hi Sam" })).toBeTruthy();
    const rows = screen.getAllByTestId("date-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("button", { name: "Yes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Contact details are the masked values the API returned.
    expect(screen.getByText("04xx xxx 678")).toBeTruthy();
  });

  it("asks a guardian whether the player is available", async () => {
    installFetch(() => ({
      status: 200,
      body: basePage({ self: false, recipientSlot: "guardian1" }),
    }));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Is Sam available?" })).toBeTruthy();
  });

  it("tapping Yes calls the PUT and shows Saved", async () => {
    const calls = installFetch(({ method }) => {
      if (method === "PUT") {
        const page = basePage();
        page.dates[0] = { ...page.dates[0], status: "yes" };
        return { status: 200, body: page };
      }
      return { status: 200, body: basePage() };
    });
    renderPage();
    const rows = await screen.findAllByTestId("date-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Yes" }));

    expect(await within(rows[0]).findByText("Saved")).toBeTruthy();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain(`/api/availability/respond/${TOKEN}`);
    expect(put?.body).toEqual({ answers: [{ date: "2026-10-10", status: "yes", note: null }] });
    expect(within(rows[0]).getByRole("button", { name: "Yes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The other row is untouched.
    expect(within(rows[1]).queryByText("Saved")).toBeNull();
  });

  it("a selected player sees the match, and confirming Can't make it withdraws", async () => {
    const selected = basePage({
      locked: true,
      canWithdraw: true,
      dates: [
        { date: "2026-10-10", status: "yes", note: null, late: false, locked: true },
        { date: "2026-10-11", status: null, note: null, late: false, locked: false },
      ],
      selection: {
        grade: "C Grade",
        opponent: "Mandurah",
        venue: "Halls Head Oval",
        startAt: "2026-10-10T04:30:00.000Z",
        isHome: true,
        role: "WK",
        twelfth: false,
      },
    });
    const withdrawn = basePage({ withdrawn: true });
    const calls = installFetch(({ method, url }) =>
      method === "POST" && url.endsWith("/withdraw")
        ? { status: 200, body: withdrawn }
        : { status: 200, body: selected },
    );
    renderPage();

    expect(await screen.findByText("You've been picked")).toBeTruthy();
    expect(screen.getByText("C Grade")).toBeTruthy();
    expect(screen.getByText(/Mandurah/)).toBeTruthy();
    expect(screen.getByText("Halls Head Oval")).toBeTruthy();
    expect(screen.getByText("Wicketkeeper")).toBeTruthy();
    expect(screen.getByText(/12:30/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Can't make it" }));
    // In-page confirm step: nothing sent until confirmed.
    expect(calls.some((c) => c.url.endsWith("/withdraw"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Yes, I can't make it" }));

    expect(await screen.findByText(/Your captain has been told/)).toBeTruthy();
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/withdraw"));
    expect(post?.url).toContain(`/api/availability/respond/${TOKEN}/withdraw`);
    expect(screen.queryByText("You've been picked")).toBeNull();
  });

  it("a player picked 12th sees they're the 12th player", async () => {
    installFetch(() => ({
      status: 200,
      body: basePage({
        locked: true,
        canWithdraw: true,
        selection: {
          grade: "A Grade",
          opponent: "Mandurah",
          venue: null,
          startAt: "2026-10-10T04:30:00.000Z",
          isHome: false,
          role: null,
          twelfth: true,
        },
      }),
    }));
    renderPage();
    expect(await screen.findByText("You've been picked")).toBeTruthy();
    expect(screen.getByText("12th player")).toBeTruthy();
  });

  it("shows server validation errors inline for away dates", async () => {
    installFetch(({ method }) =>
      method === "POST"
        ? { status: 400, body: { error: "in_the_past" } }
        : { status: 200, body: basePage() },
    );
    renderPage();
    await screen.findByRole("heading", { name: "Hi Sam" });
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-01-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Add away dates" }));
    expect(await screen.findByText("Away dates can't be in the past.")).toBeTruthy();
  });

  it("a second contact change within 12 hours shows a friendly message", async () => {
    installFetch(({ method }) =>
      method === "PATCH"
        ? { status: 429, body: { error: "too_many_changes" } }
        : { status: 200, body: basePage() },
    );
    renderPage();
    await screen.findByRole("heading", { name: "Hi Sam" });
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.change(screen.getByLabelText("New email"), { target: { value: "sam@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(
      await screen.findByText(/Your contact details were changed in the last 12 hours/),
    ).toBeTruthy();
  });

  it("Stop text messages posts stop and confirms email only; Start again posts stop: false", async () => {
    let stopped = false;
    const calls = installFetch(({ method, url, body }) => {
      if (method === "POST" && url.endsWith("/texts")) {
        stopped = (body as { stop: boolean }).stop;
        return { status: 200, body: basePage({ smsOptedOut: stopped }) };
      }
      return { status: 200, body: basePage({ smsOptedOut: stopped }) };
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Stop text messages" }));
    expect(await screen.findByText("Done. We'll only email you from now on.")).toBeTruthy();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toContain(`/api/availability/respond/${TOKEN}/texts`);
    expect(post?.body).toEqual({ stop: true });

    fireEvent.click(screen.getByRole("button", { name: "Start text messages again" }));
    expect(await screen.findByText("Text messages are on again.")).toBeTruthy();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([
      { stop: true },
      { stop: false },
    ]);
    expect(screen.getByRole("button", { name: "Stop text messages" })).toBeTruthy();
  });

  it("an opted-out recipient sees the email-only note; no control without a mobile or texts", async () => {
    installFetch(() => ({ status: 200, body: basePage({ smsOptedOut: true }) }));
    renderPage();
    expect(await screen.findByTestId("texts-stopped")).toHaveTextContent(/only email you/);
    expect(screen.getByRole("button", { name: "Start text messages again" })).toBeTruthy();
    cleanup();

    installFetch(() => ({
      status: 200,
      body: basePage({ contact: { mobile: null, email: "s***@example.com" } }),
    }));
    renderPage();
    await screen.findByRole("heading", { name: "Hi Sam" });
    expect(screen.queryByTestId("text-messages")).toBeNull();
    cleanup();

    installFetch(() => ({ status: 200, body: basePage({ textsAvailable: false }) }));
    renderPage();
    await screen.findByRole("heading", { name: "Hi Sam" });
    expect(screen.queryByTestId("text-messages")).toBeNull();
  });

  it("a 404 shows the expired-link message", async () => {
    installFetch(() => ({ status: 404, body: { error: "not_found" } }));
    renderPage();
    expect(
      await screen.findByText(
        "This link has expired or isn't valid. Contact your club for a new one.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("date-row")).toBeNull());
  });
});
