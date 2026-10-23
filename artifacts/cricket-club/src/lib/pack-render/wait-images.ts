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

/** Two animation frames: React has committed and the browser has painted. */
export const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
