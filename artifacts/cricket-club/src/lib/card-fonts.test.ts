import { describe, it, expect, beforeEach } from "vitest";
import { ensureCardFontsLoaded, __resetCardFontsForTests } from "./card-fonts";

// Match the single card-fonts stylesheet by its stable prefix, independent of
// which font family happens to be listed first (the family list grows/reorders
// as packs add display fonts).
const selector = 'link[href^="https://fonts.googleapis.com/css2?family="]';

/** jsdom never fires load events for stylesheets — fire it by hand. */
function fireLoad() {
  const link = document.querySelector(selector);
  link?.dispatchEvent(new Event("load"));
}

describe("ensureCardFontsLoaded", () => {
  beforeEach(() => {
    __resetCardFontsForTests();
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove());
  });

  it("injects the decorative Google Fonts stylesheet once", async () => {
    const p = ensureCardFontsLoaded();
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    fireLoad();
    await p;
  });

  it("is idempotent — repeat calls share one promise and never add a second link", async () => {
    const first = ensureCardFontsLoaded();
    const second = ensureCardFontsLoaded();
    expect(second).toBe(first);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
    fireLoad();
    await Promise.all([first, second]);
    // Even after settling, another call must not append a new link.
    await ensureCardFontsLoaded();
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });

  it("resolves (not rejects) when the stylesheet fails to load", async () => {
    const p = ensureCardFontsLoaded();
    document.querySelector(selector)?.dispatchEvent(new Event("error"));
    await expect(p).resolves.toBeUndefined();
  });
});
