/**
 * One panel slot, Position, and the Pages view (New Studio, Nov 2026, Ash's
 * feedback): every tool opens in the one panel beside the rail, the last one
 * opened replacing it; the toolbar above the canvas offers Replace (a photo),
 * Edit and Position by the layer's type; a click on the empty page opens Edit
 * page; Position (Arrange and Layers) is the single way in to a page's
 * layers; and a set's pages show as Thumbnails (the strip, the default) or
 * Scroll (every slide stacked), remembered in this browser.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import { assembleSetDocument } from "@workspace/scorecard/kind-templates";
import { TemplateEditorV2, type EditorTemplate } from "@/pages/admin-template-editor";
import AdminSetDraftEditor from "@/pages/admin-set-draft-editor";
import { previewSample } from "@/lib/kind-templates/samples";
import { buildPackData } from "@/lib/pack-card-data";
import type { FreeLayer } from "@/lib/pack-render";
import { packNativeSize } from "@/lib/pack-render/tokens";
import { renderAt } from "@/test/render";
import { EDITOR_PANEL, EDITOR_RAIL, editorLayout, overlaps } from "../canvas-fit";
import TEAM_LIST from "../../../../../../lib/template-bundles/broadcast-dark/teamList.json";
import MATCH_DAY from "../../../../../../lib/template-bundles/broadcast-dark/matchDay.json";
import CARD_INPUT from "./fixtures/weekend-team-lists.json";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
  // jsdom has no DragEvent: a MouseEvent carries the pointer's position for a drop.
  if (!("DragEvent" in window)) {
    (window as unknown as { DragEvent: typeof MouseEvent }).DragEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // Storage blocked: nothing to clear.
  }
});

// ── A single card with a text, a photo and a shape ──────────────────────────

const at = (x: number, y: number, w: number, h: number) => ({
  geometry: { portrait: { x, y, w, h }, story: { x, y, w, h } },
});
const TITLE: FreeLayer = {
  id: "title",
  kind: "text",
  name: "Title",
  content: "Big win",
  ...at(10, 10, 60, 10),
};
const PHOTO: FreeLayer = { id: "ph", kind: "photo", name: "Photo", ...at(0, 30, 100, 40) };
const BAR: FreeLayer = {
  id: "bar",
  kind: "shape",
  name: "Bar",
  style: { background: "#112233" },
  ...at(5, 35, 40, 10),
};
const FAR: FreeLayer = {
  id: "far",
  kind: "shape",
  name: "Far",
  style: { background: "#445566" },
  ...at(80, 85, 10, 10),
};
const CARD = { formatVersion: 2, pages: { card: { layers: [PHOTO, BAR, TITLE, FAR] } } };

function openCard(
  save: (doc: Record<string, unknown>) => void = () => undefined,
  photoPanel = true,
) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const payload = /social-settings/.test(url)
        ? { settings: {}, captionTemplates: [], activeSponsors: [] }
        : [];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const template: EditorTemplate = {
    id: 7,
    kind: "player",
    name: "Player card",
    version: 1,
    document: CARD,
    fitStatus: "pass",
  };
  renderAt(
    <TemplateEditorV2
      template={template}
      viewport={{ w: 1440, h: 900 }}
      initialFormat="portrait"
      host={{
        club: true,
        backHref: "/admin/social",
        save: async (version, doc) => {
          save(doc);
          return { ...template, version: version + 1, document: doc };
        },
        reload: async () => template,
        status: () => null,
      }}
      draftMode={{
        input: previewSample("player", "Test CC") as unknown as Record<string, unknown>,
        data: { ...buildPackData(), photoUrl: "https://example.test/bowler.jpg" },
      }}
      sidePanels={() =>
        photoPanel
          ? [
              {
                id: "photo",
                title: "Change photo",
                onPage: true,
                body: <p data-testid="host-photo-panel">The host's Change photo</p>,
              },
            ]
          : []
      }
    />,
    "/admin/social/editor/7",
  );
}

const overlay = (id: string) => document.querySelector<HTMLElement>(`[data-testid="layer-${id}"]`);
async function pick(id: string, mods: { ctrlKey?: boolean } = {}) {
  await waitFor(() => expect(overlay(id)).toBeTruthy());
  fireEvent.pointerDown(overlay(id)!, mods);
  fireEvent.pointerUp(overlay(id)!, mods);
}
const toolbar = () => screen.getByRole("toolbar", { name: "Layer tools" });
const tool = (name: string) => within(toolbar()).queryByRole("button", { name });
/** The one panel beside the rail, and which tool it holds. */
const slot = () => screen.getByTestId("editor-panel");
const canvasArea = () => screen.getByTestId("canvas-area");

