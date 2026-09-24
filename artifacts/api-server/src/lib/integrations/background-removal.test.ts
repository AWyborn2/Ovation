/**
 * Social Studio U19 — the Photoroom provider boundary. Mocked `fetch` only; no
 * real network calls. The library rules (senior-only, stored as a derived
 * photo) are covered by routes/studio-tools.test.ts against a real database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";
import {
  PHOTOROOM_SEGMENT_URL,
  BackgroundRemovalError,
  backgroundRemovalEnabled,
  cutOutLibraryPhoto,
  removeBackground,
} from "./background-removal";

const jpeg = () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: "#00305c" } })
    .jpeg()
    .toBuffer();
const transparentPng = () =>
  sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  process.env.PHOTOROOM_API_KEY = "pr-test-key";
  const png = await transparentPng();
  fetchMock = vi.fn(async () => new Response(new Uint8Array(png), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PHOTOROOM_API_KEY;
});

describe("backgroundRemovalEnabled", () => {
  it("is off without PHOTOROOM_API_KEY", () => {
    expect(backgroundRemovalEnabled()).toBe(true);
    delete process.env.PHOTOROOM_API_KEY;
    expect(backgroundRemovalEnabled()).toBe(false);
  });
});

describe("removeBackground", () => {
  it("posts only the image (under a generic name) with the API key, and returns the PNG", async () => {
    const out = await removeBackground(await jpeg());
    expect(out.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PHOTOROOM_SEGMENT_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("pr-test-key");
    const form = init.body as FormData;
    expect([...form.keys()].sort()).toEqual(["format", "image_file"]);
    const file = form.get("image_file") as File;
    expect(file.name).toBe("photo.jpg");
    expect(file.type).toBe("image/jpeg");
  });

  it("turns a provider error into a clear BackgroundRemovalError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("quota", { status: 402 }));
    await expect(removeBackground(await jpeg())).rejects.toThrow(
      /could not process this photo \(402\)/,
    );
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await expect(removeBackground(await jpeg())).rejects.toBeInstanceOf(BackgroundRemovalError);
  });

  it("rejects a response that is not a PNG", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(removeBackground(await jpeg())).rejects.toThrow(/unexpected file/);
  });

  it("never calls out without a key", async () => {
    delete process.env.PHOTOROOM_API_KEY;
    await expect(removeBackground(await jpeg())).rejects.toBeInstanceOf(BackgroundRemovalError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("cutOutLibraryPhoto", () => {
  it("is refused as not configured, with no lookup or external call, when the key is missing", async () => {
    delete process.env.PHOTOROOM_API_KEY;
    const r = await cutOutLibraryPhoto(1, 1);
    expect(r).toMatchObject({ ok: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
