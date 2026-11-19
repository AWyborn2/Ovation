/**
 * Wait for every <img> under `root` to finish loading AND decoding before a
 * card is screenshotted or measured. Pack image slots (club logo, player
 * photo, sponsors) render as real <img> elements, and the first card in a
 * batch hits a cold image cache: without this a screenshot captures a
 * half-loaded (blank) photo while later cards, with the image cached, look
 * fine. A per-image timeout keeps a slow or broken image from hanging the
 * render; a genuinely broken image simply paints blank.
 */
export async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
      if (!(img.complete && img.naturalWidth > 0)) {
        await Promise.race([
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
          timeout,
        ]);
      }
      try {
        // decode() guarantees the pixels are ready to paint (not just fetched).
        await Promise.race([img.decode(), timeout]);
      } catch {
        // decode() rejects on a broken/undecodable image — paint what we have.
      }
    }),
  );
}

/** An image a strict render could not draw whole, and why. */
export type ImageProblem = {
  /** A readable name: the file's name, or "an embedded image". */
  name: string;
  src: string;
  reason: "failed" | "timed out" | "incomplete";
};

/** A short readable name for an image source (its file name). */
export function imageName(src: string): string {
  if (/^data:/i.test(src)) return "an embedded image";
  if (/^blob:/i.test(src)) return "an uploaded image";
  let path = src;
  try {
    path = new URL(src, "http://x").pathname;
  } catch {
    /* keep the raw source */
  }
  const last = path.split("/").filter(Boolean).pop() ?? src;
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    /* keep it encoded */
  }
  return name.length > 40 ? `${name.slice(0, 37)}…` : name || "an image";
}

const after = (ms: number) => new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms));

/**
 * One image, settled strictly: it finished loading, decoded, and its data is
 * whole. `img.complete` and `decode()` both pass for a picture whose download
 * ended part way (a cut-off response still "loads"), and that draws as a blank
 * or half tile; building a small ImageBitmap from it fails instead, so that is
 * the last check (round 6 retest, set downloads).
 */
export async function settleImageStrict(
  img: HTMLImageElement,
  timeoutMs: number,
): Promise<ImageProblem["reason"] | null> {
  const deadline = after(timeoutMs);
  if (!img.complete) {
    const settled = await Promise.race([
      new Promise<"done">((resolve) => {
        img.addEventListener("load", () => resolve("done"), { once: true });
        img.addEventListener("error", () => resolve("done"), { once: true });
      }),
      deadline,
    ]);
    if (settled === "timeout" && !img.complete) return "timed out";
  }
  if (!img.complete) return "timed out";
  if (img.naturalWidth === 0) return "failed";
  try {
    if ((await Promise.race([img.decode().then(() => "ok" as const), deadline])) === "timeout")
      return "timed out";
  } catch {
    return "failed";
  }
  if (typeof createImageBitmap === "function") {
    try {
      // Tiny on purpose: the check decodes the whole file but keeps 8×8 pixels.
      const bitmap = await createImageBitmap(img, { resizeWidth: 8, resizeHeight: 8 });
      bitmap.close();
    } catch {
      return "incomplete";
    }
  }
  return null;
}

/**
 * Wait for every <img> under `root` and check each strictly (see
 * settleImageStrict). Images that appear while waiting (a late React commit)
 * are checked too. Returns the images that could not be drawn whole; empty
 * when every image is ready to paint.
 */
export async function verifyImages(root: HTMLElement, timeoutMs = 15000): Promise<ImageProblem[]> {
  const checked = new Map<HTMLImageElement, string>();
  const problems: ImageProblem[] = [];
  for (let round = 0; round < 3; round++) {
    const fresh = Array.from(root.querySelectorAll("img")).filter(
      (img) => checked.get(img) !== img.src,
    );
    if (fresh.length === 0) break;
    const results = await Promise.all(fresh.map((img) => settleImageStrict(img, timeoutMs)));
    fresh.forEach((img, i) => {
      checked.set(img, img.src);
      const reason = results[i];
      if (reason) problems.push({ name: imageName(img.src), src: img.src, reason });
    });
  }
  // Each source once, however many tiles it fills.
  const seen = new Set<string>();
  return problems.filter((p) => (seen.has(p.src) ? false : (seen.add(p.src), true)));
}

/** The message a strict render fails with, naming the images. */
export function imageProblemMessage(problems: ImageProblem[]): string {
  const names = problems.map((p) => `${p.name} (${p.reason})`);
  const shown =
    names.slice(0, 4).join(", ") + (names.length > 4 ? ` and ${names.length - 4} more` : "");
  return problems.length === 1
    ? `An image on this card didn't load: ${shown}. Check that photo or logo, then try again.`
    : `${problems.length} images on this card didn't load: ${shown}. Check those photos or logos, then try again.`;
}

/** Two animation frames: React has committed and the browser has painted. */
export const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
