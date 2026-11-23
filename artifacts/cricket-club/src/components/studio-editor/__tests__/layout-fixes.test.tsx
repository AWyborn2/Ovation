/**
 * Editor layout fixes (recheck of set 1040, Nov 2026):
 *
 * 1. Edit page always has a route: a click on the page's base (its full-bleed
 *    background), Esc, a click on the grey off the card, and the rail's own
 *    Edit page. The background shape stays reachable from Layers.
 * 2. A click on a photo under a scrim selects the photo; a second click on the
 *    same spot reaches the scrim.
 * 3. The quick colour swatches live in the Edit panel, not beside Edit and
 *    Position, and the toolbar's buttons are at least 32px.
 * 4. The slide-level Change photo has the Photo position sliders, saved per slide.
 * 5. The Scroll view shows Duplicate only where it's allowed, and a disabled
 *    one with why where it isn't.
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
import { renderAt } from "@/test/render";
import { clickOrder, isDecorativeOver, pageBackgroundIds } from "../hit-test";
import TEAM_LIST from "../../../../../../lib/template-bundles/broadcast-dark/teamList.json";
import MATCH_DAY from "../../../../../../lib/template-bundles/broadcast-dark/matchDay.json";
import CLUB_KIT_MATCH_DAY from "../../../../../../lib/template-bundles/club-kit/matchDay.json";
import CARD_INPUT from "./fixtures/weekend-team-lists.json";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
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

const at = (x: number, y: number, w: number, h: number) => ({
  geometry: { portrait: { x, y, w, h }, story: { x, y, w, h } },
});
const BG: FreeLayer = {
  id: "bg",
  kind: "shape",
  style: { background: "#101010" },
  ...at(0, 0, 100, 100),
};
const PHOTO: FreeLayer = { id: "ph", kind: "photo", name: "Photo", ...at(0, 30, 100, 40) };
/** A gradient over the photo, unnamed (as the bundles' scrims are). */
const SCRIM = {
  id: "scrim",
  kind: "shape",
  style: {
    fill: {
      type: "linear",
      stops: [
        { color: "#000000b3", at: 0 },
        { color: "#00000000", at: 40 },
      ],
    },
  },
  ...at(0, 30, 100, 40),
} as unknown as FreeLayer;
/** A small solid badge over the photo: a real layer, so it takes the first click. */
const BADGE: FreeLayer = {
  id: "badge",
  kind: "shape",
  name: "Badge",
  style: { background: "#c8a000" },
  ...at(70, 60, 20, 8),
};
const TITLE: FreeLayer = {
  id: "title",
  kind: "text",
  name: "Title",
  content: "Big win",
  ...at(10, 10, 60, 10),
};
const CARD = { formatVersion: 2, pages: { card: { layers: [BG, PHOTO, SCRIM, BADGE, TITLE] } } };

