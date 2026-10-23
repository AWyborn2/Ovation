/** Studio → Templates (ADR-011 T5.6): browse, use, adopt a look, defaults. */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type {
  ClubTemplateSummary,
  LibraryLookList,
  LibraryTemplate,
} from "@workspace/api-client-react";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { renderAt, renderWithHistory } from "../test/render";
import { installApiMock } from "../test/mock-api";
import AdminTemplateLibrary from "./admin-template-library";
import { defaultsAdoptionChanges } from "@/components/template-library/looks-panel";

const template = (over: Partial<LibraryTemplate>): LibraryTemplate => ({
  id: 1,
  slug: "club-kit/milestone",
  kind: "milestone",
  name: "Club Kit milestone",
  origin: "bundle",
  authorName: "Ovation",
  look: { id: 10, slug: "club-kit", name: "Club Kit" },
  version: 2,
  coverage: { pages: ["card"], sizes: ["square", "portrait"] },
  fitStatus: "pass",
  fitReport: null,
  listed: true,
  document: placeholderDocument("milestone"),
  ...over,
});

const LIBRARY = {
  templates: [
    template({}),
    template({ id: 2, slug: "club-kit/record", kind: "record", name: "Club Kit record" }),
  ],
  nextCursor: null,
};

const LOOKS: LibraryLookList = {
  looks: [
    {
      id: 10,
      slug: "club-kit",
      name: "Club Kit",
      description: "Clean club colours.",
      authorName: "Ovation",
      templates: [
        {
          id: 1,
          kind: "milestone",
          name: "Club Kit milestone",
          version: 2,
          coverage: LIBRARY.templates[0]!.coverage,
        },
        {
          id: 2,
          kind: "record",
          name: "Club Kit record",
          version: 2,
          coverage: LIBRARY.templates[0]!.coverage,
        },
      ],
    },
  ],
};

const copy = (over: Partial<ClubTemplateSummary>): ClubTemplateSummary => ({
  id: 100,
  kind: "milestone",
  name: "Milestone template",
  version: 1,
  isDefault: true,
  basedOn: null,
  edited: false,
  updateAvailable: null,
  fitStatus: "pass",
  fitReport: null,
  coverage: { pages: ["card"], sizes: ["square"] },
  updatedAt: null,
  waitingDrafts: 0,
  ...over,
});

const CLUB = {
  templates: [
    copy({
      id: 100,
      isDefault: true,
      name: "Club Kit milestone",
      basedOn: {
        templateId: 1,
        version: 2,
        name: "Club Kit milestone",
        authorName: "Ovation",
        look: null,
      },
    }),
    copy({ id: 101, isDefault: false, name: "Pending copy", fitStatus: "pending" }),
    copy({ id: 102, isDefault: false, name: "Spare copy" }),
  ],
};

/** The latest location of the page `setup()` rendered. */
let currentUrl: () => string = () => "";

function setup() {
  installApiMock({
    "/template-library/looks": LOOKS,
    "/template-library/preview-input": { kind: "milestone", source: "sample", input: null },
    "/template-library": LIBRARY,
    "/club-templates/": { ...CLUB.templates[0], document: placeholderDocument("milestone") },
    "/club-templates": CLUB,
    "/social-settings": {},
  });
  const base = globalThis.fetch as unknown as (
    i: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        writes.push({
          method,
          url: String(input),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        const body = String(input).includes("/adopt")
          ? {
              look: LOOKS.looks[0],
              changed: [{ kind: "record", copyId: 9, created: true }],
              unchanged: [],
            }
          : { ...CLUB.templates[0], document: placeholderDocument("milestone") };
        return new Response(JSON.stringify(body), {
          status: method === "DELETE" ? 204 : 200,
          headers: { "content-type": "application/json" },
        });
      }
      return base(input, init);
    }),
  );
  currentUrl = renderWithHistory(<AdminTemplateLibrary />, "/admin/social/template-library").url;
  return writes;
}

