/**
 * The Layers drawer on converted looks (editable-elements plan, A1): every
 * layer kind a template bundle holds — `vector` and `group` included — gets a
 * row with an icon, and a kind this build doesn't know falls back to a plain
 * icon instead of crashing the editor.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import { layerOnSize, primaryPage } from "@workspace/scorecard/kind-templates";
import AdminTemplateEditor from "@/pages/admin-template-editor";
import type { FreeLayer } from "@/lib/pack-render";
import { renderAt } from "@/test/render";
import { LayersDrawer } from "../layers-drawer";

const BUNDLES = path.resolve(__dirname, "../../../../../../lib/template-bundles");
// A look folder has a look.json; the element library's `elements/` doesn't.
const LOOKS = readdirSync(BUNDLES).filter((d) => existsSync(path.join(BUNDLES, d, "look.json")));

type Bundle = {
  document: { layers?: FreeLayer[]; pages?: Record<string, { layers: FreeLayer[] }> };
};
const bundle = (look: string, kind: string): Bundle =>
  JSON.parse(readFileSync(path.join(BUNDLES, look, `${kind}.json`), "utf8")) as Bundle;
const kindsOf = (look: string) =>
  readdirSync(path.join(BUNDLES, look))
    .filter((f) => f.endsWith(".json") && f !== "look.json")
    .map((f) => f.slice(0, -5));
const pagesOf = (b: Bundle): FreeLayer[][] =>
  b.document.pages ? Object.values(b.document.pages).map((p) => p.layers) : [b.document.layers!];

const drawer = (layers: FreeLayer[]) =>
  render(
    <LayersDrawer
      layers={layers}
      selection={[]}
      onSelect={() => {}}
      onToggleHidden={() => {}}
      onToggleLocked={() => {}}
      onClose={() => {}}
    />,
  );

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("layers drawer", () => {
  it("lists every top-level layer of every bundle page in every look", () => {
    expect(LOOKS).toEqual(expect.arrayContaining(["broadcast-dark", "gold-foil", "neon-night"]));
    for (const look of LOOKS) {
      for (const kind of kindsOf(look)) {
        for (const layers of pagesOf(bundle(look, kind))) {
          const { container } = drawer(layers);
          expect(container.querySelectorAll("li")).toHaveLength(layers.length);
          cleanup();
        }
      }
    }
  }, 60_000);

  it("names vectors and groups by what they are, with their own icons", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    drawer([
      { id: "v", kind: "vector", geometry: { square: box } },
      { id: "g", kind: "group", geometry: { square: box } },
      { id: "n", kind: "group", name: "Score block", geometry: { square: box } },
    ]);
    expect(screen.getByRole("button", { name: "Hide Graphic" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide Group" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lock Score block" })).toBeTruthy();
    const icons = [...document.querySelectorAll("li button[aria-pressed] > svg")].map((s) =>
      s.getAttribute("class"),
    );
    expect(icons[0]).toMatch(/lucide-group/);
    expect(icons[2]).toMatch(/lucide-pen-tool/);
  });

  it("falls back to a plain icon for a kind it doesn't know", () => {
    drawer([
      {
        id: "x",
        kind: "hologram" as FreeLayer["kind"],
        geometry: { square: { x: 0, y: 0, w: 1, h: 1 } },
      },
    ]);
    expect(screen.getByRole("button", { name: "Hide hologram" })).toBeTruthy();
    expect(document.querySelector("li button[aria-pressed] > svg")?.getAttribute("class")).toMatch(
      /lucide-square/,
    );
  });

  /** Open the template editor's Layers drawer on a bundle template; the square's layers. */
  async function openLayers(look: string, kind: string) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    const doc = bundle(look, kind).document;
    const template = {
      id: 9,
      kind,
      name: `${look} ${kind}`,
      version: 1,
      isDefault: false,
      basedOn: null,
      edited: false,
      updateAvailable: null,
      fitStatus: "pass",
      fitReport: null,
      coverage: { pages: [primaryPage(kind)], sizes: ["square"] },
      updatedAt: null,
      waitingDrafts: 0,
      document: doc,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        let payload: unknown = [];
        if (/club-templates\/9$/.test(url)) payload = template;
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
    await waitFor(() => expect(document.querySelector('[data-testid^="layer-"]')).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    const list = await screen.findByRole("complementary", { name: "Layers" });
    // The drawer lists the layers on the size being edited (square).
    const card = doc.pages![primaryPage(kind)]!.layers.filter((l) => layerOnSize(l, "square"));
    expect(within(list).getAllByRole("listitem")).toHaveLength(card.length);
    const count = (icon: string) =>
      list.querySelectorAll(`li button[aria-pressed] > svg.lucide-${icon}`).length;
    return { card, count };
  }

  it("opens Layers on a converted template with vectors (Gold Foil's stripes)", async () => {
    const { card, count } = await openLayers("gold-foil", "matchSummary");
    expect(card.some((l) => l.kind === "vector")).toBe(true);
    expect(count("pen-tool")).toBe(card.filter((l) => l.kind === "vector").length);
  });

  it("opens Layers on a starter with groups (its Club Kit elements, split in C3)", async () => {
    const { card, count } = await openLayers("club-kit-classic", "century");
    expect(card.some((l) => l.kind === "group")).toBe(true);
    expect(count("group")).toBe(card.filter((l) => l.kind === "group").length);
  });
});