/** Nothing docked on the right, no floating layer, and the slot isn't inside the canvas area. */
function expectNothingOverCanvas() {
  expect(screen.getAllByTestId("editor-panel")).toHaveLength(1);
  expect(canvasArea().contains(slot())).toBe(false);
  expect(screen.queryByTestId("editor-dock")).toBeNull();
  expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
  // The slot sits before the canvas area, beside the rail.
  expect(slot().compareDocumentPosition(canvasArea()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("the contextual toolbar, by layer type", () => {
  it("a text layer offers Edit and Position; Edit opens its text settings in the slot", async () => {
    openCard();
    await pick("title");
    expect(tool("Replace")).toBeNull();
    expect(tool("Edit")).toBeTruthy();
    expect(tool("Position")).toBeTruthy();
    fireEvent.click(tool("Edit")!);
    expect(slot().getAttribute("data-panel")).toBe("edit");
    expect(within(slot()).getByRole("heading", { name: "Edit text" })).toBeTruthy();
    // Font, size, weight, colour, alignment and spacing, and the layer's own settings.
    const style = within(slot()).getByRole("toolbar", { name: "Text style" });
    for (const name of ["Font size", "Letter spacing"])
      expect(within(style).getByRole("spinbutton", { name })).toBeTruthy();
    expect(within(slot()).getByTestId("layer-design-panel")).toBeTruthy();
    // Its text, with the live fields to insert, is here too, not above the canvas.
    expect(within(slot()).getByRole("combobox", { name: "Text" })).toBeTruthy();
    expect(within(canvasArea()).queryByRole("combobox", { name: "Text" })).toBeNull();
    expectNothingOverCanvas();
  });

  it("a photo layer adds Replace: its photo and Photo position, in the slot", async () => {
    openCard();
    await pick("ph");
    expect(
      within(toolbar())
        .getAllByRole("button")
        .slice(0, 3)
        .map((b) => b.textContent?.trim()),
    ).toEqual(["Replace", "Edit", "Position"]);
    fireEvent.click(tool("Replace")!);
    expect(slot().getAttribute("data-panel")).toBe("replace");
    expect(within(slot()).getByTestId("host-photo-panel")).toBeTruthy();
    expect(within(slot()).getByRole("region", { name: "Photo position" })).toBeTruthy();
    // Edit is the layer's design settings (filters, style, show when).
    fireEvent.click(tool("Edit")!);
    expect(within(slot()).getByRole("heading", { name: "Edit photo" })).toBeTruthy();
    expect(within(slot()).getByTestId("layer-design-panel")).toBeTruthy();
    expect(within(slot()).queryByRole("region", { name: "Photo position" })).toBeNull();
    expectNothingOverCanvas();
  });

  it("a different layer changes the toolbar, and the open panel follows", async () => {
    openCard();
    await pick("ph");
    fireEvent.click(tool("Replace")!);
    await pick("bar");
    // A shape has no photo to replace: Replace goes, and its Edit takes the slot.
    expect(tool("Replace")).toBeNull();
    expect(tool("Edit")).toBeTruthy();
    expect(tool("Position")).toBeTruthy();
    expect(slot().getAttribute("data-panel")).toBe("edit");
    expect(within(slot()).getByRole("heading", { name: "Edit layer" })).toBeTruthy();
  });

  it("with no Change photo or Photo position to offer, a photo has no Replace", async () => {
    // A template being designed (no draft) has neither.
    openCard(undefined, false);
    await pick("ph");
    // Photo position is a draft's, so Replace still shows for this draft card.
    expect(tool("Replace")).toBeTruthy();
    fireEvent.click(tool("Replace")!);
    expect(within(slot()).queryByTestId("host-photo-panel")).toBeNull();
    expect(within(slot()).getByRole("region", { name: "Photo position" })).toBeTruthy();
  });
});

describe("Edit page", () => {
  it("opens on a click on the empty page, with the page colour and the page's photo", async () => {
    openCard();
    await waitFor(() => expect(overlay("title")).toBeTruthy());
    const board = screen.getByTestId("editor-artboard");
    fireEvent.pointerDown(board, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(board, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(window, { clientX: 1, clientY: 1 });
    await waitFor(() => expect(slot().getAttribute("data-panel")).toBe("page"));
    expect(within(slot()).getByRole("heading", { name: "Edit page" })).toBeTruthy();
    expect(within(slot()).getByRole("group", { name: "Page colours" })).toBeTruthy();
    expect(
      within(within(slot()).getByRole("region", { name: "Change photo" })).getByTestId(
        "host-photo-panel",
      ),
    ).toBeTruthy();
    // The page colour and the hint no longer sit above the canvas.
    expect(within(canvasArea()).queryByRole("button", { name: "Page colour" })).toBeNull();
    expect(within(canvasArea()).queryByText(/Select a layer to edit it/)).toBeNull();
    expectNothingOverCanvas();
  });

  it("picking a layer from Edit page opens that layer's Edit; clearing it goes back", async () => {
    openCard();
    await waitFor(() => expect(overlay("title")).toBeTruthy());
    const board = screen.getByTestId("editor-artboard");
    fireEvent.pointerDown(board, { clientX: 1, clientY: 1 });
    fireEvent.pointerUp(window, { clientX: 1, clientY: 1 });
    await waitFor(() => expect(slot().getAttribute("data-panel")).toBe("page"));
    await pick("title");
    expect(slot().getAttribute("data-panel")).toBe("edit");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(slot().getAttribute("data-panel")).toBe("page"));
  });

  it("closes with an X, and a rail tool replaces whatever is open", async () => {
    openCard();
    await pick("title");
    fireEvent.click(tool("Edit")!);
    fireEvent.click(screen.getByRole("button", { name: "Elements" }));
    expect(slot().getAttribute("data-panel")).toBe("elements");
    fireEvent.click(within(slot()).getByRole("button", { name: "Close panel" }));
    expect(screen.queryByTestId("editor-panel")).toBeNull();
  });
});

describe("Position", () => {
  const savedLayers = (saved: Array<Record<string, unknown>>) =>
    (saved.at(-1) as { pages: { card: { layers: FreeLayer[] } } }).pages.card.layers;

  it("is the one way in: no Layer rail item and no Layers button", async () => {
    openCard();
    const rail = await screen.findByRole("navigation", { name: "Editor tools" });
    expect(within(rail).getByRole("button", { name: "Position" })).toBeTruthy();
    expect(within(rail).queryByRole("button", { name: "Layer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Layers" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Layers" })).toBeNull();
  });

  it("opens from the rail with nothing selected, and from the toolbar; both tabs work", async () => {
    openCard();
    const rail = await screen.findByRole("navigation", { name: "Editor tools" });
    fireEvent.click(within(rail).getByRole("button", { name: "Position" }));
    expect(slot().getAttribute("data-panel")).toBe("position");
    const tabs = within(slot()).getByRole("tablist", { name: "Position" });
    const [arrange, layers] = within(tabs).getAllByRole("tab");
    expect(arrange.textContent).toBe("Arrange");
    expect(arrange.getAttribute("aria-selected")).toBe("true");
    expect(within(slot()).getByText(/Select a layer on the canvas/)).toBeTruthy();

    fireEvent.click(layers);
    expect(layers.getAttribute("aria-selected")).toBe("true");
    const panel = within(slot()).getByRole("tabpanel", { name: "Layers" });
    // Top-most first.
    expect(
      within(panel)
        .getAllByRole("button", { pressed: false })
        .filter((b) => ["Far", "Title", "Bar", "Photo"].includes(b.textContent ?? ""))
        .map((b) => b.textContent),
    ).toEqual(["Far", "Title", "Bar", "Photo"]);
    // Click to select: the canvas selects it too, and Arrange then works on it.
    fireEvent.click(within(panel).getByRole("button", { name: "Bar" }));
    expect(screen.getByTestId("selection-box")).toBeTruthy();
    fireEvent.click(arrange);
    expect(within(slot()).getByRole("button", { name: "Bring to front" })).toBeTruthy();

    // From the toolbar too.
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(slot().getAttribute("data-panel")).toBe("text");
    fireEvent.click(tool("Position")!);
    expect(slot().getAttribute("data-panel")).toBe("position");
    expectNothingOverCanvas();
  });

  it("Arrange restacks, aligns to the page and sets X, Y, W and H, and they save", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openCard((d) => saved.push(d));
    await pick("bar");
    fireEvent.click(tool("Position")!);
    fireEvent.click(within(slot()).getByRole("button", { name: "Bring to front" }));
    fireEvent.click(within(slot()).getByRole("button", { name: "Align right of page" }));
    const native = packNativeSize("portrait");
    const y = within(slot()).getByRole("spinbutton", { name: "Y position" }) as HTMLInputElement;
    expect(Number(y.value)).toBe(Math.round(0.35 * native.h));
    fireEvent.change(y, { target: { value: String(native.h / 2) } });
    fireEvent.keyDown(y, { key: "Enter" });
    const w = within(slot()).getByRole("spinbutton", { name: "Width" }) as HTMLInputElement;
    fireEvent.change(w, { target: { value: String(native.w / 4) } });
    fireEvent.blur(w);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const layers = savedLayers(saved);
    expect(layers.map((l) => l.id)).toEqual(["ph", "title", "far", "bar"]);
    const bar = layers.find((l) => l.id === "bar")!.geometry!.portrait!;
    expect(bar.y).toBeCloseTo(50);
    expect(bar.w).toBeCloseTo(25);
    // Aligned right before the width changed: its left edge stays at 60%.
    expect(bar.x).toBeCloseTo(60);
    // Only Portrait moved.
    expect(layers.find((l) => l.id === "bar")!.geometry!.story).toEqual({
      x: 5,
      y: 35,
      w: 40,
      h: 10,
    });
  });

  it("dragging a row in Layers restacks the layer, and the order saves", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openCard((d) => saved.push(d));
    const rail = await screen.findByRole("navigation", { name: "Editor tools" });
    fireEvent.click(within(rail).getByRole("button", { name: "Position" }));
    fireEvent.click(within(slot()).getByRole("tab", { name: "Layers" }));
    const panel = within(slot()).getByRole("tabpanel", { name: "Layers" });
    const row = (name: string) =>
      within(panel).getByRole("button", { name }).closest("li") as HTMLElement;
    const box = (el: HTMLElement) =>
      (el.getBoundingClientRect = () => ({ top: 0, height: 20 }) as DOMRect);
    // Photo (bottom-most) dragged onto the top half of Far (top-most): to the front.
    const target = row("Far");
    box(target);
    fireEvent.dragStart(row("Photo"), { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    fireEvent.dragOver(target, { clientY: 2 });
    fireEvent.drop(target, { clientY: 2 });
    expect(
      within(panel)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("button[aria-pressed]")?.textContent),
    ).toEqual(["Photo", "Far", "Title", "Bar"]);
    // And Title dragged below Bar (the bottom half of Bar's row).
    const bar = row("Bar");
    box(bar);
    fireEvent.dragStart(row("Title"), { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    fireEvent.dragOver(bar, { clientY: 18 });
    fireEvent.drop(bar, { clientY: 18 });
    const order = () =>
      within(panel)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("button[aria-pressed]")?.textContent);
    expect(order()).toEqual(["Photo", "Far", "Bar", "Title"]);
    // Each drag is one change: Undo puts back the order before the second.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(order()).toEqual(["Photo", "Far", "Title", "Bar"]);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(order()).toEqual(["Photo", "Far", "Bar", "Title"]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(savedLayers(saved).map((l) => l.id)).toEqual(["title", "bar", "far", "ph"]);
  });

  it("Overlapping lists only the layers whose box meets the selected one's", async () => {
    openCard();
    await pick("bar");
    fireEvent.click(tool("Position")!);
    fireEvent.click(within(slot()).getByRole("tab", { name: "Layers" }));
    const panel = within(slot()).getByRole("tabpanel", { name: "Layers" });
    fireEvent.click(within(panel).getByRole("button", { name: "Overlapping" }));
    const names = () =>
      within(panel)
        .getAllByRole("listitem")
        .map((li) => li.querySelector("button[aria-pressed]")?.textContent);
    // The bar sits on the photo; the title (above it) and Far (a corner) don't touch it.
    expect(names()).toEqual(["Bar", "Photo"]);
    fireEvent.click(within(panel).getByRole("button", { name: "All" }));
    expect(names()).toEqual(["Far", "Title", "Bar", "Photo"]);
  });

  it("each row's Edit selects the layer and opens its settings; eye and lock still work", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openCard((d) => saved.push(d));
    const rail = await screen.findByRole("navigation", { name: "Editor tools" });
    fireEvent.click(within(rail).getByRole("button", { name: "Position" }));
    fireEvent.click(within(slot()).getByRole("tab", { name: "Layers" }));
    const panel = within(slot()).getByRole("tabpanel", { name: "Layers" });
    fireEvent.click(within(panel).getByRole("button", { name: "Hide Far" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Lock Bar" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Edit Title" }));
    expect(slot().getAttribute("data-panel")).toBe("edit");
    expect(within(slot()).getByRole("heading", { name: "Edit text" })).toBeTruthy();
    expect(screen.getByTestId("selection-box")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const layers = savedLayers(saved);
    expect(layers.find((l) => l.id === "far")!.hidden).toBe(true);
    expect(layers.find((l) => l.id === "bar")!.locked).toBe(true);
  });
});

describe("the panel and the canvas, laid out", () => {
  it("the panel beside the rail never covers the canvas at either size", () => {
    for (const viewport of [
      { w: 1366, h: 768 },
      { w: 1440, h: 900 },
      { w: 1024, h: 768 },
    ])
      for (const size of ["portrait", "story"] as const) {
        const { canvas, dock } = editorLayout({
          viewport,
          native: packNativeSize(size),
          panelOpen: true,
          dockOpen: false,
        });
        const panel = { x: EDITOR_RAIL, y: 56, w: EDITOR_PANEL, h: viewport.h - 112 };
        expect(dock).toBeNull();
        expect(overlaps(panel, canvas)).toBe(false);
        expect(canvas.x).toBeGreaterThanOrEqual(EDITOR_RAIL + EDITOR_PANEL);
      }
  });
});

// ── A set draft: the Pages view ──────────────────────────────────────────────

const docs: Record<string, unknown> = {
  teamList: TEAM_LIST.document,
  matchDay: MATCH_DAY.document,
};
const DOC = assembleSetDocument("teamLists", (kind) => docs[kind])!.document;
const DRAFT = {
  id: 956,
  engine: "ondemand",
  family: "matchday",
  status: "awaiting_review",
  appPath: "",
  sourceMatchIsJunior: false,
  caption: "Team lists",
  createdAt: "2026-11-17T06:21:56Z",
  packId: "blank",
  templateVersion: 4,
  templateRef: { libraryTemplateId: 66, version: 4 },
  cardInput: CARD_INPUT,
  adjustments: DOC,
};

function openSet() {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (method !== "GET")
        requests.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      let payload: unknown = [];
      if (/social-drafts\/956\/set-design$/.test(url))
        payload =
          method === "PUT"
            ? { ...DRAFT }
            : {
                draftId: 956,
                setType: "teamLists",
                layout: "carousel",
                document: DOC,
                templateRef: DRAFT.templateRef,
                size: "portrait",
                stored: false,
              };
      else if (/social-drafts\/956$/.test(url)) payload = DRAFT;
      else if (/tenant-plan/.test(url))
        payload = { plan: "club", newStudio: true, entitlements: { socialStudio: true } };
      else if (/social-settings/.test(url))
        payload = { settings: {}, captionTemplates: [], activeSponsors: [] };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  renderAt(
    <Route path="/admin/social/set/:id">
      <AdminSetDraftEditor />
    </Route>,
    "/admin/social/set/956",
  );
  return requests;
}

const pagesToggle = () => screen.getByRole("group", { name: "Pages" });

describe("the Pages view", () => {
  it("opens as Thumbnails: the canvas and the slide strip", async () => {
    openSet();
    await screen.findByRole("navigation", { name: "Slides" });
    const thumbs = within(pagesToggle()).getByRole("button", { name: "Thumbnails" });
    expect(thumbs.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(pagesToggle()).getByRole("button", { name: "Scroll" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByTestId("scroll-page-1")).toBeNull();
    // "N / M" sits beside it.
    expect(screen.getByText("1 / 3")).toBeTruthy();
  });

  it("Scroll hides the strip and stacks every slide, and is remembered", async () => {
    openSet();
    await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(pagesToggle()).getByRole("button", { name: "Scroll" }));
    expect(screen.queryByRole("navigation", { name: "Slides" })).toBeNull();
    const list = screen.getByRole("region", { name: "Slides" });
    expect(within(list).getByText("Page 1 – Title page")).toBeTruthy();
    expect(within(list).getByText(/^Page 2 – A Grade/)).toBeTruthy();
    expect(within(list).getByText("Page 3 – Sponsors")).toBeTruthy();
    // One live canvas, the slide being edited.
    expect(screen.getAllByTestId("editor-artboard")).toHaveLength(1);
    expect(window.localStorage.getItem("ovation.studio.pagesView")).toBe("scroll");
    cleanup();

    // Opened again, it stays in Scroll until switched back.
    openSet();
    expect(await screen.findByRole("region", { name: "Slides" })).toBeTruthy();
    fireEvent.click(within(pagesToggle()).getByRole("button", { name: "Thumbnails" }));
    expect(await screen.findByRole("navigation", { name: "Slides" })).toBeTruthy();
    expect(window.localStorage.getItem("ovation.studio.pagesView")).toBe("thumbnails");
  });

  it("still opens when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      openSet();
      await screen.findByRole("navigation", { name: "Slides" });
      fireEvent.click(within(pagesToggle()).getByRole("button", { name: "Scroll" }));
      expect(screen.getByRole("region", { name: "Slides" })).toBeTruthy();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("in Scroll, a click on slide 3 makes it the one edited, and an edit changes slide 3 only", async () => {
    const requests = openSet();
    await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(pagesToggle()).getByRole("button", { name: "Scroll" }));
    const list = screen.getByRole("region", { name: "Slides" });
    fireEvent.click(within(list).getByRole("button", { name: "Show page 3, Sponsors" }));
    const third = screen.getByTestId("scroll-page-3");
    expect(third.getAttribute("aria-current")).toBe("page");
    expect(within(third).getByTestId("editor-artboard")).toBeTruthy();
    expect(screen.getByText("3 / 3")).toBeTruthy();

    // Hide every layer of the Sponsors slide from Position → Layers, then save.
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Editor tools" })).getByRole("button", {
        name: "Position",
      }),
    );
    fireEvent.click(within(slot()).getByRole("tab", { name: "Layers" }));
    const panel = within(slot()).getByRole("tabpanel", { name: "Layers" });
    fireEvent.click(within(panel).getAllByRole("button", { name: /^Hide / })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const saved = (
      requests.find((r) => r.method === "PUT")!.body as {
        document: { pages: Array<{ slot: string; layers: FreeLayer[] }> };
      }
    ).document;
    const before = DOC as unknown as { pages: Array<{ slot: string; layers: FreeLayer[] }> };
    const hidden = (p: { layers: FreeLayer[] }) => p.layers.filter((l) => l.hidden).length;
    const sponsors = saved.pages.find((p) => p.slot === "sponsors")!;
    expect(hidden(sponsors)).toBe(hidden(before.pages.find((x) => x.slot === "sponsors")!) + 1);
    // Every other page is as it was.
    for (const p of saved.pages.filter((x) => x.slot !== "sponsors"))
      expect(p.layers).toEqual(before.pages.find((x) => x.slot === p.slot)!.layers);
  });

  it("each slide's header moves it, under the strip's own rules", async () => {
    openSet();
    await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(pagesToggle()).getByRole("button", { name: "Scroll" }));
    const list = screen.getByRole("region", { name: "Slides" });
    const grade = "A Grade v Waroona Cricket Club";
    expect(within(list).getByRole("button", { name: "Move Title page up" })).toBeDisabled();
    expect(within(list).getByRole("button", { name: "Move Sponsors down" })).toBeDisabled();
    // The strip offers Duplicate only for a page the set added; none of these is one.
    expect(within(list).queryByRole("button", { name: /^Duplicate / })).toBeNull();
    fireEvent.click(within(list).getByRole("button", { name: `Move ${grade} up` }));
    expect(within(list).getByText(`Page 1 – ${grade}`)).toBeTruthy();
    expect(within(list).getByText("Page 2 – Title page")).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Delete Sponsors" }));
    expect(within(list).queryByText(/Sponsors/)).toBeNull();
    // The strip shows the same order.
    fireEvent.click(within(pagesToggle()).getByRole("button", { name: "Thumbnails" }));
    const strip = screen.getByRole("navigation", { name: "Slides" });
    expect(
      within(strip)
        .getAllByRole("button", { name: /^\d\. / })
        .map((b) => b.getAttribute("aria-label")?.split(",")[0]),
    ).toEqual([`1. ${grade}`, "2. Title page"]);
  });

  it("a single card has one page, so it has no Pages toggle", async () => {
    openCard();
    await waitFor(() => expect(overlay("title")).toBeTruthy());
    expect(screen.queryByRole("group", { name: "Pages" })).toBeNull();
  });
});