describe("Studio → Templates", () => {
  it("browses the library and uses a template, or makes it the default", async () => {
    const writes = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Open Club Kit milestone" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Club Kit look · by Ovation/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save to my templates" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: "POST",
      body: { libraryTemplateId: 1, version: 2, makeDefault: false },
    });
    expect(writes[0]!.url).toContain("/club-templates");
    fireEvent.click(within(dialog).getByRole("button", { name: "Use as default" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]!.body).toMatchObject({ makeDefault: true });
    expect(await within(dialog).findByRole("status")).toHaveTextContent("set as your");
  });

  it("customises a template from its dialog: a club copy, opened in the editor", async () => {
    const writes = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Open Club Kit milestone" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Customise this template" }));
    await waitFor(() => expect(currentUrl()).toBe("/admin/social/template/100"));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: "POST",
      body: { libraryTemplateId: 1, version: 2, makeDefault: false },
    });
  });

  it("customises straight from the grid with Edit or a double-click", async () => {
    const writes = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Club Kit record" }));
    await waitFor(() => expect(currentUrl()).toBe("/admin/social/template/100"));
    expect(writes[0]!.body).toMatchObject({ libraryTemplateId: 2, makeDefault: false });

    cleanup();
    const again = setup();
    fireEvent.doubleClick(await screen.findByRole("button", { name: "Open Club Kit milestone" }));
    await waitFor(() => expect(currentUrl()).toBe("/admin/social/template/100"));
    expect(again[0]!.body).toMatchObject({ libraryTemplateId: 1, makeDefault: false });
  });

  it("adopts a look after naming the defaults that change", async () => {
    const writes = setup();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Looks" }));
    const adopt = await screen.findByRole("button", { name: "Adopt look" });
    await waitFor(() => expect(adopt).toBeEnabled());
    fireEvent.click(adopt);
    const confirmDialog = await screen.findByRole("alertdialog");
    // Milestone's default already is Club Kit's at its current version: only Record changes.
    expect(within(confirmDialog).getByText(/Record\./)).toBeInTheDocument();
    expect(within(confirmDialog).queryByText(/Milestone/)).toBeNull();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Adopt look" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/template-library/looks/10/adopt");
    expect(await screen.findByText(/1 default changed/)).toBeInTheDocument();
  });

  it("lists the club's templates with the default first and the right actions", async () => {
    const writes = setup();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Your templates" }));
    expect(await screen.findByText("Based on Club Kit milestone by Ovation")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    // The default can't be deleted; a copy whose check is running can't be made the default.
    expect(screen.queryByRole("button", { name: "Delete Club Kit milestone" })).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Set as default" });
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeEnabled();
    fireEvent.click(buttons[1]!);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/club-templates/102/default");
  });
});

describe("update available (T6.3)", () => {
  it("shows the newer version side by side and takes it", async () => {
    installApiMock({
      "/template-library/preview-input": { kind: "milestone", source: "sample", input: null },
      "/template-library/1": template({ version: 3 }),
      "/template-library/looks": { looks: [] },
      "/template-library": { templates: [], nextCursor: null },
      "/club-templates/100": { ...CLUB.templates[0], document: placeholderDocument("milestone") },
      "/club-templates": {
        templates: [
          {
            ...CLUB.templates[0],
            updateAvailable: { version: 3 },
          },
        ],
      },
      "/social-settings": {},
    });
    const base = globalThis.fetch as unknown as (
      i: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    const writes: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? "GET").toUpperCase() === "POST") {
          writes.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
          return new Response(JSON.stringify({ ...CLUB.templates[0], document: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return base(input, init);
      }),
    );
    renderAt(<AdminTemplateLibrary />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Your templates" }));
    expect(await screen.findByText("Update available")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "See update" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Yours now (version 2)")).toBeInTheDocument();
    expect(within(dialog).getByText("Version 3")).toBeInTheDocument();
    const take = within(dialog).getByRole("button", { name: "Take update" });
    await waitFor(() => expect(take).toBeEnabled());
    fireEvent.click(take);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toContain("/club-templates/100/update");
    expect(writes[0]!.body).toEqual({ baseVersion: 1 });
  });
});

describe("defaultsAdoptionChanges", () => {
  it("skips kinds already on the look's current, unedited template", () => {
    const look = LOOKS.looks[0]!;
    expect(defaultsAdoptionChanges(look, CLUB.templates)).toEqual(["record"]);
    const edited = CLUB.templates.map((t) => (t.id === 100 ? { ...t, edited: true } : t));
    expect(defaultsAdoptionChanges(look, edited)).toEqual(["milestone", "record"]);
  });
});
