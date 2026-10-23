/**
 * Social Media Studio home (plan 2026-10-23): search, Create (size, then a
 * template or blank, then the editor), Continue designing newest first,
 * Templates for you, quick links, and "Your designs" at /admin/social/designs.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { renderWithHistory } from "../test/render";
import { installApiMock } from "../test/mock-api";
import AdminSocialStudio from "./admin-social-studio";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BUNDLE = {
  settings: {
    sponsorsEnabled: false,
    clubHashtag: "#DEMO",
    matchSummaryGradeConfig: {},
    postingPlanSaved: true,
    postingPlan: {
      version: 2,
      styleId: null,
      rows: { ladders: { enabled: false } },
      bigMoments: {},
    },
  },
  brand: { name: "Demo Cricket Club", primaryColour: "#1d4ed8", backgroundColour: "#0f172a" },
  activeSponsors: [],
};

const LIB_TEMPLATE = {
  id: 1,
  slug: "club-kit/milestone",
  kind: "milestone",
  name: "Club Kit milestone",
  origin: "bundle",
  authorName: "Ovation",
  look: { id: 10, slug: "club-kit", name: "Club Kit" },
  version: 2,
  coverage: { pages: ["card"], sizes: ["square", "story"] },
  fitStatus: "pass",
  fitReport: null,
  listed: true,
  document: placeholderDocument("milestone"),
};

const DRAFTS = [
  {
    id: 41,
    engine: "ondemand",
    status: "awaiting_review",
    cardInput: { kind: "milestone" },
    appPath: "/",
    sourceMatchIsJunior: false,
    createdAt: "2026-10-01T00:00:00Z",
    editedAt: "2026-10-20T00:00:00Z",
    packId: "club-kit-v1",
  },
];

const SETS = [
  {
    id: 7,
    name: "Round 5 results",
    platformSize: "portrait",
    slides: [],
    isPublished: false,
    updatedAt: "2026-10-22T00:00:00Z",
  },
];

type Write = { url: string; method: string; body: Record<string, unknown> | null };

function open(path = "/admin/social") {
  installApiMock({
    "/social-settings": BUNDLE,
    "/social-drafts": DRAFTS,
    "/card-sets": SETS,
    "/template-library/preview-input": { kind: "milestone", source: "sample", input: null },
    "/template-library/elements": {
      elements: [
        {
          id: 3,
          slug: null,
          name: "Milestone ribbon",
          category: "badges",
          tags: [],
          origin: "bundle",
          authorName: "Ovation",
          mine: false,
          look: null,
          listed: true,
          document: { layers: [] },
          thumbnailUrl: null,
          createdAt: "2026-10-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    },
    "/template-library": { templates: [LIB_TEMPLATE], nextCursor: null },
    "/club-templates": { templates: [] },
    "/card-themes": [],
  });
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Write[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (method !== "GET") {
        writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ ...DRAFTS[0], id: 99 }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return base(input, init);
    }),
  );
  const { url } = renderWithHistory(<AdminSocialStudio />, path);
  return { writes, url };
}

describe("Studio home", () => {
  it("asks what to design, with Create tiles for the kinds the club posts", async () => {
    open();
    expect(
      screen.getByRole("heading", { name: "What will you design today?" }),
    ).toBeInTheDocument();
    const create = screen.getByRole("heading", { name: "Create" }).closest("section")!;
    expect(await within(create).findByRole("button", { name: "Match Day" })).toBeInTheDocument();
    expect(within(create).getByRole("button", { name: "Carousel set" })).toBeInTheDocument();
    expect(within(create).getByRole("button", { name: "Blank design" })).toBeInTheDocument();
    // Ladders are off in the posting plan: Ladder waits under More.
    await waitFor(() =>
      expect(within(create).queryByRole("button", { name: "Ladder" })).toBeNull(),
    );
    fireEvent.click(within(create).getByRole("button", { name: /More/ }));
    expect(within(create).getByRole("button", { name: "Ladder" })).toBeInTheDocument();
    // Quick links stay one click away.
    const shortcuts = screen.getByRole("navigation", { name: "Studio shortcuts" });
    expect(within(shortcuts).getByRole("link", { name: "Queue" })).toHaveAttribute(
      "href",
      "/admin/social/queue",
    );
    expect(within(shortcuts).getByRole("link", { name: "Posting plan" })).toHaveAttribute(
      "href",
      "/admin/social/plan",
    );
  });

  it("creates from a template at the chosen size and opens the editor", async () => {
    const { writes, url } = open();
    fireEvent.click(await screen.findByRole("button", { name: "Milestone" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Story" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Use Club Kit milestone" }));
    await waitFor(() => expect(url()).toBe("/admin/social/editor/99?format=story"));
    expect(writes[0]).toMatchObject({ method: "POST" });
    expect(writes[0]!.url).toContain("/social-drafts");
    expect(writes[0]!.body).toMatchObject({
      cardInput: { kind: "milestone" },
      templateRef: { libraryTemplateId: 1, version: 2 },
    });
  });

  it("starts a blank design from a size alone", async () => {
    const { writes, url } = open();
    fireEvent.click(screen.getByRole("button", { name: "Blank design" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Landscape" }));
    await waitFor(() => expect(url()).toBe("/admin/social/editor/99?format=landscape"));
    expect(writes[0]!.body).toMatchObject({ packId: "blank" });
  });

  it("lists recent work newest first, each opening where it's edited", async () => {
    open();
    const section = screen.getByRole("heading", { name: "Continue designing" }).closest("section")!;
    const links = await within(section).findAllByRole("link", { name: /^Open / });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/admin/social/sets?open=7",
      "/admin/social/editor/41",
    ]);
    expect(within(section).getByText(/Carousel set · 0 slides · Portrait/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "See all" })).toHaveAttribute(
      "href",
      "/admin/social/designs",
    );
  });

  it("searches card types, templates, elements and the club's designs, grouped", async () => {
    open();
    fireEvent.change(screen.getByPlaceholderText("Search templates, elements and your designs"), {
      target: { value: "milestone" },
    });
    expect(await screen.findByRole("region", { name: "Card types" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Templates" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Elements" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Your designs" })).toBeInTheDocument();
  });

  it("shows every design, with filters, at /admin/social/designs", async () => {
    open("/admin/social/designs");
    expect(screen.getByRole("heading", { name: "Your designs" })).toBeInTheDocument();
    await screen.findAllByRole("link", { name: /^Open / });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "set" } });
    const links = screen.getAllByRole("link", { name: /^Open / });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/admin/social/sets?open=7"]);
  });
});
