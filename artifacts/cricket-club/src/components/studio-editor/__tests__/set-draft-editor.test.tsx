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
import {
  matchDayFixtureContent,
  matchDaySponsorsContent,
  matchDayTitleContent,
  presetFields,
} from "@workspace/scorecard/card-content";

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

function open({
  newStudio = false,
  draft = DRAFT as Record<string, unknown>,
  design = {
    draftId: 42,
    setType: "teamLists",
    layout: "list",
    document: DOC as unknown,
    templateRef: DRAFT.templateRef,
    size: null as string | null,
    stored: true,
  },
  library = [] as unknown[],
}: {
  newStudio?: boolean;
  draft?: Record<string, unknown>;
  design?: Record<string, unknown>;
  /** Templates the library lists (Change look). */
  library?: unknown[];
} = {}) {
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
            ? { ...draft, adjustments: (body as { document: unknown }).document }
            : design;
      else if (/social-drafts\/42$/.test(url)) payload = draft;
      else if (/\/api\/template-library\?/.test(url)) payload = { templates: library };
      else if (/\/api\/club-templates\?/.test(url)) payload = { templates: [] };
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
    expect(screen.getByText(/shares the set's layout with 1 other slide/)).toBeTruthy();
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

  it("keeps each slide's own layout through reorder and delete (dev retest, draft 962)", async () => {
    const requests = open({ newStudio: true });
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    const tiles = () =>
      within(strip)
        .getAllByRole("button", { name: /^\d\. / })
        .map((b) => b.getAttribute("aria-label"));
    for (const grade of ["A Grade", "B Grade"]) {
      fireEvent.click(within(strip).getByRole("button", { name: new RegExp(`^\\d\\. ${grade}`) }));
      fireEvent.click(await screen.findByRole("button", { name: "Layout" }));
      fireEvent.click(screen.getByRole("button", { name: "New layout for this slide" }));
    }
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. B Grade/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Move B Grade earlier" }));
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. A Grade/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Delete A Grade" }));
    // No layout page shows as a slide of its own.
    expect(tiles()).toEqual(["1. Cover", "2. B Grade", "3. Sponsors"]);
    fireEvent.click(within(strip).getByRole("button", { name: /^2\. B Grade/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Layout" }));
    expect(screen.getByText(/has its own layout/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const saved = (
      requests.find((r) => r.method === "PUT")!.body as {
        document: {
          pages: Array<{ id: string; slot: string }>;
          arrangement: { pageFor: unknown; removed: string[] };
        };
      }
    ).document;
    // A Grade's layout went with its slide; B Grade's stays its own.
    expect(saved.pages.map((p) => p.slot)).toEqual(["cover", "team", "sponsors", "page"]);
    const own = saved.pages.find((p) => p.slot === "page")!;
    expect(saved.arrangement.pageFor).toEqual({ "detail:senior:B Grade": own.id });
    expect(saved.arrangement.removed).toEqual(["detail:senior:A Grade"]);
  });
});

describe("a queued carousel holding orphaned slide layouts (dev retest 3, draft 962)", () => {
  const bookend = {
    heading: "This weekend",
    from: "2026-10-09",
    to: "2026-10-11",
    roundLabels: ["3"],
    fixtureCount: 1,
  };
  const slide = (id: string, label: string, content: unknown) => ({
    id,
    label,
    content,
    visibleFields: [...presetFields("matchDay", "standard")],
    photoId: null,
    data: {},
    junior: false,
    sponsorsOn: false,
    warnings: [],
  });
  const fixture = matchDayFixtureContent({
    id: 7,
    grade: "A Grade",
    roundLabel: "Round 3",
    opponentName: "Waroona Cricket Club",
    opponentLogoUrl: "https://crest",
    venue: "Oval",
    startAt: new Date("2026-10-10T02:00:00Z"),
    isHome: true,
  });
  // A stored design slide for a layout page a slide let go of, after Sponsors.
  const orphanSlide = (pageId: string, label: string) => ({
    id: `page:${pageId}`,
    label,
    pageId,
    input: { kind: "matchDay" },
    data: {},
    junior: false,
    sponsorsOn: false,
    warnings: [],
  });
  const named = (id: string, slot: string, p: string, name?: string) => ({
    ...page(id, slot, "matchDay", p),
    role: slot === "fixture" ? "repeat" : "fixed",
    ...(name ? { name } : {}),
  });
  const SET = {
    formatVersion: 2,
    set: "matchDay",
    pages: [
      named("cover", "cover", "title"),
      named("fixture", "fixture", "fixture"),
      named("sponsors", "sponsors", "sponsors"),
      named("a-layout", "page", "fixture", "A Grade v Waroona layout"),
      named("b-layout", "page", "fixture", "B Grade v Pinjarra layout"),
    ],
  };
  const CAROUSEL = {
    ...DRAFT,
    engine: "ondemand",
    templateRef: { copyId: 12, version: 4 },
    cardInput: {
      kind: "matchDay",
      weekendCarousel: {
        version: 3,
        templateRef: { copyId: 12, version: 4 },
        setType: "matchDay",
        submissionId: "12345678-1234-1234-1234-123456789abc",
        size: "square",
        slides: [
          slide("title", "Title page", matchDayTitleContent(bookend)),
          slide("fixture-7", "A Grade v Waroona", fixture),
          slide("sponsors", "Sponsors", matchDaySponsorsContent({ ...bookend, sponsors: [] })),
          orphanSlide("a-layout", "A Grade v Waroona layout"),
          orphanSlide("b-layout", "B Grade v Pinjarra layout"),
        ],
      },
    },
    adjustments: SET,
  };

  it("opens without them, and saves the design without them", async () => {
    const requests = open({
      draft: CAROUSEL,
      design: {
        draftId: 42,
        setType: "matchDay",
        layout: "carousel",
        document: SET,
        templateRef: CAROUSEL.templateRef,
        size: "square",
        stored: true,
      },
    });
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    const tiles = within(strip)
      .getAllByRole("button", { name: /^\d\. / })
      .map((b) => b.getAttribute("aria-label") ?? "");
    expect(tiles).toHaveLength(3);
    expect(tiles.some((t) => /layout/.test(t))).toBe(false);

    // A small edit, so Save sends the design: move the fixture first.
    fireEvent.click(within(strip).getByRole("button", { name: /^2\. / }));
    fireEvent.click(within(strip).getByRole("button", { name: /^Move .* earlier$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const saved = (
      requests.find((r) => r.method === "PUT")!.body as {
        document: { pages: Array<{ id: string }> };
      }
    ).document;
    expect(saved.pages.map((p) => p.id)).toEqual(["cover", "fixture", "sponsors"]);
  });

  it("offers a deleted slide back by its name, not its key (item 11a)", async () => {
    open({
      draft: CAROUSEL,
      design: {
        draftId: 42,
        setType: "matchDay",
        layout: "carousel",
        document: SET,
        templateRef: CAROUSEL.templateRef,
        size: "square",
        stored: true,
      },
    });
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^2\. A Grade v Waroona/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Delete A Grade v Waroona" }));
    fireEvent.click(within(strip).getByRole("button", { name: "Add a page" }));
    const restore = await screen.findByRole("button", { name: /Restore a deleted slide/ });
    expect(restore.textContent).toContain("A Grade v Waroona");
    expect(restore.textContent).not.toContain("fixture-7");
    fireEvent.click(restore);
    expect(within(strip).getByRole("button", { name: /^\d\. A Grade v Waroona/ })).toBeTruthy();
  });
});

describe("saving a set with a blank added page (dev retest 3, item 11b)", () => {
  it("says which slide is blank, shows it, and gives no false player rows warning", async () => {
    const requests = open();
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    // Added from a team slide: drawn like the team page, the page that shows player rows.
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. B Grade/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Add a page" }));
    fireEvent.click(await screen.findByRole("button", { name: /Blank page/ }));
    // The blank page shows no card's data, so it has no player rows to lose.
    expect(await screen.findByRole("button", { name: /^4\. Page 1/ })).toBeTruthy();
    expect(screen.queryByText(/no longer shows/)).toBeNull();

    // Back on another slide, then Save: the blank one is named and shown.
    fireEvent.click(within(strip).getByRole("button", { name: /^1\. Cover/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByText(/Not saved: slide 4 \("Page 1"\) is blank/);
    expect(alert.getAttribute("role")).toBe("alert");
    expect(requests.some((r) => r.method === "PUT")).toBe(false);
    expect(
      within(strip)
        .getByRole("button", { name: /^4\. Page 1/ })
        .getAttribute("aria-current"),
    ).toBeTruthy();
  });
});

describe("changing a set's look (dev retest 3, item 12)", () => {
  const lookTemplate = (id: number, name: string, document: unknown) => ({
    id,
    version: 1,
    name,
    kind: "set:teamLists",
    authorName: "Ovation",
    look: { id, name },
    document,
  });
  const NEW_LOOK = {
    ...DOC,
    pages: DOC.pages.map((p) => ({
      ...p,
      layers: p.layers.map((l) => ({ ...l, content: `NEW ${l.content}` })),
    })),
  };

  it("keeps a page the admin added, saved or not, and says what goes", async () => {
    const requests = open({
      library: [lookTemplate(3, "Old look", DOC), lookTemplate(9, "New look", NEW_LOOK)],
    });
    const strip = await screen.findByRole("navigation", { name: "Slides" });
    fireEvent.click(within(strip).getByRole("button", { name: /^3\. B Grade/ }));
    fireEvent.click(within(strip).getByRole("button", { name: "Add a page" }));
    fireEvent.click(await screen.findByRole("button", { name: /Blank page/ }));
    expect(await within(strip).findByRole("button", { name: /^4\. Page 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Change look/ }));
    expect(await screen.findByText(/so do the pages you added/)).toBeTruthy();
    expect(screen.getByText(/own layout \(Edit this slide\) goes back/)).toBeTruthy();
    const uses = await screen.findAllByRole("button", { name: "Use this look" });
    fireEvent.click(uses[uses.length - 1]!);
    await waitFor(() => expect(requests.some((r) => r.method === "PUT")).toBe(true));
    const body = requests.find((r) => r.method === "PUT")!.body as {
      document: { pages: Array<{ id: string; slot: string; name?: string; layers: unknown[] }> };
      templateRef: unknown;
    };
    expect(body.templateRef).toEqual({ libraryTemplateId: 9, version: 1 });
    // The new look's pages, with the added page still after B Grade's team page.
    expect(body.document.pages.map((p) => p.slot)).toEqual(["cover", "team", "page", "sponsors"]);
    expect(body.document.pages[2]!.name).toBe("Page 1");
    expect(JSON.stringify(body.document.pages[1]!.layers)).toContain("NEW TEAM");
  });
});