function openCard(save: (doc: Record<string, unknown>) => void = () => undefined) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1366 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (/platform\/auth\/me/.test(url))
        return new Response(JSON.stringify({ error: "Not signed in" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
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
      viewport={{ w: 1366, h: 768 }}
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
      sidePanels={() => [
        {
          id: "photo",
          title: "Change photo",
          onPage: true,
          body: <p data-testid="host-photo-panel">The host's Change photo</p>,
        },
      ]}
      actions={({ openPanel }) => (
        <button type="button" onClick={() => openPanel("photo")}>
          Change photo
        </button>
      )}
    />,
    "/admin/social/editor/7",
  );
}

const overlay = (id: string) => document.querySelector<HTMLElement>(`[data-testid="layer-${id}"]`);
/** A click on an overlay that ends where it started (no drag). */
async function click(id: string) {
  await waitFor(() => expect(overlay(id)).toBeTruthy());
  fireEvent.pointerDown(overlay(id)!, { button: 0 });
  fireEvent.pointerUp(overlay(id)!, { button: 0 });
  // A click on the page's base starts a marquee, which ends on the window.
  fireEvent.pointerUp(window, { button: 0 });
}
const slot = () => screen.getByTestId("editor-panel");
const panelIs = (id: string) => waitFor(() => expect(slot().getAttribute("data-panel")).toBe(id));
const toolbar = () => screen.getByRole("toolbar", { name: "Layer tools" });
const tool = (name: string) => within(toolbar()).queryByRole("button", { name });
const rail = () => screen.getByRole("navigation", { name: "Editor tools" });
/** The selected layer, by the name its selection is shown with in the toolbar's panel title. */
const selectionBox = () => screen.queryByTestId("selection-box");

describe("1. a route to Edit page", () => {
  it("a click on the page's full-bleed background opens Edit page, not the shape", async () => {
    openCard();
    await click("title");
    fireEvent.click(tool("Edit")!);
    await panelIs("edit");
    expect(overlay("bg")!.hasAttribute("data-page-base")).toBe(true);
    await click("bg");
    await panelIs("page");
    expect(within(slot()).getByRole("heading", { name: "Edit page" })).toBeTruthy();
    expect(selectionBox()).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Layer tools" })).toBeNull();
  });

  it("Esc deselects and opens Edit page, from any panel", async () => {
    openCard();
    await click("title");
    fireEvent.click(within(rail()).getByRole("button", { name: "Elements" }));
    await panelIs("elements");
    fireEvent.keyDown(window, { key: "Escape" });
    await panelIs("page");
    expect(selectionBox()).toBeNull();
  });

  it("a click on the grey around the slide deselects and opens Edit page", async () => {
    openCard();
    await click("title");
    fireEvent.click(within(rail()).getByRole("button", { name: "Text" }));
    await panelIs("text");
    // The stage the card is centred in, not the canvas area itself.
    const grey = screen.getByTestId("canvas-stage");
    fireEvent.pointerDown(grey, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(window, { button: 0, clientX: 5, clientY: 5 });
    await panelIs("page");
    expect(selectionBox()).toBeNull();
  });

  it("the rail always has Edit page, which deselects", async () => {
    openCard();
    await click("title");
    fireEvent.click(tool("Edit")!);
    await panelIs("edit");
    const entry = within(rail()).getByRole("button", { name: "Edit page" });
    fireEvent.click(entry);
    await panelIs("page");
    expect(entry.getAttribute("aria-pressed")).toBe("true");
    expect(selectionBox()).toBeNull();
  });

  it("the background shape is still reachable from Layers", async () => {
    openCard();
    fireEvent.click(within(rail()).getByRole("button", { name: "Position" }));
    fireEvent.click(within(slot()).getByRole("tab", { name: "Layers" }));
    const layers = within(slot()).getByRole("tabpanel", { name: "Layers" });
    const rows = within(layers).getAllByRole("button", { pressed: false });
    // Bottom-most last: the unnamed background shape.
    const bottom = rows.filter((b) => b.closest("li")).at(-1)!;
    fireEvent.click(bottom);
    await waitFor(() => expect(selectionBox()).toBeTruthy());
    expect(tool("Edit")).toBeTruthy();
  });
});

describe("2. a photo under a scrim", () => {
  it("the first click selects the photo; a second click on the same spot reaches the scrim", async () => {
    openCard();
    // The scrim is on top of the photo: its overlay takes the pointer.
    await click("scrim");
    await waitFor(() => expect(tool("Replace")).toBeTruthy());
    expect(within(toolbar()).getAllByRole("button")[0]!.textContent?.trim()).toBe("Replace");
    // Again on the same spot: the scrim (a shape, so no Replace).
    await click("scrim");
    await waitFor(() => expect(tool("Replace")).toBeNull());
    expect(tool("Edit")).toBeTruthy();
    fireEvent.click(tool("Edit")!);
    expect(within(slot()).getByRole("heading", { name: "Edit layer" })).toBeTruthy();
    // And again: back to the photo.
    await click("scrim");
    await waitFor(() => expect(tool("Replace")).toBeTruthy());
  });

  it("a solid layer over the photo still takes the first click", async () => {
    openCard();
    await click("badge");
    await waitFor(() => expect(tool("Edit")).toBeTruthy());
    expect(tool("Replace")).toBeNull();
  });

  it("a drag on the scrim moves the photo, not the scrim", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openCard((d) => saved.push(d));
    await waitFor(() => expect(overlay("scrim")).toBeTruthy());
    const board = screen.getByTestId("editor-artboard");
    board.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 500, right: 400, bottom: 500 }) as DOMRect;
    fireEvent.pointerDown(overlay("scrim")!, { button: 0, clientX: 200, clientY: 250 });
    fireEvent.pointerMove(overlay("scrim")!, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(overlay("scrim")!, { clientX: 200, clientY: 300 });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const layers = (saved[0] as { pages: { card: { layers: FreeLayer[] } } }).pages.card.layers;
    expect(layers.find((l) => l.id === "ph")!.geometry.portrait!.y).toBeCloseTo(40);
    expect(layers.find((l) => l.id === "scrim")!.geometry.portrait!.y).toBe(30);
  });
});

