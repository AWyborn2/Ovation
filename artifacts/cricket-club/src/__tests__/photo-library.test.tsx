/**
 * Social Studio U8 — the photo library: batch tagging from a multi-select, and
 * a bulk upload where one failed file doesn't stop the rest.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import AdminPhotoLibrary from "@/pages/admin-photo-library";
import { renderAt } from "@/test/render";
import {
  contentTypeFor,
  uploadLibraryPhotos,
  type UploadState,
} from "@/components/social-queue/library-upload";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo = (id: number) => ({
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
});

describe("photo library page", () => {
  it("selecting three photos and applying a grade tags all three", async () => {
    const requests: Array<{ method: string; url: string; body: unknown }> = [];
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
        const payload =
          url.includes("/club-photos") && method === "GET" ? [1, 2, 3, 4].map(photo) : [];
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    for (const id of [1, 2, 4])
      fireEvent.click(await screen.findByRole("button", { name: `Photo ${id}` }));
    expect(screen.getByText("3 selected")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Grade"), { target: { value: "B Grade" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply tags" }));
    await waitFor(() => {
      const tag = requests.find((r) => r.method === "POST" && r.url.includes("/club-photos/tags"));
      expect(tag?.body).toEqual({ photoIds: [1, 2, 4], grade: "B Grade" });
    });
  });

  it("carries no raw hex colours", () => {
    for (const f of [
      join(__dirname, "..", "pages", "admin-photo-library.tsx"),
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
