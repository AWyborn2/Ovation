/**
 * Console → Element library (editable-elements plan, D5; decision E1): every
 * element with its credit and reports, reported first; Ovation unlists for
 * every club with a reason, lists again, or dismisses the reports.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderAt } from "@/test/render";
import LibraryElementsPage from "./library-elements";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const element = (over: Record<string, unknown> = {}) => ({
  id: 5,
  slug: null,
  name: "Copied crest ring",
  category: "crest-frames",
  tags: [],
  origin: "club",
  authorName: "Seaview CC",
  authorTenantId: 12,
  look: null,
  listed: true,
  unlistedBy: null,
  unlistReason: null,
  unlistedAt: null,
  openReports: 2,
  document: { formatVersion: 2, layers: [] },
  createdAt: "2026-10-22T01:00:00.000Z",
  ...over,
});

type Sent = { url: string; method: string; body: unknown };

function stubApi() {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      let payload: unknown = {};
      if (/\/elements\/5\/reports$/.test(url)) {
        payload = {
          reports: [
            {
              id: 1,
              clubName: "Harbour CC",
              reason: "That's our crest",
              createdAt: "2026-10-22T02:00:00.000Z",
              resolvedAt: null,
            },
          ],
        };
      } else if (method === "POST" && /\/elements\/5\/unlist$/.test(url)) {
        payload = element({ listed: false, unlistedBy: "ovation", openReports: 0 });
      } else if (/library\/elements/.test(url)) {
        payload = {
          elements: [
            element(),
            element({
              id: 6,
              name: "Gold rule",
              category: "rules",
              origin: "bundle",
              authorName: "Ovation",
              authorTenantId: null,
              look: { id: 1, slug: "club-kit", name: "Club Kit" },
              openReports: 0,
            }),
            element({
              id: 7,
              name: "Old badge",
              category: "badges",
              listed: false,
              unlistedBy: "ovation",
              unlistReason: "Off-brand",
              openReports: 0,
            }),
          ],
          total: 3,
          page: 1,
          pageSize: 100,
        };
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return sent;
}

describe("Element library console", () => {
  it("lists every element with its credit, status and open reports, and shows the reports", async () => {
    stubApi();
    renderAt(<LibraryElementsPage />);
    const list = await screen.findByRole("list", { name: "Elements" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]!.textContent).toMatch(/Copied crest ring.*Crest frames · Club · by Seaview CC/);
    expect(within(rows[0]!).getByText("2 open reports")).toBeTruthy();
    expect(await within(rows[0]!).findByText(/That's our crest/)).toBeTruthy();
    expect(rows[0]!.textContent).toMatch(/Harbour CC/);
    expect(rows[1]!.textContent).toMatch(/Gold rule.*Bundle · Club Kit/);
    expect(rows[2]!.textContent).toMatch(/Unlisted by Ovation/);
    expect(rows[2]!.textContent).toMatch(/Why: Off-brand/);
    expect(within(rows[2]!).getByRole("button", { name: "List again" })).toBeTruthy();
  });

  it("unlists for every club with a reason", async () => {
    const sent = stubApi();
    renderAt(<LibraryElementsPage />);
    const list = await screen.findByRole("list", { name: "Elements" });
    const row = within(list).getAllByRole("listitem")[0]!;
    fireEvent.click(within(row).getByRole("button", { name: "Unlist" }));
    fireEvent.change(within(row).getByRole("textbox", { name: "Reason for unlisting" }), {
      target: { value: "Another club's crest" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Unlist for every club" }));
    await waitFor(() =>
      expect(sent.find((r) => r.method === "POST")).toMatchObject({
        body: { reason: "Another club's crest" },
      }),
    );
    expect(sent.find((r) => r.method === "POST")!.url).toMatch(/\/elements\/5\/unlist$/);
  });

  it("filters to reported elements", async () => {
    const sent = stubApi();
    renderAt(<LibraryElementsPage />);
    await screen.findByRole("list", { name: "Elements" });
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() =>
      expect(sent.some((r) => /library\/elements\?(.*&)?reported=true/.test(r.url))).toBe(true),
    );
  });
});
