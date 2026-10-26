/**
 * Editing inside groups (editable-elements plan, A2): the scope model, a
 * group's children moving with it, double-click to go inside a group on the
 * canvas, Esc to come back up, and the nested Layers tree.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminTemplateEditor from "@/pages/admin-template-editor";
import type { FreeLayer } from "@/lib/pack-render";
import { renderAt } from "@/test/render";
import { duplicate, nudge, setBoxes, type EditorDoc } from "../document";
import { cellAt, cellId, parentOf, scopeDoc, scopeInStack, scopePath, withScope } from "../scope";
import { removeFromSize, setTextStyle } from "../template-ops";
import { findLayer } from "../template-doc";

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (b: ReturnType<typeof box>) => ({ square: b, portrait: b, story: b, landscape: b });
const leaf = (id: string, b: ReturnType<typeof box>, kind: FreeLayer["kind"] = "text") =>
  ({
    id,
    kind,
    name: id,
    ...(kind === "text" ? { content: id } : { style: { background: "#c00" } }),
    geometry: at(b),
  }) as FreeLayer;
const groupOf = (id: string, b: ReturnType<typeof box>, children: FreeLayer[], extra = {}) =>
  ({ id, kind: "group", name: id, geometry: at(b), children, ...extra }) as unknown as FreeLayer;

const PAGE: EditorDoc = {
  layers: [
    leaf("title", box(10, 5, 80, 10)),
    groupOf("score", box(10, 40, 80, 20), [
      leaf("panel", box(10, 40, 80, 20), "shape"),
      leaf("runs", box(20, 45, 30, 10)),
      groupOf("inner", box(60, 45, 20, 10), [leaf("wkts", box(60, 45, 20, 10))]),
    ]),
    groupOf(
      "names",
      box(10, 70, 80, 20),
      [leaf("first", box(0, 0, 80, 8)), leaf("second", box(0, 0, 80, 8))],
      { stack: { direction: "column", gap: 1, align: "stretch" } },
    ),
    {
      id: "list",
      kind: "rows",
      name: "Ladder",
      geometry: { square: box(10, 20, 80, 50) },
      rows: {
        repeat: "rows",
        rowHeight: 10,
        gap: 2,
        cells: [
          { field: "pos", x: 0, w: 100, show: "backdrop", style: { background: "#222" } },
          { field: "team", x: 5, w: 60, style: { fontSize: 3 } },
          { field: "pts", x: 70, w: 25, y: 10, h: 80, style: { fontSize: 3 } },
        ],
      },
    },
  ],
};
const listOf = (doc: EditorDoc) => findLayer(doc, "list")!.layer.rows!;

const geo = (doc: EditorDoc, id: string) => findLayer(doc, id)!.layer.geometry.square!;

describe("scope model", () => {
  it("shows a group's children as a flat document and writes edits back", () => {
    const view = scopeDoc(PAGE, "score");
    expect(view.layers!.map((l) => l.id)).toEqual(["panel", "runs", "inner"]);
    const moved = withScope(PAGE, "score", nudge(view, "square", ["runs"], 5, 0));
    expect(geo(moved, "runs").x).toBe(25);
    expect(geo(moved, "title")).toEqual(geo(PAGE, "title"));
    expect(scopeDoc(PAGE, null)).toBe(PAGE);
    expect(scopeDoc(PAGE, "missing")).toBe(PAGE);
  });

  it("knows each layer's group and the path down to a scope", () => {
    expect(parentOf(PAGE, "wkts")).toBe("inner");
    expect(parentOf(PAGE, "score")).toBeNull();
    expect(scopePath(PAGE, "inner").map((g) => g.id)).toEqual(["score", "inner"]);
    expect(scopeInStack(PAGE, "names")).toBe(true);
    expect(scopeInStack(PAGE, "inner")).toBe(false);
  });
});

describe("groups move their children", () => {
  it("moves and scales every layer inside a group with it", () => {
    const next = setBoxes(PAGE, "square", { score: box(20, 30, 40, 10) });
    expect(geo(next, "panel")).toEqual(box(20, 30, 40, 10));
    expect(geo(next, "runs")).toEqual(box(25, 32.5, 15, 5));
    expect(geo(next, "wkts")).toEqual(box(45, 32.5, 10, 5));
    // Other sizes are untouched.
    expect(findLayer(next, "runs")!.layer.geometry.story).toEqual(box(20, 45, 30, 10));
  });

  it("duplicates a group with new ids inside it, offset with it", () => {
    const r = duplicate(PAGE, "square", ["score"]);
    const copy = r.doc.layers!.at(-1)!;
    const kids = (copy as unknown as { children: FreeLayer[] }).children;
    expect(kids.map((k) => k.id)).not.toContain("runs");
    expect(new Set(kids.map((k) => k.id)).size).toBe(3);
    expect(kids[1]!.geometry.square).toEqual(box(22, 47, 30, 10));
  });

  it("gives duplicates new link ids, shared between copies made together", () => {
    const linked: EditorDoc = {
      layers: [
        { ...leaf("a", box(0, 0, 10, 10)), link: "k1" },
        { ...leaf("b", box(20, 0, 10, 10)), link: "k1" },
      ],
    };
    const r = duplicate(linked, "square", ["a", "b"]);
    const [ca, cb] = r.doc.layers!.slice(2);
    expect(ca!.link).toBeTruthy();
    expect(ca!.link).not.toBe("k1");
    expect(cb!.link).toBe(ca!.link);
  });
});

describe("a list's row cells", () => {
  it("shows the cells on the first row as layers", () => {
    const view = scopeDoc(PAGE, "list", "square");
    expect(view.layers!.map((l) => [l.id, l.kind, l.name])).toEqual([
      [cellId("list", 0), "shape", "pos backdrop"],
      [cellId("list", 1), "text", "team"],
      [cellId("list", 2), "text", "pts"],
    ]);
    // Square is 1:1, so a row 10% of the width is 10% of the height.
    expect(view.layers![1]!.geometry.square).toEqual(box(14, 20, 48, 10));
    expect(view.layers![2]!.geometry.square).toEqual(box(66, 21, 20, 8));
  });

  it("writes a moved or restyled cell back to the row, leaving the others exactly as they were", () => {
    const view = scopeDoc(PAGE, "list", "square");
    const moved = nudge(view, "square", [cellId("list", 1)], 8, 1);
    const styled = setTextStyle(moved, cellId("list", 2), { color: "#f00" });
    const cells = listOf(withScope(PAGE, "list", styled, "square")).cells;
    expect(cells[0]).toEqual(listOf(PAGE).cells[0]);
    expect(cells[1]).toEqual({
      field: "team",
      x: 15,
      w: 60,
      y: 10,
      h: 100,
      style: { fontSize: 3 },
    });
    expect(cells[2]).toEqual({ ...listOf(PAGE).cells[2], style: { fontSize: 3, color: "#f00" } });
  });

  it("deletes and duplicates cells in the row template", () => {
    const view = scopeDoc(PAGE, "list", "square");
    const gone = withScope(
      PAGE,
      "list",
      removeFromSize(view, [cellId("list", 0)], "square"),
      "square",
    );
    expect(listOf(gone).cells.map((c) => c.field)).toEqual(["team", "pts"]);
    const r = duplicate(view, "square", [cellId("list", 2)]);
    const more = listOf(withScope(PAGE, "list", r.doc, "square")).cells;
    expect(more.map((c) => c.field)).toEqual(["pos", "team", "pts", "pts"]);
    expect(more[3]!.x).toBe(72.5);
  });

  it("finds the cell under a point in any row", () => {
    const list = findLayer(PAGE, "list")!.layer as FreeLayer;
    // Row 3 starts at 20 + 3 × 12 = 56.
    expect(cellAt(list, "square", { x: 20, y: 61 })).toBe(cellId("list", 1));
    expect(cellAt(list, "square", { x: 80, y: 61 })).toBe(cellId("list", 2));
    expect(cellAt(list, "square", { x: 80, y: 56.2 })).toBe(cellId("list", 0));
    expect(cellAt(list, "square", { x: 5, y: 61 })).toBeNull();
  });
});

// ── The template editor ─────────────────────────────────────────────────────

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

function open() {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  const doc = { formatVersion: 2, pages: { fixture: { layers: PAGE.layers } } };
  const template = {
    id: 9,
    kind: "matchDay",
    name: "Grouped",
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
    document: doc,
  };
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
        payload = { ...template, version: 5, document: (body as { document: unknown }).document };
      } else if (/club-templates\/9$/.test(url)) payload = template;
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

const overlay = (id: string) => document.querySelector(`[data-testid="layer-${id}"]`);
const savedPage = async (requests: Req[]) => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
  const body = requests.find((r) => r.method === "PUT")!.body as {
    document: { pages: Record<string, EditorDoc> };
  };
  return body.document.pages.fixture!;
};

describe("editing inside a group", () => {
  it("double-click goes inside a group, edits a child there, and Esc comes back up", async () => {
    const requests = open();
    await waitFor(() => expect(overlay("score")).toBeTruthy());
    expect(overlay("runs")).toBeNull();

    fireEvent.doubleClick(overlay("score")!);
    await waitFor(() => expect(overlay("runs")).toBeTruthy());
    expect(overlay("title")).toBeNull();
    expect(screen.getByTestId("scope-frame")).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Editing inside" })).getByText("score"));

    fireEvent.pointerDown(overlay("runs")!);
    fireEvent.pointerUp(overlay("runs")!);
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(overlay("title")).toBeTruthy());
    expect(overlay("runs")).toBeNull();
    expect(screen.queryByTestId("scope-frame")).toBeNull();
    // The group comes back selected.
    expect(screen.getByTestId("selection-box")).toBeTruthy();

    const page = await savedPage(requests);
    expect(geo(page, "runs")).toEqual({ ...box(20, 45, 30, 10), x: 22 });
    expect(geo(page, "panel")).toEqual(box(10, 40, 80, 20));
  });

  it("goes two levels deep, and a stack's children select but don't drag", async () => {
    open();
    await waitFor(() => expect(overlay("score")).toBeTruthy());
    fireEvent.doubleClick(overlay("score")!);
    await waitFor(() => expect(overlay("inner")).toBeTruthy());
    fireEvent.doubleClick(overlay("inner")!);
    await waitFor(() => expect(overlay("wkts")).toBeTruthy());
    const crumbs = screen.getByRole("navigation", { name: "Editing inside" });
    fireEvent.click(within(crumbs).getByRole("button", { name: "score" }));
    await waitFor(() => expect(overlay("runs")).toBeTruthy());
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(overlay("names")).toBeTruthy());

    fireEvent.doubleClick(overlay("names")!);
    await waitFor(() => expect(overlay("first")).toBeTruthy());
    expect(overlay("first")!.className).toMatch(/cursor-pointer/);
  });

  it("opens groups in the Layers tree and selects a child from there", async () => {
    const requests = open();
    await waitFor(() => expect(overlay("score")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    const drawer = await screen.findByRole("complementary", { name: "Layers" });
    expect(within(drawer).queryByRole("button", { name: "Hide runs" })).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "Open score" }));
    const inScore = within(drawer).getByRole("group", { name: "In score" });
    fireEvent.click(within(inScore).getByRole("button", { name: "runs" }));
    await waitFor(() => expect(overlay("runs")).toBeTruthy());
    expect(screen.getByTestId("selection-box")).toBeTruthy();

    // Hiding a child from the tree hides it in place.
    fireEvent.click(within(inScore).getByRole("button", { name: "Hide panel" }));
    await waitFor(() =>
      expect(within(drawer).getByRole("button", { name: "Show panel" })).toBeTruthy(),
    );
    const page = await savedPage(requests);
    expect(findLayer(page, "panel")!.layer.hidden).toBe(true);
  });

  it("selects a list's cell from the Layers tree and edits the row template", async () => {
    const requests = open();
    await waitFor(() => expect(overlay("list")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    const drawer = await screen.findByRole("complementary", { name: "Layers" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Open Ladder" }));
    const inList = within(drawer).getByRole("group", { name: "In Ladder" });
    // Cells have no eye or lock: they show and lock with their list.
    expect(within(inList).queryByRole("button", { name: /^Hide/ })).toBeNull();
    fireEvent.click(within(inList).getByRole("button", { name: "team" }));
    await waitFor(() => expect(overlay(cellId("list", 1))).toBeTruthy());
    expect(screen.getByText(/every row follows/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    const page = await savedPage(requests);
    expect(listOf(page).cells[1]!.x).toBe(7.5);
    expect(listOf(page).cells[0]).toEqual(listOf(PAGE).cells[0]);
  });
});
