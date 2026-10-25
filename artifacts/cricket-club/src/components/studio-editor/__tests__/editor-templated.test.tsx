/**
 * A templated draft opens in the full editor (full draft editor plan, stage 1):
 * the template's own layers are in Layers with the draft's content panels
 * beside the editor's, and saving stores the one design on the draft.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Route } from "wouter";
import AdminStudioEditor from "@/pages/admin-studio-editor";
import { renderAt } from "@/test/render";
import { stressSample } from "@/lib/kind-templates/samples";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROWS_DOC = {
  layers: [
    {
      id: "results",
      kind: "rows",
      name: "Results",
      geometry: { square: { x: 0, y: 0, w: 100, h: 50 } },
      rows: { repeat: "matches", rowHeight: 10, cells: [{ field: "grade", x: 0, w: 100 }] },
    },
  ],
};

const DRAFT = {
  id: 11,
  engine: "roundup",
  family: "roundup",
  status: "awaiting_review",
  // The sample weekend wrap grown to nine results.
  cardInput: stressSample("weekendWrap"),
  appPath: "/results",
  sourceMatchIsJunior: false,
  createdAt: "2026-09-20T00:00:00Z",
  packId: "blank",
  templateVersion: 3,
  layoutCheckPending: false,
  layoutWarnings: { square: [] },
  adjustments: ROWS_DOC,
};

type Req = { method: string; url: string; body: unknown };

function open(): Req[] {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let payload: unknown = [];
      if (method === "PATCH") payload = { ...DRAFT, ...(body as object) };
      else if (/\/api\/social-drafts\/11$/.test(url)) payload = DRAFT;
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [DRAFT];
      else if (/social-settings/.test(url))
        payload = { settings: {}, captionTemplates: [], activeSponsors: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  renderAt(
    <Route path="/admin/social/editor/:id">
      <AdminStudioEditor />
    </Route>,
    "/admin/social/editor/11",
  );
  return requests;
}

describe("a templated draft in the editor", () => {
  it("opens its own design in the full editor and saves the one design", async () => {
    const requests = open();
    // The template's own list is a layer, and the draft's content panels sit in the rail.
    fireEvent.click(await screen.findByRole("button", { name: "Layers" }));
    expect(await screen.findByText("Results")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cricket" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Live stats" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a heading" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PATCH")).toBe(true));
    const patch = requests.find((r) => r.method === "PATCH")!.body as {
      adjustments: { formatVersion?: number; pages?: { card?: { layers: unknown[] } } };
    };
    // A heading on one size makes it a page-based design: the list and the heading, one page.
    expect(patch.adjustments.formatVersion).toBe(2);
    expect(patch.adjustments.pages?.card?.layers).toHaveLength(2);
  });
});
