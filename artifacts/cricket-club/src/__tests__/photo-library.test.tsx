/**
 * Social Studio — the photo library as folders: a folder per senior grade plus
 * Club-wide, type sub-folders plus Unsorted, the folder in the URL, uploads
 * filed into the open folder, "Move to…", player tagging inside a folder, and
 * a bulk upload where one failed file doesn't stop the rest.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AdminPhotoLibrary from "@/pages/admin-photo-library";
import { renderAt, renderWithHistory } from "@/test/render";
import {
  contentTypeFor,
  uploadLibraryPhotos,
  type UploadState,
} from "@/components/social-queue/library-upload";
import {
  folderCounts,
  folderSearch,
  parseFolder,
  typeFolderOf,
  CLUB_WIDE,
  UNSORTED,
} from "@/lib/photo-folders";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = (id: number, grade: string | null = null, photoTypes: string[] = []) => ({
  id,
  url: `/api/storage/objects/library/${id}`,
  thumbUrl: `/api/storage/objects/library/${id}-t`,
  width: 100,
  height: 100,
  season: null,
  grade,
  takenAt: null,
  createdAt: "2026-09-20T10:00:00Z",
  playerIds: [],
  photoTypes,
});

type Req = { method: string; url: string; body: unknown };

const LIBRARY = [
  photo(1, "A Grade", ["batting"]),
  photo(2, "A Grade", ["batting"]),
  // An older photo with two types: filed under its first type (Bowling).
  photo(3, "A Grade", ["team", "bowling"]),
  photo(4, "A Grade"),
  photo(5, null, ["team"]),
  photo(6),
];

function stubLibrary(photos: unknown[] = LIBRARY) {
  const requests: Req[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      requests.push({
        method,
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      let payload: unknown = [];
      if (url.includes("/storage/uploads/request-url"))
        payload = { uploadURL: "https://up/a", objectPath: "/objects/uploads/a" };
      else if (url.includes("/club-photos/ingest"))
        payload = { results: [{ objectPath: "/objects/uploads/a", ok: true }] };
      else if (url.includes("/club-photos") && method === "GET") payload = photos;
      else if (url.includes("/grades") && method === "GET")
        payload = [{ grade: "B Grade" }, { grade: "A Grade" }, { grade: "Under 15" }];
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return requests;
}

const folders = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label"));

describe("folder helpers", () => {
  it("files a photo by grade and first type, and counts folders", () => {
    expect(typeFolderOf({ grade: null, photoTypes: ["team", "bowling"] })).toBe("bowling");
    expect(typeFolderOf({ grade: null, photoTypes: [] })).toBe(UNSORTED);
    const { byGrade, byType } = folderCounts(LIBRARY);
    expect(byGrade.get("A Grade")).toBe(4);
    expect(byGrade.get(CLUB_WIDE)).toBe(2);
    expect(byType.get("A Grade|batting")).toBe(2);
    expect(byType.get("A Grade|bowling")).toBe(1);
    expect(byType.get("A Grade|team")).toBeUndefined();
  });

  it("round-trips the folder through the query string", () => {
    const s = folderSearch("?x=1", { grade: "A Grade", type: "batting" });
    expect(s).toBe("?x=1&grade=A+Grade&type=batting");
    expect(parseFolder(s)).toEqual({ grade: "A Grade", type: "batting" });
    expect(parseFolder("?type=batting")).toEqual({ grade: null, type: null });
    expect(parseFolder("?grade=A%20Grade&type=selfie")).toEqual({ grade: "A Grade", type: null });
    expect(folderSearch("?grade=A+Grade&type=team", { grade: null, type: null })).toBe("");
  });
});

describe("folder browser", () => {
  it("shows senior grade folders plus Club-wide with counts, then type sub-folders", async () => {
    stubLibrary();
    const { url } = renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library");
    await screen.findByRole("button", { name: "A Grade, 4 photos" });
    expect(folders("Team folders")).toEqual([
      "A Grade, 4 photos",
      "B Grade, 0 photos",
      "Club-wide, 2 photos",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "A Grade, 4 photos" }));
    expect(url()).toBe("/admin/social/library?grade=A+Grade");
    expect(await screen.findByRole("heading", { name: "A Grade" })).toBeTruthy();
    expect(folders("Type folders")).toEqual([
      "Batting, 2 photos",
      "Bowling, 1 photo",
      "Fielding, 0 photos",
      "Team, 0 photos",
      "Celebrating, 0 photos",
      "Batting milestone, 0 photos",
      "Bowling milestone, 0 photos",
      "Unsorted, 1 photo",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Batting, 2 photos" }));
    expect(url()).toBe("/admin/social/library?grade=A+Grade&type=batting");
    const grid = await screen.findByRole("list", { name: "Library photos" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(2);

    // The breadcrumb goes back up.
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByText("Batting").getAttribute("aria-current")).toBe("page");
    fireEvent.click(within(crumbs).getByRole("button", { name: "Photo library" }));
    expect(url()).toBe("/admin/social/library");
    expect(await screen.findByRole("list", { name: "Team folders" })).toBeTruthy();
  });

  it("opens the folder in the URL, and a multi-type photo sits in its first type's folder", async () => {
    stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=A%20Grade&type=bowling");
    const grid = await screen.findByRole("list", { name: "Library photos" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(1);
    const tile = within(grid).getByRole("button", { name: "Photo 3" });
    expect(tile.textContent).toContain("A Grade / Bowling");
    expect(screen.getByRole("heading", { name: "A Grade / Bowling" })).toBeTruthy();
  });

  it("the Club-wide Unsorted folder holds photos with no grade and no type", async () => {
    stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=club-wide&type=unsorted");
    const grid = await screen.findByRole("list", { name: "Library photos" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(1);
    expect(within(grid).getByRole("button", { name: "Photo 6" })).toBeTruthy();
  });

  it("an empty folder says so", async () => {
    stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=B%20Grade&type=team");
    expect(await screen.findByText("No photos in this folder")).toBeTruthy();
  });
});

describe("uploading into a folder", () => {
  it("names the target folder, and the upload files photos there", async () => {
    const requests = stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=A%20Grade&type=batting");
    expect((await screen.findByTestId("upload-target")).textContent).toBe(
      "Uploading to A Grade / Batting",
    );
    const put = vi.fn();
    vi.stubGlobal(
      "XMLHttpRequest",
      class {
        status = 200;
        upload = {};
        onload: (() => void) | null = null;
        open() {}
        setRequestHeader() {}
        send() {
          put();
          this.onload?.();
        }
      },
    );
    fireEvent.change(screen.getByTestId("library-file-input"), {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => {
      const ingest = requests.find((r) => r.url.includes("/club-photos/ingest"));
      expect(ingest?.body).toEqual({
        objectPaths: ["/objects/uploads/a"],
        grade: "A Grade",
        photoType: "batting",
      });
    });
    expect(put).toHaveBeenCalled();
  });

  it("a junior-grade folder offers no uploader, only a note to move or remove", async () => {
    stubLibrary([...LIBRARY, photo(7, "Under 15")]);
    renderWithHistory(
      <AdminPhotoLibrary />,
      "/admin/social/library?grade=Under%2015&type=unsorted",
    );
    await screen.findByRole("button", { name: "Photo 7" });
    expect(screen.getByText("Move these photos to a senior grade or remove them.")).toBeTruthy();
    expect(screen.queryByTestId("upload-target")).toBeNull();
    expect(screen.queryByTestId("library-file-input")).toBeNull();
    expect(screen.queryByRole("button", { name: /Upload photos/ })).toBeNull();
  });

  it("at the top level, uploads go to Club-wide / Unsorted", async () => {
    stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library");
    expect((await screen.findByTestId("upload-target")).textContent).toBe(
      "Uploading to Club-wide / Unsorted",
    );
  });

  it("the uploader passes the folder's grade and type to ingest", async () => {
    const ingest = vi.fn(async ({ objectPaths }: { objectPaths: string[] }) => ({
      results: objectPaths.map((p) => ({ objectPath: p, ok: true })),
    }));
    await uploadLibraryPhotos([new File(["x"], "a.jpg")], {
      grade: "B Grade",
      photoType: "fielding",
      onState: () => {},
      sign: async () => ({ uploadURL: "https://up/a", objectPath: "/objects/uploads/a" }),
      put: async () => {},
      ingest,
    });
    expect(ingest).toHaveBeenCalledWith({
      objectPaths: ["/objects/uploads/a"],
      grade: "B Grade",
      season: undefined,
      photoType: "fielding",
    });
  });
});

describe("selection inside a folder", () => {
  it("“Move to…” files the selected photos into the chosen folder", async () => {
    const requests = stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=A%20Grade&type=batting");
    fireEvent.click(await screen.findByRole("button", { name: "Photo 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Photo 2" }));
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move to…" }));
    const team = screen.getByLabelText("Team folder") as HTMLSelectElement;
    // Senior grades and Club-wide only; the current folder is preselected.
    expect(Array.from(team.options).map((o) => o.textContent)).toEqual([
      "A Grade",
      "B Grade",
      "Club-wide",
    ]);
    expect(team.value).toBe("A Grade");
    fireEvent.change(team, { target: { value: "B Grade" } });
    fireEvent.change(screen.getByLabelText("Type folder"), { target: { value: "celebrating" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));

    await waitFor(() => {
      const move = requests.find((r) => r.method === "POST" && r.url.includes("/club-photos/move"));
      expect(move?.body).toEqual({ photoIds: [1, 2], grade: "B Grade", photoType: "celebrating" });
    });
  });

  it("moving to Club-wide / Unsorted sends nulls", async () => {
    const requests = stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=A%20Grade&type=bowling");
    fireEvent.click(await screen.findByRole("button", { name: "Photo 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to…" }));
    fireEvent.change(screen.getByLabelText("Team folder"), { target: { value: "club-wide" } });
    fireEvent.change(screen.getByLabelText("Type folder"), { target: { value: "unsorted" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() => {
      const move = requests.find((r) => r.url.includes("/club-photos/move"));
      expect(move?.body).toEqual({ photoIds: [3], grade: null, photoType: null });
    });
  });

  it("tags players on the selected photos", async () => {
    const requests = stubLibrary();
    renderWithHistory(<AdminPhotoLibrary />, "/admin/social/library?grade=A%20Grade&type=batting");
    fireEvent.click(await screen.findByRole("button", { name: "Photo 1" }));
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "2025" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply tags" }));
    await waitFor(() => {
      const tag = requests.find((r) => r.method === "POST" && r.url.includes("/club-photos/tags"));
      expect(tag?.body).toEqual({ photoIds: [1], season: 2025 });
    });
  });

  it("carries no raw hex colours", () => {
    for (const f of [
      join(__dirname, "..", "pages", "admin-photo-library.tsx"),
      join(__dirname, "..", "lib", "photo-folders.ts"),
      join(__dirname, "..", "pages", "admin-social-queue.tsx"),
      join(__dirname, "..", "components", "social-queue", "draft-drawer.tsx"),
      join(__dirname, "..", "components", "social-queue", "automation-card.tsx"),
    ]) {
      expect({ f, hex: readFileSync(f, "utf8").match(/#[0-9a-fA-F]{6}\b/g) }).toEqual({
        f,
        hex: null,
      });
    }
  });
});

describe("bulk upload", () => {
  it("renders at the top level without a folder", async () => {
    stubLibrary([]);
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    expect(await screen.findByText("No photos yet")).toBeTruthy();
  });

  it("a failed file shows its error while the others complete", async () => {
    const files = ["a.jpg", "b.heic", "c.png", "d.jpg"].map((n) => new File(["x"], n));
    const states = new Map<number, UploadState>();
    await uploadLibraryPhotos(files, {
      onState: (i, s) => states.set(i, s),
      sign: async (file) => {
        if (file.name === "d.jpg") throw new Error("File too large. Maximum size is 10MB.");
        return {
          uploadURL: `https://up/${file.name}`,
          objectPath: `/objects/uploads/${file.name}`,
        };
      },
      put: async (_url, _file, onProgress) => onProgress(1),
      ingest: async ({ objectPaths }) => ({
        results: objectPaths.map((p) =>
          p.endsWith("b.heic")
            ? { objectPath: p, ok: false, error: "This HEIC photo could not be read." }
            : { objectPath: p, ok: true },
        ),
      }),
    });
    expect(states.get(0)).toEqual({ phase: "done" });
    expect(states.get(1)).toEqual({
      phase: "error",
      message: "This HEIC photo could not be read.",
    });
    expect(states.get(2)).toEqual({ phase: "done" });
    expect(states.get(3)).toEqual({
      phase: "error",
      message: "File too large. Maximum size is 10MB.",
    });
  });

  it("signs a .heic with an empty browser type as image/heic", () => {
    expect(contentTypeFor(new File(["x"], "IMG_0001.HEIC"))).toBe("image/heic");
    expect(contentTypeFor(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe("image/jpeg");
  });
});
