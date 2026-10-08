/**
 * Card kind templates U8 — the template editor: starter choice, add to other
 * sizes as one undo step, text style and field tokens through save, save
 * rules, version conflicts, the apply dialog, and the phone fallback.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminKindTemplateEditor from "@/pages/admin-kind-template-editor";
import { renderAt } from "@/test/render";

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

const box = { x: 10, y: 10, w: 80, h: 20 };
/** A full template: one heading on every size. */
const FULL_DOC = {
  layers: [
    {
      id: "title",
      kind: "text",
      name: "Title",
      content: "CENTURY",
      style: { fontSize: 8 },
      geometry: { square: box, portrait: box, story: box, landscape: box },
    },
  ],
};

const template = (over: Record<string, unknown> = {}) => ({
  kind: "century",
  version: 1,
  updatedAt: null,
  replacedPackId: null,
  noticeDismissed: false,
  waitingDrafts: 0,
  document: FULL_DOC,
  ...over,
});

type Api = {
  platformAdmin?: boolean;
  template?: Record<string, unknown> | null;
  waiting?: number;
  saveStatus?: number;
  saveBody?: unknown;
};

function stubApi(api: Api = {}): Req[] {
  const requests: Req[] = [];
  const current = api.template === undefined ? template() : api.template;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let status = 200;
      let payload: unknown = [];
      if (/platform\/auth\/me/.test(url)) {
        status = api.platformAdmin ? 200 : 401;
        payload = api.platformAdmin ? { id: 1, email: "ops@example.test" } : { error: "no" };
      } else if (/\/api\/kind-templates$/.test(url)) {
        payload = {
          enabled: true,
          templates: [{ ...template(), waitingDrafts: api.waiting ?? 0 }],
        };
      } else if (method === "POST" && /kind-templates\/century\/start$/.test(url)) {
        payload = template();
      } else if (method === "POST" && /kind-templates\/century\/apply$/.test(url)) {
        payload = { changed: 2, skipped: 1 };
      } else if (method === "PUT" && /kind-templates\/century$/.test(url)) {
        status = api.saveStatus ?? 200;
        payload =
          api.saveBody ??
          template({
            version: 2,
            document: (body as { document: unknown }).document,
            waitingDrafts: api.waiting ?? 0,
          });
      } else if (/kind-templates\/century$/.test(url)) {
        if (current === null) status = 404;
        payload = current ?? { error: "Not found" };
      } else if (/social-settings/.test(url)) {
        payload = { settings: {}, captionTemplates: [], activeSponsors: [] };
      }
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

function open(api: Api = {}, width = 1440) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  const requests = stubApi(api);
  renderAt(
    <Route path="/admin/social/templates/:kind">
      <AdminKindTemplateEditor />
    </Route>,
    "/admin/social/templates/century",
  );
  return requests;
}

const layerBoxes = () => document.querySelectorAll('[data-testid^="layer-"]');
const selectLayer = (id: string) =>
  fireEvent.pointerDown(document.querySelector(`[data-testid="layer-${id}"]`)!);
const format = (value: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value } });
const saved = (requests: Req[]) => requests.filter((r) => r.method === "PUT");

