/**
 * Several nested layers at once (editable-elements plan, A4): arranging and
 * resizing inside a group, copying and pasting groups and vectors, a group
 * resize scaling the type inside it, and linked copies kept in step.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminTemplateEditor from "@/pages/admin-template-editor";
import type { FreeLayer } from "@/lib/pack-render";
import { renderAt } from "@/test/render";
import { align, matchSize, resizeGroup } from "../arrange";
import { copyLayers, pasteLayers } from "../clipboard";
import { childrenOf, type EditorDoc } from "../document";
import { removeLinked, sharedLinks, syncLinks } from "../links";
import { scopeDoc, withScope } from "../scope";
import { findLayer } from "../template-doc";

type Box = { x: number; y: number; w: number; h: number };
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });
const text = (id: string, b: Box, extra: Partial<FreeLayer> = {}): FreeLayer => ({
  id,
  kind: "text",
  name: id,
  content: id,
  style: { fontSize: 4, color: "#fff" },
  geometry: { square: b },
  ...extra,
});
const group = (id: string, b: Box, children: FreeLayer[]) =>
  ({ id, kind: "group", name: id, geometry: { square: b }, children }) as unknown as FreeLayer;
const geo = (doc: EditorDoc, id: string) => findLayer(doc, id)!.layer.geometry.square!;

const PAGE: EditorDoc = {
  layers: [
    group("score", box(10, 40, 80, 20), [
      text("runs", box(20, 45, 30, 10)),
      text("wkts", box(60, 50, 20, 6)),
    ]),
    {
      id: "slash",
      kind: "vector",
      name: "Slash",
      geometry: { square: box(70, 0, 10, 20) },
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><polygon points="0,0 10,0 5,20" fill="var(--gold)"/></svg>',
    } as unknown as FreeLayer,
    text("title-sq", box(10, 5, 80, 10), { sizes: ["square"], link: "k-title" }),
    text("title-st", box(10, 8, 80, 8), {
      sizes: ["story"],
      link: "k-title",
      geometry: { story: box(10, 8, 80, 8) },
      style: { fontSize: 6, color: "#fff" },
    }),
  ],
};

describe("arranging inside a group", () => {
  it("aligns and matches the size of a group's children", () => {
    const view = scopeDoc(PAGE, "score");
    const aligned = withScope(PAGE, "score", align(view, "square", ["runs", "wkts"], "left"));
    expect(geo(aligned, "wkts").x).toBe(20);
    const matched = withScope(
      PAGE,
      "score",
      matchSize(view, "square", ["runs", "wkts"], "width", "first"),
    );
    expect(geo(matched, "wkts").w).toBe(30);
    expect(geo(matched, "score")).toEqual(geo(PAGE, "score"));
  });

  it("scales the type inside a group on a corner resize", () => {
    const start = PAGE.layers!.filter((l) => l.id === "score");
    const next = resizeGroup(PAGE, "square", start, box(10, 40, 80, 20), box(10, 40, 40, 10), true);
    const runs = findLayer(next, "runs")!.layer;
    expect(runs.style?.fontSize).toBe(2);
    expect(runs.geometry.square).toEqual(box(15, 42.5, 15, 5));
  });
});

describe("copy and paste", () => {
  it("pastes a group with new ids inside it, its children moved with it", () => {
    const clip = copyLayers(PAGE, "square", ["score"], "template")!;
    const r = pasteLayers({ layers: [] }, clip, "story", { kind: "matchDay", page: "fixture" });
    expect(r.skipped).toBe(0);
    const copy = r.doc.layers![0]!;
    const kids = childrenOf(copy);
    expect(kids.map((k) => k.id)).not.toContain("runs");
    // Story is taller than square: the group and its children are placed together.
    const g = copy.geometry.story!;
    const runs = kids[0]!.geometry.story!;
    expect(runs.x - g.x).toBeCloseTo(((20 - 10) / 80) * g.w);
    expect(runs.y - g.y).toBeCloseTo(((45 - 40) / 20) * g.h);
  });

  it("pastes vectors in a template, and gives copies new links shared within the paste", () => {
    const clip = copyLayers(PAGE, "square", ["slash", "title-sq"], "template")!;
    const r = pasteLayers({ layers: [] }, clip, "square", { kind: "matchDay", page: "fixture" });
    expect(r.skipped).toBe(0);
    expect(r.doc.layers!.map((l) => l.kind)).toEqual(["vector", "text"]);
    const link = r.doc.layers![1]!.link;
    expect(link).toBeTruthy();
    expect(link).not.toBe("k-title");
  });
});

describe("linked copies", () => {
  it("takes a colour or text change to the other sizes' copies, not their size or font size", () => {
    const edited: EditorDoc = {
      layers: PAGE.layers!.map((l) =>
        l.id === "title-sq"
          ? {
              ...l,
              content: "New title",
              style: { fontSize: 5, color: "#f00" },
              geometry: { square: box(0, 0, 50, 5) },
            }
          : l,
      ),
    };
    const synced = syncLinks(PAGE, edited);
    const story = findLayer(synced, "title-st")!.layer;
    expect(story.content).toBe("New title");
    expect(story.style).toEqual({ fontSize: 6, color: "#f00" });
    expect(story.geometry).toEqual({ story: box(10, 8, 80, 8) });
    expect(syncLinks(PAGE, PAGE)).toBe(PAGE);
  });

  it("finds the copies left after deleting one, and deletes them all", () => {
    const after: EditorDoc = { layers: PAGE.layers!.filter((l) => l.id !== "title-sq") };
    expect(sharedLinks(PAGE, after, ["title-sq"])).toEqual(["k-title"]);
    expect(sharedLinks(PAGE, after, ["slash"])).toEqual([]);
    expect(removeLinked(after, ["k-title"]).layers!.map((l) => l.id)).toEqual(["score", "slash"]);
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
  window.sessionStorage.clear();
});

type Req = { method: string; url: string; body: unknown };

function open() {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  const doc = { formatVersion: 2, pages: { fixture: { layers: PAGE.layers } } };
  const template = {
    id: 9,
    kind: "matchDay",
    name: "Nested",
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

const overlay = (id: string) => document.querySelector(`[data-testid="layer-${id}"]`)!;
const savedPage = async (requests: Req[]) => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
  const body = requests.find((r) => r.method === "PUT")!.body as {
    document: { pages: Record<string, EditorDoc> };
  };
  return body.document.pages.fixture!;
};
const keys = (key: string) => fireEvent.keyDown(window, { key, ctrlKey: true });

describe("several nested layers in the editor", () => {
  it("multi-selects inside a group and copies and pastes there", async () => {
    const requests = open();
    await waitFor(() => expect(overlay("score")).toBeTruthy());
    fireEvent.doubleClick(overlay("score"));
    await waitFor(() => expect(overlay("runs")).toBeTruthy());
    fireEvent.pointerDown(overlay("runs"));
    fireEvent.pointerUp(overlay("runs"));
    fireEvent.pointerDown(overlay("wkts"), { shiftKey: true });
    expect(screen.getByTestId("multi-bounds")).toBeTruthy();
    keys("c");
    keys("v");
    const page = await savedPage(requests);
    const kids = childrenOf(findLayer(page, "score")!.layer as FreeLayer);
    expect(kids).toHaveLength(4);
    expect(new Set(kids.map((k) => k.id)).size).toBe(4);
  });

  it("offers to delete a linked copy on every size", async () => {
    const requests = open();
    await waitFor(() => expect(overlay("title-sq")).toBeTruthy());
    fireEvent.pointerDown(overlay("title-sq"));
    fireEvent.pointerUp(overlay("title-sq"));
    fireEvent.keyDown(window, { key: "Delete" });
    const prompt = await screen.findByRole("dialog", { name: "Delete on other sizes" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Delete on every size" }));
    const page = await savedPage(requests);
    expect(findLayer(page, "title-st")).toBeNull();
    expect(findLayer(page, "slash")).toBeTruthy();
  });
});