describe("the hit test", () => {
  const box = (l: FreeLayer) => l.geometry.portrait ?? null;
  const layers = [BG, PHOTO, SCRIM, BADGE, TITLE];

  it("treats the bottom run of full-bleed plain layers, or one named so, as the page", () => {
    const glow = { ...BG, id: "glow", style: { opacity: 0.4 } } as FreeLayer;
    const named = { ...BADGE, id: "named", name: "Background texture" } as FreeLayer;
    const fullPhoto = { ...PHOTO, id: "full", ...at(0, 0, 100, 100) } as FreeLayer;
    expect([...pageBackgroundIds([BG, glow, PHOTO, named], box)]).toEqual(["bg", "glow", "named"]);
    // A full-bleed photo is never the page, and ends the run.
    expect([...pageBackgroundIds([fullPhoto, BG], box)]).toEqual([]);
    expect(clickOrder(layers, box, "bg", { x: 50, y: 5 })).toEqual([]);
  });

  it("treats a whole-card scrim over the photo as the page, off the photo (Broadcast Dark team page)", () => {
    const team = (
      TEAM_LIST as unknown as { document: { pages: { team: { layers: FreeLayer[] } } } }
    ).document.pages.team.layers.filter((l) => l.geometry.portrait);
    const b = (l: FreeLayer) => l.geometry.portrait ?? null;
    // team-l1: the base; team-l4: a full-card gradient (showWhen photo) above the photo.
    const base = pageBackgroundIds(team, b);
    expect(base.has("team-l1")).toBe(true);
    expect(base.has("team-l4")).toBe(true);
    // Its top-left corner, off the photo (x 38–100): the page.
    expect(clickOrder(team, b, "team-l4", { x: 2, y: 50 })).toEqual([]);
    // On the photo: the photo first, its own gradient (team-l3) after it.
    const order = clickOrder(team, b, "team-l4", { x: 70, y: 50 });
    expect(order[0]).toBe("team-l2");
    expect(order).toContain("team-l3");
    expect(order).not.toContain("team-l4");
  });

  it("puts a photo before the decoration over it, but not before real layers", () => {
    expect(clickOrder(layers, box, "scrim", { x: 50, y: 40 })).toEqual(["ph", "scrim"]);
    expect(clickOrder(layers, box, "badge", { x: 75, y: 62 })).toEqual(["badge", "ph", "scrim"]);
    // Inside a group there is no page base.
    expect(clickOrder(layers, box, "bg", { x: 50, y: 5 }, { backgrounds: false })).toEqual(["bg"]);
  });

  it("knows decoration by name, showWhen photo, gradient, see-through or full size", () => {
    const p = box(PHOTO);
    const small = at(10, 40, 10, 5).geometry.portrait;
    const shape = (extra: Partial<FreeLayer> & Record<string, unknown>) =>
      ({ id: "x", kind: "shape", ...at(10, 40, 10, 5), ...extra }) as FreeLayer;
    expect(isDecorativeOver(shape({ name: "Bottom shading" }), small, p)).toBe(true);
    expect(isDecorativeOver(shape({ name: "Date and Game Day scrim" }), small, p)).toBe(true);
    expect(isDecorativeOver(shape({ showWhen: { photo: true } }), small, p)).toBe(true);
    expect(
      isDecorativeOver(
        shape({ style: { background: "linear-gradient(#000, transparent)" } }),
        small,
        p,
      ),
    ).toBe(true);
    expect(isDecorativeOver(shape({ style: { opacity: 0.6 } }), small, p)).toBe(true);
    expect(isDecorativeOver(shape({ style: { background: "#000" } }), p, p)).toBe(true);
    expect(isDecorativeOver(shape({ style: { background: "#000" } }), small, p)).toBe(false);
    expect(isDecorativeOver({ ...TITLE, name: "Overlay title" }, small, p)).toBe(false);
  });

  it("on a real bundle, a click on the photo's gradient picks the photo", () => {
    // Club Kit Match Day: fixture-l23 is a gradient over the photo fixture-l20.
    const page = Object.values(
      (
        CLUB_KIT_MATCH_DAY as unknown as {
          document: { pages: Record<string, { layers: FreeLayer[] }> };
        }
      ).document.pages,
    ).find((pg) => pg.layers.some((l) => l.id === "fixture-l23"))!;
    const size = Object.keys(page.layers.find((l) => l.id === "fixture-l20")!.geometry)[0] as
      "portrait" | "story";
    const on = page.layers.filter((l) => !l.sizes || l.sizes.includes(size));
    const b = (l: FreeLayer) => l.geometry[size] ?? null;
    const photo = b(on.find((l) => l.id === "fixture-l20")!)!;
    const p = { x: photo.x + photo.w / 2, y: photo.y + photo.h / 2 };
    const top = [...on]
      .reverse()
      .find(
        (l) =>
          l.kind !== "text" &&
          b(l) &&
          p.x >= b(l)!.x &&
          p.x <= b(l)!.x + b(l)!.w &&
          p.y >= b(l)!.y &&
          p.y <= b(l)!.y + b(l)!.h,
      )!;
    expect(clickOrder(on, b, top.id, p)[0]).toBe("fixture-l20");
    // Its full-card base layers are the page.
    expect(pageBackgroundIds(on, b).has("fixture-l1")).toBe(true);
  });
});

