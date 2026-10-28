/**
 * Photo collections and photo layer sources in the web app: the photo
 * library lists collections beside the folders, makes one, adds a folder's
 * selection to a collection, shows a collection's photos and takes them out;
 * the template editor's Layer panel picks where a photo layer's photo comes
 * from (the card's photo, a team list player, a collection).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AdminPhotoLibrary from "@/pages/admin-photo-library";
import { LayerDesignPanel } from "@/components/studio-editor/layer-design-panel";
import type { EditorLayer } from "@/components/studio-editor/template-doc";
import { templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import { renderAt, renderWithHistory } from "@/test/render";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = (id: number, collectionIds: number[] = []) => ({
  id,
  url: `/api/storage/objects/library/${id}`,
  thumbUrl: `/api/storage/objects/library/${id}-t`,
  width: 100,
  height: 100,
  season: null,
  grade: null,
  takenAt: null,
  createdAt: "2026-09-20T10:00:00Z",
  playerIds: [],
  photoTypes: [],
  matchFormat: null,
  collectionIds,
});

const collection = (id: number, name: string, photoCount: number) => ({
  id,
  name,
  photoCount,
  coverUrl: photoCount ? `/api/storage/objects/library/${id}-cover` : null,
  createdAt: "2026-10-01T10:00:00Z",
});

type Req = { method: string; url: string; body: unknown };

function stubApi(collections = [collection(5, "Matchday crowd", 1), collection(6, "Sponsors", 0)]) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      let payload: unknown = [];
      let status = 200;
      if (method === "GET" && url.includes("/club-photo-collections")) payload = collections;
      else if (method === "POST" && /\/club-photo-collections$/.test(url)) {
        status = 201;
        payload = collection(7, (body as { name: string }).name, 0);
      } else if (method === "POST" && url.includes("/club-photo-collections/"))
        payload = collections[0];
      else if (method === "GET" && url.includes("/club-photos"))
        payload = [photo(1, [5]), photo(2), photo(3)];
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

describe("photo collections in the library", () => {
  it("lists collections beside the folders and makes a new one", async () => {
    const requests = stubApi();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library");
    const list = await screen.findByRole("list", { name: "Photo collections" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Matchday crowd, 1 photo", "Sponsors, 0 photos"]);

    fireEvent.click(screen.getByRole("button", { name: "New collection" }));
    fireEvent.change(screen.getByLabelText("Collection name"), {
      target: { value: "  Presentation night " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.method === "POST" && /club-photo-collections$/.test(r.url))?.body,
      ).toEqual({ name: "Presentation night" }),
    );
  });

  it("adds a folder's selection to a collection", async () => {
    const requests = stubApi();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=club-wide&type=unsorted");
    fireEvent.click(await screen.findByRole("button", { name: "Photo 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Photo 3" }));
    fireEvent.change(await screen.findByLabelText("Collection to add to"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
    await waitFor(() =>
      expect(
        requests.find(
          (r) => r.method === "POST" && r.url.includes("/club-photo-collections/6/photos"),
        )?.body,
      ).toEqual({ photoIds: [2, 3] }),
    );
  });

  it("shows a collection's photos and takes a selection out of it", async () => {
    const requests = stubApi();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?collection=5");
    const grid = await screen.findByRole("list", { name: "Library photos" });
    expect(within(grid).getAllByRole("button", { name: /^Photo \d$/ })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Matchday crowd" })).toBeTruthy();
    // Uploads go to folders, not collections.
    expect(screen.queryByRole("button", { name: /Upload photos to/ })).toBeNull();
    fireEvent.click(within(grid).getByRole("button", { name: "Photo 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Take out of Matchday crowd" }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.url.includes("/club-photo-collections/5/photos/remove"))?.body,
      ).toEqual({ photoIds: [1] }),
    );
  });
});

describe("a photo layer's source in the Layer panel", () => {
  const panel = (layer: Partial<EditorLayer> = {}) => {
    const onPatch = vi.fn();
    const full = {
      id: "hero",
      kind: "photo",
      geometry: { square: { x: 0, y: 0, w: 50, h: 50 } },
      ...layer,
    } as EditorLayer;
    renderAt(
      <LayerDesignPanel
        layer={full}
        kind="teamList"
        page="team"
        onPatch={onPatch}
        onSelect={() => {}}
        onMoveChild={() => {}}
        onUnstack={() => {}}
        onPlay={() => {}}
      />,
    );
    const last = () => onPatch.mock.lastCall![0].source;
    /** The document a save would send, checked by the format's validator. */
    const valid = () =>
      templateDocumentErrors(
        { formatVersion: 2, pages: { team: { layers: [{ ...full, source: last() }] } } },
        "teamList",
      );
    return { last, valid };
  };

  it("picks a team list player by role or position", async () => {
    stubApi();
    const { last, valid } = panel();
    const from = screen.getByLabelText("Photo comes from") as HTMLSelectElement;
    expect(from.value).toBe("card");
    fireEvent.change(from, { target: { value: "player" } });
    expect(last()).toEqual({ kind: "player", pick: "random" });
    expect(valid()).toEqual([]);
    cleanup();

    const again = panel({ source: { kind: "player", pick: "random" } });
    fireEvent.change(screen.getByLabelText("Which player"), { target: { value: "position" } });
    expect(again.last()).toEqual({ kind: "player", pick: "position", position: 1 });
    cleanup();

    const pos = panel({ source: { kind: "player", pick: "position", position: 1 } });
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "4" } });
    expect(pos.last()).toEqual({ kind: "player", pick: "position", position: 4 });
    expect(pos.valid()).toEqual([]);
  });

  it("picks a collection, names a deleted one, and goes back to the card's photo", async () => {
    stubApi();
    const { last, valid } = panel();
    // Collections load before the choice is offered.
    await waitFor(() =>
      expect(
        (
          screen.getByRole("option", {
            name: "A random photo from a collection",
          }) as HTMLOptionElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Photo comes from"), {
      target: { value: "collection" },
    });
    expect(last()).toEqual({ kind: "collection", collectionId: 5 });
    expect(valid()).toEqual([]);
    cleanup();

    const gone = panel({ source: { kind: "collection", collectionId: 99 } });
    const pick = (await screen.findByLabelText("Collection")) as HTMLSelectElement;
    await waitFor(() => expect(pick.options).toHaveLength(3));
    expect(pick.options[0]!.textContent).toBe("A deleted collection");
    fireEvent.change(pick, { target: { value: "6" } });
    expect(gone.last()).toEqual({ kind: "collection", collectionId: 6 });
    fireEvent.change(screen.getByLabelText("Photo comes from"), { target: { value: "card" } });
    expect(gone.last()).toBeUndefined();
  });

  it("is only offered on photo layers", () => {
    stubApi();
    panel({ kind: "image", content: "{{clubLogo}}" });
    expect(screen.queryByLabelText("Photo comes from")).toBeNull();
  });
});
