/**
 * Portrait and Story sizes plan, Stage 3 ("Offer Portrait and Story only"):
 * the editor's Format menu lists Portrait and Story, and adds an older size
 * (Square, Landscape) only when the design has layers on it, labelled
 * "(older size)". An October landscape draft still opens at Landscape.
 *
 * Round 9: only sizes the design draws (B13), and an older size only where
 * the draft was made in it (B8): the server's `olderSizes` says which. A new
 * card from a four-size library look lists Portrait and Story only.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { Route } from "wouter";
import AdminStudioEditor from "@/pages/admin-studio-editor";
import { renderWithHistory } from "@/test/render";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = { x: 10, y: 10, w: 80, h: 20 };
const title = (geometry: Record<string, typeof box>, sizes?: string[]) => ({
  id: "title",
  kind: "text",
  name: "Title",
  text: "Big win",
  ...(sizes ? { sizes } : {}),
  geometry,
});
const FOUR_SIZE = { layers: [title({ square: box, portrait: box, story: box, landscape: box })] };
const NEW_DESIGN = {
  layers: [title({ portrait: box, story: box }, ["portrait", "story"])],
};

const DRAFT = {
  id: 11,
  engine: "adhoc",
  family: "results",
  status: "awaiting_review",
  cardInput: { kind: "announcement", headline: "Big win", body: "We won" },
  appPath: "/",
  trackedSlug: null,
  caption: "x",
  photoUrl: null,
  photoSource: null,
  staleSince: null,
  sourceMatchIsJunior: false,
  createdAt: "2026-11-19T00:00:00Z",
  packId: "blank",
  templateVersion: 3,
  layoutCheckPending: false,
  layoutWarnings: { square: [] },
  adjustments: FOUR_SIZE,
  designSize: null,
};

function stubApi(draft: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      let payload: unknown = [];
      if (/\/api\/social-drafts\/11$/.test(url)) payload = draft;
      else if (/social-settings/.test(url))
        payload = {
          settings: { clubUrl: "", familyConfig: {} },
          captionTemplates: [],
          activeSponsors: [],
          brand: { name: "Demo Cricket Club", primaryColour: "#1d4ed8" },
        };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function openEditor(path: string) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  return renderWithHistory(
    <Route path="/admin/social/editor/:id">
      <AdminStudioEditor />
    </Route>,
    path,
  );
}

const formatMenu = async () => {
  const select = (await screen.findByRole("combobox", { name: "Format" })) as HTMLSelectElement;
  return {
    value: select.value,
    options: Array.from(select.options).map((o) => (o.textContent ?? "").trim()),
  };
};

describe("the Format menu (Stage 3)", () => {
  it("a new Portrait and Story design offers Portrait and Story only", async () => {
    stubApi({ ...DRAFT, adjustments: NEW_DESIGN, designSize: "portrait" });
    openEditor("/admin/social/editor/11");
    const menu = await formatMenu();
    expect(menu.value).toBe("portrait");
    expect(menu.options).toEqual(["Portrait", "Story"]);
  });

  it("a four-size design made in its older sizes lists them after, as (older size)", async () => {
    stubApi({ ...DRAFT, designSize: "portrait", olderSizes: ["square", "landscape"] });
    openEditor("/admin/social/editor/11");
    const menu = await formatMenu();
    expect(menu.options).toEqual([
      "Portrait",
      "Story",
      "Square (older size)",
      "Landscape (older size)",
    ]);
  });

  it("round 9 B8: a brand-new card from a four-size look lists no older size", async () => {
    stubApi({ ...DRAFT, designSize: "portrait", olderSizes: [] });
    openEditor("/admin/social/editor/11");
    const menu = await formatMenu();
    expect(menu.value).toBe("portrait");
    expect(menu.options).toEqual(["Portrait", "Story"]);
  });

  it('round 9 B13: card 1022 (no Story layers) offers Portrait only, never "Story · empty"', async () => {
    const t20 = {
      layers: [
        title({ square: box, portrait: box, landscape: box }, ["square", "portrait", "landscape"]),
      ],
    };
    stubApi({ ...DRAFT, adjustments: t20, designSize: "portrait", olderSizes: [] });
    // Even a link asking for Story opens at a size the design draws.
    openEditor("/admin/social/editor/11?format=story");
    const menu = await formatMenu();
    expect(menu.value).toBe("portrait");
    expect(menu.options).toEqual(["Portrait"]);
  });

  it("an older draft with no saved size still opens at Square, as before", async () => {
    stubApi({ ...DRAFT, designSize: null, olderSizes: ["square", "landscape"] });
    openEditor("/admin/social/editor/11");
    const menu = await formatMenu();
    expect(menu.value).toBe("square");
    expect(menu.options).toContain("Square (older size)");
  });

  it("an October landscape draft opens and stays at Landscape from its Format menu", async () => {
    stubApi({ ...DRAFT, designSize: "landscape", olderSizes: ["landscape"] });
    openEditor("/admin/social/editor/11");
    const menu = await formatMenu();
    expect(menu.value).toBe("landscape");
    expect(menu.options).toContain("Landscape (older size)");
  });

  it("a pack design (the older editor) keeps all four, the older ones labelled", async () => {
    stubApi({
      ...DRAFT,
      packId: "broadcast-dark",
      templateVersion: null,
      adjustments: {},
      designSize: null,
    });
    openEditor("/admin/social/editor/11");
    const menu = await formatMenu();
    expect(menu.value).toBe("square");
    expect(menu.options.map((o) => o.split(" ·")[0])).toEqual([
      "Portrait",
      "Story",
      "Square (older size)",
      "Landscape (older size)",
    ]);
  });

  it("a blank canvas started at Portrait (the older editor) offers no older size", async () => {
    stubApi({
      ...DRAFT,
      packId: "blank",
      templateVersion: null,
      adjustments: { layers: [title({ portrait: box })] },
      designSize: "portrait",
    });
    openEditor("/admin/social/editor/11?format=portrait");
    const menu = await formatMenu();
    expect(menu.value).toBe("portrait");
    expect(menu.options.map((o) => o.split(" ·")[0])).toEqual(["Portrait", "Story"]);
  });
});
