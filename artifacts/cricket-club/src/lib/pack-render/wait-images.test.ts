/**
 * Strict image settling for downloads and posts (round 6 retest: set
 * downloads saved slides with blank sponsor tiles and a missing hero photo).
 *
 * jsdom loads no pictures, so each <img> here is driven by hand: it loads
 * after its own random delay (out of order), fails, never finishes, or
 * "loads" a cut-off file. A cut-off file is the case the old check let
 * through: the browser reports it complete with a width and decode()
 * resolves, yet half the picture is missing. Building an ImageBitmap from it
 * fails, and that is what verifyImages checks last.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageName, imageProblemMessage, verifyImages } from "./wait-images";

type Fate = "ok" | "error" | "never" | "truncated" | "undecodable";
const fates = new WeakMap<HTMLImageElement, Fate>();
const loaded = new WeakSet<HTMLImageElement>();

/** An <img> that settles `fate` after `delay` ms, as a browser would report it. */
function fakeImage(src: string, fate: Fate, delay: number): HTMLImageElement {
  const img = document.createElement("img");
  img.setAttribute("src", src);
  let complete = false;
  let width = 0;
  fates.set(img, fate);
  Object.defineProperty(img, "complete", { get: () => complete });
  Object.defineProperty(img, "naturalWidth", { get: () => width });
  img.decode = () =>
    complete && width > 0 && fate !== "undecodable"
      ? Promise.resolve()
      : Promise.reject(new DOMException("The source image cannot be decoded.", "EncodingError"));
  if (fate !== "never")
    setTimeout(() => {
      complete = true;
      width = fate === "error" ? 0 : 400;
      if (fate !== "error") loaded.add(img);
      img.dispatchEvent(new Event(fate === "error" ? "error" : "load"));
    }, delay);
  return img;
}

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", async (img: HTMLImageElement) => {
    if (fates.get(img) === "truncated")
      throw new DOMException("The ImageBitmap could not be allocated.", "InvalidStateError");
    return { close: () => {} };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** One slide's card: a crest, a hero photo and twelve sponsor tiles. */
function slide(n: number, fateOf: (src: string) => Fate = () => "ok") {
  const root = document.createElement("div");
  const srcs = [
    "/api/storage/objects/crest.png",
    `/api/storage/objects/photos/hero-${n}.jpg`,
    ...Array.from({ length: 12 }, (_, i) => `/api/storage/objects/sponsors/sponsor-${i + 1}.png`),
  ];
  for (const src of srcs) root.appendChild(fakeImage(src, fateOf(src), Math.random() * 40));
  document.body.appendChild(root);
  return root;
}

describe("verifyImages (strict downloads)", () => {
  it("a 14-slide set with 12 sponsors and a photo each, loading out of order: every image has loaded before a slide is drawn", async () => {
    for (let n = 1; n <= 14; n++) {
      const root = slide(n);
      const problems = await verifyImages(root, 2000);
      expect(problems).toEqual([]);
      const imgs = Array.from(root.querySelectorAll("img"));
      expect(imgs).toHaveLength(14);
      // Never early: at the moment it resolves, every picture is in.
      for (const img of imgs) expect(loaded.has(img), img.getAttribute("src")!).toBe(true);
      root.remove();
    }
  });

  it("names a cut-off sponsor logo the old check let through", async () => {
    const root = slide(1, (src) => (src.endsWith("sponsor-7.png") ? "truncated" : "ok"));
    const problems = await verifyImages(root, 2000);
    const cut = Array.from(root.querySelectorAll("img")).find((i) =>
      i.getAttribute("src")!.endsWith("sponsor-7.png"),
    )!;
    // What the harness used to accept: complete, with a width, decodable.
    expect(cut.complete && cut.naturalWidth > 0).toBe(true);
    await expect(cut.decode()).resolves.toBeUndefined();
    expect(problems.map((p) => [p.name, p.reason])).toEqual([["sponsor-7.png", "incomplete"]]);
  });

  it("reports a logo that failed, a photo that never arrived and one that won't decode", async () => {
    const root = slide(2, (src) =>
      src.endsWith("sponsor-3.png")
        ? "error"
        : src.includes("hero-")
          ? "never"
          : src.endsWith("crest.png")
            ? "undecodable"
            : "ok",
    );
    const problems = await verifyImages(root, 200);
    expect(new Map(problems.map((p) => [p.name, p.reason]))).toEqual(
      new Map([
        ["crest.png", "failed"],
        ["hero-2.jpg", "timed out"],
        ["sponsor-3.png", "failed"],
      ]),
    );
    expect(imageProblemMessage(problems)).toMatch(
      /^3 images on this card didn't load: .*hero-2\.jpg \(timed out\)/,
    );
  });

  it("checks an image that appears while it waits (a late commit)", async () => {
    const root = slide(3);
    setTimeout(() => root.appendChild(fakeImage("/late/sponsor-13.png", "truncated", 5)), 10);
    const problems = await verifyImages(root, 2000);
    expect(problems.map((p) => p.name)).toEqual(["sponsor-13.png"]);
  });

  it("names a logo used on several tiles once", async () => {
    const root = document.createElement("div");
    for (let i = 0; i < 3; i++) root.appendChild(fakeImage("/s/peel-fencing.png", "error", 5));
    expect((await verifyImages(root, 500)).map((p) => p.name)).toEqual(["peel-fencing.png"]);
  });
});

describe("imageName", () => {
  it("is the file's name, short", () => {
    expect(imageName("https://cdn.x/a/b/Peel%20Fencing.png?sig=1")).toBe("Peel Fencing.png");
    expect(imageName("data:image/png;base64,AAAA")).toBe("an embedded image");
    expect(imageName("blob:https://x/123")).toBe("an uploaded image");
    expect(imageName(`/x/${"a".repeat(60)}.png`)).toHaveLength(38);
  });
});
