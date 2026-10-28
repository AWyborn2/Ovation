/**
 * Console → Library (ADR-011 L7-A, T7.2–T7.3): every template with its origin,
 * listing and fit; bundle templates are duplicated to edit; listing and
 * unlisting; new templates and looks; and the console editor, where a save is a
 * new version.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import { placeholderDocument } from "@workspace/scorecard/kind-templates";
import { renderAt, renderWithHistory } from "@/test/render";
import LibraryPage from "./library";
import LibraryEditorPage from "./library-editor";

beforeAll(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Req = { method: string; url: string; body: unknown };

const template = (over: Record<string, unknown> = {}) => ({
  id: 1,
  slug: "club-kit-classic/milestone",
  kind: "milestone",
  name: "Club Kit milestone",
  origin: "bundle",
  authorName: "Ovation",
  look: { id: 3, slug: "club-kit-classic", name: "Club Kit" },
  version: 2,
  coverage: { pages: ["card"], sizes: ["square"] },
  fitStatus: "pass",
  fitReport: { status: "pass", issues: [] },
  listed: true,
  document: placeholderDocument("milestone"),
  readOnly: true,
  unlistedBy: null,
  unlistReason: null,
  updatedAt: "2026-10-22T00:00:00.000Z",
  openReports: 0,
  ...over,
});

const TEMPLATES = [
  template(),
  template({
    id: 2,
    slug: null,
    name: "Gold milestone",
    origin: "console",
    readOnly: false,
    listed: false,
    look: null,
    fitStatus: "fail",
    fitReport: { status: "fail", issues: [{}] },
  }),
  template({
    id: 4,
    slug: null,
    name: "Unchecked milestone",
    origin: "console",
    readOnly: false,
    listed: false,
    fitReport: { skipped: true },
  }),
];

function stubApi(routes: Record<string, (req: Req) => unknown> = {}) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const req = { method, url, body };
      requests.push(req);
      const path = url.replace(/^.*\/api/, "").replace(/\?.*$/, "");
      const handler = routes[`${method} ${path}`];
      let payload: unknown = {};
      let status = 200;
      if (handler) {
        const out = handler(req);
        if (out && typeof out === "object" && "status" in out && "body" in out) {
          status = (out as { status: number }).status;
          payload = (out as { body: unknown }).body;
        } else payload = out;
      } else if (method === "GET" && path === "/platform/admin/library/templates") {
        payload = { templates: TEMPLATES };
      } else if (method === "GET" && path === "/platform/admin/library/looks") {
        payload = {
          looks: [
            {
              id: 3,
              slug: "club-kit-classic",
              name: "Club Kit",
              description: null,
              origin: "bundle",
              displayOrder: 0,
              templates: 9,
            },
          ],
        };
      } else if (/social-settings/.test(path)) {
        payload = { settings: {}, captionTemplates: [], activeSponsors: [] };
      }
      return new Response(status === 204 ? null : JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

describe("console library page", () => {
  it("shows every template with its origin, listing and fit", async () => {
    stubApi();
    renderAt(<LibraryPage />, "/platform-admin/library");
    const list = await screen.findByTestId("library-templates");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toMatch(/Club Kit milestone.*Listed.*Fit passed/);
    expect(rows[0]!.textContent).toMatch(/Bundle · Club Kit · v2/);
    expect(within(rows[0]!).getByRole("button", { name: "Duplicate to edit" })).toBeTruthy();
    expect(within(rows[0]!).queryByRole("link", { name: /Edit/ })).toBeNull();
    expect(rows[1]!.textContent).toMatch(/Gold milestone.*Unlisted.*Fit failed/);
    expect(within(rows[1]!).getByRole("link", { name: "Edit Gold milestone" })).toBeTruthy();
    expect(rows[2]!.textContent).toMatch(/Not checked/);
  });

  it("filters by kind, origin and listing", async () => {
    const requests = stubApi();
    renderAt(<LibraryPage />, "/platform-admin/library");
    await screen.findByTestId("library-templates");
    fireEvent.change(screen.getByRole("combobox", { name: "Origin" }), {
      target: { value: "console" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Listing" }), {
      target: { value: "false" },
    });
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            /library\/templates\?/.test(r.url) &&
            /origin=console/.test(r.url) &&
            /listed=false/.test(r.url),
        ),
      ).toBe(true),
    );
  });

  it("shows a club template's reports and dismisses them (release 2)", async () => {
    const club = template({
      id: 7,
      slug: null,
      name: "Club milestone",
      origin: "club",
      authorName: "Halls Head",
      readOnly: false,
      look: null,
      openReports: 2,
    });
    const requests = stubApi({
      "GET /platform/admin/library/templates": () => ({ templates: [club] }),
      "GET /platform/admin/library/templates/7/reports": () => [
        {
          id: 1,
          clubName: "Mandurah",
          reason: "Uses our crest",
          createdAt: "2026-10-26T00:00:00.000Z",
          resolvedAt: null,
        },
      ],
      "POST /platform/admin/library/templates/7/reports/dismiss": () => ({
        status: 204,
        body: null,
      }),
    });
    renderAt(<LibraryPage />, "/platform-admin/library");
    const list = await screen.findByTestId("library-templates");
    const row = within(list).getAllByRole("listitem")[0]!;
    expect(row.textContent).toMatch(/2 open reports/);
    expect(row.textContent).toMatch(/Club \(Halls Head\)/);
    fireEvent.click(within(row).getByRole("button", { name: "Reports" }));
    const reports = await within(row).findByRole("list", { name: "Reports" });
    expect(reports.textContent).toMatch(/Mandurah.*Uses our crest/);
    fireEvent.click(within(row).getByRole("button", { name: "Keep it, dismiss reports" }));
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === "POST" && /templates\/7\/reports\/dismiss$/.test(r.url)),
      ).toBe(true),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Reports dismissed");

    fireEvent.change(screen.getByRole("combobox", { name: "Reports" }), {
      target: { value: "true" },
    });
    await waitFor(() =>
      expect(requests.some((r) => /library\/templates\?.*reported=true/.test(r.url))).toBe(true),
    );
  });

  it("leaves a template its club unlisted without a List button", async () => {
    stubApi({
      "GET /platform/admin/library/templates": () => ({
        templates: [
          template({
            id: 8,
            slug: null,
            name: "Withdrawn",
            origin: "club",
            readOnly: false,
            listed: false,
            unlistedBy: "author",
          }),
        ],
      }),
    });
    renderAt(<LibraryPage />, "/platform-admin/library");
    const row = within(await screen.findByTestId("library-templates")).getAllByRole("listitem")[0]!;
    expect(row.textContent).toMatch(/Unlisted by its club/);
    expect(within(row).queryByRole("button", { name: "List" })).toBeNull();
  });

  it("duplicates a bundle template and opens the copy", async () => {
    stubApi({
      "POST /platform/admin/library/templates/1/duplicate": () => ({
        status: 201,
        body: template({ id: 9, origin: "console", readOnly: false, listed: false }),
      }),
    });
    const { url } = renderWithHistory(<LibraryPage />, "/platform-admin/library");
    fireEvent.click(await screen.findByRole("button", { name: "Duplicate to edit" }));
    await waitFor(() => expect(url()).toBe("/platform-admin/library/9/edit"));
  });

  it("lists a template, and shows why the server refused one", async () => {
    stubApi({
      "POST /platform/admin/library/templates/2/list": () => ({
        status: 409,
        body: {
          error: "This version failed the layout check. Fix it and save a new version first.",
        },
      }),
      "POST /platform/admin/library/templates/4/list": () => template({ id: 4, listed: true }),
    });
    renderAt(<LibraryPage />, "/platform-admin/library");
    const rows = within(await screen.findByTestId("library-templates")).getAllByRole("listitem");
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "List" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/failed the layout check/);
    fireEvent.click(within(rows[2]!).getByRole("button", { name: "List" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/is listed/);
  });

  it("unlists with a reason", async () => {
    const requests = stubApi({
      "POST /platform/admin/library/templates/1/unlist": () => template({ listed: false }),
    });
    renderAt(<LibraryPage />, "/platform-admin/library");
    const rows = within(await screen.findByTestId("library-templates")).getAllByRole("listitem");
    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Unlist…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for unlisting" }), {
      target: { value: "Sponsor clash" },
    });
    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Unlist" }));
    await waitFor(() =>
      expect(requests.find((r) => /unlist$/.test(r.url))?.body).toEqual({
        reason: "Sponsor clash",
      }),
    );
  });

  it("creates a template from the kind's plain layout, and a look", async () => {
    const requests = stubApi({
      "POST /platform/admin/library/templates": () => ({
        status: 201,
        body: template({ id: 12, origin: "console", readOnly: false }),
      }),
      "POST /platform/admin/library/looks": () => ({
        status: 201,
        body: {
          id: 20,
          slug: "night-shift",
          name: "Night Shift",
          description: null,
          origin: "console",
          displayOrder: 1000,
          templates: 0,
        },
      }),
    });
    const { url } = renderWithHistory(<LibraryPage />, "/platform-admin/library");
    await screen.findByTestId("library-templates");
    fireEvent.change(screen.getByRole("combobox", { name: "New template's kind" }), {
      target: { value: "record" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "New template's name" }), {
      target: { value: "Night record" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "New template's look" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create and edit" }));
    await waitFor(() => expect(url()).toBe("/platform-admin/library/12/edit"));
    const created = requests.find((r) => r.method === "POST" && /library\/templates$/.test(r.url))!
      .body as Record<string, unknown>;
    expect(created).toMatchObject({ kind: "record", name: "Night record", lookId: 3 });
    expect(created.document).toEqual(placeholderDocument("record"));

    fireEvent.change(screen.getByRole("textbox", { name: "New look's name" }), {
      target: { value: "Night Shift" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "New look's slug" }), {
      target: { value: "Night-Shift" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add look" }));
    await waitFor(() =>
      expect(
        requests.find((r) => /library\/looks$/.test(r.url) && r.method === "POST")?.body,
      ).toEqual({ slug: "night-shift", name: "Night Shift" }),
    );
  });
});

describe("console editor", () => {
  const openEditor = (
    current: ReturnType<typeof template>,
    saved: Record<string, unknown> = {},
  ) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    const requests = stubApi({
      [`GET /platform/admin/library/templates/${current.id}`]: () => current,
      [`PUT /platform/admin/library/templates/${current.id}`]: (r) =>
        template({
          ...current,
          version: current.version + 1,
          fitStatus: "pending",
          fitReport: null,
          document: (r.body as { document: unknown }).document,
          ...saved,
        }),
    });
    renderAt(
      <Route path="/platform-admin/library/:id/edit">
        <LibraryEditorPage />
      </Route>,
      `/platform-admin/library/${current.id}/edit`,
    );
    return requests;
  };

  it("saves a console template as a new version and shows the layout check", async () => {
    const requests = openEditor(
      template({ id: 2, origin: "console", readOnly: false, listed: false }),
    );
    expect(await screen.findByText("Library · v2")).toBeTruthy();
    expect(screen.getByText("Unlisted")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    const heading = screen
      .getAllByRole("button")
      .find((b) => /heading/i.test(b.textContent ?? ""))!;
    fireEvent.click(heading);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Checking the layout…")).toBeTruthy();
    expect(await screen.findByText("Library · v3")).toBeTruthy();
    const put = requests.find((r) => r.method === "PUT")!;
    expect((put.body as { baseVersion: number }).baseVersion).toBe(2);
    // The console has no club: it never asks for a club's settings or cards.
    expect(requests.some((r) => /social-settings|social-drafts/.test(r.url))).toBe(false);
  });

  it("opens a bundle template read-only, with a duplicate", async () => {
    openEditor(template());
    expect(await screen.findByText(/comes from a bundle/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Duplicate to edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
