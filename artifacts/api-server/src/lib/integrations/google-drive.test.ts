/**
 * Google Drive photo import: picked files are downloaded with the admin's
 * short-lived token; non-images, oversized files and bad ids are refused
 * before any bytes are fetched. `fetch` is mocked, so no Google calls.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DriveFileError,
  downloadDriveFile,
  googleDriveConfig,
  isDriveFileId,
} from "./google-drive";

const ID = "1AbCdEfGhIjKlMnOp_qr-St";
const TOKEN = "ya29.token";

function driveFetch(meta: Record<string, unknown>, bytes = Buffer.from("jpegbytes"), status = 200) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    if (u.includes("alt=media")) return new Response(bytes, { status: 200 });
    return new Response(JSON.stringify(meta), { status });
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("downloadDriveFile", () => {
  it("downloads a picked photo with the admin's token", async () => {
    const f = driveFetch({ name: "team.jpg", mimeType: "image/jpeg", size: "9" });
    const out = await downloadDriveFile(ID, TOKEN, f as unknown as typeof fetch);
    expect(out).toMatchObject({ name: "team.jpg", mimeType: "image/jpeg" });
    expect(out.data.toString()).toBe("jpegbytes");
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toContain(`/files/${ID}?fields=`);
  });

  it("refuses a non-image before downloading it", async () => {
    const f = driveFetch({ name: "minutes.pdf", mimeType: "application/pdf", size: "100" });
    await expect(downloadDriveFile(ID, TOKEN, f as unknown as typeof fetch)).rejects.toThrow(
      "Only photos can be imported.",
    );
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refuses a photo over 25 MB before downloading it", async () => {
    const f = driveFetch({
      name: "big.jpg",
      mimeType: "image/jpeg",
      size: String(30 * 1024 * 1024),
    });
    await expect(downloadDriveFile(ID, TOKEN, f as unknown as typeof fetch)).rejects.toThrow(
      "over 25 MB",
    );
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("an expired token reads as a sign-in problem", async () => {
    const f = driveFetch({}, undefined, 401);
    await expect(downloadDriveFile(ID, TOKEN, f as unknown as typeof fetch)).rejects.toThrow(
      "Google sign-in expired",
    );
  });

  it("a malformed id never reaches a URL", async () => {
    const f = vi.fn();
    await expect(
      downloadDriveFile("../../etc", TOKEN, f as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(DriveFileError);
    expect(f).not.toHaveBeenCalled();
    expect(isDriveFileId("abc?x=1&y=2")).toBe(false);
    expect(isDriveFileId(ID)).toBe(true);
  });
});

describe("googleDriveConfig", () => {
  it("is null unless all three keys are set", () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "cid.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
    vi.stubEnv("GOOGLE_DRIVE_APP_ID", "123456");
    expect(googleDriveConfig()).toBeNull();
    vi.stubEnv("GOOGLE_DRIVE_API_KEY", "AIzaKey");
    expect(googleDriveConfig()).toEqual({
      clientId: "cid.apps.googleusercontent.com",
      apiKey: "AIzaKey",
      appId: "123456",
    });
  });
});
