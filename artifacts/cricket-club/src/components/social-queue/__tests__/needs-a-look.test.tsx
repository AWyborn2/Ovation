/**
 * Card kind templates U9 — "Needs a look" in the queue (AE2): the badge, the
 * filter, the drawer's reasons and Edit design link, and Mark ready anyway
 * behind a confirmation.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { renderAt } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string };

const base = {
  engine: "milestone",
  family: "achievements",
  status: "awaiting_review",
  appPath: "/players/1",
  trackedSlug: null,
  sourceMatchIsJunior: false,
  caption: "x",
  photoUrl: null,
  photoSource: null,
  staleSince: null,
  createdAt: "2026-09-20T10:00:00Z",
  packId: "blank",
  templateVersion: 2,
  layoutCheckPending: false,
};

const FLAGGED = {
  ...base,
  id: 7,
  cardInput: { kind: "century", playerName: "Sam Keeper", runs: 104 },
  layoutWarnings: {
    square: [{ reason: "overflow", size: "square", layerId: "name" }],
    story: [],
  },
};
const CLEAN = {
  ...base,
  id: 8,
  cardInput: { kind: "century", playerName: "Jo Bloggs", runs: 101 },
  layoutWarnings: { square: [] },
};
const CHECKING = {
  ...base,
  id: 9,
  cardInput: { kind: "century", playerName: "Ali Khan", runs: 120 },
  layoutWarnings: null,
  layoutCheckPending: true,
};

function stubApi(): Req[] {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      requests.push({ method, url });
      let payload: unknown = [];
      if (method === "POST" && /social-drafts\/7\/approve$/.test(url))
        payload = { ...FLAGGED, status: "ready" };
      else if (/pending-count/.test(url)) payload = { count: 3 };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [FLAGGED, CLEAN, CHECKING];
      else if (/social-settings/.test(url))
        payload = { settings: { clubUrl: "", familyConfig: {} }, captionTemplates: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

function open() {
  const requests = stubApi();
  renderAt(
    <ConfirmProvider>
      <AdminSocialQueue />
    </ConfirmProvider>,
    "/admin/social/queue",
  );
  return requests;
}

describe("needs a look", () => {
  it("badges a flagged draft and filters to it (AE2)", async () => {
    open();
    await screen.findByText("Sam Keeper");
    expect(screen.getAllByText("Needs a look")).toHaveLength(1);
    expect(screen.getByText("Checking layout")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Needs a look (1)" }));
    expect(screen.getByText("Sam Keeper")).toBeTruthy();
    expect(screen.queryByText("Jo Bloggs")).toBeNull();
    expect(screen.queryByText("Ali Khan")).toBeNull();
  });

  it("explains the reason in the drawer and links to the editor", async () => {
    open();
    fireEvent.click(await screen.findByText("Sam Keeper"));
    const dialog = await screen.findByRole("dialog");
    const notice = within(dialog).getByRole("status", { name: "Needs a look" });
    expect(notice.textContent).toMatch(/Square: some text doesn't fit its box/);
    expect(within(notice).getByRole("link", { name: "Edit design" }).getAttribute("href")).toBe(
      "/admin/social/editor/7",
    );
  });

  it("marks ready anyway only after confirming", async () => {
    const requests = open();
    fireEvent.click(await screen.findByText("Sam Keeper"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark ready anyway" }));
    const confirmBox = await screen.findByRole("alertdialog");
    expect(within(confirmBox).getByText(/doesn't fit its design/)).toBeTruthy();
    fireEvent.click(within(confirmBox).getByRole("button", { name: "Mark ready anyway" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && /7\/approve$/.test(r.url))).toBe(true),
    );
  });

  it("a clean draft is marked ready without a confirmation", async () => {
    const requests = open();
    fireEvent.click(await screen.findByText("Jo Bloggs"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark ready" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && /8\/approve$/.test(r.url))).toBe(true),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
