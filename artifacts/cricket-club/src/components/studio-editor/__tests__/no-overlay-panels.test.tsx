/**
 * Nothing covers the creative (Nov 2026): in the New Studio editors no
 * settings panel, menu or toolbar ever sits over the card or slide being
 * edited. The list settings, the layers, a text box's style and every menu
 * that would float over the canvas open in the one panel beside the rail
 * (Ash's amendment: nothing opens on the right), and the canvas fits the
 * space left, whole, at 100% zoom. The dock's layout maths is kept below.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route } from "wouter";
import { assembleSetDocument } from "@workspace/scorecard/kind-templates";
import AdminSetDraftEditor from "@/pages/admin-set-draft-editor";
import { packNativeSize } from "@/lib/pack-render/tokens";
import { renderAt } from "@/test/render";
import {
  DOCK_WIDTH,
  EDITOR_TOP_BAR,
  TOOLBAR_STRIP,
  contains,
  editorLayout,
  overlaps,
} from "../canvas-fit";
import TEAM_LIST from "../../../../../../lib/template-bundles/broadcast-dark/teamList.json";
import MATCH_DAY from "../../../../../../lib/template-bundles/broadcast-dark/matchDay.json";
import CARD_INPUT from "./fixtures/weekend-team-lists.json";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const VIEWPORTS = [
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
];
const SIZES = ["portrait", "story"] as const;
// The slide strip under a set's canvas (as measured in Chromium), and none.
const STRIPS = [0, 164];

describe("the canvas and the dock, laid out", () => {
  for (const viewport of VIEWPORTS)
    for (const size of SIZES)
      for (const stripHeight of STRIPS)
        for (const panelOpen of [true, false])
          it(`${size} at ${viewport.w}×${viewport.h}, strip ${stripHeight}px, panel ${panelOpen ? "open" : "shut"}`, () => {
            const native = packNativeSize(size);
            const { area, canvas, dock } = editorLayout({
              viewport,
              native,
              panelOpen,
              dockOpen: true,
              stripHeight,
            });
            // The dock never covers the canvas…
            expect(dock).not.toBeNull();
            expect(overlaps(dock!, canvas)).toBe(false);
            expect(dock!.w).toBe(DOCK_WIDTH);
            expect(dock!.x + dock!.w).toBe(viewport.w);
            // …nor does the toolbar strip above it…
            const strip = { x: area.x, y: EDITOR_TOP_BAR, w: area.w, h: TOOLBAR_STRIP };
            expect(overlaps(strip, canvas)).toBe(false);
            // …and the whole card is in view.
            expect(contains(area, canvas)).toBe(true);
            expect(canvas.w).toBeGreaterThan(120);
          });

  it("opening the dock never makes a portrait or story canvas smaller at these sizes", () => {
    for (const viewport of VIEWPORTS)
      for (const size of SIZES) {
        const native = packNativeSize(size);
        const shut = editorLayout({ viewport, native, panelOpen: true, dockOpen: false });
        const open = editorLayout({ viewport, native, panelOpen: true, dockOpen: true });
        expect(open.canvas.w).toBe(shut.canvas.w);
      }
  });
});

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

function openSetEditor() {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      let payload: unknown = [];
      if (/social-drafts\/956\/set-design$/.test(url))
        payload = {
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
}

const slotEl = () => screen.getByTestId("editor-panel");
const areaEl = () => screen.getByTestId("canvas-area");

describe("in the set editor", () => {
  it("shows a sponsor grid's list settings in the panel beside the rail, not over the canvas", async () => {
    openSetEditor();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. Sponsors/ }));
    const grid = document.querySelector<HTMLElement>('[data-testid="layer-sponsors-tiles"]')!;
    expect(grid).toBeTruthy();
    fireEvent.pointerDown(grid, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10, pointerId: 1 });
    // Nothing opens by itself over the canvas: the toolbar's Edit opens the settings.
    expect(screen.queryByRole("region", { name: "List settings" })).toBeNull();
    fireEvent.click(
      within(screen.getByRole("toolbar", { name: "Layer tools" })).getByRole("button", {
        name: "Edit",
      }),
    );
    const settings = await screen.findByRole("region", { name: "List settings" });
    expect(slotEl().contains(settings)).toBe(true);
    // The canvas is in the canvas area; the panel and the canvas area are separate columns.
    const board = screen.getByTestId("editor-artboard");
    expect(areaEl().contains(board)).toBe(true);
    expect(areaEl().contains(settings)).toBe(false);
    expect(slotEl().contains(board)).toBe(false);
    expect(screen.queryByTestId("editor-dock")).toBeNull();
    // Every control is still there.
    for (const name of ["Row height", "Row gap", "Columns"])
      expect(within(settings).getByLabelText(name)).toBeTruthy();
  });

  it("opens the Layout and the layers in the panel beside the rail, never as a floating menu", async () => {
    openSetEditor();
    await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    expect(slotEl().getAttribute("data-panel")).toBe("layout");
    expect(
      within(slotEl()).getByRole("button", { name: "New layout for this slide" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Editor tools" })).getByRole("button", {
        name: "Position",
      }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Layers" }));
    expect(slotEl().contains(screen.getByRole("tabpanel", { name: "Layers" }))).toBe(true);
    expect(areaEl().contains(slotEl())).toBe(false);
  });

  it("opens the strip's Add a page in the panel beside the rail", async () => {
    openSetEditor();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: "Add a page" }));
    expect(slotEl().getAttribute("data-panel")).toBe("add-page");
    expect(within(slotEl()).getByRole("button", { name: /Blank page/ })).toBeTruthy();
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
  });
});