describe("template editor", () => {
  it("offers the starters when the kind has no template, and starts from the pick", async () => {
    const requests = open({ template: null });
    fireEvent.click(await screen.findByRole("button", { name: "Start from Club Kit" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "POST" && /start$/.test(r.url))).toBe(true),
    );
    const start = requests.find((r) => /start$/.test(r.url))!;
    expect(start.body).toEqual({ starter: "club-kit" });
    expect(await screen.findByRole("combobox", { name: "Format" })).toBeTruthy();
  });

  it("adds an element to every size as one undo step (AE5)", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a heading" }));
    expect(layerBoxes()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Add to all sizes" }));
    for (const size of ["portrait", "story", "landscape"]) {
      format(size);
      expect(layerBoxes()).toHaveLength(2);
    }
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(layerBoxes()).toHaveLength(1);
    format("square");
    expect(layerBoxes()).toHaveLength(1);
  });

  it("keeps an element on its own size when the admin says so", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a heading" }));
    fireEvent.click(screen.getByRole("button", { name: "Just square" }));
    format("story");
    expect(layerBoxes()).toHaveLength(1);
  });

  it("saves text style, including letter spacing, and a field token", async () => {
    const requests = open();
    await screen.findByRole("combobox", { name: "Format" });
    selectLayer("title");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Letter spacing" }), {
      target: { value: "0.12" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size" }), {
      target: { value: "11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Align left" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Font weight" }), {
      target: { value: "900" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Insert Runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved(requests)).toHaveLength(1));
    const body = saved(requests)[0].body as { baseVersion: number; document: typeof FULL_DOC };
    expect(body.baseVersion).toBe(1);
    const title = body.document.layers.find((l) => l.id === "title")!;
    expect(title.style).toMatchObject({
      letterSpacing: 0.12,
      fontSize: 11,
      align: "left",
      fontWeight: 900,
    });
    expect(title.content).toBe("CENTURY {{runs}}");
  });

  it("renders an inserted field with the card's value", async () => {
    open();
    await screen.findByRole("combobox", { name: "Format" });
    selectLayer("title");
    const runs = screen.getByRole("button", { name: "Insert Runs" });
    const value = within(runs).getAllByText(/./).at(-1)!.textContent!;
    fireEvent.click(runs);
    const board = screen.getByTestId("editor-artboard");
    expect(board.textContent).toContain(`CENTURY ${value}`);
    expect(board.textContent).not.toContain("{{runs}}");
  });

  it("won't save with an empty size, and names it", async () => {
    const requests = open({
      template: template({
        document: {
          layers: [{ ...FULL_DOC.layers[0], sizes: ["square", "portrait", "landscape"] }],
        },
      }),
    });
    await screen.findByRole("combobox", { name: "Format" });
    selectLayer("title");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size" }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Story has no elements/);
    expect(saved(requests)).toHaveLength(0);
  });

  it("shows a conflict instead of overwriting another admin's save", async () => {
    open({
      saveStatus: 409,
      saveBody: { error: "conflict", currentVersion: 2, updatedByName: "Pat" },
    });
    await screen.findByRole("combobox", { name: "Format" });
    selectLayer("title");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size" }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Someone else changed this template \(Pat\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load their version" })).toBeTruthy();
  });

  it("offers to apply to waiting cards, defaulting to Don't apply (AE4)", async () => {
    const requests = open({ waiting: 3 });
    await screen.findByRole("combobox", { name: "Format" });
    selectLayer("title");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size" }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: /Update 3 waiting cards/ });
    expect(within(dialog).getByText(/Their captions are kept/)).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole("button", { name: "Don't apply" }),
      ),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply to waiting cards" }));
    expect(await screen.findByText(/2 cards now use this design/)).toBeTruthy();
    expect(screen.getByText(/1 card was posted in the meantime/)).toBeTruthy();
    const apply = requests.find((r) => /apply$/.test(r.url))!;
    expect(apply.body).toEqual({ version: 2, expectedDrafts: 3 });
  });

  it("doesn't offer to apply when no cards are waiting", async () => {
    const requests = open({ waiting: 0 });
    await screen.findByRole("combobox", { name: "Format" });
    selectLayer("title");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Font size" }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved(requests)).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows Export as starter to platform admins only (T6.2)", async () => {
    open();
    await screen.findByRole("combobox", { name: "Format" });
    expect(screen.queryByRole("button", { name: "Export as starter" })).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    open({ platformAdmin: true });
    expect(await screen.findByRole("button", { name: "Export as starter" })).toBeTruthy();
  });

  it("tells a phone to use a computer or tablet", async () => {
    open({}, 390);
    expect(await screen.findByText(/Open on a computer or tablet to edit templates/)).toBeTruthy();
    expect(screen.queryByTestId("editor-artboard")).toBeNull();
  });

  it("edits on a tablet-width screen", async () => {
    open({}, 820);
    expect(await screen.findByTestId("editor-artboard")).toBeTruthy();
  });
});
