/**
 * One slide of a set draft in the card editor (studio-create S8, New Studio):
 * "Edit this slide" opens it there, and saving writes its design back into the
 * set as that slide's own layout, leaving the other slides' shared page alone.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminSetDraftEditor from "@/pages/admin-set-draft-editor";
import AdminSetSlideEditor from "@/pages/admin-set-slide-editor";
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

function stub(newStudio: boolean) {
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
  return requests;
}

const KEY = "detail:senior:B Grade";

describe("Edit this slide (studio-create S8)", () => {
  it("links the team slide on show to the card editor, not the cover", async () => {
    stub(true);
    renderAt(
      <Route path="/admin/social/set/:id">
        <AdminSetDraftEditor />
      </Route>,
      "/admin/social/set/42",
    );
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    // The cover is edited in the set editor.
    expect(screen.queryByRole("link", { name: "Edit this slide" })).toBeNull();
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. B Grade/ }));
    const link = await screen.findByRole("link", { name: "Edit this slide" });
    expect(link.getAttribute("href")).toBe(
      `/admin/social/set/42/slide?key=${encodeURIComponent(KEY)}`,
    );
  });

  it("saves the slide's design as its own layout, leaving the shared team page alone", async () => {
    const requests = stub(true);
    renderAt(
      <Route path="/admin/social/set/:id/slide">
        <AdminSetSlideEditor />
      </Route>,
      `/admin/social/set/42/slide?key=${encodeURIComponent(KEY)}`,
    );
    expect(await screen.findByText("B Grade: one slide")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a heading" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const saved = (
      requests.find((r) => r.method === "PUT")!.body as {
        document: {
          pages: Array<{ id: string; slot: string; layers: unknown[] }>;
          arrangement: { pageFor: Record<string, string> };
        };
      }
    ).document;
    const own = saved.pages.find((p) => p.slot === "page")!;
    expect(saved.arrangement.pageFor).toEqual({ [KEY]: own.id });
    expect(own.layers.length).toBeGreaterThan(1);
    // The page every other team slide shares is as it was.
    expect(saved.pages.find((p) => p.id === "team")!.layers).toEqual(DOC.pages[1]!.layers);
  });

  it("isn't open with the New Studio switch off", async () => {
    stub(false);
    renderAt(
      <Route path="/admin/social/set/:id/slide">
        <AdminSetSlideEditor />
      </Route>,
      `/admin/social/set/42/slide?key=${encodeURIComponent(KEY)}`,
    );
    expect(await screen.findByText("Edit the slide in the set editor.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the set" }).getAttribute("href")).toBe(
      "/admin/social/set/42",
    );
  });
});
