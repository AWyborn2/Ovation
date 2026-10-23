/** Saving exports: separate images through the share sheet on a phone or tablet, a zip on a desktop. */
import { afterEach, describe, expect, it, vi } from "vitest";

const downloads = vi.hoisted(() => [] as Array<{ blob: Blob; name: string }>);
vi.mock("@/lib/share-card", () => ({
  downloadBlob: (blob: Blob, name: string) => downloads.push({ blob, name }),
}));

import {
  clearPendingSave,
  getPendingSave,
  isShareDevice,
  saveFile,
  saveFiles,
  toFile,
} from "./save-files";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

function device({
  ua,
  touch,
  share,
}: {
  ua: string;
  touch: number;
  share?: (data?: ShareData) => Promise<void>;
}) {
  const nav = {
    userAgent: ua,
    maxTouchPoints: touch,
    ...(share ? { share, canShare: () => true } : {}),
  };
  vi.stubGlobal("navigator", nav);
  return nav as unknown as Navigator;
}

const png = (name: string) => toFile(new Blob(["x"], { type: "image/png" }), name);

afterEach(() => {
  vi.unstubAllGlobals();
  downloads.length = 0;
  clearPendingSave();
});

describe("isShareDevice", () => {
  it("is true on an iPhone and on an iPad that reports itself as a Mac", () => {
    const share = vi.fn(async () => undefined);
    expect(isShareDevice(device({ ua: IPHONE, touch: 5, share }))).toBe(true);
    expect(isShareDevice(device({ ua: MAC, touch: 5, share }))).toBe(true);
  });

  it("is false on a Mac without touch, and where files can't be shared", () => {
    const share = vi.fn(async () => undefined);
    expect(isShareDevice(device({ ua: MAC, touch: 0, share }))).toBe(false);
    expect(isShareDevice(device({ ua: IPHONE, touch: 5 }))).toBe(false);
  });
});

describe("saveFiles", () => {
  it("shares every slide as its own image, in order, on a phone", async () => {
    const share = vi.fn(async () => undefined);
    device({ ua: IPHONE, touch: 5, share });
    const files = [png("001-cover.png"), png("002-a-grade.png"), png("003-sponsors.png")];
    await expect(saveFiles(files, { zipName: "set.zip" })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ files });
    expect(downloads).toEqual([]);
  });

  it("treats a dismissed share sheet as cancelled", async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error("dismissed"), { name: "AbortError" });
    });
    device({ ua: IPHONE, touch: 5, share });
    await expect(saveFiles([png("a.png")], { zipName: "a.zip" })).resolves.toBe("cancelled");
    expect(getPendingSave()).toBeNull();
  });

  it("asks for another tap when the render outlasted the first one", async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error("needs a tap"), { name: "NotAllowedError" });
    });
    device({ ua: IPHONE, touch: 5, share });
    const files = [png("001.png"), png("002.png")];
    await expect(saveFiles(files, { zipName: "set.zip" })).resolves.toBe("waiting");
    expect(getPendingSave()?.files).toEqual(files);
    expect(downloads).toEqual([]);
  });

  it("downloads one zip of the slides on a desktop", async () => {
    device({ ua: MAC, touch: 0, share: vi.fn(async () => undefined) });
    await expect(saveFiles([png("001.png"), png("002.png")], { zipName: "set.zip" })).resolves.toBe(
      "downloaded",
    );
    expect(downloads.map((d) => d.name)).toEqual(["set.zip"]);
  });

  it("downloads a single file as itself on a desktop", async () => {
    device({ ua: MAC, touch: 0 });
    await saveFile(new Blob(["x"], { type: "image/png" }), "card-sq.png");
    expect(downloads.map((d) => d.name)).toEqual(["card-sq.png"]);
  });
});

describe("toFile", () => {
  it("types a file from its blob, or from its extension when the blob has none", () => {
    expect(toFile(new Blob(["x"], { type: "image/png" }), "a.png").type).toBe("image/png");
    expect(toFile(new Blob(["x"]), "clip.mp4").type).toBe("video/mp4");
  });
});
