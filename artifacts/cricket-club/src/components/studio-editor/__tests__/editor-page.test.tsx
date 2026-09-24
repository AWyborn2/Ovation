/**
 * Social Studio U16 — the editor page: add layers, undo/redo, keyboard nudge,
 * multi-select, saving adjustments, and the small-screen fallback.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Route } from "wouter";
import AdminStudioEditor from "@/pages/admin-studio-editor";
import { renderAt } from "@/test/render";

// jsdom has no PointerEvent; without it pointer events drop their modifier keys.
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };

const DRAFT = {
  id: 7,
  engine: "milestone",
  family: "achievements",
  status: "awaiting_review",
  cardInput: { kind: "century", playerName: "Sam Keeper", runs: 104, grade: "A Grade" },
  appPath: "/players/1",
  sourceMatchIsJunior: false,
  createdAt: "2026-09-20T00:00:00Z",
  packId: "broadcast-dark",
  adjustments: null,
};

function stubApi(): Req[] {
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
      if (method === "PATCH" && /social-drafts\/7$/.test(url))
        payload = { ...DRAFT, ...(body as object) };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [DRAFT];
      else if (/social-settings/.test(url))
        payload = { settings: {}, captionTemplates: [], activeSponsors: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

function open(width = 1440) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  const requests = stubApi();
  renderAt(
    <Route path="/admin/social/editor/:id">
      <AdminStudioEditor />
    </Route>,
    "/admin/social/editor/7",
  );
  return requests;
}

const layerBoxes = () => document.querySelectorAll('[data-testid^="layer-"]');
const ctrl = (key: string, shift = false) =>
  fireEvent.keyDown(window, { key, ctrlKey: true, shiftKey: shift });

describe("editor page", () => {
  it("adds a heading, then undo removes it and redo restores it", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a heading" }));
    expect(layerBoxes()).toHaveLength(1);
    ctrl("z");
    expect(layerBoxes()).toHaveLength(0);
    ctrl("z", true);
    expect(layerBoxes()).toHaveLength(1);
  });

  it("arrow keys nudge the selection 0.5% (2% with Shift); Escape clears it", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Elements" }));
    fireEvent.click(screen.getByRole("button", { name: "Add square" }));
    const box = layerBoxes()[0] as HTMLElement;
    const x0 = parseFloat(box.style.left);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(parseFloat((layerBoxes()[0] as HTMLElement).style.left)).toBeCloseTo(x0 + 0.5);
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(parseFloat((layerBoxes()[0] as HTMLElement).style.left)).toBeCloseTo(x0 + 2.5);
    expect(screen.getByTestId("selection-box")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("selection-box")).toBeNull();
  });

  it("Delete removes the selected layer", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Elements" }));
    fireEvent.click(screen.getByRole("button", { name: "Add circle" }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(layerBoxes()).toHaveLength(0);
  });

  it("shift-click multi-selects; grouping then clicking one selects the group", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Elements" }));
    fireEvent.click(screen.getByRole("button", { name: "Add square" }));
    fireEvent.click(screen.getByRole("button", { name: "Add pill" }));
    const [a, b] = Array.from(layerBoxes()) as HTMLElement[];
    fireEvent.pointerDown(a);
    fireEvent.pointerUp(a);
    fireEvent.pointerDown(b, { shiftKey: true });
    expect(screen.getByTestId("multi-bounds").textContent).toContain("2 selected");
    ctrl("g");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(layerBoxes()[0] as HTMLElement);
    fireEvent.pointerUp(layerBoxes()[0] as HTMLElement);
    expect(screen.getByTestId("multi-bounds").textContent).toContain("Group · 2 layers");
  });

  it("overriding a field and saving writes the adjustments once", async () => {
    const requests = open();
    fireEvent.change(await screen.findByRole("textbox", { name: /Player name/i }), {
      target: { value: "S. Keeper" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() => {
      const patches = requests.filter((r) => r.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(patches[0].body).toMatchObject({
        adjustments: { fields: { playerName: "S. Keeper" } },
      });
    });
  });

  it("keeps the primary action visible on a narrower desktop", async () => {
    open(1100);
    expect(await screen.findByRole("button", { name: /Save/ })).toBeTruthy();
  });

  it("at 768px shows the card with a larger-screen notice instead of the canvas", async () => {
    open(768);
    expect(await screen.findByText(/Open the editor on a larger screen/)).toBeTruthy();
    expect(screen.queryByTestId("editor-artboard")).toBeNull();
  });
});
