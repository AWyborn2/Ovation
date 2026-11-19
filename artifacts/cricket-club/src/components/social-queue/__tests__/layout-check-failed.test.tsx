/**
 * Layout checks that never finish (retest 7): the queue badge says when the
 * check was last tried, and a check that gave up after three failed tries
 * shows as "Layout check failed", lists under "Needs a look", explains itself
 * in the drawer and is marked ready only after a confirmation.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import AdminSocialQueue from "@/pages/admin-social-queue";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { renderAt } from "@/test/render";
import {
  clubDateTimeLabel,
  layoutCheckBadge,
  layoutNeedsAttention,
  layoutState,
} from "@/components/social-queue/draft-meta";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string };

// 06:05 UTC is 2:05 pm in Perth.
const TRIED = "2026-11-19T06:05:00Z";

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
  createdAt: "2026-11-19T01:00:00Z",
  packId: "blank",
  templateVersion: 2,
  layoutWarnings: null,
  layoutCheckPending: true,
  layoutCheckAttempts: 0,
  layoutCheckLastTriedAt: null,
  layoutCheckFailed: false,
  layoutCheckError: null,
};

const FAILED = {
  ...base,
  id: 21,
  cardInput: { kind: "century", playerName: "Sam Keeper", runs: 104 },
  layoutCheckAttempts: 3,
  layoutCheckLastTriedAt: TRIED,
  layoutCheckFailed: true,
  layoutCheckError:
    "The card renderer page didn't start the card renderer within 90 s (after 90 s).",
};
const RETRYING = {
  ...base,
  id: 22,
  cardInput: { kind: "century", playerName: "Jo Bloggs", runs: 101 },
  layoutCheckAttempts: 1,
  layoutCheckLastTriedAt: TRIED,
};
const WAITING = {
  ...base,
  id: 23,
  cardInput: { kind: "century", playerName: "Ali Khan", runs: 120 },
};

describe("layout check state", () => {
  it("tells a failed check apart from one still being checked", () => {
    expect(layoutState(FAILED)).toBe("check-failed");
    expect(layoutState(RETRYING)).toBe("checking");
    expect(layoutState(WAITING)).toBe("checking");
    // A pack draft never owes a check, whatever its columns say.
    expect(layoutState({ ...FAILED, templateVersion: null })).toBe("clear");
    // Warnings from an earlier check win: the card needs a look either way.
    expect(
      layoutState({
        ...FAILED,
        layoutWarnings: { square: [{ reason: "overflow", size: "square" }] },
      }),
    ).toBe("needs-look");
  });

  it("lists a failed check under Needs a look, but not one still being checked", () => {
    expect(layoutNeedsAttention(FAILED)).toBe(true);
    expect(layoutNeedsAttention(RETRYING)).toBe(false);
  });

  it("shows the last try as DD/MM/YYYY in club time", () => {
    expect(clubDateTimeLabel(TRIED)).toBe("19/11/2026, 2:05 pm");
    expect(clubDateTimeLabel("2026-01-04T23:30:00Z")).toBe("05/01/2026, 7:30 am");
  });

  it("words the badge", () => {
    expect(layoutCheckBadge(FAILED)).toEqual({
      label: "Layout check failed",
      tone: "danger",
      lastTried: "last tried 19/11/2026, 2:05 pm",
      text: "Layout check failed · last tried 19/11/2026, 2:05 pm",
    });
    expect(layoutCheckBadge(RETRYING)?.text).toBe(
      "Checking layout · last tried 19/11/2026, 2:05 pm",
    );
    expect(layoutCheckBadge(WAITING)?.text).toBe("Checking layout");
    expect(layoutCheckBadge({ ...WAITING, layoutCheckPending: false })).toBeNull();
    for (const d of [FAILED, RETRYING, WAITING])
      expect(layoutCheckBadge(d)?.text ?? "").not.toMatch(/—/);
  });
});

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
      if (method === "POST" && /social-drafts\/21\/approve$/.test(url))
        payload = { ...FAILED, status: "ready" };
      else if (/pending-count/.test(url)) payload = { count: 3 };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [FAILED, RETRYING, WAITING];
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

const pillText = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ").trim();

describe("the queue", () => {
  it("badges each draft with its check state and when it was last tried", async () => {
    open();
    await screen.findByText("Sam Keeper");
    const failed = screen.getByText("Layout check failed");
    expect(pillText(failed)).toBe("Layout check failed · last tried 19/11/2026, 2:05 pm");
    const checking = screen.getAllByText("Checking layout").map(pillText);
    expect(checking.sort()).toEqual([
      "Checking layout",
      "Checking layout · last tried 19/11/2026, 2:05 pm",
    ]);
  });

  it("lists a failed check under Needs a look", async () => {
    open();
    await screen.findByText("Sam Keeper");
    fireEvent.click(screen.getByRole("button", { name: "Needs a look (1)" }));
    expect(screen.getByText("Sam Keeper")).toBeTruthy();
    expect(screen.queryByText("Jo Bloggs")).toBeNull();
    expect(screen.queryByText("Ali Khan")).toBeNull();
  });

  it("explains the failed check in the drawer and links to the editor", async () => {
    open();
    fireEvent.click(await screen.findByText("Sam Keeper"));
    const dialog = await screen.findByRole("dialog");
    const notice = within(dialog).getByRole("status", { name: "Layout check failed" });
    expect(notice.textContent).toMatch(/tried 3 times, last on 19\/11\/2026, 2:05 pm/);
    expect(notice.textContent).toMatch(/didn't start the card renderer within 90 s/);
    expect(notice.textContent).toMatch(/Automatic posting skips this card/);
    expect(within(notice).getByRole("link", { name: "Edit design" }).getAttribute("href")).toBe(
      "/admin/social/editor/21",
    );
    expect(notice.textContent ?? "").not.toMatch(/—/);
  });

  it("marks a failed check ready only after confirming", async () => {
    const requests = open();
    fireEvent.click(await screen.findByText("Sam Keeper"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark ready anyway" }));
    const confirmBox = await screen.findByRole("alertdialog");
    expect(within(confirmBox).getByText(/layout couldn't be checked/)).toBeTruthy();
    expect(requests.some((r) => r.method === "POST" && /21\/approve$/.test(r.url))).toBe(false);
    fireEvent.click(within(confirmBox).getByRole("button", { name: "Mark ready anyway" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && /21\/approve$/.test(r.url))).toBe(true),
    );
  });
});