describe("3. the toolbar's swatches and targets", () => {
  it("has no colour swatches beside Edit / Position; they are in the Edit panel", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openCard((d) => saved.push(d));
    await click("title");
    await waitFor(() => expect(tool("Edit")).toBeTruthy());
    expect(within(toolbar()).queryByRole("group", { name: "Colour" })).toBeNull();
    expect(within(toolbar()).queryByRole("button", { name: "Accent" })).toBeNull();
    expect(within(toolbar()).queryByLabelText("Custom colour")).toBeNull();
    fireEvent.click(tool("Edit")!);
    const colours = within(slot()).getByRole("region", { name: "Quick colours" });
    fireEvent.click(within(colours).getByRole("button", { name: "Accent" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const layers = (saved[0] as { pages: { card: { layers: FreeLayer[] } } }).pages.card.layers;
    expect(layers.find((l) => l.id === "title")!.style?.color).toBe("var(--gold)");
  });

  it("every toolbar button is at least 32px, with a gap between them", async () => {
    openCard();
    await click("title");
    await waitFor(() => expect(tool("Edit")).toBeTruthy());
    expect(toolbar().className).toMatch(/\bgap-1\.5\b/);
    for (const b of within(toolbar()).getAllByRole("button")) {
      expect(b.className).toMatch(/\bh-8\b/);
      expect(b.className).toMatch(/\b(min-w-8|w-8)\b/);
    }
    // Edit and Position sit together, then a divider, then nothing colourful.
    const edit = tool("Edit")!;
    const position = tool("Position")!;
    expect(edit.nextElementSibling).toBe(position);
    expect(position.nextElementSibling?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("4. the slide-level Change photo", () => {
  it("shows the Photo position sliders for the page's photo, saved on it per size", async () => {
    const saved: Array<Record<string, unknown>> = [];
    openCard((d) => saved.push(d));
    await waitFor(() => expect(overlay("title")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Change photo" }));
    await panelIs("photo");
    expect(within(slot()).getByTestId("host-photo-panel")).toBeTruthy();
    const pos = within(slot()).getByRole("region", { name: "Photo position" });
    const slider = within(pos).getByRole("slider", { name: "Photo left–right" });
    fireEvent.change(slider, { target: { value: "0.2" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const layers = (saved[0] as { pages: { card: { layers: FreeLayer[] } } }).pages.card.layers;
    expect(layers.find((l) => l.id === "ph")!.photoPosition).toEqual({
      portrait: { focalX: 0.2, focalY: 0.5, zoom: 1 },
    });
  });
});

// ── A set draft ─────────────────────────────────────────────────────────────

const docs: Record<string, unknown> = {
  teamList: TEAM_LIST.document,
  matchDay: MATCH_DAY.document,
};
const BASE_DOC = assembleSetDocument("teamLists", (kind) => docs[kind])!.document;
const GAME = "fixture-244";
/** The game slide has a photo of its own, so the set offers Change photo for it. */
const DOC = {
  ...BASE_DOC,
  arrangement: {
    ...((BASE_DOC as { arrangement?: object }).arrangement ?? {}),
    order: [],
    removed: [],
    ownPhotos: { [GAME]: { photoId: 5, url: "https://example.test/own.jpg" } },
  },
};
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
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1366 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
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
                stored: true,
              };
      else if (/social-drafts\/956$/.test(url)) payload = DRAFT;
      else if (/photo-pool/.test(url)) payload = { photoIds: [], playerIds: [], junior: false };
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

describe("4. a set slide's Change photo", () => {
  it("has the Photo position sliders, and they save for that slide alone", async () => {
    const requests = openSet();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^2\. A Grade/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Change photo" }));
    await panelIs("photo");
    expect(within(slot()).getByTestId("change-photo")).toBeTruthy();
    const pos = within(slot()).getByRole("region", { name: "Photo position" });
    expect(within(pos).getByText(/This slide only/)).toBeTruthy();
    const slider = within(pos).getByRole("slider", { name: "Photo up–down" });
    fireEvent.change(slider, { target: { value: "0.3" } });
    fireEvent.pointerUp(slider);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(requests.some((r) => r.method === "PUT" && /set-design$/.test(r.url))).toBe(true),
    );
    const put = requests.find((r) => r.method === "PUT" && /set-design$/.test(r.url))!;
    const photoFor = (
      put.body as { document: { arrangement?: { photoFor?: Record<string, unknown> } } }
    ).document.arrangement?.photoFor;
    // Only the game slide, only Portrait.
    expect(Object.keys(photoFor ?? {})).toEqual([GAME]);
    const own = Object.values(photoFor![GAME] as Record<string, Record<string, unknown>>)[0]!;
    expect(own).toEqual({ portrait: { focalX: 0.5, focalY: 0.3, zoom: 1 } });
  });
});

describe("5. the Scroll header's Duplicate", () => {
  it("is shown disabled with why on a game slide, and offered on an added page", async () => {
    openSet();
    await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Pages" })).getByRole("button", { name: "Scroll" }),
    );
    const list = screen.getByRole("region", { name: "Slides" });
    const game = within(list).getByRole("button", {
      name: "Duplicate A Grade v Waroona Cricket Club",
    });
    expect(game.getAttribute("aria-disabled")).toBe("true");
    expect(game.title).toBe("Game slides can't be duplicated");
    const before = within(list).getAllByRole("listitem").length;
    fireEvent.click(game);
    expect(within(list).getAllByRole("listitem")).toHaveLength(before);

    // An added blank page can be duplicated.
    fireEvent.click(within(list).getByRole("button", { name: "Add a page" }));
    const options = within(list).getByRole("group", { name: "Add a page" });
    fireEvent.click(
      within(options)
        .getAllByRole("button")
        .find((b) => /blank/i.test(b.textContent ?? ""))!,
    );
    await waitFor(() => expect(within(list).getAllByRole("listitem").length).toBe(before + 1));
    const added = within(list)
      .getAllByRole("button", { name: /^Duplicate / })
      .filter((b) => b.getAttribute("aria-disabled") !== "true");
    expect(added).toHaveLength(1);
    expect(added[0]!.title).toBe("Duplicate");
    fireEvent.click(added[0]!);
    await waitFor(() => expect(within(list).getAllByRole("listitem").length).toBe(before + 2));
  });
});
