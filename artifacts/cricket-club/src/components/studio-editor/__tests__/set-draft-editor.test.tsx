/**
 * Editing a carousel set draft (carousel set editor plan, part 3): a Round
 * Team Lists draft opens with its real slides; reorder, delete and save write
 * the slide order into its set design.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminSetDraftEditor from "@/pages/admin-set-draft-editor";
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

const box = { x: 10, y: 10, w: 80, h: 20 };
const geometry = { square: box, portrait: box, story: box, landscape: box };
const page = (id: string, slot: string, kind: string, p: string) => ({
  id,
  role: slot === "team" ? "repeat" : "fixed",
  slot,
  kind,
  page: p,
  layers: [{ id: `${id}-1`, kind: "text", name: id, content: id.toUpperCase(), geometry }],
});
const DOC = {
  formatVersion: 2,
  set: "teamLists",
  pages: [
    page("cover", "cover", "teamListRound", "card"),
    page("team", "team", "teamList", "team"),
    page("sponsors", "sponsors", "matchDay", "sponsors"),
  ],
};
const DRAFT = {
  id: 42,
  engine: "teamlists-round",
  family: "matchday",
  status: "awaiting_review",
  appPath: "/fixtures",
  sourceMatchIsJunior: false,
  caption: "Round 15",
  createdAt: "2026-10-20T10:00:00Z",
  packId: "blank",
  templateVersion: 1,
  templateRef: { libraryTemplateId: 3, version: 1 },
  cardInput: {
    kind: "teamListRound",
    roundLabel: "Round 15",
    date: "Saturday 14 Feb",
    teams: ["A Grade", "B Grade"].map((grade) => ({
      grade,
      players: [{ surname: "SMITH", order: 1 }],
    })),
  },
  adjustments: DOC,
};

type Req = { method: string; url: string; body: unknown };

function open({ newStudio = false }: { newStudio?: boolean } = {}) {
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
      if (/social-drafts\/42\/set-design$/.test(url))
        payload =
          method === "PUT"
            ? { ...DRAFT, adjustments: (body as { document: unknown }).document }
            : {
                draftId: 42,
                setType: "teamLists",
                layout: "list",
                document: DOC,
                templateRef: DRAFT.templateRef,
                size: null,
                stored: true,
              };
      else if (/social-drafts\/42$/.test(url)) payload = DRAFT;
      else if (/tenant-plan/.test(url))
        payload = { plan: "club", newStudio, entitlements: { socialStudio: true } };
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
    "/admin/social/set/42",
  );
  return requests;
}

describe("editing a Round Team Lists set draft", () => {
  it("shows its real slides, and saves a new order without the sponsors slide", async () => {
    const requests = open();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    const tiles = () =>
      within(strip)
        .getAllByRole("button", { name: /^\d\. / })
        .map((b) => b.getAttribute("aria-label"));
    expect(tiles()).toEqual([
      "1. Cover",
      "2. A Grade, repeats for each item",
      "3. B Grade, repeats for each item",
      "4. Sponsors",
    ]);
    expect(screen.getByText("Team lists: Round 15")).toBeTruthy();

    fireEvent.click(within(strip).getByRole("button", { name: /^3\. B Grade/ }));
    expect(screen.getByText(/Every team slide shares this design/)).toBeTruthy();
    fireEvent.click(within(strip).getByRole("button", { name: "Move B Grade earlier" }));
    expect(tiles()[1]).toBe("2. B Grade, repeats for each item");

    fireEvent.click(within(strip).getByRole("button", { name: /^4\. Sponsors/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Delete Sponsors" }));
    expect(tiles()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const put = requests.find((r) => r.method === "PUT")!;
    expect(put.url).toMatch(/social-drafts\/42\/set-design$/);
    const saved = (put.body as { document: { arrangement: unknown } }).document;
    expect(saved.arrangement).toEqual({
      order: ["page:cover", "detail:senior:B Grade", "detail:senior:A Grade"],
      removed: ["page:sponsors"],
    });
  });
});

describe("a slide's own layout (studio-create S9, New Studio)", () => {
  it("isn't offered with the New Studio switch off", async () => {
    open();
    await screen.findByRole("navigation", { name: "Slides" });
    expect(screen.queryByRole("button", { name: "Layout" })).toBeNull();
  });

  it("gives one team slide a layout of its own and saves it in the arrangement", async () => {
    const requests = open({ newStudio: true });
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. B Grade/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout" }));
    expect(screen.getByText(/shares its layout with 1 other slide/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New layout for this slide" }));
    // The canvas now edits this slide's own layout.
    fireEvent.click(await screen.findByRole("button", { name: "Layout" }));
    expect(screen.getByText(/has its own layout/)).toBeTruthy();
    // The team still shows; it no longer marks itself as repeating.
    expect(
      within(strip)
        .getByRole("button", { name: /^3\. B Grade/ })
        .getAttribute("aria-label"),
    ).toBe("3. B Grade");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const saved = (
      requests.find((r) => r.method === "PUT")!.body as {
        document: { pages: Array<{ id: string; slot: string }>; arrangement: { pageFor: unknown } };
      }
    ).document;
    const own = saved.pages.find((p) => p.slot === "page")!;
    expect(saved.arrangement.pageFor).toEqual({ "detail:senior:B Grade": own.id });
    expect(saved.pages.map((p) => p.slot)).toEqual(["cover", "team", "sponsors", "page"]);
  });
});
