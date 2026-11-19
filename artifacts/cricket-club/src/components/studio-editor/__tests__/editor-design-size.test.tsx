/**
 * Portrait and Story sizes plan, Stage 2 ("Save the size", round 7): the
 * editor opens a draft at the link's `?format=`, else its saved design size,
 * else square, and changing Format saves the size on the draft (top level,
 * never inside the design). The queue and Continue designing link at the saved
 * size, so a Story design reopens at Story.
 */
import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { Route } from "wouter";
import AdminStudioEditor from "@/pages/admin-studio-editor";
import AdminSocialQueue from "@/pages/admin-social-queue";
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
const DOC = {
  layers: [
    {
      id: "title",
      kind: "text",
      name: "Title",
      text: "Big win",
      geometry: { square: box, portrait: box, story: box, landscape: box },
    },
  ],
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
  adjustments: DOC,
};

type Req = { method: string; url: string; body: unknown };

/** The API, holding one draft whose PATCHes stick (as the server stores them). */
function stubApi(draft: Record<string, unknown>): Req[] {
  const requests: Req[] = [];
  let stored = { ...draft };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let payload: unknown = [];
      if (method === "PATCH") {
        stored = { ...stored, ...(body as object) };
        payload = stored;
      } else if (/\/api\/social-drafts\/11$/.test(url)) payload = stored;
      else if (/pending-count/.test(url)) payload = { count: 1 };
      else if (/\/api\/social-drafts(\?|$)/.test(url)) payload = [stored];
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
  return requests;
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

const format = async () =>
  ((await screen.findByRole("combobox", { name: "Format" })) as HTMLSelectElement).value;

describe("where the editor opens a draft", () => {
  it("at the link's ?format= first", async () => {
    // An older size only where the draft was made in it (round 9 B8).
    stubApi({ ...DRAFT, designSize: "portrait", olderSizes: ["landscape"] });
    openEditor("/admin/social/editor/11?format=landscape");
    expect(await format()).toBe("landscape");
  });

  it("round 9 B8: not at an older size the draft wasn't made in, whatever the link says", async () => {
    stubApi({ ...DRAFT, designSize: "portrait", olderSizes: [] });
    openEditor("/admin/social/editor/11?format=landscape");
    expect(await format()).toBe("portrait");
  });

  it("at the saved design size when the link names none", async () => {
    stubApi({ ...DRAFT, designSize: "story" });
    openEditor("/admin/social/editor/11");
    expect(await format()).toBe("story");
  });

  it("at Square for an older draft with no saved size, as before", async () => {
    stubApi({ ...DRAFT, designSize: null, olderSizes: ["square", "landscape"] });
    openEditor("/admin/social/editor/11");
    expect(await format()).toBe("square");
  });

  it("round 9 B8: at Portrait for a new card with no saved size (a sweep's)", async () => {
    stubApi({ ...DRAFT, designSize: null, olderSizes: [] });
    openEditor("/admin/social/editor/11");
    expect(await format()).toBe("portrait");
  });
});

describe("changing Format", () => {
  it("saves the size on the draft at the top level and updates the address", async () => {
    const requests = stubApi({ ...DRAFT, designSize: "portrait" });
    const { url } = openEditor("/admin/social/editor/11?format=portrait");
    expect(await format()).toBe("portrait");
    fireEvent.change(screen.getByRole("combobox", { name: "Format" }), {
      target: { value: "story" },
    });
    await waitFor(() => expect(requests.some((r) => r.method === "PATCH")).toBe(true));
    const patch = requests.find((r) => r.method === "PATCH")!;
    expect(patch.url).toMatch(/\/api\/social-drafts\/11$/);
    // The size alone: the design isn't saved (or changed) by switching Format.
    expect(patch.body).toEqual({ designSize: "story" });
    expect(url()).toBe("/admin/social/editor/11?format=story");
  });
});

describe("round 7: a Story design reopens at Story", () => {
  it("pick Story, leave, reopen from the queue: it opens at Story", async () => {
    // Picked Story in the editor (the draft started at Portrait).
    const requests = stubApi({ ...DRAFT, designSize: "portrait" });
    const editor = openEditor("/admin/social/editor/11?format=portrait");
    expect(await format()).toBe("portrait");
    fireEvent.change(screen.getByRole("combobox", { name: "Format" }), {
      target: { value: "story" },
    });
    await waitFor(() => expect(requests.some((r) => r.method === "PATCH")).toBe(true));
    // Leave.
    editor.unmount();
    cleanup();
    // The queue's Open in editor link carries the saved size.
    renderWithHistory(<AdminSocialQueue />, "/admin/social/queue");
    fireEvent.click(await screen.findByText("Big win"));
    const dialog = await screen.findByRole("dialog");
    const href = within(dialog).getByRole("link", { name: "Open in editor" }).getAttribute("href");
    expect(href).toBe("/admin/social/editor/11?format=story");
    cleanup();
    // Reopened from that link, and from a bare link (a bookmark, an older page).
    openEditor(href!);
    expect(await format()).toBe("story");
    cleanup();
    openEditor("/admin/social/editor/11");
    expect(await format()).toBe("story");
  });
});
