/**
 * Social Studio U9 — the notification bell (unread count, opening marks read,
 * empty state) and the auto-post settings card.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderAt } from "@/test/render";
import { NotificationBell } from "..";
import { AutoPostCard } from "@/components/social-queue/auto-post-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };

function stub(reply: (req: Req) => unknown): Req[] {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const req = {
        method: (init?.method ?? "GET").toUpperCase(),
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      requests.push(req);
      return new Response(JSON.stringify(reply(req)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const NOTE = {
  id: 1,
  kind: "drafts_ready",
  title: "3 cards are ready to post",
  body: "Their review window ended.",
  link: "/admin/social/queue?ids=1,2,3",
  createdAt: new Date().toISOString(),
  readAt: null,
};

describe("NotificationBell", () => {
  it("shows the unread count, and opening lists the notifications and marks them read", async () => {
    const requests = stub((r) =>
      r.method === "POST"
        ? { unreadCount: 0, items: [{ ...NOTE, readAt: new Date().toISOString() }] }
        : { unreadCount: 1, items: [NOTE] },
    );
    renderAt(<NotificationBell />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    expect(await screen.findByText("3 cards are ready to post")).toBeTruthy();
    expect(screen.getByRole("link", { name: /3 cards are ready/ }).getAttribute("href")).toBe(
      "/admin/social/queue?ids=1,2,3",
    );
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "POST" && r.url.endsWith("/notifications/read")),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy());
  });

  it("with none, says so", async () => {
    stub(() => ({ unreadCount: 0, items: [] }));
    renderAt(<NotificationBell />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications")).toBeTruthy();
  });
});

describe("AutoPostCard", () => {
  it("saves the switch, window and email together", async () => {
    const requests = stub(() => ({}));
    renderAt(
      <AutoPostCard
        settings={
          {
            autoPostEnabled: false,
            autoPostWindowHours: 12,
            notificationEmail: null,
          } as never
        }
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Move drafts to Ready automatically" }));
    fireEvent.change(screen.getByLabelText("Review window"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Notification email"), {
      target: { value: "studio@club.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const patch = requests.find((r) => r.method === "PATCH");
      expect(patch?.body).toEqual({
        autoPostEnabled: true,
        autoPostWindowHours: 6,
        notificationEmail: "studio@club.example",
      });
    });
  });

  it("rejects a window outside 1–168 hours without saving", () => {
    const requests = stub(() => ({}));
    renderAt(
      <AutoPostCard
        settings={
          { autoPostEnabled: true, autoPostWindowHours: 12, notificationEmail: null } as never
        }
      />,
    );
    fireEvent.change(screen.getByLabelText("Review window"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText(/between 1 and 168 hours/)).toBeTruthy();
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });
});
