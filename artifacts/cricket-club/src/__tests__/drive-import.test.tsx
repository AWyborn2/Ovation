/**
 * Google Drive photo import: the button appears only when the deployment has
 * Google keys, and picked photos are copied then converted like uploads, each
 * file failing on its own. Google's picker is mocked (no network).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import AdminPhotoLibrary from "@/pages/admin-photo-library";
import { renderAt } from "@/test/render";
import { importDrivePhotos, type UploadState } from "@/components/social-queue/library-upload";

const pickMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/social-queue/google-drive-picker", () => ({
  pickDrivePhotos: pickMock,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pickMock.mockReset();
});

const PICK = {
  accessToken: "ya29.t",
  files: [
    { id: "driveFileAAAA1", name: "team.jpg" },
    { id: "driveFileBBBB2", name: "notes.pdf" },
  ],
};

describe("importDrivePhotos", () => {
  it("copies the picked files, converts the good ones and fails the rest one by one", async () => {
    const states = new Map<number, UploadState>();
    const fetchDrive = vi.fn(async () => ({
      results: [
        { fileId: "driveFileAAAA1", ok: true, objectPath: "/objects/uploads/a" },
        { fileId: "driveFileBBBB2", ok: false, error: "Only photos can be imported." },
      ],
    }));
    const ingest = vi.fn(async () => ({
      results: [{ objectPath: "/objects/uploads/a", ok: true }],
    }));
    await importDrivePhotos(PICK, {
      onState: (i, s) => states.set(i, s),
      fetchDrive,
      ingest,
    });
    expect(fetchDrive).toHaveBeenCalledWith({
      accessToken: "ya29.t",
      fileIds: ["driveFileAAAA1", "driveFileBBBB2"],
    });
    expect(ingest).toHaveBeenCalledWith({
      objectPaths: ["/objects/uploads/a"],
      grade: undefined,
      season: undefined,
    });
    expect(states.get(0)).toEqual({ phase: "done" });
    expect(states.get(1)).toEqual({ phase: "error", message: "Only photos can be imported." });
  });

  it("a failed Drive request fails every file without converting anything", async () => {
    const states = new Map<number, UploadState>();
    const ingest = vi.fn();
    await importDrivePhotos(PICK, {
      onState: (i, s) => states.set(i, s),
      fetchDrive: vi.fn(async () => {
        throw new Error("network");
      }),
      ingest,
    });
    expect(ingest).not.toHaveBeenCalled();
    expect([...states.values()].every((s) => s.phase === "error")).toBe(true);
  });
});

function stubApi(configured: boolean) {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, body });
      const json = (payload: unknown, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/club-photos/google-drive/fetch"))
        return json({
          results: [{ fileId: "driveFileAAAA1", ok: true, objectPath: "/objects/uploads/a" }],
        });
      if (url.includes("/club-photos/google-drive"))
        return configured
          ? json({ clientId: "cid", apiKey: "key", appId: "123" })
          : json({ error: "not configured" }, 404);
      if (url.includes("/club-photos/ingest"))
        return json({ results: [{ objectPath: "/objects/uploads/a", ok: true }] });
      return json([]);
    }),
  );
  return requests;
}

describe("photo library: Import from Google Drive", () => {
  it("is hidden when the deployment has no Google keys", async () => {
    stubApi(false);
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    await screen.findByText(/Drop photos here/);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /google drive/i })).toBeNull();
  });

  it("imports the picked photos and shows them added", async () => {
    const requests = stubApi(true);
    pickMock.mockResolvedValue({
      accessToken: "ya29.t",
      files: [{ id: "driveFileAAAA1", name: "team.jpg" }],
    });
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    fireEvent.click(await screen.findByRole("button", { name: /import from google drive/i }));
    expect(await screen.findByText("team.jpg")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Added")).toBeTruthy());
    const fetchReq = requests.find((r) => r.url.includes("/google-drive/fetch"));
    expect(fetchReq?.body).toEqual({ accessToken: "ya29.t", fileIds: ["driveFileAAAA1"] });
    expect(requests.some((r) => r.url.includes("/club-photos/ingest"))).toBe(true);
    expect(pickMock).toHaveBeenCalledWith({ clientId: "cid", apiKey: "key", appId: "123" });
  });

  it("closing the picker without choosing imports nothing", async () => {
    const requests = stubApi(true);
    pickMock.mockResolvedValue(null);
    renderAt(<AdminPhotoLibrary />, "/admin/social/library");
    fireEvent.click(await screen.findByRole("button", { name: /import from google drive/i }));
    await waitFor(() => expect(pickMock).toHaveBeenCalled());
    expect(requests.some((r) => r.url.includes("/google-drive/fetch"))).toBe(false);
  });
});
