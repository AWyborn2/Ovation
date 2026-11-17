/**
 * Dragging a layer of a set draft's slide (New Studio, S9). A team slide's
 * list fits each name by rewriting its text ("…"); the canvas re-fits when the
 * card's markup changes, so the fit must never retrigger itself. It did: the
 * fit and the canvas's observer fed each other without end and froze the tab
 * (draft 956, a weekend Team Lists carousel on Broadcast Dark).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route } from "wouter";
import { assembleSetDocument } from "@workspace/scorecard/kind-templates";
import AdminSetDraftEditor from "@/pages/admin-set-draft-editor";
import type * as LayerFit from "@/lib/pack-render/layer-fit";
import { renderAt } from "@/test/render";
import TEAM_LIST from "../../../../../../lib/template-bundles/broadcast-dark/teamList.json";
import MATCH_DAY from "../../../../../../lib/template-bundles/broadcast-dark/matchDay.json";
import CARD_INPUT from "./fixtures/weekend-team-lists.json";

// Counts the fit passes; a pass that keeps retriggering itself fails loudly
// instead of hanging the test run. Each pass rewrites a list cell's text, as
// the real fit does in a browser (jsdom measures nothing, so it never cuts).
const fits = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/pack-render/layer-fit", async (importOriginal) => {
  const real = await importOriginal<typeof LayerFit>();
  return {
    ...real,
    fitLayersInDom: (...args: Parameters<typeof real.fitLayersInDom>) => {
      if (++fits.count > 2000) throw new Error("the fit keeps retriggering itself");
      const warnings = real.fitLayersInDom(...args);
      const cell = args[0].querySelector<HTMLElement>(`[${real.FIT_WORDS_ATTR}]`);
      if (cell) cell.textContent = `${cell.textContent ?? ""}`;
      return warnings;
    },
  };
});

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

function open() {
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
          size: "square",
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

const layerBoxes = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="layer-"]'));

/** Select and drag every layer on the canvas, one at a time, letting the page settle after each. */
async function dragEach() {
  for (const el of layerBoxes()) {
    fits.count = 0;
    fireEvent.pointerDown(el, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 70, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 70, clientY: 60, pointerId: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(fits.count).toBeLessThan(50);
  }
}

describe("dragging a layer on a team slide of a set draft", () => {
  it("fits the slide a bounded number of times on the shared layout", async () => {
    open();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^2\. A Grade/ }));
    expect(layerBoxes().length).toBeGreaterThan(0);
    await dragEach();
  });

  it("does the same on a slide with a layout of its own (S9)", async () => {
    open();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^2\. A Grade/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout" }));
    fireEvent.click(screen.getByRole("button", { name: "New layout for this slide" }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout" }));
    expect(screen.getByText(/has its own layout/)).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await dragEach();
    // The rows layer's own cells, fitted to "…", are still on the card.
    expect(document.querySelector("[data-fit-words]")).toBeTruthy();
  });
});
