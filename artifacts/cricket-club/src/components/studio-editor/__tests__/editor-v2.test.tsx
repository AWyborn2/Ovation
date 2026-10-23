/**
 * Editor v2 (ADR-011 L5-B, T5.7–T5.13): a club template by id, its pages, the
 * Layer panel (conditions, stacks), saving as format v2 when v2 is used, the
 * layout check after a save, and the update badge.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminTemplateEditor from "@/pages/admin-template-editor";
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
const geometry = { square: box, portrait: box, story: box, landscape: box };
const MATCH_DAY = {
  layers: [
    { id: "grade", kind: "text", name: "Grade", content: "{{grade}}", geometry },
    {
      id: "venue",
      kind: "text",
      name: "Venue",
      content: "{{venue}}",
      geometry: { ...geometry, square: { ...box, y: 50 } },
    },
  ],
};

const copy = (over: Record<string, unknown> = {}) => ({
  id: 9,
  kind: "matchDay",
  name: "Our match day",
  version: 4,
  isDefault: false,
  basedOn: null,
  edited: false,
  updateAvailable: null,
  fitStatus: "pass",
  fitReport: null,
  coverage: { pages: ["fixture"], sizes: ["square"] },
  updatedAt: null,
  waitingDrafts: 0,
  document: MATCH_DAY,
  ...over,
});

function open(current = copy(), saved: Record<string, unknown> = {}) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let payload: unknown = [];
      if (method === "PUT" && /club-templates\/9$/.test(url)) {
        payload = copy({
          version: 5,
          edited: true,
          document: (body as { document: unknown }).document,
          ...saved,
        });
      } else if (/club-templates\/9$/.test(url)) payload = current;
      else if (/social-settings/.test(url))
        payload = { settings: {}, captionTemplates: [], activeSponsors: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  renderAt(
    <Route path="/admin/social/template/:id">
      <AdminTemplateEditor />
    </Route>,
    "/admin/social/template/9",
  );
  return requests;
}

const putBody = async (requests: Req[]) => {
  await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
  return requests.find((r) => r.method === "PUT")!.body as {
    baseVersion: number;
    document: Record<string, unknown>;
  };
};
const selectLayer = (id: string, mods: Record<string, boolean> = {}) =>
  fireEvent.pointerDown(document.querySelector(`[data-testid="layer-${id}"]`)!, mods);

describe("editor v2", () => {
  it("edits a page the template doesn't have yet, and saves format v2", async () => {
    const requests = open();
    // Match Day's pages are in the page strip (carousel set editor plan, part 2).
    const strip = await screen.findByRole("navigation", { name: "Pages" });
    expect(within(strip).getAllByText("· empty")).toHaveLength(3);
    fireEvent.click(within(strip).getByRole("button", { name: "2. Title page" }));
    expect(screen.getByText(/The title page is empty/)).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="layer-"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    const panelButtons = screen
      .getAllByRole("button")
      .filter((b) => /heading/i.test(b.textContent ?? ""));
    fireEvent.click(panelButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const body = await putBody(requests);
    expect(body.baseVersion).toBe(4);
    expect(body.document.formatVersion).toBe(2);
    const pages = body.document.pages as Record<string, { layers: unknown[] }>;
    expect(pages.fixture!.layers).toEqual(MATCH_DAY.layers);
    expect(pages.title!.layers.length).toBeGreaterThan(0);
  });

  it("sets when a layer shows from the Layer panel", async () => {
    const requests = open();
    await screen.findByRole("navigation", { name: "Pages" });
    selectLayer("venue");
    fireEvent.click(screen.getByRole("button", { name: "Layer" }));
    const panel = await screen.findByTestId("layer-design-panel");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Show when photo" }), {
      target: { value: "no" },
    });
    fireEvent.change(within(panel).getByRole("combobox", { name: "Text lines" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const body = await putBody(requests);
    const venue = (
      body.document.pages as Record<string, { layers: Array<Record<string, unknown>> }>
    ).fixture!.layers.find((l) => l.id === "venue")!;
    expect(venue.showWhen).toEqual({ photo: false });
    expect(venue.fit).toEqual({ maxLines: 2 });
  });

  it("clips a layer from the Layer panel, a drag on the clip pad undoing as one change", async () => {
    open();
    await screen.findByRole("navigation", { name: "Pages" });
    selectLayer("venue");
    fireEvent.click(screen.getByRole("button", { name: "Layer" }));
    const panel = await screen.findByTestId("layer-design-panel");
    fireEvent.change(within(panel).getByRole("combobox", { name: "Clip shape" }), {
      target: { value: "slash" },
    });
    const across = () =>
      (within(panel).getByRole("spinbutton", { name: "Point 2 across (%)" }) as HTMLInputElement)
        .value;
    expect(across()).toBe("100");
    const pad = within(panel).getByTestId("clip-pad");
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 120 }) as DOMRect;
    fireEvent.pointerDown(within(panel).getByTestId("clip-point-1"), { pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 90, clientY: 10 });
    fireEvent.pointerMove(pad, { clientX: 80, clientY: 10 });
    fireEvent.pointerUp(pad);
    expect(across()).toBe("70");
    expect(within(panel).getByRole("combobox", { name: "Clip shape" })).toHaveProperty(
      "value",
      "custom",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(across()).toBe("100");
    expect(within(panel).getByRole("combobox", { name: "Clip shape" })).toHaveProperty(
      "value",
      "slash",
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(panel).getByRole("combobox", { name: "Clip shape" })).toHaveProperty("value", "");
  });

  it("stacks two layers and lists them in the stack's controls", async () => {
    const requests = open();
    await screen.findByRole("navigation", { name: "Pages" });
    selectLayer("grade");
    selectLayer("venue", { shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Layer" }));
    fireEvent.click(await screen.findByRole("button", { name: /Stack these layers/ }));
    const panel = await screen.findByTestId("layer-design-panel");
    const list = within(panel).getByRole("list", { name: "Stack layers" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining("Grade"), expect.stringContaining("Venue")]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const body = await putBody(requests);
    const layers = (
      body.document.pages as Record<string, { layers: Array<Record<string, unknown>> }>
    ).fixture!.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ kind: "group", stack: { direction: "column" } });
  });

  it("shows the layout check after a save, and the update badge", async () => {
    open(copy({ updateAvailable: { version: 2 } }), {
      fitStatus: "pending",
      updateAvailable: null,
    });
    expect(await screen.findByRole("link", { name: "Update available" })).toBeTruthy();
    selectLayer("grade");
    fireEvent.click(screen.getByRole("button", { name: "Layer" }));
    fireEvent.change(
      within(await screen.findByTestId("layer-design-panel")).getByRole("combobox", {
        name: "Blend",
      }),
      { target: { value: "multiply" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Checking the layout…")).toBeTruthy();
  });

  it("previews at each content preset", async () => {
    open();
    const preset = await screen.findByRole("combobox", { name: "Preset" });
    expect(
      within(preset)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Minimal", "Standard", "Full"]);
  });
});

describe("a set template (carousel set editor plan, part 2)", () => {
  const SET = {
    formatVersion: 2,
    set: "teamLists",
    pages: [
      {
        id: "cover",
        role: "fixed",
        slot: "cover",
        kind: "teamListRound",
        page: "card",
        layers: [{ id: "c1", kind: "text", name: "Title", content: "SELECTED SIDES", geometry }],
      },
      {
        id: "team",
        role: "repeat",
        slot: "team",
        kind: "teamList",
        page: "team",
        layers: [{ id: "t1", kind: "text", name: "Grade", content: "{{grade}}", geometry }],
      },
      {
        id: "sponsors",
        role: "fixed",
        slot: "sponsors",
        kind: "matchDay",
        page: "sponsors",
        layers: [{ id: "s1", kind: "text", name: "Thanks", content: "THANKS", geometry }],
      },
    ],
  };
  const setCopy = () => copy({ kind: "set:teamLists", name: "Team lists set", document: SET });

  it("shows every slide in the page strip, edits the repeating page and saves the set", async () => {
    const requests = open(setCopy());
    const strip = await screen.findByRole("navigation", { name: "Team lists pages" });
    const tiles = within(strip).getAllByRole("button", { name: /^\d\. / });
    expect(tiles.map((b) => b.getAttribute("aria-label"))).toEqual([
      "1. Cover",
      "2. Team, repeats for each item",
      "3. Sponsors",
    ]);
    fireEvent.click(tiles[1]!);
    expect(screen.getByText(/This page repeats: one slide per team/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sample 3" })).toBeTruthy();
    // The team page's own layer is on the canvas; delete it and add a heading.
    expect(document.querySelector('[data-testid="layer-t1"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    const heading = screen
      .getAllByRole("button")
      .filter((b) => /heading/i.test(b.textContent ?? ""))[0]!;
    fireEvent.click(heading);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const body = await putBody(requests);
    const saved = body.document as typeof SET;
    expect(saved.set).toBe("teamLists");
    expect(saved.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors"]);
    expect(saved.pages[1]!.layers.length).toBe(2);
    expect(saved.pages[0]!.layers).toEqual(SET.pages[0]!.layers);
  });

  it("duplicates and deletes pages from the strip", async () => {
    const requests = open(setCopy());
    const strip = await screen.findByRole("navigation", { name: "Team lists pages" });
    fireEvent.click(within(strip).getByRole("button", { name: "Duplicate Cover" }));
    await waitFor(() =>
      expect(within(strip).getAllByRole("button", { name: /^\d\. / })).toHaveLength(4),
    );
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. Team/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Delete Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saved = (await putBody(requests)).document as typeof SET;
    expect(saved.pages.map((p) => p.slot)).toEqual(["cover", "page", "sponsors"]);
  });
});
